# -*- coding: utf-8 -*-
"""
데이터 증강·다중 시점 예측(TTA)·애매함 표시 실험 — 새 이미지·새 라벨 없이 같은 281장으로 시험한다.

  python aug_experiments.py --image-dir data\\user_label_pool --labels data\\user_labels_all.csv ^
      --real-dir data\\train_images --real-dir-extra data\\train_images2,data\\train_images3 --emoset-class-weight dreamy=0.4

변형(모두 같은 겹 분할, 쿠르님 라벨 교차검증):
  ref      : 지금 방식(원본 한 장면으로 학습·예측)
  tta      : 학습은 그대로, 예측만 여러 시점(좌우반전·전체 축소·가운데 확대)의 CLIP 특징 평균
  aug      : 쿠르님 라벨 이미지를 여러 시점으로 늘려 학습(총 가중은 같게 나눔), 예측은 원본
  aug_tta  : 둘 다
이어서 '애매함 표시'(1·2위 확률 차이가 작은 이미지를 따로 표시)를 하면 표시된 이미지 쪽 정확도가 어떻게 되는지 잰다.
봉인 테스트는 쓰지 않는다. 모델 파일도 건드리지 않는다.
"""
import argparse
import json
import os
import time

import numpy as np
import torch

from ablation_cv import BASE_CFG, _fit_predict, print_table, summarize
from eval_harness import _softmax, crossfit_T, metrics, wilson_ci
from train_projection_v2 import cos_logits, stratified_folds

ROOT = os.path.dirname(os.path.abspath(__file__))
VIEW_NAMES = ["원본", "좌우반전", "전체 축소", "전체 축소+반전", "가운데 75% 확대"]


def view_images(img):
    """PIL 이미지 → 5개 시점의 PIL 이미지(CLIP preprocess 전)."""
    from PIL import Image, ImageOps
    w, h = img.size
    sq = img.resize((224, 224), Image.BICUBIC)
    cw, ch = int(w * 0.75), int(h * 0.75)
    l, t = (w - cw) // 2, (h - ch) // 2
    return [img, ImageOps.mirror(img), sq, ImageOps.mirror(sq), img.crop((l, t, l + cw, t + ch))]


def multiview_features(files, image_dir, clip_model, preprocess, device):
    from PIL import Image
    out = []
    for f in files:
        img = Image.open(os.path.join(image_dir, f)).convert("RGB")
        x = torch.stack([preprocess(v) for v in view_images(img)]).to(device)
        with torch.no_grad():
            e = clip_model.encode_image(x).float()
        out.append((e / e.norm(dim=-1, keepdim=True)).cpu())
    return torch.stack(out)          # [n, V, D]


def _tta(views):
    m = views.mean(1)
    return m / m.norm(dim=-1, keepdim=True)


def run_aug(emo, real, bal, user_mv, anchors, names, *, k=5, repeats=3, emo_w=None, hn_pairs=(), kw_common=None, log=print):
    """user_mv=(views[n,V,D], y[n], va[n,2]). 반환: summarize/print_table 이 읽는 dict."""
    kw_common = kw_common or {}
    uv_, uy, uva = user_mv
    n, V, _ = uv_.shape
    K = anchors.shape[0]
    yn = uy.numpy()
    folds = [stratified_folds(yn, k, seed=r) for r in range(repeats)]
    Z = {nm: np.zeros((repeats, n, K), dtype=np.float32) for nm in ("ref", "tta", "aug", "aug_tta")}
    cfg_ref = dict(BASE_CFG)
    cfg_aug = dict(BASE_CFG, user_w=BASE_CFG["user_w"] / V)     # 장수가 V배가 되므로 총 가중은 같게
    t0 = time.time()
    for r in range(repeats):
        for f in range(k):
            tr, te = folds[r] != f, folds[r] == f
            p_ref = _fit_predict(cfg_ref, emo, real, bal, anchors, emo_w, hn_pairs, (uv_[tr][:, 0], uy[tr], uva[tr]), kw_common)
            flat_x = uv_[tr].reshape(-1, uv_.shape[2])
            flat_y = uy[tr].repeat_interleave(V)
            flat_v = uva[tr].repeat_interleave(V, dim=0)
            p_aug = _fit_predict(cfg_aug, emo, real, bal, anchors, emo_w, hn_pairs, (flat_x, flat_y, flat_v), kw_common)
            e0, et = uv_[te][:, 0], _tta(uv_[te])
            Z["ref"][r][te] = np.asarray(cos_logits(p_ref, e0, anchors))
            Z["tta"][r][te] = np.asarray(cos_logits(p_ref, et, anchors))
            Z["aug"][r][te] = np.asarray(cos_logits(p_aug, e0, anchors))
            Z["aug_tta"][r][te] = np.asarray(cos_logits(p_aug, et, anchors))
        log(f"  반복 {r + 1}/{repeats} 완료 ({time.time() - t0:.0f}초)")
    M = {}
    for nm, z in Z.items():
        ms = []
        for r in range(repeats):
            p, _ = crossfit_T(z[r].astype(float), yn, folds[r])
            ms.append(metrics(p, yn, names))
        M[nm] = ms
    return {"Z": Z, "M": M, "y": yn, "folds": folds}


def selective_table(z, y, folds, fracs=(1.0, 0.75, 0.5, 0.25)):
    """애매함 표시: 1·2위 확률 차이(margin)가 큰 순으로 상위 fracs 만큼만 '확실'로 보았을 때 그 안의 정확도.
    반복마다 교차적합 온도 확률을 쓰고 합산한다."""
    margins, hits = [], []
    for r in range(z.shape[0]):
        p, _ = crossfit_T(z[r].astype(float), y, folds[r])
        s = np.sort(p, axis=1)
        margins.append(s[:, -1] - s[:, -2])
        hits.append(p.argmax(1) == y)
    margins, hits = np.concatenate(margins), np.concatenate(hits)
    order = np.argsort(-margins)
    rows = []
    for fr in fracs:
        m = max(1, int(round(len(order) * fr)))
        sel = order[:m]
        k_ = int(hits[sel].sum())
        lo, hi = wilson_ci(k_, m)
        rows.append({"coverage": fr, "n": m, "acc": k_ / m, "wilson95": [lo, hi], "margin_cut": float(margins[sel].min())})
    rest = order[int(round(len(order) * fracs[-1])):]
    return rows, float(hits[rest].mean()) if len(rest) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image-dir", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--real-dir", required=True)
    ap.add_argument("--real-dir-extra", default=None)
    ap.add_argument("--emoset-class-weight", default="dreamy=0.4")
    ap.add_argument("--max-per-class", type=int, default=3000)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--clip-model", default="ViT-B/32")
    a = ap.parse_args()
    import clip
    from pool_data import load_pool
    d = load_pool(a)
    device = d["kw_common"]["device"]
    clip_model, preprocess = clip.load(a.clip_model, device=device)
    clip_model.eval()
    mv = multiview_features(d["files"], a.image_dir, clip_model, preprocess, device)
    print(f"시점 {mv.shape[1]}개({', '.join(VIEW_NAMES)}) × 이미지 {mv.shape[0]}장")
    out = run_aug(d["emo"], d["real"], d["bal"], (mv, d["user"][1], d["user"][2]), d["anchors"], d["names"], k=a.folds,
                  repeats=a.repeats, emo_w=d["emo_w"], hn_pairs=d["hn_pairs"], kw_common=d["kw_common"])
    rows = summarize(out, d["names"], repeats=a.repeats)
    print_table(rows, d["names"])
    print("\n[채택 기준(미리 정함): 정확도 +2%p 이상, McNemar p<0.1, ECE 악화 0.01 이하]")
    for nm, r in rows.items():
        if nm == "ref":
            continue
        vr = r["vs_ref"]
        ok = vr["diff_pp"] >= 2 and vr["p_median"] < 0.1 and (r["ece"] - rows["ref"]["ece"]) <= 0.01
        print(f"  {nm:<8}{'채택 후보' if ok else '기준 미달':<9} 정확도 {vr['diff_pp']:+.1f}%p  p={vr['p_median']:.2f}  ECE {r['ece'] - rows['ref']['ece']:+.3f}")
    sel_out = {}
    for nm in ("ref", max(rows, key=lambda k_: rows[k_]["acc"])):
        if nm in sel_out:
            continue
        tab, rest_acc = selective_table(out["Z"][nm], out["y"], out["folds"])
        sel_out[nm] = {"rows": tab, "rest_acc": rest_acc}
        print(f"\n[애매함 표시 — {nm}] 1·2위 확률 차이가 큰 쪽부터 (교차검증 예측 {len(out['y']) * a.repeats}건)")
        for t in tab:
            print(f"  상위 {t['coverage']:.0%} ({t['n']}건): 정확도 {t['acc']:.1%} (95% {t['wilson95'][0]:.1%}~{t['wilson95'][1]:.1%}), 차이 하한 {t['margin_cut']:.2f}")
        if rest_acc is not None:
            print(f"  나머지 하위 25%의 정확도: {rest_acc:.1%}")
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    json.dump({"n": len(d["files"]), "variants": rows, "selective": sel_out}, open(os.path.join(ROOT, "results", "aug_experiments.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("저장: results\\aug_experiments.json")


if __name__ == "__main__":
    main()
