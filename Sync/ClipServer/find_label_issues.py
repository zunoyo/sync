# -*- coding: utf-8 -*-
"""
학습 라벨 중 '틀렸을 가능성이 큰 것'을 골라 검토용 이미지 시트로 만든다.

[왜]
melancholy·calm·sad·dreamy 는 라벨이 사람마다 갈린다. 학습 이미지의 라벨은 대부분 Claude 한 명이 붙였기 때문에
그 편향이 모델에 그대로 들어간다. 학습에 안 쓴 상태(OOF)의 모델이 "이 이미지는 X 다"라고 확신하는데 라벨이 다른 것을
먼저 사람이 다시 보면, 적은 수고로 라벨을 바로잡을 수 있다.

사용
  1) python train_projection_v2.py ... --dump-oof results\\oof_predictions.csv     (학습할 때 같이 저장)
  2) python find_label_issues.py                       → results\\label_review\\sheet_01.jpg ... + review.csv
  3) 시트를 보고 라벨이 틀린 이미지의 번호와 맞는 감정을 정한다.
  4) python apply_label_fixes.py --set "3=sad,17=melancholy"      (또는 review.csv 의 new_label 칸을 채워 --review 로)
시트에는 번호, 현재 라벨 → 모델 추정, 모델 확신도가 적혀 있다. 모델이 항상 맞는 건 아니니 '그림을 보고' 판단한다.
"""
import argparse
import csv
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
FOCUS = {"melancholy", "sad", "calm", "dreamy", "romantic"}


def pick_issues(rows, thr=0.6, only_focus=True, limit=80):
    """rows: [{file,label,guess,p_label,p_guess}] → 라벨≠추정이고 p_guess>=thr 인 것을 확신도 큰 순서로."""
    out = []
    for r in rows:
        if r["label"] == r["guess"]:
            continue
        if float(r["p_guess"]) < thr:
            continue
        if only_focus and not ({r["label"], r["guess"]} & FOCUS):
            continue
        out.append(r)
    out.sort(key=lambda r: -float(r["p_guess"]))
    return out[:limit]


def make_sheets(issues, out_dir, cols=5, rows_=4, tile=230):
    from PIL import Image, ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    per = cols * rows_
    paths = []
    for s in range(0, len(issues), per):
        chunk = issues[s:s + per]
        im = Image.new("RGB", (cols * tile, rows_ * (tile + 34)), "white")
        dr = ImageDraw.Draw(im)
        for k, r in enumerate(chunk):
            x = Image.open(r["file"]).convert("RGB")
            x.thumbnail((tile, tile))
            cx, cy = (k % cols) * tile, (k // cols) * (tile + 34)
            im.paste(x, (cx, cy + 34))
            dr.text((cx + 4, cy + 2), f"#{s + k + 1}  {r['label']} -> {r['guess']}", fill="red")
            dr.text((cx + 4, cy + 16), f"model {float(r['p_guess']):.0%}  ({os.path.basename(r['file'])})", fill="gray")
        p = os.path.join(out_dir, f"sheet_{s // per + 1:02d}.jpg")
        im.save(p, quality=85)
        paths.append(p)
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--oof", default=os.path.join(ROOT, "results", "oof_predictions.csv"))
    ap.add_argument("--out", default=os.path.join(ROOT, "results", "label_review"))
    ap.add_argument("--thr", type=float, default=0.6, help="모델 확신도 하한")
    ap.add_argument("--limit", type=int, default=80)
    ap.add_argument("--all-emotions", action="store_true", help="melancholy·sad·calm·dreamy·romantic 이외의 쌍도 포함")
    args = ap.parse_args()
    with open(args.oof, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    issues = pick_issues(rows, args.thr, not args.all_emotions, args.limit)
    if not issues:
        raise SystemExit("의심되는 라벨이 없습니다(--thr 를 낮춰 보세요).")
    sheets = make_sheets(issues, args.out)
    with open(os.path.join(args.out, "review.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["idx", "file", "label", "guess", "p_guess", "new_label"])
        for i, r in enumerate(issues, 1):
            w.writerow([i, r["file"], r["label"], r["guess"], r["p_guess"], ""])
    print(f"검토할 이미지 {len(issues)}장 → 시트 {len(sheets)}장: {args.out}")
    print("시트를 보고 라벨이 틀린 번호와 맞는 감정을 정한 뒤:")
    print('  python apply_label_fixes.py --set "3=sad,17=melancholy"')
    from collections import Counter
    print("라벨→모델 추정 쌍:", dict(Counter(f"{r['label']}->{r['guess']}" for r in issues).most_common(8)))


if __name__ == "__main__":
    main()
