# -*- coding: utf-8 -*-
"""
복합 평가(data\\fusion_pairs.csv)의 이미지가 학습 풀·봉인 테스트와 겹치는지 점검한다. 겹치면 그 쌍의 복합 정확도는 낙관적이다.
  python check_fusion_overlap.py
"""
import argparse
import csv
import os

from make_label_sets import dhash, hamming, walk_images

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(DATA, "fusion_pairs.csv"))
    ap.add_argument("--dirs", default="user_label_pool,sealed_test,train_images,train_images2,train_images3,real_images")
    a = ap.parse_args()
    pools = {}
    for d in a.dirs.split(","):
        p = os.path.join(DATA, d)
        hs = []
        for f in walk_images(p) if os.path.isdir(p) else []:
            try:
                hs.append((os.path.relpath(f, DATA), dhash(f)))
            except Exception:
                pass
        pools[d] = hs
    rows = [r for r in csv.DictReader(open(a.csv, encoding="utf-8-sig", newline="")) if (r.get("image_path") or "").strip() and (r.get("true_emotion") or "").strip()]
    print(f"복합 평가 쌍 {len(rows)}개 — 이미지 겹침 검사(해시 거리 ≤5)")
    hit = {d: [] for d in pools}
    for r in rows:
        path = r["image_path"].strip()
        path = path if os.path.isabs(path) else os.path.join(ROOT, path)
        try:
            h = dhash(path)
        except Exception:
            continue
        for d, hs in pools.items():
            m = next((n for n, x in hs if hamming(h, x) <= 5), None)
            if m:
                hit[d].append((r.get("pair_id"), r.get("kind"), m))
    for d, v in hit.items():
        print(f"  {d:<18} 겹침 {len(v)}쌍" + (f"  예: {v[:3]}" if v else ""))
    tot = {pid for v in hit.values() for pid, _, _ in v}
    print(f"\n학습에 쓰였을 수 있는 이미지를 가진 쌍: {len(tot)}/{len(rows)}")
    if tot:
        print("→ 이 쌍들의 복합 정확도는 낙관적입니다. 복합 수치를 보고할 때 이 점을 같이 쓰거나, 겹치지 않는 쌍만으로 다시 계산하세요.")


if __name__ == "__main__":
    main()
