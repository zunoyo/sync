# -*- coding: utf-8 -*-
"""
평가용 이미지 중 사람 라벨과 Claude 라벨이 갈린 것만 골라, 쿠르님이 직접 최종 라벨을 정하는 화면을 만든다.

  python review_disagreements.py --image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv

→ data/eval_review_images/ 에 갈린 이미지만 복사하고, data/eval_review.html 을 만든다(두 라벨은 화면에 보이지 않는다 = 블라인드).
  브라우저로 열어 이미지마다 감정(1~8) 또는 0(애매함·제외)을 고르고 'CSV 내보내기' → 받은 eval_final_labels.csv 를 data/ 에 둔다.
→ 그다음:
  python eval_labelers.py --image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv --final data\\eval_final_labels.csv --checkpoint model\\emotion_projection.pt
     (일치한 이미지는 그 라벨, 갈린 이미지는 쿠르님 최종 라벨로 정확도를 잰다)
"""
import argparse
import os
import shutil

from eval_labelers import read_labels
from label_images import labeling_html

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image-dir", required=True)
    ap.add_argument("--human", required=True)
    ap.add_argument("--claude", required=True)
    ap.add_argument("--rest", action="store_true", help="사람 라벨이 아직 없는(Claude 라벨만 있는) 평가 이미지를 대상으로 한다. 결과 파일: eval_final_labels_rest.csv")
    args = ap.parse_args()

    human, claude = read_labels(args.human), read_labels(args.claude)
    if args.rest:
        files = sorted(f for f in claude if f not in human and os.path.exists(os.path.join(args.image_dir, f)))
    else:
        files = sorted(f for f in set(human) & set(claude) if human[f] != claude[f]
                       and os.path.exists(os.path.join(args.image_dir, f)))
    if not files:
        raise SystemExit("대상 이미지를 찾지 못했습니다(경로·파일명을 확인하세요).")
    tag = "_rest" if args.rest else ""
    dst = os.path.join(DATA, f"eval_review{tag}_images")
    os.makedirs(dst, exist_ok=True)
    for f in files:
        shutil.copy2(os.path.join(args.image_dir, f), os.path.join(dst, f))

    from label_images import list_images
    html = labeling_html(dst, list_images(dst))
    html = html.replace("a.download='image_labels.csv'", "a.download='eval_final_labels%s.csv'" % tag)
    html = html.replace("image_labels_v1:", "eval_final%s_v1:" % tag)
    html = html.replace("받은 image_labels.csv 를 ClipServer/data/ 에 두고 --apply 로 정리하세요",
                        f"받은 eval_final_labels{tag}.csv 를 ClipServer/data/ 에 두세요")
    out = os.path.join(DATA, f"eval_review{tag}.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"{'사람 라벨이 없는' if args.rest else '라벨이 갈린'} {len(files)}장 → {out}\n브라우저로 열어 정한 뒤 'CSV 내보내기' → eval_final_labels{tag}.csv 를 data\\ 에 두세요.")


if __name__ == "__main__":
    main()
