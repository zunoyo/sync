# -*- coding: utf-8 -*-
"""
단계 1: 새 라벨 만들기 도구 — 세 가지 모드.

(1) test    봉인 테스트 세트 후보를 감정별로 균형 있게 뽑아 라벨링 화면을 만든다.
    python collect_images.py --test --covers 30 --photos 10        # 먼저 새 이미지 수집(약 300장)
    python make_label_sets.py test
    → data\\test_label.html 열어 라벨링 → 'CSV 내보내기' → test_labels.csv 를 data\\ 에 둔다
    (학습·평가에 쓴 모든 폴더와 겹치는/거의 같은 이미지는 자동으로 뺀다. 이 이미지들은 학습에 절대 쓰지 말 것 = 봉인)

(2) relabel 쿠르님 라벨 이미지 60장을 이름을 바꿔 다시 라벨링(자기 일치율 = 정확도의 현실적 상한 측정).
    python make_label_sets.py relabel --image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv --final data\\eval_final_labels.csv,data\\eval_final_labels_rest.csv
    → data\\relabel.html 라벨링 → relabel_labels.csv 를 data\\ 에 둔 뒤(되도록 하루 이상 지나서)
    python make_label_sets.py relabel --compare data\\relabel_labels.csv

(3) hard    아직 라벨 없는 후보 풀에서 모델이 헷갈려 하는 이미지 + 약한 감정(melancholy·angry·sad) 후보를 뽑는다(능동 학습).
    python make_label_sets.py hard --checkpoint model\\emotion_projection.pt
    → data\\hard_label.html 라벨링 → hard_labels.csv 를 data\\ 에 둔다. 테스트 후보로 뽑힌 이미지는 자동 제외.
"""
import argparse
import csv
import json
import os
import random
import shutil
import sys

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
DEFAULT_EXCLUDE = ["collected_images", "collected_train", "collected_train2", "collected_train3",
                   "train_images", "train_images2", "train_images3", "real_images", "eval_review_images", "eval_review_rest_images"]


# ───────────────── 순수 함수 ─────────────────
def dhash(path, size=8):
    """차이 해시 64비트(거의 같은 이미지·재인코딩 중복 탐지용)."""
    from PIL import Image
    im = Image.open(path).convert("L").resize((size + 1, size), Image.LANCZOS)
    a = np.asarray(im, dtype=np.int16)
    return int("".join("1" if v else "0" for v in (a[:, 1:] > a[:, :-1]).flatten()), 2)


def hamming(a, b):
    return bin(a ^ b).count("1")


def walk_images(folder):
    out = []
    for r, _, fs in os.walk(folder):
        out += [os.path.join(r, f) for f in fs if f.lower().endswith(EXTS)]
    return sorted(out)


def build_exclude_hashes(dirs, log=print):
    hs = []
    for d in dirs:
        if not os.path.isdir(d):
            continue
        n0 = len(hs)
        for p in walk_images(d):
            try:
                hs.append(dhash(p))
            except Exception:
                pass
        log(f"  제외 기준 {os.path.basename(d):<22}{len(hs) - n0}장")
    return hs


def is_dup(h, pool, thr=5):
    return any(hamming(h, x) <= thr for x in pool)


def pick_balanced(cands, per_class, seed=0):
    """cands: [(file, query_emotion)] → 감정별 최대 per_class 개(부족하면 있는 만큼). 라운드로빈 후 섞음."""
    rng = random.Random(seed)
    by = {}
    for f, e in cands:
        by.setdefault(e, []).append(f)
    out = []
    for e, fs in by.items():
        fs = sorted(fs)
        rng.shuffle(fs)
        out += fs[:per_class]
    rng.shuffle(out)
    return out


def stratified_sample(truth, n, seed=0, min_per=4):
    """truth{file:emotion} → n장, 감정 비율대로(감정마다 최소 min_per, 있는 수가 적으면 전부)."""
    rng = random.Random(seed)
    by = {}
    for f, e in truth.items():
        by.setdefault(e, []).append(f)
    tot = len(truth)
    take = {e: min(len(fs), max(min_per, round(n * len(fs) / tot))) for e, fs in by.items()}
    while sum(take.values()) > n:        # 초과분은 큰 감정에서 줄임
        e = max(take, key=lambda k: take[k] - min(len(by[k]), min_per))
        if take[e] <= min(len(by[e]), min_per):
            break
        take[e] -= 1
    out = []
    for e, fs in by.items():
        fs = sorted(fs)
        rng.shuffle(fs)
        out += fs[:take[e]]
    rng.shuffle(out)
    return out


def cohen_kappa(a, b, labels):
    n = len(a)
    if n == 0:
        return float("nan")
    po = sum(x == y for x, y in zip(a, b)) / n
    pe = sum((sum(x == l for x in a) / n) * (sum(y == l for y in b) / n) for l in labels)
    return float((po - pe) / (1 - pe)) if pe < 1 else 1.0


def agreement_report(first, second):
    """first/second: {file: emotion}. 같은 파일만. 반환 dict(일치율, kappa, 감정별, 혼동 쌍)."""
    files = sorted(set(first) & set(second))
    a, b = [first[f] for f in files], [second[f] for f in files]
    n = len(files)
    hit = sum(x == y for x, y in zip(a, b))
    per = {}
    for e in EMOTIONS:
        idx = [i for i, x in enumerate(a) if x == e]
        if idx:
            per[e] = f"{sum(b[i] == e for i in idx)}/{len(idx)}"
    pairs = {}
    for x, y in zip(a, b):
        if x != y:
            pairs[f"{x}→{y}"] = pairs.get(f"{x}→{y}", 0) + 1
    pairs = dict(sorted(pairs.items(), key=lambda kv: -kv[1]))
    return {"n": n, "agree": hit, "rate": hit / n if n else None, "kappa": cohen_kappa(a, b, EMOTIONS),
            "per_class": per, "swaps": pairs}


def hard_scores(P, target_idx, per_target=20, n_uncertain=30, feats=None):
    """P[n,K] 확률 → 선택할 인덱스. 불확실(margin 작은 순) n_uncertain개 + 대상 감정별 P가 높은 순 per_target개.
    feats 가 있으면 대상 후보 안에서 서로 비슷한 것을 피하는 그리디(farthest-point) 선택."""
    n = len(P)
    srt = np.sort(P, axis=1)
    margin = srt[:, -1] - srt[:, -2]
    chosen = []
    for t in target_idx:
        order = np.argsort(-P[:, t])
        pool = [i for i in order[:per_target * 4] if i not in chosen]
        if feats is not None and len(pool) > per_target:
            sel = [pool[0]]
            d = 1 - feats[pool] @ feats[pool[0]]
            while len(sel) < per_target:
                j = int(np.argmax(d))
                sel.append(pool[j])
                d = np.minimum(d, 1 - feats[pool] @ feats[pool[j]])
            pool = sel
        chosen += pool[:per_target]
    added = 0
    for i in np.argsort(margin):
        if added >= n_uncertain:
            break
        if int(i) not in chosen:
            chosen.append(int(i)); added += 1
    seen, out = set(), []
    for i in chosen:
        if i not in seen:
            seen.add(i); out.append(int(i))
    return out


# ───────────────── 화면(HTML) ─────────────────
def make_html(img_dir, out_html, csv_name, key_tag, title_note="", order=None):
    from label_images import labeling_html, list_images
    html = labeling_html(img_dir, order if order is not None else list_images(img_dir))
    html = html.replace("a.download='image_labels.csv'", f"a.download='{csv_name}'")
    html = html.replace("image_labels_v1:", f"{key_tag}_v1:")
    html = html.replace("받은 image_labels.csv 를 ClipServer/data/ 에 두고 --apply 로 정리하세요", f"받은 {csv_name} 를 ClipServer/data/ 에 두세요")
    if title_note:
        html = html.replace("<title>이미지 라벨링</title>", f"<title>{title_note}</title>")
    with open(out_html, "w", encoding="utf-8") as fh:
        fh.write(html)


def read_csv_labels(path):
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            e = (r.get("emotion") or "").strip()
            if e in EMOTIONS:
                out[r["file"]] = e
    return out


def fresh_dir(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path)


# ───────────────── 모드 ─────────────────
def mode_test(a):
    pool_dir = os.path.join(DATA, a.pool)
    files = [f for f in os.listdir(pool_dir) if f.lower().endswith(EXTS)] if os.path.isdir(pool_dir) else []
    if not files:
        raise SystemExit(f"{pool_dir} 에 이미지가 없습니다. 먼저: python collect_images.py --test --covers 30 --photos 10")
    qmap_p = os.path.join(pool_dir, "_query_emotion.json")
    qmap = json.load(open(qmap_p, encoding="utf-8")) if os.path.exists(qmap_p) else {}
    print("기존 이미지와 겹침 검사(거의 같은 이미지 제거):")
    ex = build_exclude_hashes([os.path.join(DATA, d) for d in a.exclude.split(",") if d], log=print)
    keep, seen = [], []
    for f in sorted(files):
        try:
            h = dhash(os.path.join(pool_dir, f))
        except Exception:
            continue
        if is_dup(h, ex) or is_dup(h, seen, thr=3):
            continue
        seen.append(h); keep.append((f, qmap.get(f, "?")))
    print(f"후보 {len(files)}장 → 중복 제거 후 {len(keep)}장")
    chosen = pick_balanced(keep, a.per_class, seed=a.seed)
    if not chosen:
        raise SystemExit("뽑을 이미지가 없습니다.")
    dst = os.path.join(DATA, "test_label_images")
    fresh_dir(dst)
    for f in chosen:
        shutil.copy2(os.path.join(pool_dir, f), os.path.join(dst, f))
    json.dump(sorted(chosen), open(os.path.join(DATA, "test_candidates.json"), "w", encoding="utf-8"))
    make_html(dst, os.path.join(DATA, "test_label.html"), "test_labels.csv", "test", "봉인 테스트 세트 라벨링")
    cnt = {}
    for f in chosen:
        cnt[dict(keep).get(f, "?")] = cnt.get(dict(keep).get(f, "?"), 0) + 1
    print(f"테스트 후보 {len(chosen)}장 선택(검색 감정별 {cnt}) → {os.path.join(DATA, 'test_label.html')}")
    print("브라우저로 열어 라벨링 → 'CSV 내보내기' → test_labels.csv 를 data\\ 에 두세요. 0(건너뛰기)은 그대로 제외됩니다.")
    print("※ 이 이미지들은 학습에 쓰지 않습니다(마지막에 한 번만 평가).")


def mode_relabel(a):
    from eval_labelers import read_labels
    map_p = os.path.join(DATA, "relabel_map.json")
    if a.compare:
        if not os.path.exists(map_p):
            raise SystemExit("relabel_map.json 이 없습니다. 먼저 relabel 모드로 화면을 만드세요.")
        m = json.load(open(map_p, encoding="utf-8"))          # {새이름: {"orig": 원래이름, "label": 이전 라벨}}
        new = read_csv_labels(a.compare)
        first = {k: m[k]["label"] for k in new if k in m}
        rep = agreement_report(first, new)
        print(f"\n[쿠르님 재라벨 일치율] 두 번 다 라벨한 {rep['n']}장 (0으로 건너뛴 {len(m) - len(new)}장 제외)")
        print(f"  일치 {rep['agree']}/{rep['n']} = {rep['rate']:.1%}   Cohen's kappa = {rep['kappa']:.3f}")
        print("  감정별(처음 라벨 기준 같은 라벨 유지):", " | ".join(f"{k} {v}" for k, v in rep["per_class"].items()))
        print("  바뀐 쌍(처음→다시):", ", ".join(f"{k} ×{v}" for k, v in list(rep["swaps"].items())[:10]) or "없음")
        from eval_harness import wilson_ci
        lo, hi = wilson_ci(rep["agree"], rep["n"])
        print(f"  일치율 95% 구간: {lo:.1%}~{hi:.1%}")
        print("\n해석: 이 값이 '같은 사람이 같은 이미지를 두 번 라벨했을 때'의 일치율이라, 모델 정확도의 현실적 상한에 가깝습니다.")
        print("      (표본 적고 시간 간격이 짧으면 실제보다 높게 나옵니다.)")
        os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
        json.dump(rep, open(os.path.join(ROOT, "results", "relabel_agreement.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("저장: results\\relabel_agreement.json")
        return
    for need in ("image_dir", "human", "claude", "final"):
        if not getattr(a, need):
            raise SystemExit(f"--{need.replace('_', '-')} 가 필요합니다")
    human, claude = read_labels(a.human), read_labels(a.claude)
    final = {}
    for p in [x.strip() for x in a.final.split(",") if x.strip()]:
        final.update(read_labels(p))
    truth = {f: human[f] for f in human if f in claude and human[f] == claude[f]}
    truth.update(final)
    truth = {f: e for f, e in truth.items() if os.path.exists(os.path.join(a.image_dir, f))}
    sample = stratified_sample(truth, a.n, seed=a.seed)
    dst = os.path.join(DATA, "relabel_images")
    fresh_dir(dst)
    mp = {}
    for i, f in enumerate(sample, 1):
        new = f"r{i:03d}{os.path.splitext(f)[1].lower()}"
        shutil.copy2(os.path.join(a.image_dir, f), os.path.join(dst, new))
        mp[new] = {"orig": f, "label": truth[f]}
    json.dump(mp, open(map_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    make_html(dst, os.path.join(DATA, "relabel.html"), "relabel_labels.csv", "relabel", "재라벨링(일치율 측정)")
    cnt = {}
    for v in mp.values():
        cnt[v["label"]] = cnt.get(v["label"], 0) + 1
    print(f"재라벨 {len(mp)}장(처음 라벨 분포 {cnt}) → {os.path.join(DATA, 'relabel.html')}")
    print("지난 라벨은 보이지 않습니다. 이전 라벨링을 떠올리지 말고 지금 느낌대로 고르세요(되도록 하루 이상 지나서).")
    print("끝나면 relabel_labels.csv 를 data\\ 에 두고: python make_label_sets.py relabel --compare data\\relabel_labels.csv")


def mode_hard(a):
    import torch
    import diagnose_image as di
    device = "cuda" if torch.cuda.is_available() else "cpu"
    clip_model, preprocess, names, anchors, proj, T = di.load_service(device, a.checkpoint)
    pool_dir = os.path.join(DATA, a.pool)
    files = [f for f in os.listdir(pool_dir) if f.lower().endswith(EXTS)] if os.path.isdir(pool_dir) else []
    tested = set(json.load(open(os.path.join(DATA, "test_candidates.json"), encoding="utf-8"))) if os.path.exists(os.path.join(DATA, "test_candidates.json")) else set()
    files = [f for f in sorted(files) if f not in tested]
    print("기존 이미지와 겹침 검사:")
    ex = build_exclude_hashes([os.path.join(DATA, d) for d in a.exclude.split(",") if d], log=print)
    from PIL import Image
    keep, feats = [], []
    batch, names_b = [], []

    def flush():
        if not batch:
            return
        with torch.no_grad():
            e = clip_model.encode_image(torch.stack(batch).to(device)).float()
        feats.append((e / e.norm(dim=-1, keepdim=True)).cpu())
        batch.clear()

    seen = []
    for f in files:
        p = os.path.join(pool_dir, f)
        try:
            h = dhash(p)
            if is_dup(h, ex) or is_dup(h, seen, thr=3):
                continue
            batch.append(preprocess(Image.open(p).convert("RGB")))
        except Exception:
            continue
        seen.append(h); keep.append(f)
        if len(batch) == 32:
            flush()
    flush()
    if not keep:
        raise SystemExit("후보가 없습니다(테스트 후보로 이미 쓰였거나 모두 중복).")
    F = torch.cat(feats)
    P = di.service_probs(F.to(device), anchors, proj, T)
    tgt = [names.index(t) for t in a.targets.split(",") if t in names]
    idx = hard_scores(P, tgt, per_target=a.per_target, n_uncertain=a.uncertain, feats=F.numpy())
    dst = os.path.join(DATA, "hard_label_images")
    fresh_dir(dst)
    for i in idx:
        shutil.copy2(os.path.join(pool_dir, keep[i]), os.path.join(dst, keep[i]))
    make_html(dst, os.path.join(DATA, "hard_label.html"), "hard_labels.csv", "hard", "추가 라벨링(헷갈리는 이미지)")
    top = {n: int((P[idx].argmax(1) == j).sum()) for j, n in enumerate(names)}
    print(f"후보 풀 {len(keep)}장 중 {len(idx)}장 선택(모델 예측 분포 {top}) → {os.path.join(DATA, 'hard_label.html')}")
    print("라벨링 후 hard_labels.csv 를 data\\ 에 두세요. 이 라벨은 학습용(쿠르님 라벨 풀)에 추가하고, 테스트 세트에는 섞지 않습니다.")



def mode_consistency(a):
    """같은 이미지를 시간 간격을 두고 두 번 라벨링해 '쿠르님 본인 일치율'을 잰다.
    1차/2차는 저장 키와 표시 순서를 달리해, 2차 화면에 1차 라벨이 남거나 순서로 기억나지 않게 한다."""
    map_p = os.path.join(DATA, "consistency_map.json")
    dst = os.path.join(DATA, "consistency_images")
    if a.compare:
        paths = [x.strip() for x in a.compare.split(",") if x.strip()]
        if len(paths) != 2:
            raise SystemExit("--compare 1차.csv,2차.csv 처럼 두 개를 주세요")
        if not os.path.exists(map_p):
            raise SystemExit("consistency_map.json 이 없습니다. 먼저 --make 로 화면을 만드세요.")
        mp = json.load(open(map_p, encoding="utf-8"))
        r1 = {f: e for f, e in read_csv_labels(paths[0]).items() if f in mp}
        r2 = {f: e for f, e in read_csv_labels(paths[1]).items() if f in mp}
        rep = agreement_report(r1, r2)
        n = rep["n"]
        if not n:
            raise SystemExit("두 CSV에 공통으로 라벨된 이미지가 없습니다.")
        from eval_harness import wilson_ci
        lo, hi = wilson_ci(rep["agree"], n)
        print(f"\n[쿠르님 재라벨 일치율] 두 번 다 라벨한 {n}장 (둘 중 하나라도 건너뛴 {len(mp) - n}장 제외)")
        print(f"  일치 {rep['agree']}/{n} = {rep['rate']:.1%}   Cohen's kappa = {rep['kappa']:.3f}   95% 구간 {lo:.1%}~{hi:.1%}")
        print("  감정별(1차 라벨 기준 같은 라벨 유지): " + " | ".join(f"{k} {v}" for k, v in rep["per_class"].items()))
        print("  바뀐 쌍(1차→2차): " + (", ".join(f"{k} ×{v}" for k, v in rep["swaps"].items()) or "없음"))
        print(f"  판정(목표 82% 이상): {'달성' if rep['rate'] >= 0.82 else '미달 — 바뀐 쌍의 구분 규칙을 카드에서 다시 쓰세요'}")
        os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
        json.dump({**rep, "wilson95": [lo, hi]},
                  open(os.path.join(ROOT, "results", "consistency.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("저장: results\\consistency.json")
        return

    if a.round2:
        if not os.path.exists(map_p):
            raise SystemExit("1차를 먼저 만드세요: python make_label_sets.py consistency --make --src <폴더>")
        mp = json.load(open(map_p, encoding="utf-8"))
        order = sorted(mp)
        random.Random(a.seed + 777).shuffle(order)      # 순서로 기억나지 않게 섞는다
        make_html(dst, os.path.join(DATA, "consistency_r2.html"), "consistency_2.csv", "consistency_r2",
                  "일치율 측정 2차", order=order)
        print(f"2차 화면 {len(order)}장 → {os.path.join(DATA, 'consistency_r2.html')}")
        print("1차 라벨은 화면에 남아 있지 않고 순서도 섞여 있습니다. 기억을 떠올리지 말고 카드 기준으로만 고르세요.")
        print("끝나면 consistency_2.csv 를 data\\ 에 두고:")
        print("  python make_label_sets.py consistency --compare data\\consistency_1.csv,data\\consistency_2.csv")
        return

    if not a.src:
        raise SystemExit("--src <이미지 폴더> 가 필요합니다")
    src = a.src if os.path.isabs(a.src) else os.path.join(ROOT, a.src)
    files = [f for f in sorted(os.listdir(src)) if f.lower().endswith(EXTS)]
    if len(files) < a.n:
        raise SystemExit(f"{src} 에 이미지가 {len(files)}장뿐입니다(필요 {a.n}장).")
    print("기존 라벨 이미지와 겹침 검사:")
    ex = build_exclude_hashes([os.path.join(DATA, d) for d in a.exclude.split(",") if d], log=print)
    keep, seen = [], []
    for f in files:
        try:
            h = dhash(os.path.join(src, f))
        except Exception:
            continue
        if is_dup(h, ex) or is_dup(h, seen, thr=3):
            continue
        seen.append(h); keep.append(f)
    if len(keep) < a.n:
        raise SystemExit(f"중복을 뺀 후보가 {len(keep)}장뿐입니다(필요 {a.n}장). 이미지를 더 모으세요.")
    rng = random.Random(a.seed)
    sample = rng.sample(keep, a.n)
    fresh_dir(dst)
    mp = {}
    for i, f in enumerate(sorted(sample), 1):
        new = f"c{i:03d}{os.path.splitext(f)[1].lower()}"
        shutil.copy2(os.path.join(src, f), os.path.join(dst, new))
        mp[new] = f
    json.dump(mp, open(map_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    make_html(dst, os.path.join(DATA, "consistency_r1.html"), "consistency_1.csv", "consistency_r1", "일치율 측정 1차")
    print(f"\n1차 화면 {len(mp)}장 → {os.path.join(DATA, 'consistency_r1.html')}")
    print("라벨링 후 consistency_1.csv 를 data\\ 에 두고, 하루 이상 지난 뒤:")
    print("  python make_label_sets.py consistency --round2")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="mode", required=True)
    t = sub.add_parser("test")
    t.add_argument("--pool", default="collected_test")
    t.add_argument("--per-class", type=int, default=14, help="검색 감정별 최대 장수(8개×14=약 112장)")
    t.add_argument("--exclude", default=",".join(DEFAULT_EXCLUDE))
    t.add_argument("--seed", type=int, default=0)
    r = sub.add_parser("relabel")
    r.add_argument("--image-dir"); r.add_argument("--human"); r.add_argument("--claude"); r.add_argument("--final")
    r.add_argument("--n", type=int, default=60); r.add_argument("--seed", type=int, default=0)
    r.add_argument("--compare", default=None, help="다시 라벨한 CSV — 처음 라벨과 일치율 계산")
    c = sub.add_parser("consistency")
    c.add_argument("--make", action="store_true", help="1차 화면 만들기(--src 필요)")
    c.add_argument("--round2", action="store_true", help="같은 이미지로 2차 화면 만들기(순서를 섞고 저장 키를 분리)")
    c.add_argument("--src", default=None, help="새 이미지 폴더(학습·테스트에 안 쓴 것)")
    c.add_argument("--n", type=int, default=60)
    c.add_argument("--seed", type=int, default=0)
    c.add_argument("--exclude", default=",".join(DEFAULT_EXCLUDE + ["user_label_pool", "sealed_test"]))
    c.add_argument("--compare", default=None, help="1차.csv,2차.csv — 일치율·kappa 계산")
    h = sub.add_parser("hard")
    h.add_argument("--checkpoint", default=os.path.join(ROOT, "model", "emotion_projection.pt"))
    h.add_argument("--pool", default="collected_test")
    h.add_argument("--targets", default="melancholy,angry,sad")
    h.add_argument("--per-target", type=int, default=20)
    h.add_argument("--uncertain", type=int, default=30)
    h.add_argument("--exclude", default=",".join(DEFAULT_EXCLUDE))
    a = ap.parse_args()
    {"test": mode_test, "relabel": mode_relabel, "hard": mode_hard, "consistency": mode_consistency}[a.mode](a)


if __name__ == "__main__":
    main()
