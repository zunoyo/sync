# -*- coding: utf-8 -*-
"""
캐시(Tip-Adapter 식) 후보의 약점을 점검한다. 모델 학습 없이 head_experiments 가 저장한 예측(results\\head_experiments_preds.npz)을 재사용해서 1~2분이면 끝난다.

  python cache_experiments.py --image-dir data\\user_label_pool

점검 항목
  1) 유사 이미지 누수: 같은 앨범 시리즈처럼 거의 같은 이미지가 학습 겹에 있으면 캐시가 그걸 그대로 따라 해서 교차검증이 부풀려진다.
     → cap0.95 / cap0.90: 코사인 유사도가 그 값보다 높은 학습 겹 이미지는 캐시 키에서 뺀다. 이득이 사라지면 누수 효과였다는 뜻.
  2) 다수 감정 쏠림: 캐시 투표는 장수가 많은 감정(calm 48장)에 유리하다(교차검증에서 calm 57→78%, melancholy 18→3%).
     → bal: 감정별 투표를 그 감정 장수로 나눠 감정끼리 같은 힘으로 만든다.
비교 기준은 ref(현재 방식)이며 채택 기준은 단계 2와 같다(+2%p, p<0.1, ECE 악화 0.01 이하). 여기서 더 고르지 않고 결과를 그대로 보고한다.
"""
import argparse
import json
import os

import numpy as np

from ablation_cv import print_table, summarize
from eval_harness import crossfit_T, metrics
from train_projection_v2 import stratified_folds

ROOT = os.path.dirname(os.path.abspath(__file__))
VARIANTS = {
    "cache_a3_b10": dict(a=3.0, b=10.0),
    "cache_a3_b10_cap0.95": dict(a=3.0, b=10.0, cap=0.95),
    "cache_a3_b10_cap0.90": dict(a=3.0, b=10.0, cap=0.90),
    "cache_a3_b10_bal": dict(a=3.0, b=10.0, bal=True),
    "cache_a1_b5_bal": dict(a=1.0, b=5.0, bal=True),
    "cache_a3_b10_bal_cap0.95": dict(a=3.0, b=10.0, bal=True, cap=0.95),
}


def cache_logits(S_te, y_tr, K, *, b, bal=False, cap=None):
    """S_te[nte,ntr] 코사인 유사도 → [nte,K] 캐시 투표."""
    A = np.exp(-b * (1 - S_te))
    if cap is not None:
        A = np.where(S_te > cap, 0.0, A)
    onehot = np.eye(K)[y_tr]
    votes = A @ onehot
    if bal:
        cnt = np.maximum(onehot.sum(0), 1.0)
        votes = votes / cnt * cnt.mean()
    return votes


def run(Zref, y, S, names, *, k=5, T0=0.0525, variants=VARIANTS, log=print):
    R, n, K = Zref.shape
    Z = {"ref": Zref.copy()}
    diag = {"frac_dup95": [], "frac_dup90": [], "acc_ref_dup": [], "acc_cache_dup": []}
    for v in variants:
        Z[v] = np.zeros_like(Zref)
    folds = [stratified_folds(y, k, seed=r) for r in range(R)]
    for r in range(R):
        for f in range(k):
            te, tr = np.where(folds[r] == f)[0], np.where(folds[r] != f)[0]
            S_te = S[np.ix_(te, tr)]
            for v, p in variants.items():
                cl = cache_logits(S_te, y[tr], K, b=p["b"], bal=p.get("bal", False), cap=p.get("cap"))
                Z[v][r][te] = Zref[r][te] + p["a"] * T0 * cl
            mx = S_te.max(1)
            diag["frac_dup95"] += list(mx > 0.95)
            diag["frac_dup90"] += list(mx > 0.90)
    M = {}
    for v in Z:
        ms = []
        for r in range(R):
            p, _ = crossfit_T(Z[v][r].astype(float), y, folds[r])
            ms.append(metrics(p, y, names))
        M[v] = ms
    return {"Z": Z, "M": M, "y": y, "folds": folds}, diag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image-dir", required=True)
    ap.add_argument("--npz", default=os.path.join(ROOT, "results", "head_experiments_preds.npz"))
    ap.add_argument("--clip-model", default="ViT-B/32")
    ap.add_argument("--T0", type=float, default=0.0525)
    a = ap.parse_args()
    import clip
    import torch
    from PIL import Image
    from model.emotion_mapper import EmotionMapper
    d = np.load(a.npz, allow_pickle=True)
    files, y, Zref = list(d["files"]), d["y"], d["z_ref"].astype(float)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    names = EmotionMapper().get_all_emotions()
    cm, pre = clip.load(a.clip_model, device=device)
    cm.eval()
    feats = []
    for i in range(0, len(files), 32):
        x = torch.stack([pre(Image.open(os.path.join(a.image_dir, f)).convert("RGB")) for f in files[i:i + 32]]).to(device)
        with torch.no_grad():
            e = cm.encode_image(x).float()
        feats.append((e / e.norm(dim=-1, keepdim=True)).cpu())
    F = torch.cat(feats).numpy()
    S = F @ F.T
    out, diag = run(Zref, y, S, names, T0=a.T0)
    rows = summarize(out, names, repeats=Zref.shape[0])
    print_table(rows, names)
    n = len(y)
    dup95 = np.array(diag["frac_dup95"]).reshape(Zref.shape[0], n)   # fold 순서가 섞여 있어 전체 비율만 사용
    print(f"\n[유사 이미지] 학습 겹에 코사인 유사도 0.95 초과 이미지가 있는 비율 {np.mean(diag['frac_dup95']):.0%}, 0.90 초과 {np.mean(diag['frac_dup90']):.0%}")
    print("\n[감정별 재현율(반복 평균)]")
    print(f"  {'':<28}" + "".join(f"{nm[:6]:>8}" for nm in names))
    for v, z in out["Z"].items():
        rec = []
        for k_ in range(len(names)):
            m = y == k_
            rec.append(np.mean([(z[r][m].argmax(1) == k_).mean() for r in range(z.shape[0])]) if m.any() else float("nan"))
        print(f"  {v:<28}" + "".join(f"{x:>8.0%}" for x in rec))
    print("\n해석 가이드: cap 변형에서도 ref 보다 +2%p 이상이면 누수 때문이 아니다 / bal 변형에서 melancholy 재현율이 회복되면 다수 감정 쏠림이 원인이다.")
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    json.dump({"variants": rows}, open(os.path.join(ROOT, "results", "cache_experiments.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("저장: results\\cache_experiments.json")


if __name__ == "__main__":
    main()
