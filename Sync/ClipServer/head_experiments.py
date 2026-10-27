# -*- coding: utf-8 -*-
"""
단계 2: 헤드 개선 방법들을 쿠르님 라벨 풀(194장)에서 같은 겹 분할로 비교한다. 모델 파일은 건드리지 않는다.

  python head_experiments.py --image-dir data\\user_label_pool --labels data\\user_labels_all.csv ^
      --real-dir data\\train_images --real-dir-extra data\\train_images2,data\\train_images3 --emoset-class-weight dreamy=0.4

비교(전부 기준 ref = 쿠르님 라벨 가중 60 으로 학습한 현재 방식):
  cache_a{α}_b{β}  Tip-Adapter 식 캐시: 학습 겹의 쿠르님 라벨 이미지를 키로 한 유사도 투표를 ref 로짓에 더함
  wise_l{λ}        가중치 보간: 쿠르님 라벨 없이 학습한 헤드와 있는 헤드를 λ 비율로 섞음(λ=1 이 ref)
  smooth_e{ε}      헷갈리는 짝(happy↔energetic, calm↔dreamy, sad↔melancholy)에 정답 확률 ε 를 나눠 줌
  ens3             시드 3개 헤드의 로짓 평균
채택 기준(미리 정함): 정확도 +2%p 이상 AND McNemar p<0.1(반복 중앙값) AND ECE 가 0.01 넘게 나빠지지 않음.
통과 못 하면 버린다(이 풀은 194장이라 작은 차이는 잡음이다).
"""
import argparse
import copy
import json
import os
import time

import numpy as np
import torch

from ablation_cv import BASE_CFG, print_table, summarize
from eval_harness import crossfit_T, metrics
from train_projection_v2 import cos_logits, stratified_folds, train_projection

ROOT = os.path.dirname(os.path.abspath(__file__))
PAIRS = [("happy", "energetic"), ("calm", "dreamy"), ("sad", "melancholy")]
CACHE_GRID = [(1.0, 5.0), (3.0, 5.0), (3.0, 10.0)]
WISE = [0.5, 0.75]
SMOOTH = [0.1, 0.2]


def partner_tensor(names):
    t = torch.full((len(names),), -1, dtype=torch.long)
    for a, b in PAIRS:
        if a in names and b in names:
            t[names.index(a)] = names.index(b)
            t[names.index(b)] = names.index(a)
    return t


def interp(proj1, proj0, lam):
    out = copy.deepcopy(proj1)
    with torch.no_grad():
        for p, p1, p0 in zip(out.parameters(), proj1.parameters(), proj0.parameters()):
            p.copy_((1 - lam) * p0 + lam * p1)
    return out


def run_head(emo, real, bal, user, anchors, names, *, k=5, repeats=3, emo_w=None, hn_pairs=(), kw_common=None, T0=0.0525,
             epochs=None, cache_grid=CACHE_GRID, wise=WISE, smooth=SMOOTH, ens=True, log=print):
    kw_common = kw_common or {}
    cfg = dict(BASE_CFG)
    if epochs:
        cfg["epochs"] = epochs
    uf, uy, uv = user
    yn = uy.numpy()
    n, K = len(yn), anchors.shape[0]
    partner = partner_tensor(names)
    W_real = torch.full((len(real[1]),), cfg["real_w"]) * (bal if (cfg["balance"] and bal is not None) else 1.0)

    def fit(tr_mask, seed=0, eps=0.0):
        F_, Y_, V_ = [emo[0], real[0]], [emo[1], real[1]], [emo[2], real[2]]
        W = [emo_w if emo_w is not None else torch.ones(len(emo[1])), W_real]
        if tr_mask is not None:
            F_.append(uf[tr_mask]); Y_.append(uy[tr_mask]); V_.append(uv[tr_mask])
            W.append(torch.full((int(tr_mask.sum()),), cfg["user_w"]))
        kw = dict(kw_common); kw["seed"] = seed
        proj, _ = train_projection(torch.cat(F_), torch.cat(Y_), torch.cat(V_), torch.cat(W), anchors, epochs=cfg["epochs"], lr=cfg["lr"],
                                   hn_pairs=hn_pairs, hn_weight=cfg["hn_weight"], smooth_eps=eps, partner=partner if eps > 0 else None, **kw)
        return proj

    names_v = ["ref"] + [f"cache_a{a:g}_b{b:g}" for a, b in cache_grid] + [f"wise_l{l:g}" for l in wise] + \
              [f"smooth_e{e:g}" for e in smooth] + (["ens3"] if ens else [])
    Z = {v: np.zeros((repeats, n, K), dtype=np.float32) for v in names_v}
    folds = [stratified_folds(yn, k, seed=r) for r in range(repeats)]
    t0 = time.time()
    proj0 = fit(None)                      # 쿠르님 라벨 없이 학습(겹과 무관 → 한 번)
    onehot = torch.nn.functional.one_hot(uy, K).float()
    for r in range(repeats):
        for f in range(k):
            tr_np, te_np = folds[r] != f, folds[r] == f
            tr, te = torch.from_numpy(tr_np), torch.from_numpy(te_np)
            proj1 = fit(tr)
            z_ref = np.asarray(cos_logits(proj1, uf[te], anchors))
            Z["ref"][r][te_np] = z_ref
            sim = uf[te] @ uf[tr].T
            for a, b in cache_grid:
                cache = (torch.exp(-b * (1 - sim)) @ onehot[tr]).numpy()
                Z[f"cache_a{a:g}_b{b:g}"][r][te_np] = z_ref + (a * T0) * cache
            for l in wise:
                Z[f"wise_l{l:g}"][r][te_np] = np.asarray(cos_logits(interp(proj1, proj0, l), uf[te], anchors))
            for e in smooth:
                Z[f"smooth_e{e:g}"][r][te_np] = np.asarray(cos_logits(fit(tr, eps=e), uf[te], anchors))
            if ens:
                zs = [z_ref] + [np.asarray(cos_logits(fit(tr, seed=s), uf[te], anchors)) for s in (1, 2)]
                Z["ens3"][r][te_np] = np.mean(zs, axis=0)
        log(f"  반복 {r + 1}/{repeats} 완료 ({time.time() - t0:.0f}초) | ref {np.mean(Z['ref'][r].argmax(1) == yn):.3f}")
    M = {}
    for v in names_v:
        ms = []
        for r in range(repeats):
            p, _ = crossfit_T(Z[v][r].astype(float), yn, folds[r])
            m = metrics(p, yn, names)
            m["top2"] = float(np.mean([yn[i] in np.argsort(-p[i])[:2] for i in range(n)]))
            ms.append(m)
        M[v] = ms
    return {"Z": Z, "M": M, "y": yn, "folds": folds}


def verdicts(rows):
    out = {}
    for name, r in rows.items():
        if name == "ref":
            continue
        vr = r["vs_ref"]
        ece_d = r["ece"] - rows["ref"]["ece"]
        ok = vr["diff_pp"] >= 2.0 and vr["p_median"] < 0.1 and ece_d <= 0.01
        out[name] = ("채택 후보" if ok else "미채택", vr["diff_pp"], vr["p_median"], ece_d)
    return out


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
    ap.add_argument("--T0", type=float, default=0.0525, help="캐시 로짓 크기를 맞추는 온도(현재 v4 T)")
    ap.add_argument("--no-ens", action="store_true", help="앙상블(학습 2회 추가)은 건너뜀")
    a = ap.parse_args()
    from pool_data import load_pool
    d = load_pool(a)
    print(f"반복 {a.repeats} × {a.folds}겹, 변형: 캐시 {len(CACHE_GRID)} / 보간 {len(WISE)} / 평활화 {len(SMOOTH)} / 앙상블 {not a.no_ens}")
    out = run_head(d["emo"], d["real"], d["bal"], d["user"], d["anchors"], d["names"], k=a.folds, repeats=a.repeats,
                   emo_w=d["emo_w"], hn_pairs=d["hn_pairs"], kw_common=d["kw_common"], T0=a.T0, ens=not a.no_ens)
    rows = summarize(out, d["names"], repeats=a.repeats)
    print_table(rows, d["names"])
    print("\n[top-2 정확도(평균)]  " + " | ".join(f"{v} {np.mean([m['top2'] for m in ms]):.1%}" for v, ms in out["M"].items()))
    print("\n[채택 기준 판정: 정확도 +2%p 이상, McNemar p<0.1, ECE 악화 0.01 이하]")
    vd = verdicts(rows)
    for name, (v, dpp, p, ed) in vd.items():
        print(f"  {name:<18}{v:<8} 정확도 {dpp:+.1f}%p  p={p:.2f}  ECE {ed:+.3f}")
    if not any(v[0] == "채택 후보" for v in vd.values()):
        print("  → 통과한 방법이 없습니다. 이 풀 크기에서는 헤드 변경이 아니라 라벨 추가가 우선입니다.")
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    json.dump({"n": len(d["files"]), "variants": rows, "verdicts": {k_: list(v) for k_, v in vd.items()}},
              open(os.path.join(ROOT, "results", "head_experiments.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    np.savez(os.path.join(ROOT, "results", "head_experiments_preds.npz"), files=np.array(d["files"]), y=out["y"],
             **{f"z_{k_}": v for k_, v in out["Z"].items()})
    print("저장: results\\head_experiments.json")


if __name__ == "__main__":
    main()
