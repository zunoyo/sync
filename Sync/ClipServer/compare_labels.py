# -*- coding: utf-8 -*-
"""
두 사람(또는 사람 vs Claude)이 붙인 이미지 라벨이 얼마나 일치하는지 본다.
  python compare_labels.py --a data\\image_labels.csv --b data\\ai_labels_eval.csv
일치율(%)과 Cohen's kappa(우연 일치를 뺀 값), 감정별 일치, 서로 다르게 붙인 감정 쌍, 불일치 파일 목록을 보여 준다.
kappa 대략: 0.8↑ 매우 높음 / 0.6~0.8 상당함 / 0.4~0.6 보통 / 0.4↓ 낮음 → 낮을수록 '정답'이 주관적이라 모델 평가 점수의 상한이 낮다는 뜻.
"""
import argparse
import csv
from collections import Counter

EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return {r["file"]: r["emotion"].strip() for r in csv.DictReader(fh) if (r.get("emotion") or "").strip() in EMOTIONS}


def compare(a: dict, b: dict):
    common = sorted(set(a) & set(b))
    n = len(common)
    if not n:
        return None
    agree = sum(a[f] == b[f] for f in common)
    pa, pb = Counter(a[f] for f in common), Counter(b[f] for f in common)
    pe = sum(pa[e] * pb[e] for e in EMOTIONS) / (n * n)
    po = agree / n
    kappa = (po - pe) / (1 - pe) if pe < 1 else 1.0
    pair = Counter((a[f], b[f]) for f in common if a[f] != b[f])
    per = {e: (sum(1 for f in common if a[f] == e and b[f] == e), sum(1 for f in common if a[f] == e)) for e in EMOTIONS}
    return {"n": n, "agree": agree, "rate": po, "kappa": kappa, "pair": pair, "per": per,
            "diff": [(f, a[f], b[f]) for f in common if a[f] != b[f]],
            "only_a": len(set(a) - set(b)), "only_b": len(set(b) - set(a))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True, help="A 라벨 CSV(예: 내가 붙인 data\\image_labels.csv)")
    ap.add_argument("--b", required=True, help="B 라벨 CSV(예: Claude 가 붙인 ai_labels_eval.csv)")
    args = ap.parse_args()
    r = compare(read(args.a), read(args.b))
    if not r:
        raise SystemExit("두 파일에 같이 라벨된 이미지가 없습니다(파일명이 같은지 확인)")
    print(f"둘 다 라벨한 이미지 {r['n']}장 (A만 {r['only_a']}장, B만 {r['only_b']}장은 제외)")
    print(f"일치 {r['agree']}/{r['n']} = {r['rate']:.1%}   Cohen's kappa = {r['kappa']:.3f}")
    print("\nA 기준 감정별 일치 (A가 그 감정이라 한 것 중 B도 같게 붙인 수):")
    for e in EMOTIONS:
        hit, tot = r["per"][e]
        if tot:
            print(f"  {e:<11}{hit:>3}/{tot:<3} ({hit / tot:.0%})")
    print("\n자주 엇갈린 쌍 (A → B):")
    for (x, y), c in r["pair"].most_common(10):
        print(f"  {x:<11}→ {y:<11}{c}장")
    print("\n불일치 파일 (A / B):")
    for f, x, y in r["diff"]:
        print(f"  {f}  {x} / {y}")


if __name__ == "__main__":
    main()
