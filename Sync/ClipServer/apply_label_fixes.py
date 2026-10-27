# -*- coding: utf-8 -*-
"""
find_label_issues.py 로 검토한 결과를 학습 이미지 폴더에 반영한다(이미지를 올바른 감정 폴더로 옮김).

  python apply_label_fixes.py --set "3=sad,17=melancholy"              # 시트 번호=맞는 감정
  python apply_label_fixes.py --review results\\label_review\\review.csv   # new_label 칸을 채운 CSV
  --dry-run 이면 옮기지 않고 무엇이 바뀌는지만 보여 준다.
옮긴 기록은 results\\label_review\\applied_fixes.csv 에 남는다(되돌릴 때 참고).
"""
import argparse
import csv
import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def target_path(src, new_label):
    """<root>/<옛감정>/<파일> → <root>/<새감정>/<파일>"""
    emo_dir = os.path.dirname(src)
    root = os.path.dirname(emo_dir)
    return os.path.join(root, new_label, os.path.basename(src))


def parse_set(spec):
    out = {}
    for item in [x.strip() for x in str(spec or "").split(",") if x.strip()]:
        k, v = [t.strip() for t in item.split("=")]
        if v not in EMOTIONS:
            raise SystemExit(f"모르는 감정 '{v}' (가능: {EMOTIONS})")
        out[int(k)] = v
    return out


def plan(review_rows, fixes):
    """review_rows: [{idx,file,label,...}], fixes: {idx: new_label} → [(src, dst, old, new)]"""
    moves = []
    for r in review_rows:
        new = fixes.get(int(r["idx"]))
        if not new or new == r["label"]:
            continue
        moves.append((r["file"], target_path(r["file"], new), r["label"], new))
    return moves


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", default=os.path.join(ROOT, "results", "label_review", "review.csv"))
    ap.add_argument("--set", default="", help='시트 번호=감정 (쉼표로 여러 개). 예: "3=sad,17=melancholy"')
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    with open(args.review, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    fixes = parse_set(args.set)
    if not fixes:
        fixes = {int(r["idx"]): r["new_label"].strip() for r in rows if (r.get("new_label") or "").strip() in EMOTIONS}
    moves = plan(rows, fixes)
    if not moves:
        raise SystemExit("바꿀 라벨이 없습니다.")
    log = []
    for src, dst, old, new in moves:
        print(f"  {old:<11}→ {new:<11}{os.path.basename(src)}")
        if args.dry_run:
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.exists(dst):
            print(f"    [건너뜀] 같은 이름이 이미 있음: {dst}")
            continue
        shutil.move(src, dst)
        log.append((src, dst, old, new))
    if not args.dry_run and log:
        lp = os.path.join(os.path.dirname(args.review), "applied_fixes.csv")
        new_file = not os.path.exists(lp)
        with open(lp, "a", encoding="utf-8-sig", newline="") as fh:
            w = csv.writer(fh)
            if new_file:
                w.writerow(["from", "to", "old", "new"])
            w.writerows(log)
        print(f"\n{len(log)}장 옮김. 기록: {lp}\n다음: 재학습(train_projection_v2.py ... --dump-oof ...)")


if __name__ == "__main__":
    main()
