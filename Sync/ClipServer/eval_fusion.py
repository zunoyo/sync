# -*- coding: utf-8 -*-
"""
복합(이미지+텍스트) 입력 후기 융합 평가 — 사람이 정답을 붙인 짝 데이터(~100쌍)로 비교한다.

비교 대상
  image_only : 이미지 경로만
  text_only  : 텍스트 경로만
  early      : 예전 방식(임베딩 0.5:0.5 평균 → 이미지용 T)
  late(w)    : 후기 융합(가중 기하평균). 기본 w=0.5, --grid 면 w 를 0.0~0.7 로 훑는다(0.0 = 텍스트만)

입력 CSV (data/fusion_pairs.csv, make_fusion_template.py 로 만든 템플릿을 채운 것)
  pair_id, kind(agree|conflict), text, text_label, image_hint, image_path, true_emotion, true_emotion_alt, note
  - image_path 와 true_emotion 이 비어 있는 행은 건너뛴다.
  - true_emotion      : '이 이미지+문장 한 쌍이 전체로 느끼게 하는 감정'을 사람이 정한 정답(8개 중 하나)
  - true_emotion_alt  : 정답으로 인정할 두 번째 감정(선택). 있으면 top-2 가 아닌 '허용 정답' 지표에 쓴다.

지표: acc, top-2, macro-F1, ECE, Brier, 평균 확신도, 충돌 쌍/일치 쌍 분리 정확도,
      conflict 플래그 vs kind(정밀도/재현율), (--cv) 교차검증한 온도 보정 후 ECE.
결과: results/step8_fusion.json (report_metrics.py 가 summary.md 의 '복합 입력' 표로 모은다)

사용
  python eval_fusion.py                          # 기본 w=0.5
  python eval_fusion.py --grid                   # w 를 훑어 비교(선택은 val 쌍에서, 보고는 나머지에서 하는 것을 권장)
  python eval_fusion.py --save-temperature       # 후기 융합 확률의 온도를 맞춰 emotion_projection.pt 에 temperature_both 저장
주의: 100쌍은 작다. 1쌍 = 1%p 이므로 몇 %p 차이는 방향만 본다. 온도를 맞춘 쌍으로 ECE 를 보고하면 낙관적이다(--cv 참고).
"""
import argparse
import csv
import json
import os
from collections import Counter

import numpy as np

from model.late_fusion import geometric_fuse, apply_temperature, assess_conflict, fuse_va
from baseline_snapshot import calibration

ROOT = os.path.dirname(os.path.abspath(__file__))


# ───────────────────────── 순수 함수(torch 불필요, 단독 테스트 가능) ─────────────────────────
def metrics(P: np.ndarray, y: np.ndarray, names, y_alt=None) -> dict:
    """P: (n, K) 확률, y: (n,) 정답 인덱스, y_alt: (n,) 허용 정답(없으면 -1)."""
    n = len(y)
    pred = P.argmax(1)
    order = np.argsort(-P, axis=1)
    top2 = ((order[:, 0] == y) | (order[:, 1] == y)).mean()
    ece, brier = calibration(P, y)
    f1s = []
    for k in range(len(names)):
        tp = int(((pred == k) & (y == k)).sum()); fp = int(((pred == k) & (y != k)).sum()); fn = int(((pred != k) & (y == k)).sum())
        if tp + fp + fn == 0:
            continue   # 정답에도 예측에도 안 나온 감정은 macro 에서 제외
        f1s.append(2 * tp / (2 * tp + fp + fn))
    out = {
        "n": int(n), "accuracy": float((pred == y).mean()), "top2_accuracy": float(top2),
        "macro_f1": float(np.mean(f1s)) if f1s else 0.0,
        "ece": float(ece), "brier": float(brier), "mean_confidence": float(P.max(1).mean()),
    }
    if y_alt is not None and (y_alt >= 0).any():
        ok = (pred == y) | ((y_alt >= 0) & (pred == y_alt))
        out["accuracy_with_alt"] = float(ok.mean())
    return out


def split_by(P, y, mask, names, y_alt=None):
    if mask.sum() == 0:
        return None
    return metrics(P[mask], y[mask], names, None if y_alt is None else y_alt[mask])


def conflict_flag_quality(flags: np.ndarray, kind_conflict: np.ndarray) -> dict:
    tp = int((flags & kind_conflict).sum()); fp = int((flags & ~kind_conflict).sum()); fn = int((~flags & kind_conflict).sum())
    return {"flagged": int(flags.sum()), "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None}


def fit_temperature_nll(P: np.ndarray, y: np.ndarray, grid=None) -> float:
    """융합 확률에 log p / T 를 적용했을 때 NLL 이 최소인 T (격자 탐색)."""
    grid = np.exp(np.linspace(np.log(0.3), np.log(4.0), 60)) if grid is None else grid
    best_T, best = 1.0, 1e18
    for T in grid:
        Q = np.stack([apply_temperature(p, float(T)) for p in P])
        nll = -np.log(Q[np.arange(len(y)), y] + 1e-9).mean()
        if nll < best:
            best, best_T = nll, float(T)
    return best_T


def cv_temperature_ece(P: np.ndarray, y: np.ndarray, k: int = 5, seed: int = 0) -> dict:
    """k-겹 교차검증: 학습 폴드에서 T 를 맞추고 검증 폴드에 적용 → 낙관적이지 않은 ECE/Brier."""
    n = len(y)
    rng = np.random.RandomState(seed)
    idx = rng.permutation(n)
    folds = np.array_split(idx, k)
    Q = np.zeros_like(P)
    for f in folds:
        tr = np.setdiff1d(idx, f)
        T = fit_temperature_nll(P[tr], y[tr])
        Q[f] = np.stack([apply_temperature(p, T) for p in P[f]])
    ece, brier = calibration(Q, y)
    ece0, brier0 = calibration(P, y)
    return {"ece_before": float(ece0), "brier_before": float(brier0), "ece_cv": float(ece), "brier_cv": float(brier)}


def evaluate_rows(rows, names, w_list, early_key="p_early"):
    """rows: [{'kind','y','y_alt','p_img','p_txt','p_early'}...] → 방식별 지표 dict."""
    y = np.array([r["y"] for r in rows])
    y_alt = np.array([r.get("y_alt", -1) for r in rows])
    kind_conf = np.array([r["kind"] == "conflict" for r in rows])
    P_img = np.stack([r["p_img"] for r in rows]); P_txt = np.stack([r["p_txt"] for r in rows])
    P_early = np.stack([r[early_key] for r in rows])
    variants = {"image_only": P_img, "text_only": P_txt, "early": P_early}
    for w in w_list:
        variants[f"late_w{w:.2f}"] = np.stack([geometric_fuse(a, b, w) for a, b in zip(P_img, P_txt)])
    res = {}
    for name, P in variants.items():
        m = metrics(P, y, names, y_alt)
        m["conflict_pairs"] = split_by(P, y, kind_conf, names, y_alt)
        m["agree_pairs"] = split_by(P, y, ~kind_conf, names, y_alt)
        res[name] = m
    flags = np.array([assess_conflict(a, b, names)["conflict"] for a, b in zip(P_img, P_txt)])
    levels = Counter(assess_conflict(a, b, names)["conflict_level"] for a, b in zip(P_img, P_txt))
    return res, {"flag_vs_kind": conflict_flag_quality(flags, kind_conf), "levels": dict(levels)}, variants, y


# ───────────────────────── CSV / 모델 ─────────────────────────
def load_pairs(path):
    rows = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            if (r.get("image_path") or "").strip() and (r.get("true_emotion") or "").strip():
                rows.append(r)
    return rows


def brief(tag, m):
    c = m.get("conflict_pairs"); a = m.get("agree_pairs")
    print(f"  {tag:<12} acc={m['accuracy']:.3f} top2={m['top2_accuracy']:.3f} F1={m['macro_f1']:.3f} "
          f"ECE={m['ece']:.3f} Brier={m['brier']:.3f} 확신도={m['mean_confidence']:.3f}"
          + (f" | 충돌쌍 acc={c['accuracy']:.3f}(n={c['n']})" if c else "")
          + (f" | 일치쌍 acc={a['accuracy']:.3f}(n={a['n']})" if a else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.path.join(ROOT, "data", "fusion_pairs.csv"))
    ap.add_argument("--image-root", default="", help="image_path 가 상대경로일 때의 기준 폴더")
    ap.add_argument("--w", type=float, default=0.5)
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--cv", action="store_true", help="온도 보정을 교차검증으로 평가")
    ap.add_argument("--save-temperature", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "results", "step8_fusion.json"))
    args = ap.parse_args()

    from PIL import Image
    from model.clip_model import ClipModel
    from config import settings

    model = ClipModel(settings.CLIP_MODEL)
    names = model.emotions
    rows_csv = load_pairs(args.csv)
    if not rows_csv:
        print(f"{args.csv} 에 image_path 와 true_emotion 이 채워진 행이 없습니다. make_fusion_template.py 로 만든 CSV 를 채워 주세요.")
        return
    rows = []
    for r in rows_csv:
        path = r["image_path"].strip()
        if not os.path.isabs(path):
            path = os.path.join(args.image_root or ROOT, path)   # 기본: ClipServer 폴더 기준(prepare_fusion_pairs.py 가 이 형식으로 적음)
        try:
            img = Image.open(path).convert("RGB")
        except Exception as e:
            print(f"[건너뜀] {r.get('pair_id')}: 이미지를 열 수 없음 ({e})")
            continue
        te = r["true_emotion"].strip()
        if te not in names:
            print(f"[건너뜀] {r.get('pair_id')}: true_emotion '{te}' 은 {names} 중 하나여야 합니다")
            continue
        alt = (r.get("true_emotion_alt") or "").strip()
        parts = model.analyze_parts(r["text"], img)
        rows.append({"pair_id": r.get("pair_id"), "kind": (r.get("kind") or "conflict").strip(),
                     "y": names.index(te), "y_alt": names.index(alt) if alt in names else -1, **parts})
    print(f"평가 쌍: {len(rows)}개 (충돌 {sum(r['kind']=='conflict' for r in rows)} / 일치 {sum(r['kind']=='agree' for r in rows)})")

    w_list = [round(x, 2) for x in np.arange(0.0, 0.71, 0.1)] if args.grid else [args.w]
    if args.w not in w_list:
        w_list.append(args.w)
    res, flag, variants, y = evaluate_rows(rows, names, sorted(set(w_list)))

    print("\n[방식별 지표]")
    for tag, m in res.items():
        brief(tag, m)
    fq = flag["flag_vs_kind"]
    print(f"\n[충돌 플래그] 켜진 쌍 {fq['flagged']}개 | kind=conflict 대비 정밀도 {fq['precision']} 재현율 {fq['recall']} | 수준 {flag['levels']}")

    main_key = f"late_w{args.w:.2f}"
    out = {"tag": "step8_fusion", "n_pairs": len(rows), "emotions": names, "w_img": args.w,
           "methods": res, "conflict_flag": flag, "main": main_key,
           "note": "짝 데이터가 작아 몇 %p 차이는 방향만 본다. ECE/Brier 는 온도 보정 전 값."}
    if args.cv:
        out["temperature_cv"] = cv_temperature_ece(variants[main_key], y)
        print("\n[온도 보정 교차검증]", out["temperature_cv"])
    if args.save_temperature:
        import torch
        T = fit_temperature_nll(variants[main_key], y)
        ck = torch.load(model.EMOTION_PROJECTION_PATH, map_location="cpu")
        ck["temperature_both"] = T
        torch.save(ck, model.EMOTION_PROJECTION_PATH)
        out["temperature_both"] = T
        print(f"temperature_both={T:.4f} 를 {model.EMOTION_PROJECTION_PATH} 에 저장했습니다(서버 재시작 필요).")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print(f"저장: {args.out}  →  python report_metrics.py 로 summary.md 갱신")


if __name__ == "__main__":
    main()
