# -*- coding: utf-8 -*-
"""
0단계: 쿠르님 라벨(약 119장) 기준 반복 교차검증 + ablation.
같은 겹 분할(seed 0..R-1)을 모든 변형이 공유하므로 변형 사이를 McNemar 로 짝지어 비교할 수 있다.

  python ablation_cv.py --image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv ^
      --final data\\eval_final_labels.csv,data\\eval_final_labels_rest.csv ^
      --real-dir data\\train_images --real-dir-extra data\\train_images2,data\\train_images3 --emoset-class-weight dreamy=0.4

옵션: --repeats 3(기본)  --only ref,no_hn  --list(변형 목록만 출력)
출력: 화면 표 + results/ablation_cv.json + results/ablation_cv_preds.npz (이후 단계의 McNemar 비교용)
모델 파일은 건드리지 않는다.
"""
import argparse
import json
import os
import time

import numpy as np
import torch

from eval_harness import bootstrap_ci, crossfit_T, mcnemar_exact, metrics, wilson_ci
from train_projection_v2 import cos_logits, stratified_folds, train_projection

ROOT = os.path.dirname(os.path.abspath(__file__))

# 기준(ref) = 현재 서비스 모델 v3 설정. 변형은 기준에서 한 가지씩만 바꾼다.
BASE_CFG = dict(real_w=30.0, user_w=60.0, lr=1e-3, hn_weight=1.0, balance=True, epochs=10)
VARIANTS = {
    "ref": {},
    "user_w0": {"user_w": 0.0},
    "user_w10": {"user_w": 10.0},
    "user_w15": {"user_w": 15.0},
    "user_w30": {"user_w": 30.0},
    "user_w120": {"user_w": 120.0},
    "real_w0": {"real_w": 0.0},            # Claude 라벨 실사용 이미지(570장)를 학습에서 완전히 뺌
    "real_w5": {"real_w": 5.0},
    "real_w0_u120": {"real_w": 0.0, "user_w": 120.0},
    "real_w10": {"real_w": 10.0},
    "real_w15": {"real_w": 15.0},
    "lr3e-4": {"lr": 3e-4},
    "lr1e-4": {"lr": 1e-4},
    "no_hn": {"hn_weight": 0.0},
    "no_balance": {"balance": False},
}


def _fit_predict(cfg, emo, real, bal, anchors, emo_w, hn_pairs, tr_user, kw_common, device="cpu"):
    """tr_user=(feats,y,va) 학습에 쓸 쿠르님 라벨(없으면 None). → projection"""
    W = [emo_w if emo_w is not None else torch.ones(len(emo[1]))]
    F_, Y_, V_ = [emo[0]], [emo[1]], [emo[2]]
    if cfg["real_w"] > 0:      # 0 이면 행 자체를 뺀다(가중 0 행이 V/A 손실·hard-negative 분모에 섞이지 않게)
        W_real = torch.full((len(real[1]),), float(cfg["real_w"]))
        if cfg["balance"] and bal is not None:
            W_real = W_real * bal
        W.append(W_real); F_.append(real[0]); Y_.append(real[1]); V_.append(real[2])
    if tr_user is not None and cfg["user_w"] > 0:
        F_.append(tr_user[0]); Y_.append(tr_user[1]); V_.append(tr_user[2])
        W.append(torch.full((len(tr_user[1]),), float(cfg["user_w"])))
    proj, _ = train_projection(torch.cat(F_), torch.cat(Y_), torch.cat(V_), torch.cat(W), anchors,
                               epochs=cfg["epochs"], lr=cfg["lr"], hn_pairs=hn_pairs if cfg["hn_weight"] > 0 else (),
                               hn_weight=cfg["hn_weight"], **kw_common)
    return proj


def run_variants(emo, real, bal, user, anchors, names, *, variants, k=5, repeats=3, emo_w=None, hn_pairs=(),
                 kw_common=None, log=print):
    """순수 텐서 입력. 반환 dict(results, preds[name]=[R,n,K] 로짓, y, folds)."""
    kw_common = kw_common or {}
    uf, uy, uv = user
    yn = uy.numpy()
    n, K = len(yn), anchors.shape[0]
    folds = [stratified_folds(yn, k, seed=r) for r in range(repeats)]
    Z, P = {}, {}
    for name, over in variants.items():
        cfg = {**BASE_CFG, **over}
        t0 = time.time()
        z = np.zeros((repeats, n, K), dtype=np.float32)
        if cfg["user_w"] == 0:       # 쿠르님 라벨을 안 쓰면 겹과 무관 → 한 번만 학습
            proj = _fit_predict(cfg, emo, real, bal, anchors, emo_w, hn_pairs, None, kw_common)
            z[:] = np.asarray(cos_logits(proj, uf, anchors))
        else:
            for r in range(repeats):
                for f in range(k):
                    tr, te = folds[r] != f, folds[r] == f
                    proj = _fit_predict(cfg, emo, real, bal, anchors, emo_w, hn_pairs,
                                        (uf[tr], uy[tr], uv[tr]), kw_common)
                    z[r][te] = np.asarray(cos_logits(proj, uf[te], anchors))
        Z[name] = z
        # 반복마다 교차적합 온도로 확률 → 지표, 반복 평균
        ms = []
        for r in range(repeats):
            p, _ = crossfit_T(z[r].astype(float), yn, folds[r])
            ms.append(metrics(p, yn, names))
        P[name] = ms
        log(f"  [{name}] {time.time() - t0:.0f}초 | 정확도 {np.mean([m['acc'] for m in ms]):.3f} "
            f"| ECE {np.mean([m['ece'] for m in ms]):.3f}")
    return {"Z": Z, "M": P, "y": yn, "folds": folds}


def summarize(out, names, ref="ref", repeats=3):
    yn = out["y"]
    rows = {}
    for name, ms in out["M"].items():
        corr = (out["Z"][name].argmax(2) == yn[None, :]).astype(float)       # [R,n]
        acc_r = [m["acc"] for m in ms]
        lo, hi = bootstrap_ci(corr)
        wl, wh = wilson_ci(int(round(np.mean(acc_r) * len(yn))), len(yn))
        row = {"acc": float(np.mean(acc_r)), "acc_sd": float(np.std(acc_r)),
               "boot95": [lo, hi], "wilson95": [wl, wh],
               "macro_f1": float(np.mean([m["macro_f1"] for m in ms])),
               "nll": float(np.mean([m["nll"] for m in ms])),
               "brier": float(np.mean([m["brier"] for m in ms])),
               "ece": float(np.mean([m["ece"] for m in ms])),
               "mean_conf": float(np.mean([m["mean_conf"] for m in ms]))}
        if ref in out["Z"] and name != ref:
            cref = (out["Z"][ref].argmax(2) == yn[None, :])
            cc = corr.astype(bool)
            bs, cs, ps = zip(*[mcnemar_exact(cc[r], cref[r]) for r in range(cc.shape[0])])
            # b = 이 변형만 맞음?  mcnemar_exact(a,b): b=A만 맞음 → 여기서 A=변형, 기준과 비교
            row["vs_ref"] = {"only_variant_right": float(np.mean(bs)), "only_ref_right": float(np.mean(cs)),
                             "p_median": float(np.median(ps)), "diff_pp": float((row["acc"] - np.mean([m["acc"] for m in out["M"][ref]])) * 100)}
        row["recall_last"] = ms[-1]["recall"]
        row["confusion_last"] = ms[-1]["confusion"]
        row["ece_by_pred_last"] = ms[-1]["ece_by_pred"]
        rows[name] = row
    return rows


def print_table(rows, names, ref="ref"):
    print("\n[쿠르님 라벨 기준 — 반복 교차검증 평균 (모든 변형이 같은 겹 분할 사용)]")
    print(f"{'변형':<11}{'정확도':>8}{'±sd':>7}  {'95%구간(bootstrap)':<19}{'MacroF1':>8}{'NLL':>7}{'Brier':>7}{'ECE':>7}  {'vs ref(%p) [변형만맞음/ref만맞음, p]':<34}")
    for name, r in rows.items():
        vr = r.get("vs_ref")
        tail = "" if not vr else f"{vr['diff_pp']:+.1f}  [{vr['only_variant_right']:.1f}/{vr['only_ref_right']:.1f}, p={vr['p_median']:.2f}]"
        print(f"{name:<11}{r['acc']:>8.1%}{r['acc_sd']:>7.3f}  {r['boot95'][0]:.1%}~{r['boot95'][1]:.1%}{'':<4}"
              f"{r['macro_f1']:>8.3f}{r['nll']:>7.3f}{r['brier']:>7.3f}{r['ece']:>7.3f}  {tail}")
    if ref in rows:
        print(f"\n[{ref}] 감정별 재현율(마지막 반복):")
        print("  " + " | ".join(f"{k} {v}" for k, v in rows[ref]["recall_last"].items()))
        cm = np.array(rows[ref]["confusion_last"])
        print(f"\n[{ref}] 혼동행렬(행=쿠르님 라벨, 열=예측, 마지막 반복):")
        present = [i for i in range(len(names)) if cm[i].sum() > 0]
        print("  " + " " * 11 + "".join(f"{names[j][:5]:>6}" for j in range(len(names))))
        for i in present:
            print(f"  {names[i]:<11}" + "".join(f"{cm[i, j]:>6}" for j in range(len(names))))
        print(f"\n[{ref}] 예측 감정별 ECE(예측 5장 이상인 감정만, n이 작아 참고용):")
        print("  " + " | ".join(f"{k} n={v['n']} ECE {v['ece']}" for k, v in rows[ref]["ece_by_pred_last"].items()))
    print("\n읽는 법: 표본이 119장이라 ±구간이 넓습니다. 'vs ref'에서 순 +8~10%p 이상이거나 p<0.1 이면 의미 있는 변화, 그 미만은 잡음으로 봅니다.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image-dir", default=None)
    ap.add_argument("--human", default=None)
    ap.add_argument("--claude", default=None)
    ap.add_argument("--final", default=None)
    ap.add_argument("--labels", default=None, help="통합 라벨 CSV(file,emotion). 주면 --human/--claude/--final 은 필요 없음")
    ap.add_argument("--real-dir", default=None)
    ap.add_argument("--real-dir-extra", default=None)
    ap.add_argument("--emoset-class-weight", default="dreamy=0.4")
    ap.add_argument("--max-per-class", type=int, default=3000)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--only", default=None, help="쉼표로 변형 이름(ref 는 자동 포함)")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--clip-model", default="ViT-B/32")
    args = ap.parse_args()

    if args.list:
        for k_, v in VARIANTS.items():
            print(f"  {k_:<11}", {**BASE_CFG, **v} if k_ == "ref" else v)
        return
    for need in ("image_dir", "real_dir") + (() if args.labels else ("human", "claude", "final")):
        if getattr(args, need) is None:
            ap.error(f"--{need.replace('_', '-')} 가 필요합니다")

    import clip
    from PIL import Image
    from eval_labelers import read_labels
    from feature_cache import get_features
    from model.emotion_mapper import EmotionMapper
    from model.emotion_prompts import build_prompt_ensemble_anchors
    from model.emotion_va_map import SERVICE_VA_ANCHOR, TRAINED_SYNC_EMOTIONS
    from train_projection_v2 import (DEFAULT_HN_PAIRS, balance_factors, emoset_class_weights, parse_pairs, real_features)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    names = EmotionMapper().get_all_emotions()
    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()
    anchors = build_prompt_ensemble_anchors(clip_model, device, names).cpu()
    to_srv = torch.tensor([names.index(e) for e in TRAINED_SYNC_EMOTIONS])
    ef, el, ev = get_features("train", args.max_per_class, clip_model, preprocess, device, clip_name=args.clip_model)
    emo = (ef, to_srv[el], ev)
    rf, ry, _ = real_features(args.real_dir, names, clip_model, preprocess, device, args.clip_model)
    for extra in [x.strip() for x in str(args.real_dir_extra or "").split(",") if x.strip()]:
        if os.path.isdir(extra):
            rf2, ry2, _ = real_features(extra, names, clip_model, preprocess, device, args.clip_model)
            rf, ry = torch.cat([rf, rf2]), torch.cat([ry, ry2])
    rv = torch.tensor([SERVICE_VA_ANCHOR[names[int(i)]] for i in ry], dtype=torch.float32)
    bal = balance_factors(ry, len(names))
    emo_w = emoset_class_weights(emo[1], names, args.emoset_class_weight)

    if args.labels:      # build_label_pool.py 가 만든 통합 라벨(file,emotion)
        truth = read_labels(args.labels)
    else:
        human, claude = read_labels(args.human), read_labels(args.claude)
        final = {}
        for p in [x.strip() for x in args.final.split(",") if x.strip()]:
            final.update(read_labels(p))
        truth = {f: human[f] for f in human if f in claude and human[f] == claude[f]}
        truth.update(final)
    files = sorted(f for f in truth if os.path.exists(os.path.join(args.image_dir, f)))
    feats = []
    for i in range(0, len(files), 32):
        x = torch.stack([preprocess(Image.open(os.path.join(args.image_dir, f)).convert("RGB")) for f in files[i:i + 32]]).to(device)
        with torch.no_grad():
            e = clip_model.encode_image(x).float()
        feats.append((e / e.norm(dim=-1, keepdim=True)).cpu())
    uf = torch.cat(feats)
    uy = torch.tensor([names.index(truth[f]) for f in files], dtype=torch.long)
    uv = torch.tensor([SERVICE_VA_ANCHOR[truth[f]] for f in files], dtype=torch.float32)
    print(f"학습용 실사용 {len(ry)}장 | 쿠르님 라벨 이미지 {len(files)}장 | 반복 {args.repeats} × {args.folds}겹")

    var = VARIANTS if not args.only else {k_: v for k_, v in VARIANTS.items() if k_ == "ref" or k_ in args.only.split(",")}
    kw_common = dict(weight_decay=1e-4, hn_margin=0.1, seed=0, device=device)
    out = run_variants(emo, (rf, ry, rv), bal, (uf, uy, uv), anchors, names, variants=var, k=args.folds,
                       repeats=args.repeats, emo_w=emo_w, hn_pairs=parse_pairs(DEFAULT_HN_PAIRS, names), kw_common=kw_common)
    rows = summarize(out, names, repeats=args.repeats)
    print_table(rows, names)
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    with open(os.path.join(ROOT, "results", "ablation_cv.json"), "w", encoding="utf-8") as fh:
        json.dump({"n": len(files), "repeats": args.repeats, "folds": args.folds, "variants": rows}, fh, ensure_ascii=False, indent=2)
    np.savez(os.path.join(ROOT, "results", "ablation_cv_preds.npz"), files=np.array(files), y=out["y"],
             **{f"z_{k_}": v for k_, v in out["Z"].items()})
    print("저장: results\\ablation_cv.json, results\\ablation_cv_preds.npz")


if __name__ == "__main__":
    main()
