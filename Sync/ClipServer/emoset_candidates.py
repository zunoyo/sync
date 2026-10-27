# -*- coding: utf-8 -*-
"""
EmoSet 안에서 romantic / melancholy 후보를 찾아 쿠르님이 8감정 중에서 직접 고르는 도구.

  1) 스캔  : python emoset_candidates.py scan --max-scan 20000
             EmoSet train 중 '학습에 안 쓴 이미지'만 CLIP으로 계산해 data\\emoset_scan\\ 에 저장(Ctrl+C 로 멈췄다 다시 실행하면 이어서).
  2) 선택  : python emoset_candidates.py pick --n 600
             romantic/melancholy 점수 상위·중간대·헷갈리는 이미지를 섞어 뽑고, 이미지와 라벨링 화면(300장씩)을 만든다.
  3) 라벨링: data\\emoset_label_1.html … 을 열어 8감정 중 하나를 고른다(아니면 0). 끝나면 CSV 내보내기 → data\\emoset_labels_1.csv …
  4) 점검  : python emoset_candidates.py report      (후보 단계별로 실제 romantic/melancholy 비율)
  5) 풀에 추가: python emoset_candidates.py merge  → 안내되는 add_to_pool.py 명령 실행
  추가 라운드: python emoset_candidates.py round --k 300
             지금까지 라벨(romantic/melancholy 맞음·아님)로 순위를 보정해 '상위 후보만' 새로 뽑는다.
             아직 안 연 화면의 band1 이미지도 새 화면에 넣는다. (후보 풀을 키우려면 scan --max-scan 을 먼저 늘린다)

원칙
- 후보는 EmoSet 원래 라벨을 화면에 보여 주지 않는다(편향 방지). 원래 라벨은 data\\emoset_cand_map.json 에만 있다.
- 학습에 쓴 이미지(클래스당 --used-per-class 장, 스트림 순서)는 후보에서 뺀다 → 쿠르님 라벨과 EmoSet 라벨이 충돌하지 않는다.
- 점수 상위만 뽑지 않고 중간대·불확실한 이미지를 섞는다(쉬운 예시만 늘어 과신하는 것을 막는다).
- 최종 라벨은 쿠르님이 정한다.
"""
import argparse
import csv
import io
import json
import os
import random
import time

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
SCAN_DIR = os.path.join(DATA, "emoset_scan")
CAND_DIR = os.path.join(DATA, "emoset_cand_images")
MAP_PATH = os.path.join(DATA, "emoset_cand_map.json")
HF = "Woleek/EmoSet-118K"
TARGETS = ["romantic", "melancholy"]
EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]
# (시작 비율, 끝 비율, 몫): 점수 상위 2% / 2~10% / 10~30% 구간에서 4:4:2 로 뽑는다
BANDS = ((0.0, 0.02, 0.4), (0.02, 0.10, 0.4), (0.10, 0.30, 0.2))
SYNC_OF = {"amusement": "happy", "excitement": "energetic", "contentment": "calm",
           "sadness": "sad", "anger": "angry", "awe": "dreamy"}   # model/emotion_va_map.py 와 같은 매핑


# ───────────────── 순수 함수(테스트 가능) ─────────────────
def sync_label(emoset_emotion):
    try:
        from model.emotion_va_map import get_sync_label
        return get_sync_label(emoset_emotion)
    except Exception:
        return SYNC_OF.get(emoset_emotion)


def classify_row(emotion, counts, used_per_class):
    """emoset_dataset.iter_emoset_rows 와 같은 규칙으로 이 행이 학습에 쓰였는지 판정.
    returns 'used' | 'unused' | 'unmapped'. 'used' 이면 counts 를 올린다."""
    s = sync_label(emotion)
    if s is None:
        return "unmapped"
    if counts.get(s, 0) < used_per_class:
        counts[s] = counts.get(s, 0) + 1
        return "used"
    return "unused"


def select_candidates(P, feats, names, n_per=600, n_uncertain=150, seed=0, bands=BANDS, dedupe_cos=0.97):
    """P[n,K] 확률, feats[n,D] L2정규화. returns [(scan_index, tag, band)] — tag 는 romantic/melancholy/uncertain."""
    rng = random.Random(seed)
    n = len(P)
    chosen, out = set(), []
    chosen_f = {}
    for t in TARGETS:
        ti = names.index(t)
        order = np.argsort(-P[:, ti])
        mine = []
        for bi, (lo, hi, frac) in enumerate(bands):
            seg = [int(i) for i in order[int(lo * n):max(int(hi * n), int(lo * n) + 1)] if int(i) not in chosen]
            rng.shuffle(seg)
            want = int(round(n_per * frac))
            got = 0
            for i in seg:
                if got >= want:
                    break
                if mine:
                    if float(np.max(feats[mine] @ feats[i])) >= dedupe_cos:
                        continue
                mine.append(i); chosen.add(i); got += 1
                out.append((i, t, f"band{bi + 1}"))
            if got < want:
                print(f"[주의] {t} band{bi + 1}: 필요 {want}장 중 {got}장만 있음(스캔 장수를 늘리면 채워집니다)")
    srt = np.sort(P, axis=1)
    margin = srt[:, -1] - srt[:, -2]
    low = [int(i) for i in np.argsort(margin)[:max(n_uncertain * 4, 1)] if int(i) not in chosen]
    rng.shuffle(low)
    for i in low[:n_uncertain]:
        chosen.add(i); out.append((i, "uncertain", "margin"))
    return out


def chunk_shuffled(files, size, seed=0):
    f = list(files)
    random.Random(seed).shuffle(f)
    return [f[i:i + size] for i in range(0, len(f), size)]


def yield_table(cmap, labels):
    """후보 태그×단계별로 쿠르님이 고른 감정 분포. cmap {file:{tag,band,..}}, labels {file:emotion}."""
    tab = {}
    for f, emo in labels.items():
        m = cmap.get(f)
        if not m:
            continue
        key = (m["tag"], m["band"])
        d = tab.setdefault(key, {"n": 0, "emo": {}})
        d["n"] += 1
        d["emo"][emo] = d["emo"].get(emo, 0) + 1
    return tab


def read_label_csv(path):
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            e = (r.get("emotion") or "").strip()
            if e in EMOTIONS:
                out[r["file"]] = e
    return out


def to_pil(img):
    from PIL import Image
    if isinstance(img, dict):
        b = img.get("bytes")
        if b is None:
            return Image.open(img["path"]).convert("RGB")
        return Image.open(io.BytesIO(b)).convert("RGB")
    return img.convert("RGB")


def open_stream(split="train", decode=False):
    from datasets import load_dataset
    ds = load_dataset(HF, split=split, streaming=True)
    if not decode:
        try:   # 안 쓰는 행은 디코딩하지 않아 훨씬 빠르다
            from datasets import Image as HFImage
            ds = ds.cast_column("image", HFImage(decode=False))
        except Exception:
            pass
    return ds


# ───────────────── 1) scan ─────────────────
def _state_path():
    return os.path.join(SCAN_DIR, "scan_state.json")


def mode_scan(a):
    import torch
    import diagnose_image as di
    os.makedirs(SCAN_DIR, exist_ok=True)
    st = json.load(open(_state_path(), encoding="utf-8")) if os.path.exists(_state_path()) else \
        {"pos": 0, "counts": {}, "kept": 0, "parts": 0}
    if st["kept"] >= a.max_scan:
        print(f"이미 {st['kept']}장 스캔했습니다. 더 하려면 --max-scan 을 키우세요.")
        return
    device = "cuda" if torch.cuda.is_available() else "cpu"
    clip_model, preprocess, names, anchors, proj, T = di.load_service(device, a.checkpoint)
    ds = open_stream("train", decode=False)
    if st["pos"]:
        print(f"이어서 시작: 스트림 {st['pos']}번째 행부터(건너뛰는 데 시간이 조금 걸립니다)")
        try:
            ds = ds.skip(st["pos"])
        except Exception:
            ds = iter(ds)
            for _ in range(st["pos"]):
                next(ds)
    buf = {"idx": [], "emo": [], "feats": [], "P": []}
    imgs, meta = [], []
    t0 = time.time()
    start_kept = st["kept"]

    def flush_batch():
        if not imgs:
            return
        with torch.no_grad():
            e = clip_model.encode_image(torch.stack(imgs).to(device)).float()
        e = e / e.norm(dim=-1, keepdim=True)
        P = di.service_probs(e, anchors, proj, T)
        e = e.cpu().numpy()
        for k, (pos, emo) in enumerate(meta):
            buf["idx"].append(pos); buf["emo"].append(emo)
            buf["feats"].append(e[k].astype(np.float16)); buf["P"].append(P[k].astype(np.float32))
        st["kept"] += len(imgs)
        imgs.clear(); meta.clear()

    def save_part():
        flush_batch()
        if not buf["idx"]:
            return
        np.savez(os.path.join(SCAN_DIR, f"part_{st['parts']:04d}.npz"), idx=np.array(buf["idx"]),
                 emo=np.array(buf["emo"]), feats=np.stack(buf["feats"]), P=np.stack(buf["P"]), names=np.array(names))
        st["parts"] += 1
        for k in buf:
            buf[k].clear()
        json.dump(st, open(_state_path(), "w", encoding="utf-8"))

    pos = st["pos"]
    try:
        for row in ds:
            cur = pos
            pos += 1
            st["pos"] = pos
            kind = classify_row(row["emotion"], st["counts"], a.used_per_class)
            if kind == "used" or (kind == "unmapped" and not a.include_unmapped):
                continue
            try:
                im = to_pil(row["image"])
                imgs.append(preprocess(im))
            except Exception:
                continue
            meta.append((cur, row["emotion"]))
            if len(imgs) == 64:
                flush_batch()
                if st["kept"] % 640 == 0:
                    el = time.time() - t0
                    rate = (st["kept"] - start_kept) / max(el, 1)
                    left = (a.max_scan - st["kept"]) / max(rate, 1e-6)
                    print(f"  ... {st['kept']}장 / {a.max_scan} (초당 {rate:.1f}장, 남은 시간 약 {left / 60:.0f}분)")
                if len(buf["idx"]) >= 2000:
                    save_part()
            if st["kept"] >= a.max_scan:
                break
    except KeyboardInterrupt:
        print("\n중단합니다. 지금까지 결과를 저장하고 끝냅니다(다시 실행하면 이어서 합니다).")
    save_part()
    json.dump(st, open(_state_path(), "w", encoding="utf-8"))
    print(f"스캔 완료: 후보 풀 {st['kept']}장(학습에 안 쓴 이미지), 스트림 위치 {st['pos']} → {SCAN_DIR}")


# ───────────────── 2) pick ─────────────────
def load_scan():
    import glob
    parts = sorted(glob.glob(os.path.join(SCAN_DIR, "part_*.npz")))
    if not parts:
        raise SystemExit("스캔 결과가 없습니다. 먼저  python emoset_candidates.py scan  을 실행하세요.")
    ds = [np.load(p, allow_pickle=False) for p in parts]
    return (np.concatenate([d["idx"] for d in ds]), np.concatenate([d["emo"] for d in ds]),
            np.concatenate([d["feats"] for d in ds]).astype(np.float32), np.concatenate([d["P"] for d in ds]),
            [str(x) for x in ds[0]["names"]])


def mode_pick(a):
    idx, emo, feats, P, names = load_scan()
    print(f"스캔된 후보 풀 {len(idx)}장")
    sel = select_candidates(P, feats, names, n_per=a.n, n_uncertain=a.uncertain, seed=a.seed)
    want = {int(idx[i]): (i, tag, band) for i, tag, band in sel}
    if os.path.isdir(CAND_DIR) and os.listdir(CAND_DIR) and not a.force:
        raise SystemExit(f"{CAND_DIR} 에 이미 후보가 있습니다. 이미 라벨링 중이면 건드리지 마세요(다시 만들려면 --force).")
    os.makedirs(CAND_DIR, exist_ok=True)
    ds = open_stream("train", decode=False)
    ri, mi = names.index("romantic"), names.index("melancholy")
    cmap, got, last = {}, 0, max(want)
    print(f"{len(want)}장을 EmoSet 에서 다시 받아 저장합니다(스트림 {last}번째 행까지 읽음)...")
    for pos, row in enumerate(ds):
        if pos in want:
            i, tag, band = want[pos]
            fn = f"e{pos:06d}.jpg"
            im = to_pil(row["image"])
            im.thumbnail((1024, 1024))
            im.save(os.path.join(CAND_DIR, fn), quality=92)
            cmap[fn] = {"pos": pos, "orig": str(emo[i]), "tag": tag, "band": band,
                        "p_romantic": round(float(P[i, ri]), 4), "p_melancholy": round(float(P[i, mi]), 4)}
            got += 1
            if got % 100 == 0:
                print(f"  ... {got}/{len(want)}")
        if pos >= last:
            break
    json.dump(cmap, open(MAP_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from make_label_sets import make_html
    chunks = chunk_shuffled(sorted(cmap), a.chunk, seed=a.seed)
    for k, files in enumerate(chunks, 1):
        make_html(CAND_DIR, os.path.join(DATA, f"emoset_label_{k}.html"), f"emoset_labels_{k}.csv",
                  f"emoset{k}", f"EmoSet 후보 라벨링 {k}/{len(chunks)}", order=files)
    cnt = {}
    for m in cmap.values():
        cnt[m["tag"]] = cnt.get(m["tag"], 0) + 1
    print(f"저장 {got}장 {cnt} → 라벨링 화면 {len(chunks)}개: data\\emoset_label_1.html ~ emoset_label_{len(chunks)}.html")
    print("각 화면을 끝내면 'CSV 내보내기'로 받은 emoset_labels_N.csv 를 data\\ 에 두세요. 이미지는 감정이 섞여 있고 원래 라벨은 보이지 않습니다.")


# ───────────────── 4) report / 5) merge ─────────────────
def collect_labels():
    import glob
    labels = {}
    for p in sorted(glob.glob(os.path.join(DATA, "emoset_labels_*.csv"))):
        labels.update(read_label_csv(p))
    return labels


def mode_report(a):
    labels = collect_labels()
    cmap = json.load(open(MAP_PATH, encoding="utf-8"))
    tab = yield_table(cmap, labels)
    print(f"라벨된 후보 {len(labels)}장 / 후보 {len(cmap)}장")
    for (tag, band), d in sorted(tab.items()):
        tot = d["n"]
        hit = d["emo"].get(tag, 0) if tag in TARGETS else None
        dist = ", ".join(f"{k} {v}" for k, v in sorted(d["emo"].items(), key=lambda x: -x[1]))
        head = f"{tag:<10} {band:<7} n={tot:<4}"
        if hit is not None:
            head += f" 목표 감정 비율 {hit}/{tot}={hit / tot:.0%}"
        print(f"  {head} | {dist}")
    n = {t: sum(1 for e in labels.values() if e == t) for t in TARGETS}
    print(f"확정된 romantic {n['romantic']} · melancholy {n['melancholy']}")
    print("→ 단계(band)가 내려갈수록 목표 감정 비율이 급격히 떨어지면, 그 아래는 더 라벨링해도 효율이 낮습니다.")
    # 다양성 점검: 확정된 이미지가 EmoSet 원래 어떤 감정이었는지, 서로 얼마나 비슷한지
    div = None
    try:
        idx, emo_, feats, P_, names_ = load_scan()
        div = ({int(p): i for i, p in enumerate(idx)}, feats)
    except SystemExit:
        pass
    for t in TARGETS:
        fs = [f for f, e in labels.items() if e == t and f in cmap]
        if not fs:
            continue
        orig = {}
        for f in fs:
            orig[cmap[f]["orig"]] = orig.get(cmap[f]["orig"], 0) + 1
        line = f"  {t} {len(fs)}장 — EmoSet 원래 감정: " + ", ".join(f"{k} {v}" for k, v in sorted(orig.items(), key=lambda x: -x[1]))
        if div:
            ii = [div[0][cmap[f]["pos"]] for f in fs if cmap[f]["pos"] in div[0]]
            if len(ii) > 5:
                X = div[1][ii]
                S = X @ X.T
                nn = np.sort(S, axis=1)[:, -2]          # 가장 비슷한 다른 이미지와의 코사인
                line += f" | 가장 비슷한 이웃과의 평균 코사인 {nn.mean():.2f} (0.9 넘는 비율 {(nn > 0.9).mean():.0%})"
        print(line)
    print("  (평균 코사인이 높고 0.9 넘는 비율이 크면 비슷한 이미지만 모인 것입니다 → round 에 --dedupe 0.93 을 쓰세요)")


def mode_merge(a):
    labels = collect_labels()
    if not labels:
        raise SystemExit("data\\emoset_labels_*.csv 가 없습니다.")
    out = os.path.join(DATA, "emoset_labels_all.csv")
    with open(out, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh); w.writerow(["file", "emotion"])
        for f in sorted(labels):
            w.writerow([f, labels[f]])
    print(f"{len(labels)}장 라벨 → {out}")
    print("풀에 추가하려면:")
    print(f"  python add_to_pool.py --src {CAND_DIR} --labels {out} --prefix e_")


# ───────────────── 6) round: 라벨로 순위 보정 후 상위 후보만 추가 ─────────────────
def fit_logreg(X, y, l2=1e-2, steps=200):
    """CLIP 특징 → (목표 감정인가) 로지스틱 회귀. returns (w, b, mean, std)."""
    import torch
    import torch.nn.functional as Fn
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Xt = torch.tensor((X - mu) / sd, dtype=torch.float32)
    yt = torch.tensor(y, dtype=torch.float32)
    pw = (len(y) - yt.sum()) / max(float(yt.sum()), 1.0)
    w = torch.zeros(Xt.shape[1], requires_grad=True)
    b = torch.zeros(1, requires_grad=True)
    opt = torch.optim.LBFGS([w, b], max_iter=steps)

    def closure():
        opt.zero_grad()
        loss = Fn.binary_cross_entropy_with_logits(Xt @ w + b, yt, pos_weight=pw) + l2 * (w ** 2).sum()
        loss.backward()
        return loss
    opt.step(closure)
    return w.detach().numpy(), float(b.item()), mu, sd


def rank_scores(base, lr_score=None):
    """점수 두 개를 순위(0~1)로 바꿔 평균. lr_score 가 없으면 base 순위만."""
    def r(x):
        o = np.argsort(np.argsort(x))
        return o / max(len(x) - 1, 1)
    return r(base) if lr_score is None else 0.5 * r(base) + 0.5 * r(lr_score)


def pick_top(score, exclude, k, feats, dedupe_cos=0.97):  # dedupe_cos 가 낮을수록 서로 다른 이미지만 뽑는다
    """score 높은 순으로 k개. exclude(이미 뽑힌 인덱스) 제외, 비슷한 이미지(코사인≥dedupe_cos) 제외."""
    out, mat = [], []
    for i in np.argsort(-score):
        i = int(i)
        if i in exclude:
            continue
        if mat and float(np.max(np.stack(mat) @ feats[i])) >= dedupe_cos:
            continue
        out.append(i); mat.append(feats[i]); exclude.add(i)
        if len(out) >= k:
            break
    return out


def done_chunks(cmap, size=300, seed=0):
    """CSV 가 이미 있는 화면(=끝낸 화면)에 들어 있던 파일 집합. 처음 만든 화면은 pick 과 같은 규칙으로 복원."""
    import glob
    have = {int(os.path.basename(p)[len("emoset_labels_"):-4]) for p in glob.glob(os.path.join(DATA, "emoset_labels_*.csv"))
            if os.path.basename(p)[len("emoset_labels_"):-4].isdigit()}
    first = sorted(f for f, m in cmap.items() if "chunk" not in m)
    done = set()
    for k, files in enumerate(chunk_shuffled(first, size, seed), 1):
        if k in have:
            done.update(files)
    for f, m in cmap.items():
        if "chunk" in m and m["chunk"] in have:
            done.add(f)
    return done


def mode_round(a):
    idx, emo, feats, P, names = load_scan()
    cmap = json.load(open(MAP_PATH, encoding="utf-8"))
    labels = collect_labels()
    pos2i = {int(p): i for i, p in enumerate(idx)}
    used = {pos2i[m["pos"]] for m in cmap.values() if m["pos"] in pos2i}
    print(f"스캔 후보 풀 {len(idx)}장, 이미 뽑힌 후보 {len(cmap)}장, 라벨 {len(labels)}장")
    exclude = set(used)
    want = {}
    for t in TARGETS:
        ti = names.index(t)
        base = P[:, ti]
        lab_i = [pos2i[cmap[f]["pos"]] for f in labels if f in cmap and cmap[f]["pos"] in pos2i]
        lab_y = [1 if labels[f] == t else 0 for f in labels if f in cmap and cmap[f]["pos"] in pos2i]
        npos = int(sum(lab_y))
        lr_score = None
        if npos >= a.min_pos and len(lab_y) - npos >= a.min_pos:
            w, b, mu, sd = fit_logreg(feats[lab_i], np.array(lab_y))
            lr_score = ((feats - mu) / sd) @ w + b
            print(f"{t}: 라벨 {len(lab_y)}장(맞음 {npos})으로 순위 보정 사용")
        else:
            print(f"{t}: 맞음 {npos}장뿐이라 기존 점수만 사용(보정은 {a.min_pos}장 이상부터)")
        sc = rank_scores(base, lr_score)
        kk = (a.k_romantic if t == "romantic" else a.k_melancholy) or a.k
        for i in pick_top(sc, exclude, kk, feats, dedupe_cos=a.dedupe):
            want[int(idx[i])] = (i, t, "top")
    # 아직 안 한 화면의 band1(상위) 이미지도 포함
    done = done_chunks(cmap, size=a.chunk)
    keep_old = [f for f, m in cmap.items() if f not in done and f not in labels and m.get("band") == "band1"]
    print(f"새로 뽑은 상위 후보 {len(want)}장 + 아직 안 한 band1 {len(keep_old)}장")
    ri, mi = names.index("romantic"), names.index("melancholy")
    ds = open_stream("train", decode=False)
    new_files, got, last = [], 0, max(want) if want else -1
    for pos, row in enumerate(ds):
        if pos > last:
            break
        if pos in want:
            i, tag, band = want[pos]
            fn = f"e{pos:06d}.jpg"
            im = to_pil(row["image"]); im.thumbnail((1024, 1024))
            im.save(os.path.join(CAND_DIR, fn), quality=92)
            cmap[fn] = {"pos": pos, "orig": str(emo[i]), "tag": tag, "band": band,
                        "p_romantic": round(float(P[i, ri]), 4), "p_melancholy": round(float(P[i, mi]), 4)}
            new_files.append(fn); got += 1
            if got % 100 == 0:
                print(f"  ... {got}/{len(want)}")
    import glob
    k0 = max([int(os.path.basename(p)[len("emoset_label_"):-5]) for p in glob.glob(os.path.join(DATA, "emoset_label_*.html"))
              if os.path.basename(p)[len("emoset_label_"):-5].isdigit()] + [0])
    from make_label_sets import make_html
    chunks = chunk_shuffled(new_files + keep_old, a.chunk, seed=a.seed + k0)
    for j, files in enumerate(chunks, 1):
        k = k0 + j
        for f in files:
            cmap[f]["chunk"] = k
        make_html(CAND_DIR, os.path.join(DATA, f"emoset_label_{k}.html"), f"emoset_labels_{k}.csv",
                  f"emoset{k}", f"EmoSet 후보 라벨링 {k}", order=files)
    json.dump(cmap, open(MAP_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"새 라벨링 화면 {len(chunks)}개: data\\emoset_label_{k0 + 1}.html ~ emoset_label_{k0 + len(chunks)}.html")
    print("이전에 만든 화면 중 아직 안 연 것(CSV 를 안 만든 것)은 이제 열지 않아도 됩니다. 그 안의 상위(band1) 이미지는 새 화면에 들어 있습니다.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="mode", required=True)
    s = sub.add_parser("scan")
    s.add_argument("--checkpoint", default=os.path.join(ROOT, "model", "emotion_projection.pt"))
    s.add_argument("--max-scan", type=int, default=20000, help="학습에 안 쓴 이미지를 몇 장까지 계산할지")
    s.add_argument("--used-per-class", type=int, default=3000, help="학습에 쓴 클래스당 장수(스트림 앞에서부터)")
    s.add_argument("--include-unmapped", action="store_true", help="fear/disgust 이미지도 후보 풀에 넣기")
    p = sub.add_parser("pick")
    p.add_argument("--n", type=int, default=600, help="감정(romantic, melancholy)별 후보 장수")
    p.add_argument("--uncertain", type=int, default=150)
    p.add_argument("--chunk", type=int, default=300, help="라벨링 화면 하나당 장수")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--force", action="store_true")
    r = sub.add_parser("round")
    r.add_argument("--k", type=int, default=300, help="감정별 새 후보 장수(상위만)")
    r.add_argument("--k-romantic", type=int, default=None, help="romantic 만 따로 장수 지정")
    r.add_argument("--k-melancholy", type=int, default=None, help="melancholy 만 따로 장수 지정")
    r.add_argument("--dedupe", type=float, default=0.97, help="비슷한 이미지 제외 기준(코사인). 낮출수록 다양하게 뽑음, 권장 0.93")
    r.add_argument("--min-pos", type=int, default=15, help="순위 보정에 필요한 '맞음' 최소 장수")
    r.add_argument("--chunk", type=int, default=300)
    r.add_argument("--seed", type=int, default=0)
    sub.add_parser("report")
    sub.add_parser("merge")
    a = ap.parse_args()
    {"scan": mode_scan, "pick": mode_pick, "report": mode_report, "merge": mode_merge, "round": mode_round}[a.mode](a)


if __name__ == "__main__":
    main()
