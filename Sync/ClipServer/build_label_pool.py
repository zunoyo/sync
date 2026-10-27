# -*- coding: utf-8 -*-
"""
쿠르님 라벨을 한 곳으로 합치고, 테스트 세트를 봉인한다.

  python build_label_pool.py --eval-image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv ^
      --final data\\eval_final_labels.csv,data\\eval_final_labels_rest.csv ^
      --pool-dir data\\collected_test --hard-labels data\\hard_labels.csv --test-labels data\\test_labels.csv

만드는 것(원본 폴더는 건드리지 않고 복사만 한다. 파일명 충돌을 막으려고 접두사를 붙인다):
  data\\user_label_pool\\      학습·교차검증용 이미지: e_(기존 쿠르님 라벨 119장) + h_(이번 추가 라벨)
  data\\user_labels_all.csv    위 이미지의 쿠르님 최종 라벨(file,emotion)
  data\\sealed_test\\          봉인 테스트 이미지(t_) — 읽기 전용으로 표시, 학습·모델 선택에 쓰지 않는다
  data\\sealed_test_labels.csv 봉인 테스트 라벨
  data\\sealed_manifest.json   파일별 SHA-256(나중에 바뀌지 않았음을 확인)
학습 풀과 거의 같은 이미지(해시 거리 ≤5)가 테스트에 있으면 테스트 쪽에서 뺀다.
"""
import argparse
import hashlib
import json
import os
import shutil
import stat
import time

from eval_labelers import read_labels
from make_label_sets import EXTS, dhash, hamming

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def write_csv(path, rows):
    import csv
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "emotion"])
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval-image-dir", required=True)
    ap.add_argument("--human", required=True)
    ap.add_argument("--claude", required=True)
    ap.add_argument("--final", required=True)
    ap.add_argument("--pool-dir", default=os.path.join(DATA, "collected_test"))
    ap.add_argument("--hard-labels", required=True)
    ap.add_argument("--test-labels", required=True)
    ap.add_argument("--redo", action="store_true", help="봉인 폴더가 이미 있어도 다시 만든다(권장하지 않음)")
    a = ap.parse_args()

    sealed_dir = os.path.join(DATA, "sealed_test")
    if os.path.isdir(sealed_dir) and not a.redo:
        raise SystemExit("data\\sealed_test 가 이미 있습니다(봉인됨). 새로 만들려면 --redo")

    human, claude = read_labels(a.human), read_labels(a.claude)
    final = {}
    for p in [x.strip() for x in a.final.split(",") if x.strip()]:
        final.update(read_labels(p))
    old = {f: human[f] for f in human if f in claude and human[f] == claude[f]}
    old.update(final)
    old = {f: e for f, e in old.items() if os.path.exists(os.path.join(a.eval_image_dir, f))}
    hard = {f: e for f, e in read_labels(a.hard_labels).items() if os.path.exists(os.path.join(a.pool_dir, f))}
    test = {f: e for f, e in read_labels(a.test_labels).items() if os.path.exists(os.path.join(a.pool_dir, f))}
    both = set(hard) & set(test)
    if both:
        raise SystemExit(f"테스트와 추가 라벨에 같은 이미지가 있습니다: {sorted(both)[:5]} …")

    # 학습 풀과 거의 같은 테스트 이미지는 테스트에서 뺀다(테스트는 학습에 쓴 이미지와 독립이어야 한다)
    pool = []   # (새이름, 원본경로, 감정)
    for f, e in old.items():
        pool.append(("e_" + f, os.path.join(a.eval_image_dir, f), e))
    for f, e in hard.items():
        pool.append(("h_" + f, os.path.join(a.pool_dir, f), e))
    ph = [dhash(path) for _, path, _ in pool]
    drop = []
    for f in sorted(test):
        h = dhash(os.path.join(a.pool_dir, f))
        j = next((k for k, x in enumerate(ph) if hamming(h, x) <= 5), None)
        if j is not None:
            drop.append((f, pool[j][0]))
            del test[f]
    keep = pool
    pdir = os.path.join(DATA, "user_label_pool")
    if os.path.isdir(pdir):
        shutil.rmtree(pdir)
    os.makedirs(pdir)
    for name, path, e in keep:
        shutil.copy2(path, os.path.join(pdir, name))
    write_csv(os.path.join(DATA, "user_labels_all.csv"), [(n, e) for n, _, e in keep])

    if os.path.isdir(sealed_dir):
        for f in os.listdir(sealed_dir):
            os.chmod(os.path.join(sealed_dir, f), stat.S_IWRITE)
        shutil.rmtree(sealed_dir)
    os.makedirs(sealed_dir)
    rows, man = [], {}
    for f, e in sorted(test.items()):
        dst = os.path.join(sealed_dir, "t_" + f)
        shutil.copy2(os.path.join(a.pool_dir, f), dst)
        man["t_" + f] = sha256(dst)
        os.chmod(dst, stat.S_IREAD)
        rows.append(("t_" + f, e))
    write_csv(os.path.join(DATA, "sealed_test_labels.csv"), rows)
    json.dump({"created": time.strftime("%Y-%m-%d %H:%M:%S"), "n": len(rows), "labels_sha256": sha256(os.path.join(DATA, "sealed_test_labels.csv")),
               "files": man}, open(os.path.join(DATA, "sealed_manifest.json"), "w", encoding="utf-8"), indent=1)

    def dist(rs):
        d = {}
        for r in rs:
            d[r] = d.get(r, 0) + 1
        return dict(sorted(d.items(), key=lambda kv: -kv[1]))
    print(f"학습·교차검증 풀: {len(keep)}장 (기존 {sum(1 for n, _, _ in keep if n.startswith('e_'))} + 추가 {sum(1 for n, _, _ in keep if n.startswith('h_'))}) → data\\user_label_pool, data\\user_labels_all.csv")
    print("  감정별:", dist(e for _, _, e in keep))
    if drop:
        print(f"  학습 풀과 거의 같아서 테스트에서 뺀 이미지 {len(drop)}장: {drop[:5]}")
    print(f"봉인 테스트: {len(rows)}장 → data\\sealed_test (읽기 전용), data\\sealed_test_labels.csv, data\\sealed_manifest.json")
    print("  감정별:", dist(e for _, e in rows))
    small = [k for k, v in dist(e for _, e in rows).items() if v < 10]
    if small:
        print(f"  ※ 테스트 {', '.join(small)} 는 10장 미만이라 그 감정의 정확도는 참고용으로만 봅니다(전체 정확도 기준으로 판단).")


if __name__ == "__main__":
    main()
