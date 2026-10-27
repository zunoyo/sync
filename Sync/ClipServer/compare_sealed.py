# -*- coding: utf-8 -*-
"""
봉인 테스트에서 두 모델을 짝지어 비교한다(eval_sealed.py 가 저장한 예측 사용, 학습·CLIP 불필요).
  python compare_sealed.py --a v3_baseline --b v4
같은 99장에 대해 정확도 차이, McNemar(정확 검정), Macro-F1, ECE, top-2, 감정별 재현율을 보여 준다.
"""
import argparse
import os

import numpy as np

from eval_harness import bootstrap_ci, ece, mcnemar_exact, metrics

ROOT = os.path.dirname(os.path.abspath(__file__))
NAMES = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def top2(P, y):
    return float(np.mean([y[i] in np.argsort(-P[i])[:2] for i in range(len(y))]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True, help="태그(예: v3_baseline)")
    ap.add_argument("--b", required=True, help="태그(예: v4)")
    a = ap.parse_args()
    A = np.load(os.path.join(ROOT, "results", f"sealed_preds_{a.a}.npz"), allow_pickle=True)
    B = np.load(os.path.join(ROOT, "results", f"sealed_preds_{a.b}.npz"), allow_pickle=True)
    if list(A["files"]) != list(B["files"]):
        raise SystemExit("두 평가의 이미지 목록이 다릅니다.")
    y, Pa, Pb = A["y"], A["P"], B["P"]
    ca, cb = Pa.argmax(1) == y, Pb.argmax(1) == y
    b, c, p = mcnemar_exact(cb, ca)      # b = B만 맞음, c = A만 맞음
    print(f"[봉인 테스트 짝 비교] n={len(y)}   A={a.a}   B={a.b}")
    for tag, P, cc in ((a.a, Pa, ca), (a.b, Pb, cb)):
        m = metrics(P, y, NAMES)
        lo, hi = bootstrap_ci(cc)
        print(f"  {tag:<14} 정확도 {m['acc']:.1%} ({lo:.1%}~{hi:.1%})  top-2 {top2(P, y):.1%}  Macro-F1 {m['macro_f1']:.3f}  NLL {m['nll']:.3f}  ECE {m['ece']:.3f}  평균확신도 {m['mean_conf']:.3f}")
    print(f"  차이(B-A) 정확도 {(cb.mean() - ca.mean()) * 100:+.1f}%p | B만 맞음 {b}장, A만 맞음 {c}장, McNemar p={p:.3f}")
    print("  감정별 재현율(A → B):")
    for k, n_ in enumerate(NAMES):
        m = y == k
        if m.any():
            print(f"    {n_:<11} n={int(m.sum()):>2}  {int(ca[m].sum())}/{int(m.sum())} → {int(cb[m].sum())}/{int(m.sum())}")
    print("\n읽는 법: 99장에서는 순 +8~10장 이상 차이가 나야 p<0.1 이 됩니다. 그 미만이면 '차이를 확인하지 못함'으로 보고합니다.")


if __name__ == "__main__":
    main()
