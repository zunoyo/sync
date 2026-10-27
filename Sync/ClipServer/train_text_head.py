# -*- coding: utf-8 -*-
"""
텍스트 헤드 학습 — KoELECTRA 은닉 상태 위에 SYNC 8감정 로지스틱 회귀를 얹고, 기존 CLIP 텍스트 경로와 합친다.

왜: 텍스트 경로가 (번역 → CLIP zero-shot)이라 사전에 없는 표현에서 정확도가 0.68~0.78 에 머문다.
    이 헤드는 문장 데이터로 직접 학습해서 번역 단계 손실 없이 8감정을 가른다.

데이터
  학습  data/text_train_ko.json (make_text_data.py 로 생성, ~490문장) + data/train_data.json 의 text_samples
        (+ --extra-train 로 사용자 피드백 등 추가 JSON: {"items":[{"text","label"}]})
  평가  text_eval_set(dev) · text_eval_heldout · text_eval_fresh · text_eval_fresh2(봉인) · fusion_pairs.csv 의 텍스트
        → 보고에만 쓴다. 하이퍼파라미터(특징 종류·C·합성 가중치 a·온도 T)는 학습 문장의 교차검증(OOF)으로만 정한다.
        (dev/heldout/fresh 는 키워드 사전 설계에 참고된 문장이 섞여 있어 기존 경로에 유리할 수 있다 — fresh2 가 가장 공정하다)

동작
  1) 기존 서비스 경로(CLIP)의 확률 p_clip, KoELECTRA 특징 X 를 모든 문장에 대해 계산(특징은 feature_cache/ 에 캐시)
  2) 학습 문장 5-fold OOF 로 (특징, C) 선택 → OOF 헤드 확률 p_head
  3) 합성  softmax((a·log p_head + (1-a)·log p_clip)/T) 의 a, T 를 OOF NLL 로 선택
  4) 전체 학습 문장으로 헤드 재학습 → model/text_head.pt 저장(서버가 있으면 자동 사용)
  5) 평가셋별 기존(CLIP) / 헤드만 / 합성 비교, 감정별 재현율, 틀린 문장 목록

사용
  python make_text_data.py          # 데이터 생성(이미 있으면 생략)
  python train_text_head.py         # 학습 + 평가 + 저장
  python train_text_head.py --no-write   # 저장 없이 측정만
이후: python eval_fusion.py --grid --cv --w 0.1 --save-temperature (텍스트 확률이 바뀌었으니 합성 온도 재보정)
"""
import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from model.text_head import TextHead, FEAT_SLICES, blend_probs, softmax  # noqa: E402

KO = lambda s: any("가" <= ch <= "힣" for ch in s)  # noqa: E731


# ───────────────────────── 순수 함수(torch/CLIP 불필요) ─────────────────────────
def fit_lr(X, y, C, K, seed=0):
    from sklearn.linear_model import LogisticRegression
    clf = LogisticRegression(C=C, max_iter=3000, class_weight="balanced", random_state=seed)
    clf.fit(X, y)
    W = np.zeros((X.shape[1], K)); b = np.zeros(K)
    for row, c in enumerate(clf.classes_):      # 학습에 없는 클래스는 아주 낮은 로짓
        W[:, c] = clf.coef_[row]; b[c] = clf.intercept_[row]
    for c in range(K):
        if c not in set(clf.classes_):
            b[c] = -20.0
    return W, b


def standardize(Xtr):
    mean = Xtr.mean(0)
    std = Xtr.std(0)
    std[std < 1e-6] = 1.0
    return mean, std


def oof_proba(X, y, C, K, folds, seed=0):
    """층화 K-fold OOF 확률 (스케일러도 fold 안에서만 맞춤)."""
    n = len(y)
    rng = np.random.RandomState(seed)
    fold_of = np.zeros(n, dtype=int)
    for c in range(K):
        idx = np.where(y == c)[0]
        rng.shuffle(idx)
        for j, i in enumerate(idx):
            fold_of[i] = j % folds
    P = np.zeros((n, K))
    for f in range(folds):
        tr, te = fold_of != f, fold_of == f
        mean, std = standardize(X[tr])
        W, b = fit_lr((X[tr] - mean) / std, y[tr], C, K, seed)
        P[te] = softmax(((X[te] - mean) / std) @ W + b, axis=1)
    return P


def nll(P, y, eps=1e-9):
    return float(-np.log(P[np.arange(len(y)), y] + eps).mean())


def fit_T(p_head, p_clip, y, a):
    """합성 확률의 온도 T 를 NLL 최소로 맞춘다(1차원 격자 + 정밀화)."""
    best = (1e9, 1.0)
    for lt in np.linspace(-1.5, 1.5, 61):
        T = float(np.exp(lt))
        v = nll(blend_probs(p_head, p_clip, a, T), y)
        if v < best[0]:
            best = (v, T)
    lo, hi = np.log(best[1]) - 0.06, np.log(best[1]) + 0.06
    for lt in np.linspace(lo, hi, 25):
        T = float(np.exp(lt))
        v = nll(blend_probs(p_head, p_clip, a, T), y)
        if v < best[0]:
            best = (v, T)
    return best[1], best[0]


def ece_np(P, y, bins=10):
    conf = P.max(1); pred = P.argmax(1); acc = (pred == y).astype(float)
    e = 0.0
    for lo in np.linspace(0, 1, bins, endpoint=False):
        m = (conf > lo) & (conf <= lo + 1.0 / bins)
        if m.any():
            e += m.mean() * abs(acc[m].mean() - conf[m].mean())
    return float(e)


def summarize(P, y, K):
    pred = P.argmax(1)
    order = np.argsort(-P, axis=1)
    f1s = []
    for k in range(K):
        tp = int(((pred == k) & (y == k)).sum()); fp = int(((pred == k) & (y != k)).sum()); fn = int(((pred != k) & (y == k)).sum())
        if tp + fp + fn:
            f1s.append(2 * tp / (2 * tp + fp + fn))
    return {
        "n": int(len(y)), "accuracy": float((pred == y).mean()),
        "top2": float(((order[:, 0] == y) | (order[:, 1] == y)).mean()),
        "macro_f1": float(np.mean(f1s)) if f1s else 0.0,
        "ece": ece_np(P, y), "mean_conf": float(P.max(1).mean()),
    }


def select_and_fit(X_all, y, p_clip, K, feats, cs, folds, a_grid):
    """(특징, C) → a → T 를 학습 문장 OOF 로 선택하고 최종 헤드 계수를 돌려준다."""
    log = {"feat_C": [], "a": []}
    best = None
    for feat in feats:
        X = X_all[:, FEAT_SLICES[feat]]
        for C in cs:
            P = oof_proba(X, y, C, K, folds)
            v = nll(P, y)
            log["feat_C"].append({"feat": feat, "C": C, "oof_nll": v, "oof_acc": float((P.argmax(1) == y).mean())})
            if best is None or v < best[0]:
                best = (v, feat, C, P)
    _, feat, C, P_head = best
    best_a = None
    for a in a_grid:
        T, v = fit_T(P_head, p_clip, y, a)
        Pb = blend_probs(P_head, p_clip, a, T)
        log["a"].append({"a": float(a), "T": T, "oof_nll": v, "oof_acc": float((Pb.argmax(1) == y).mean())})
        if best_a is None or v < best_a[0]:
            best_a = (v, float(a), T)
    _, a, T = best_a
    X = X_all[:, FEAT_SLICES[feat]]
    mean, std = standardize(X)
    W, b = fit_lr((X - mean) / std, y, C, K)
    return dict(feat=feat, C=C, a=a, T=T, W=W, b=b, mean=mean, std=std, log=log, p_head_oof=P_head)


# ───────────────────────── 데이터 / 모델 연결 ─────────────────────────
def load_items(path):
    d = json.load(open(path, encoding="utf-8"))
    items = d["items"] if isinstance(d, dict) and "items" in d else d.get("text_samples", d)
    out = []
    for it in items:
        lab = it.get("label") or it.get("emotion")
        if lab and it.get("text"):
            out.append({"text": it["text"].strip(), "label": lab, "lang": it.get("lang", "ko")})
    return out


def load_fusion_texts(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            if r.get("text") and r.get("text_label"):
                out.append({"text": r["text"].strip(), "label": r["text_label"].strip(), "lang": "ko"})
    return out


def features_for(texts, cache_dir):
    from model.korean_emotion import encode_features
    key = hashlib.md5("\n".join(texts).encode("utf-8")).hexdigest()[:12]
    path = os.path.join(cache_dir, f"ktext_{key}.npy")
    if os.path.exists(path):
        print(f"[특징 캐시] {path}")
        return np.load(path)
    print(f"[특징] KoELECTRA 로 {len(texts)}문장 인코딩 중 …")
    X = encode_features(texts)
    if X is None:
        sys.exit("KoELECTRA 모델을 불러오지 못했습니다(transformers 설치/모델 다운로드 확인).")
    os.makedirs(cache_dir, exist_ok=True)
    np.save(path, X)
    return X


def clip_probs_for(texts):
    from model.clip_model import ClipModel
    m = ClipModel()
    m.text_head = None            # 기존 경로만 — 이미 저장된 헤드가 있어도 섞이지 않게
    emos = list(m.emotions)
    P = np.stack([m._text_forward(t)[1] for t in texts])
    return P, emos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", default="data/text_train_ko.json")
    ap.add_argument("--train-data", default="data/train_data.json", help="기존 text_samples(없으면 생략)")
    ap.add_argument("--extra-train", nargs="*", default=[], help="추가 학습 JSON(사용자 피드백 등)")
    ap.add_argument("--evals", nargs="*", default=[
        "dev=data/text_eval_set.json", "heldout=data/text_eval_heldout.json",
        "fresh=data/text_eval_fresh.json", "fresh2=data/text_eval_fresh2.json"])
    ap.add_argument("--fusion-csv", default="data/fusion_pairs.csv")
    ap.add_argument("--feats", default="clsmean,cls,all")
    ap.add_argument("--cs", default="0.01,0.03,0.1,0.3,1")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--cache-dir", default="feature_cache")
    ap.add_argument("--out", default="model/text_head.pt")
    ap.add_argument("--results", default="results/step9_text_head.json")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    # 1) 데이터 ───────────────────────────────────────────────────────────
    ev_sets = {}
    for spec in args.evals:
        name, path = spec.split("=", 1)
        if os.path.exists(path):
            ev_sets[name] = [i for i in load_items(path) if i["lang"] == "ko"]
    fz = load_fusion_texts(args.fusion_csv)
    if fz:
        ev_sets["fusion_texts"] = fz
    eval_texts = {i["text"] for v in ev_sets.values() for i in v}

    train = load_items(args.train)
    if os.path.exists(args.train_data):
        train += load_items(args.train_data)
    for p in args.extra_train:
        train += load_items(p)
    seen, tr = set(), []
    for it in train:
        if it["text"] in eval_texts or it["text"] in seen or not KO(it["text"]):
            continue          # 평가 문장·중복·한국어 아닌 문장은 학습에서 제외
        seen.add(it["text"]); tr.append(it)
    print(f"학습 {len(tr)}문장 {dict(Counter(i['label'] for i in tr))}")
    print("평가셋:", {k: len(v) for k, v in ev_sets.items()})

    all_items = tr + [i for v in ev_sets.values() for i in v]
    texts = [i["text"] for i in all_items]
    uniq = list(dict.fromkeys(texts))

    # 2) 특징·기존 경로 확률 ───────────────────────────────────────────────
    Pc_u, emos = clip_probs_for(uniq)
    X_u = features_for(uniq, args.cache_dir)
    pos = {t: i for i, t in enumerate(uniq)}
    K = len(emos)
    lab = {e: i for i, e in enumerate(emos)}

    def gather(items):
        idx = [pos[i["text"]] for i in items]
        return X_u[idx], Pc_u[idx], np.array([lab[i["label"]] for i in items])

    Xtr, Pc_tr, ytr = gather(tr)

    # 3) 선택·학습 ───────────────────────────────────────────────────────
    feats = args.feats.split(","); cs = [float(c) for c in args.cs.split(",")]
    sel = select_and_fit(Xtr, ytr, Pc_tr, K, feats, cs, args.folds, [round(x, 2) for x in np.arange(0, 1.01, 0.1)])
    print("\n[학습 문장 OOF] (특징, C) 선택")
    for r in sel["log"]["feat_C"]:
        mark = " ◀" if (r["feat"], r["C"]) == (sel["feat"], sel["C"]) else ""
        print(f"  feat={r['feat']:<7} C={r['C']:<5} OOF acc={r['oof_acc']:.3f} NLL={r['oof_nll']:.3f}{mark}")
    print(f"기존 CLIP 경로(학습 문장) acc={float((Pc_tr.argmax(1)==ytr).mean()):.3f}")
    print("[합성 가중치 a (a=1 헤드만, a=0 기존 경로만)]")
    for r in sel["log"]["a"]:
        mark = " ◀" if r["a"] == sel["a"] else ""
        print(f"  a={r['a']:.1f} T={r['T']:.3f} OOF acc={r['oof_acc']:.3f} NLL={r['oof_nll']:.3f}{mark}")

    head = TextHead(sel["W"], sel["b"], sel["mean"], sel["std"], emos, sel["feat"], sel["a"], sel["T"],
                    meta={"C": sel["C"], "n_train": len(tr)})

    # 4) 평가 ───────────────────────────────────────────────────────────
    results = {"selected": {k: sel[k] for k in ("feat", "C", "a", "T")}, "train_n": len(tr), "oof": sel["log"], "eval": {}}
    pooled = {"clip": [], "head": [], "blend": [], "y": [], "texts": []}
    print("\n[평가] 기존(CLIP) / 헤드만 / 합성 — 평가셋은 선택에 쓰지 않음")
    print(f"  {'set':<13}{'n':>4}  {'기존 acc':>8} {'헤드 acc':>8} {'합성 acc':>8}  {'합성 top2':>9} {'F1':>6} {'ECE':>6} {'평균확신':>8}")
    for name, items in ev_sets.items():
        X, Pc, y = gather(items)
        Ph = head.proba_from_features(X)
        Pb = blend_probs(Ph, Pc, head.a, head.T)
        sc, sh, sb = summarize(Pc, y, K), summarize(Ph, y, K), summarize(Pb, y, K)
        results["eval"][name] = {"clip": sc, "head": sh, "blend": sb}
        print(f"  {name:<13}{len(y):>4}  {sc['accuracy']:>8.3f} {sh['accuracy']:>8.3f} {sb['accuracy']:>8.3f}  "
              f"{sb['top2']:>9.3f} {sb['macro_f1']:>6.3f} {sb['ece']:>6.3f} {sb['mean_conf']:>8.3f}")
        if name != "fusion_texts":     # 짝 데이터 텍스트는 이미지와 충돌하도록 쓴 문장이라 따로 본다
            pooled["clip"].append(Pc); pooled["head"].append(Ph); pooled["blend"].append(Pb)
            pooled["y"].append(y); pooled["texts"] += [i["text"] for i in items]
    if pooled["y"]:
        y = np.concatenate(pooled["y"])
        Pb = np.concatenate(pooled["blend"]); Pc = np.concatenate(pooled["clip"]); Ph = np.concatenate(pooled["head"])
        sb, sc = summarize(Pb, y, K), summarize(Pc, y, K)
        results["eval"]["pooled_ko"] = {"clip": sc, "head": summarize(Ph, y, K), "blend": sb}
        print(f"  {'pooled(dev+held+fresh+fresh2)':<13} n={len(y)} 기존 {sc['accuracy']:.3f} → 합성 {sb['accuracy']:.3f}")
        print("\n감정별 재현율 (합성, pooled):")
        pred = Pb.argmax(1)
        for e in emos:
            m = y == lab[e]
            rc = float((pred[m] == lab[e]).mean()) if m.any() else float("nan")
            rc0 = float((Pc.argmax(1)[m] == lab[e]).mean()) if m.any() else float("nan")
            print(f"  {e:<11} {rc:.3f}  (기존 {rc0:.3f}, n={int(m.sum())})")
        cm = np.zeros((K, K), dtype=int)
        for t, p in zip(y, pred):
            cm[t, p] += 1
        print("혼동행렬(행=정답, 열=예측):", emos)
        for i, row in enumerate(cm):
            print(f"  {emos[i]:<11}", row.tolist())
        results["eval"]["pooled_ko"]["confusion"] = cm.tolist()
        if "fresh2" in ev_sets:
            Xf, Pcf, yf = gather(ev_sets["fresh2"])
            Pbf = blend_probs(head.proba_from_features(Xf), Pcf, head.a, head.T).argmax(1)
            wrong = [(emos[yf[i]], emos[Pbf[i]], ev_sets["fresh2"][i]["text"]) for i in range(len(yf)) if Pbf[i] != yf[i]]
            print(f"\n[fresh2 오답 {len(wrong)}개]")
            for g, p, t in wrong[:25]:
                print(f"  ({g}→{p}) {t}")

    os.makedirs(os.path.dirname(args.results) or ".", exist_ok=True)
    json.dump(results, open(args.results, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {args.results}")
    if args.no_write:
        print("(--no-write: 헤드는 저장하지 않았습니다)")
    else:
        head.save(args.out)
        print(f"헤드 저장: {args.out}  → 서버 재시작하면 한국어 텍스트 경로에 적용됩니다")
        print("다음: python eval_fusion.py --grid --cv --w 0.1 --save-temperature")


if __name__ == "__main__":
    main()
