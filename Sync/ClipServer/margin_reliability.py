# -*- coding: utf-8 -*-
"""
'확실/보통/애매' 3단계 기준을 봉인 테스트의 저장된 예측으로 한 번 확인한다(모델을 다시 돌리지 않는다).
기준은 교차검증(aug_experiments.py, 281장 × 3회)에서 미리 정했다: 1·2위 확률 차이(margin) ≥0.38 확실, 0.18~0.38 보통, <0.18 애매.

  python margin_reliability.py --tag v4
이 결과로 기준값을 바꾸지 않는다(바꾸면 봉인 테스트가 다시 선택에 쓰임). 구간별 정확도가 크게 어긋나면 그대로 보고만 한다.
"""
import argparse
import os

import numpy as np

from eval_harness import wilson_ci

ROOT = os.path.dirname(os.path.abspath(__file__))


def bands(P, y, hi=0.38, lo=0.18):
    s = np.sort(P, axis=1)
    margin = s[:, -1] - s[:, -2]
    hit = P.argmax(1) == y
    conf = P.max(1)
    out = []
    for name, m in (("확실", margin >= hi), ("보통", (margin >= lo) & (margin < hi)), ("애매", margin < lo)):
        n = int(m.sum())
        k = int(hit[m].sum())
        out.append({"band": name, "n": n, "k": k, "acc": (k / n if n else None), "wilson95": wilson_ci(k, n),
                    "mean_conf": float(conf[m].mean()) if n else None})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="v4")
    ap.add_argument("--hi", type=float, default=0.38)
    ap.add_argument("--lo", type=float, default=0.18)
    a = ap.parse_args()
    d = np.load(os.path.join(ROOT, "results", f"sealed_preds_{a.tag}.npz"), allow_pickle=True)
    P, y = d["P"], d["y"]
    print(f"[봉인 테스트 {a.tag}] n={len(y)}  기준: 확실 ≥{a.hi}, 보통 {a.lo}~{a.hi}, 애매 <{a.lo} (교차검증에서 미리 정함)")
    for b in bands(P, y, a.hi, a.lo):
        if b["n"]:
            print(f"  {b['band']}: {b['n']}장, 정확도 {b['acc']:.1%} (95% {b['wilson95'][0]:.1%}~{b['wilson95'][1]:.1%}), 화면 신뢰도 평균 {b['mean_conf']:.0%}")
        else:
            print(f"  {b['band']}: 0장")
    print("교차검증 기대값(참고): 확실 약 75%, 보통 약 50%, 애매 약 35%")


if __name__ == "__main__":
    main()
