# -*- coding: utf-8 -*-
"""
[Step 3] 텍스트 전용 temperature 보정.

배경: analyze_text()는 이미지 경로에서 fit한 T(0.0388)를 그대로 쓰고 있다. 그런데 텍스트 경로는
projection 없는 순수 zero-shot 이라 logit(코사인 유사도) 분포가 이미지와 다르다 — 그래서 확신도가
23~47%대에 머문다. 이 스크립트는 텍스트 경로의 logit 으로 따로 T 를 맞춘다.

중요(기대치): temperature 보정은 "확신도를 실제 정답률에 맞추는" 작업이지 "높이는" 작업이 아니다.
텍스트 정확도가 50%라면 보정 후 평균 확신도도 50% 근처가 되는 게 정상이다. 지금 확신도가 정확도보다
낮게 나오고 있었다면 올라가고, 높게 나오고 있었다면 오히려 내려간다. 목표는 '믿을 수 있는 수치'.

동작:
  1) data/text_eval_set.json (감정 8개 × 한/영 문장) 을 서비스와 똑같은 경로
     (_translate_korean → CLIP text encoder → 감정 앵커 코사인 유사도)로 통과시켜 logit 수집
  2) 문장을 절반(fit)/절반(test)으로 나눠서, fit 절반으로 T 를 맞추고 test 절반에서 현재 T(이미지 기준)와 비교
     → T 하나만 맞추는 거라 과적합 위험은 작지만, 문장이 100개 안팎이라 숫자가 흔들릴 수 있어서 확인용으로 둠
  3) 번역 경로별(영어 원문 / 키워드 사전 / KoELECTRA / fallback 고정문장) 정확도를 따로 출력
     → 텍스트 정확도가 낮을 때 원인이 CLIP 인지 한국어 번역 단계인지 구분하기 위함
  4) --write 를 주면 전체 문장으로 맞춘 T 를 체크포인트에 temperature_text 로 저장(백업 .bak 생성)

사용 예:
    python calibrate_text_temperature.py                 # 측정만 (체크포인트 안 건드림)
    python calibrate_text_temperature.py --write         # 측정 + temperature_text 저장
"""

import argparse
import json
import os
import shutil
from collections import defaultdict

import numpy as np
import torch

from baseline_snapshot import summarize
from calibrate_temperature import fit_temperature

FALLBACK_SENTENCE = "a music that matches this emotional feeling and mood"


def route_of(item: dict, english: str) -> str:
    if item["lang"] == "en":
        return "english"
    if english == FALLBACK_SENTENCE:
        return "fallback"
    if english.startswith("a ") and english.endswith("feeling music"):
        return "classifier"      # KoELECTRA 2차 분류기를 거쳐 나온 프롬프트
    return "keyword"             # 키워드 사전 매칭


def collect(model, items):
    from model.clip_model import _translate_korean
    import clip

    logits, labels, routes, englishes = [], [], [], []
    with torch.no_grad():
        for it in items:
            english = _translate_korean(it["text"])
            tok = clip.tokenize([english], truncate=True).to(model.device)
            feat = model.model.encode_text(tok)
            feat = feat / feat.norm(dim=-1, keepdim=True)
            logits.append((feat @ model.emotion_features.T).squeeze().float().cpu().numpy())
            labels.append(model.emotions.index(it["label"]))
            routes.append(route_of(it, english))
            englishes.append(english)
    return np.stack(logits), np.array(labels), routes, englishes


def brief(tag, s):
    print(f"  {tag:<34} acc={s['accuracy']:.3f}  macroF1={s['macro_f1']:.3f}  "
          f"ECE={s['ece_with_T']:.3f}  Brier={s['brier_with_T']:.3f}  평균확신도={s['mean_confidence_with_T']:.3f}")


def main():
    from model.clip_model import ClipModel

    ap = argparse.ArgumentParser()
    ap.add_argument("--eval-set", default="data/text_eval_set.json")
    ap.add_argument("--checkpoint", default="model/emotion_projection.pt")
    ap.add_argument("--write", action="store_true", help="전체 문장으로 맞춘 T 를 체크포인트에 temperature_text 로 저장")
    ap.add_argument("--out", default="results/step3_text_temperature.json")
    args = ap.parse_args()

    with open(args.eval_set, encoding="utf-8") as f:
        items = json.load(f)["items"]

    model = ClipModel()
    names = list(model.emotions)
    t_img = float(model.temperature)
    print(f"감정(서비스 순서): {names}")
    print(f"문장 {len(items)}개 | 현재 텍스트 경로가 쓰는 T(이미지 기준) = {t_img:.4f}")

    logits, labels, routes, englishes = collect(model, items)

    # ── 번역 경로별 정확도 ───────────────────────────────────────────────
    pred = logits.argmax(axis=1)
    by_route = defaultdict(lambda: [0, 0])
    for r, p, y in zip(routes, pred, labels):
        by_route[r][0] += int(p == y)
        by_route[r][1] += 1
    print("\n[번역 경로별 정확도 — 온도와 무관]")
    for r, (c, n) in sorted(by_route.items()):
        print(f"  {r:<11} {c}/{n} = {c / n:.3f}")

    # ── fit / test 분할 (감정별로 번갈아) ───────────────────────────────
    order = defaultdict(int)
    fit_idx, test_idx = [], []
    for i, it in enumerate(items):
        (fit_idx if order[it["label"]] % 2 == 0 else test_idx).append(i)
        order[it["label"]] += 1
    fit_idx, test_idx = np.array(fit_idx), np.array(test_idx)

    L = torch.tensor(logits)
    Y = torch.tensor(labels)
    t_fit_half = fit_temperature(L[fit_idx].clone(), Y[fit_idx])
    t_all = fit_temperature(L.clone(), Y)

    print(f"\n[맞춘 T] fit 절반={t_fit_half:.4f} | 전체={t_all:.4f} | 현재(이미지 기준)={t_img:.4f}")
    print("\n[test 절반 — fit 에 안 쓴 문장]")
    s_old = summarize(labels[test_idx], logits[test_idx], t_img, names)
    s_new = summarize(labels[test_idx], logits[test_idx], t_fit_half, names)
    brief(f"현재 T={t_img:.4f}", s_old)
    brief(f"텍스트 전용 T={t_fit_half:.4f}", s_new)

    print("\n[전체 문장]")
    s_all_old = summarize(labels, logits, t_img, names)
    s_all_new = summarize(labels, logits, t_all, names)
    brief(f"현재 T={t_img:.4f}", s_all_old)
    brief(f"텍스트 전용 T={t_all:.4f}", s_all_new)

    print("\n감정별 recall (T 무관):")
    for n in names:
        print(f"  {n:<11} {s_all_new['per_class_recall'][n]:.3f}")
    print("Confusion Matrix (행=실제, 열=예측):")
    print("  ", names)
    for row in s_all_new["confusion_matrix"]:
        print("  ", row)

    result = {
        "n_items": len(items), "t_image_current": t_img,
        "t_text_fit_half": t_fit_half, "t_text_all": t_all,
        "route_accuracy": {r: {"correct": c, "n": n} for r, (c, n) in by_route.items()},
        "test_half": {"current_T": s_old, "text_T": s_new},
        "all": {"current_T": s_all_old, "text_T": s_all_new},
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {args.out}")

    if args.write:
        shutil.copyfile(args.checkpoint, args.checkpoint + ".bak")
        ckpt = torch.load(args.checkpoint, map_location="cpu")
        ckpt["temperature_text"] = float(t_all)
        torch.save(ckpt, args.checkpoint)
        print(f"체크포인트에 temperature_text={t_all:.4f} 저장 (백업: {args.checkpoint}.bak)")
    else:
        print("(측정만 했습니다. 서비스에 반영하려면 --write 로 다시 실행하세요)")


if __name__ == "__main__":
    main()
