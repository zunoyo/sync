# -*- coding: utf-8 -*-
"""
한국어 키워드 경로 오프라인 평가 (torch/CLIP 불필요).

각 문장이 (1) 키워드에 걸리는지(커버리지), (2) 걸렸을 때 지배 감정 태그가 정답 라벨과 같은지(정밀도)를 본다.
키워드에 안 걸린 문장은 KoELECTRA 분류기/폴백으로 넘어가는 문장이다.
  python eval_ko_keywords.py                              # dev + held-out 둘 다
  python eval_ko_keywords.py --show-miss                  # 못 건 문장/오답 목록도 출력
dev(text_eval_set.json)는 사전 설계 때 참고한 세트라 낙관적이고, held-out(text_eval_heldout.json)이 더 믿을 만하다.
"""
import argparse
import json
import sys
from collections import defaultdict

from model.ko_keywords import translate_keywords

EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def run(path, show):
    items = [i for i in json.load(open(path, encoding="utf-8"))["items"] if i["lang"] == "ko"]
    n = len(items)
    hit = ok = 0
    per = defaultdict(lambda: [0, 0, 0])  # total, hit, ok
    misses, wrongs = [], []
    for it in items:
        r = translate_keywords(it["text"])
        per[it["label"]][0] += 1
        if r is None:
            misses.append(it)
            continue
        hit += 1
        per[it["label"]][1] += 1
        if r[1] == it["label"]:
            ok += 1
            per[it["label"]][2] += 1
        else:
            wrongs.append((it, r))
    print(f"\n=== {path} (한국어 {n}문장) ===")
    print(f"키워드로 처리: {hit}/{n} = {hit/n:.1%} | 그중 감정 일치: {ok}/{hit} = {ok/max(hit,1):.1%} | 전체 대비 정답 처리: {ok}/{n} = {ok/n:.1%}")
    print("감정별 (처리/전체, 일치):")
    for e in EMOTIONS:
        t, h, o = per[e]
        print(f"  {e:11s} 처리 {h}/{t}  일치 {o}/{h}")
    if show:
        print("\n[키워드 미처리 → 분류기/폴백으로 넘어감]")
        for it in misses:
            print(f"  ({it['label']}) {it['text']}")
        print("\n[키워드가 걸렸지만 감정 불일치]")
        for it, r in wrongs:
            print(f"  ({it['label']}→{r[1]}) {it['text']}  =>  {r[0]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--show-miss", action="store_true")
    a = ap.parse_args()
    for p in ["data/text_eval_set.json", "data/text_eval_heldout.json", "data/text_eval_fresh.json"]:
        run(p, a.show_miss)
