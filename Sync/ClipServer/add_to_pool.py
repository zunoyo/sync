# -*- coding: utf-8 -*-
"""
새로 라벨링한 이미지를 쿠르님 라벨 풀에 추가한다(봉인 테스트는 건드리지 않는다).
  python add_to_pool.py --src data\\collected_rare --labels data\\image_labels_rare.csv --prefix r_

- 이미지를 data\\user_label_pool\\<prefix><파일명> 으로 복사하고 data\\user_labels_all.csv 에 행을 덧붙인다(실행 전 .bak 백업).
- 봉인 테스트 이미지와 거의 같은 이미지(dHash 해밍거리 ≤5)는 풀에 넣지 않는다(테스트 독립성 유지).
- 같은 접두사 파일이 이미 풀에 있으면 건너뛰므로 다시 실행해도 중복되지 않는다.
"""
import argparse
import os
import shutil
from collections import Counter

from eval_labelers import read_labels
from make_label_sets import dhash, hamming, walk_images

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--prefix", default="r_")
    a = ap.parse_args()
    labels = read_labels(a.labels)
    pool = os.path.join(DATA, "user_label_pool")
    csv_path = os.path.join(DATA, "user_labels_all.csv")
    if not (os.path.isdir(pool) and os.path.exists(csv_path)):
        raise SystemExit("data\\user_label_pool / user_labels_all.csv 가 없습니다. build_label_pool.py 를 먼저 실행하세요.")
    test_h = [dhash(p) for p in walk_images(os.path.join(DATA, "sealed_test"))]
    shutil.copy2(csv_path, csv_path + ".bak")
    rows, skipped_dup, skipped_have, missing = [], 0, 0, 0
    for name, emo in labels.items():
        src = os.path.join(a.src, name)
        if not os.path.exists(src):
            missing += 1
            continue
        dst_name = a.prefix + name
        if os.path.exists(os.path.join(pool, dst_name)):
            skipped_have += 1
            continue
        h = dhash(src)
        if any(hamming(h, t) <= 5 for t in test_h):
            skipped_dup += 1
            continue
        shutil.copy2(src, os.path.join(pool, dst_name))
        rows.append((dst_name, emo))
    with open(csv_path, "a", encoding="utf-8-sig", newline="") as fh:
        import csv
        csv.writer(fh).writerows(rows)
    print(f"추가 {len(rows)}장 (이미 있음 {skipped_have}, 테스트와 유사해 제외 {skipped_dup}, 파일 없음 {missing})")
    for k, v in sorted(Counter(e for _, e in rows).items(), key=lambda x: -x[1]):
        print(f"  {k:<11}{v}장")
    allc = Counter()
    import csv as _c
    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        for r in _c.DictReader(fh):
            allc[r["emotion"]] += 1
    print(f"\n풀 전체 {sum(allc.values())}장: " + ", ".join(f"{k} {v}" for k, v in sorted(allc.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main()
