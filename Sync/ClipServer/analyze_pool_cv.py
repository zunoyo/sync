# -*- coding: utf-8 -*-
"""
ablation_cv.py 가 저장한 results\\ablation_cv_preds.npz 를 다시 분석한다(학습·CLIP 불필요, 몇 초).
  python analyze_pool_cv.py [--variant ref] [--T 0.043]
- 이미지 출처별 정확도: e_(기존 쿠르님 라벨 119장) vs h_(모델이 헷갈려 해서 뽑은 추가 라벨)
- 온도별 확신도 점검: v3 의 온도(0.0430)로 계산한 ECE / 평균 확신도 vs 쿠르님 라벨 예측만으로 맞춘 온도
"""
import argparse
import os

import numpy as np

from eval_harness import _fit_T, _softmax, ece

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--npz", default=os.path.join(ROOT, "results", "ablation_cv_preds.npz"))
    ap.add_argument("--variant", default="ref")
    ap.add_argument("--T", type=float, default=0.0430, help="현재 서비스(v3) 이미지 온도")
    a = ap.parse_args()
    d = np.load(a.npz, allow_pickle=True)
    files, y = d["files"], d["y"]
    Z = d[f"z_{a.variant}"].astype(float)          # [R,n,K]
    R, n, K = Z.shape
    print(f"[{a.variant}] 이미지 {n}장, 반복 {R}회")
    for tag, m in (("전체", np.ones(n, bool)), ("e_ 기존 쿠르님 라벨", np.array([f.startswith("e_") for f in files])),
                   ("h_ 추가(헷갈린 이미지)", np.array([f.startswith("h_") for f in files]))):
        acc = np.mean([(Z[r][m].argmax(1) == y[m]).mean() for r in range(R)])
        top2 = np.mean([np.mean([y[i] in np.argsort(-Z[r][i])[:2] for i in np.where(m)[0]]) for r in range(R)])
        print(f"  {tag:<22} n={int(m.sum()):>3}  정확도 {acc:.1%}  top-2 {top2:.1%}")
    names = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]
    print("\n감정별 재현율(반복 평균):")
    for k_ in range(K):
        m = y == k_
        if m.any():
            rec = np.mean([(Z[r][m].argmax(1) == k_).mean() for r in range(R)])
            print(f"  {names[k_]:<11} n={int(m.sum()):>3}  {rec:.0%}")
    zr = Z[0]
    T_fit = _fit_T(zr, y)
    print(f"\n온도 비교(반복 1회 예측, 쿠르님 라벨만으로 맞춘 온도 = {T_fit:.4f}, v3 = {a.T:.4f})")
    for name, T in (("v3 온도", a.T), ("쿠르님 라벨로 맞춘 온도", T_fit)):
        p = _softmax(zr / T)
        print(f"  {name:<22} T={T:.4f}  ECE {ece(p, y):.3f}  평균 확신도 {p.max(1).mean():.3f}  실제 정확도 {(p.argmax(1) == y).mean():.3f}")
    p = _softmax(zr / T_fit)
    conf = p.max(1)
    print("  쿠르님 라벨 온도 기준 확신도 구간별:")
    for lo, hi in [(0, .4), (.4, .6), (.6, .8), (.8, 1.01)]:
        s = (conf >= lo) & (conf < hi)
        if s.any():
            print(f"    {lo:.0%}~{min(hi, 1):.0%}: {int(s.sum()):>3}장, 정답률 {(p.argmax(1)[s] == y[s]).mean():.1%}, 평균 확신도 {conf[s].mean():.1%}")
    print("\n주의: 온도 1개를 같은 예측으로 맞춘 값이라 약간 낙관적입니다(파라미터가 1개라 영향은 작음).")


if __name__ == "__main__":
    main()
