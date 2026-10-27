# -*- coding: utf-8 -*-
"""
복합 입력 라벨링용 CSV 템플릿 생성 (torch 불필요).  python make_fusion_template.py  → data/fusion_pairs_template.csv

100쌍 = 일치(agree) 30 + 충돌(conflict) 70. 문장은 기존 한국어 평가 문장(text_eval_*.json)에서 감정별로 고르게 뽑고,
각 문장에 짝지을 '이미지 종류(image_hint)'만 정해 둔다. 이미지는 직접 고른다.

채우는 방법 (행마다)
  1) image_hint 의 EmoSet 폴더에서 이미지 한 장을 골라 image_path 에 적는다(상대경로면 eval_fusion.py --image-root 로 기준 지정).
     같은 이미지를 여러 행에 쓰지 않는다.
  2) 이미지와 문장을 같이 봤을 때 '이 둘이 전체로 전하는 감정'을 true_emotion 에 적는다
     (happy/sad/calm/energetic/romantic/melancholy/angry/dreamy 중 하나). 문장 라벨(text_label)을 따라 적지 말 것 — 사람이 보고 정한다.
  3) 애매하면 true_emotion_alt 에 허용할 두 번째 감정을 적는다(선택). 가능하면 2~3명이 따로 라벨링해 다수결로 정한다.
  4) 완성본은 data/fusion_pairs.csv 로 저장하고 python eval_fusion.py 실행.
이미지 종류: image_hint 는 'SYNC감정 (EmoSet폴더)' 형태. EmoSet 에 없는 romantic/melancholy 는 가까운 종류로 대신 지정했다.
"""
import csv
import json
import os
import random

ROOT = os.path.dirname(os.path.abspath(__file__))
SEED = 7

# SYNC 이미지 감정 → EmoSet 폴더
IMG_DIR = {"happy": "amusement", "energetic": "excitement", "calm": "contentment",
           "sad": "sadness", "angry": "anger", "dreamy": "awe"}
IMG_CLASSES = list(IMG_DIR)
# 텍스트 감정이 romantic/melancholy 일 때 '일치' 쌍에 쓸 이미지 종류
AGREE_IMG = {"happy": "happy", "sad": "sad", "calm": "calm", "energetic": "energetic",
             "angry": "angry", "dreamy": "dreamy", "romantic": "dreamy", "melancholy": "sad"}
# '충돌' 쌍에 쓸 이미지 종류 — 의미가 정말 다른 쪽(hard)과 비슷한 쪽(soft)을 섞는다
CONFLICT_IMG = {
    "happy":      ["sad", "angry", "calm"],
    "sad":        ["energetic", "happy", "calm"],
    "calm":       ["angry", "energetic", "dreamy"],
    "energetic":  ["calm", "sad", "dreamy"],
    "angry":      ["calm", "happy", "dreamy"],
    "dreamy":     ["angry", "energetic", "sad"],
    "romantic":   ["angry", "sad", "energetic"],
    "melancholy": ["happy", "energetic", "dreamy"],
}
TEXT_EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def load_texts():
    by = {e: [] for e in TEXT_EMOTIONS}
    seen = set()
    for f in ("text_eval_fresh.json", "text_eval_heldout.json", "text_eval_set.json"):
        for it in json.load(open(os.path.join(ROOT, "data", f), encoding="utf-8"))["items"]:
            if it.get("lang") != "ko" or it["label"] not in by or it["text"] in seen:
                continue
            seen.add(it["text"])
            by[it["label"]].append(it["text"])
    return by


def build(n_agree=30, n_conflict=70):
    rnd = random.Random(SEED)
    by = load_texts()
    for e in by:
        rnd.shuffle(by[e])
    pool = {e: list(v) for e, v in by.items()}

    def take(e):
        if not pool[e]:
            raise SystemExit(f"{e} 문장이 부족합니다(text_eval_*.json 에 한국어 문장을 더 추가하세요)")
        return pool[e].pop()

    rows = []
    # 감정을 돌려가며 고르게 뽑는다
    for i in range(n_agree):
        e = TEXT_EMOTIONS[i % len(TEXT_EMOTIONS)]
        rows.append(("agree", e, take(e), AGREE_IMG[e]))
    for i in range(n_conflict):
        e = TEXT_EMOTIONS[i % len(TEXT_EMOTIONS)]
        opts = CONFLICT_IMG[e]
        rows.append(("conflict", e, take(e), opts[(i // len(TEXT_EMOTIONS)) % len(opts)]))
    rnd.shuffle(rows)
    return rows


def main():
    rows = build()
    out = os.path.join(ROOT, "data", "fusion_pairs_template.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as fh:   # utf-8-sig: 엑셀에서 한글이 안 깨짐
        w = csv.writer(fh)
        w.writerow(["pair_id", "kind", "text", "text_label", "image_hint", "image_path",
                    "true_emotion", "true_emotion_alt", "note"])
        for i, (kind, e, text, img) in enumerate(rows, 1):
            w.writerow([f"P{i:03d}", kind, text, e, f"{img} (EmoSet: {IMG_DIR[img]})", "", "", "", ""])
    n_a = sum(r[0] == "agree" for r in rows)
    print(f"{out} 생성: {len(rows)}쌍 (일치 {n_a} / 충돌 {len(rows) - n_a})")
    print("채운 뒤 data/fusion_pairs.csv 로 저장하고  python eval_fusion.py  를 실행하세요.")


if __name__ == "__main__":
    main()
