# -*- coding: utf-8 -*-
"""
[Step 0] 기준선(baseline) 스냅샷 — 이후 모든 CLIP 고도화 단계의 비교 기준.

evaluate_projection.py가 이미 있지만, 아래 3가지가 빠져 있어 기준선으로 쓰기엔 부족했다.
  1) 체크포인트가 "어떤 학습으로 만들어졌는지" 기록이 안 보임
     (hard_negative_weight > 0 인지 → Hard Negative가 실제로 반영된 체크포인트인지,
      temperature가 이미 fit된 체크포인트인지)
  2) 실서비스 추론 경로(clip_model.py)는 projection 결과를 temperature로 나눈 뒤 softmax 하는데,
     evaluate_projection.py는 temperature 없이 평가해서 ECE가 서비스 값과 다름
  3) 헷갈림 쌍(happy↔energetic, calm↔dreamy) 혼동 횟수를 따로 세지 않고, 결과를 파일로 남기지 않음

이 스크립트는 위를 채우고 결과를 results/<tag>.json 으로 저장한다.
이후 단계에서 같은 명령을 --tag 만 바꿔 다시 돌리고 --compare 로 변화량을 본다.

사용 예:
    python baseline_snapshot.py --tag step0_baseline --max-per-class 300
    # (Hard Negative 재학습 후)
    python baseline_snapshot.py --tag step1_hn --max-per-class 300 --compare results/step0_baseline.json

주의: --max-per-class 는 val 셋 크기를 정한다(클래스당 장수). 비교할 땐 항상 같은 값을 쓸 것.
"""

import argparse
import json
import os
from datetime import datetime

import numpy as np

# 헷갈림 쌍 — train_emotion_projection.py의 _HARD_NEGATIVE_PAIRS_BY_NAME 과 동일
CONFUSION_PAIRS = [("happy", "energetic"), ("energetic", "happy"),
                   ("calm", "dreamy"), ("dreamy", "calm")]


def calibration(probs: np.ndarray, labels: np.ndarray, n_bins: int = 10):
    """ECE / multiclass Brier (evaluate_projection.compute_calibration 과 동일 정의)."""
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    acc = (pred == labels).astype(float)
    edges = np.linspace(0, 1, n_bins + 1)
    ece, n = 0.0, len(labels)
    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        m = (conf >= lo) & (conf <= hi) if i == 0 else (conf > lo) & (conf <= hi)
        if m.sum():
            ece += (m.sum() / n) * abs(acc[m].mean() - conf[m].mean())
    brier = float(np.mean(np.sum((probs - np.eye(probs.shape[1])[labels]) ** 2, axis=1)))
    return float(ece), brier


def summarize(labels: np.ndarray, logits: np.ndarray, temperature: float, names: list) -> dict:
    """logits(= corrected @ text_anchors.T) 하나로 모든 지표를 계산하는 순수 함수."""
    from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

    pred = logits.argmax(axis=1)
    raw = _softmax(logits)                       # 서비스 이전(온도 없음) — evaluate_projection 과 같은 값
    cal = _softmax(logits / temperature)         # 서비스 경로(clip_model.py)와 같은 값

    cm = confusion_matrix(labels, pred, labels=list(range(len(names))))
    recall = {n: float(cm[i, i] / cm[i].sum()) if cm[i].sum() else None for i, n in enumerate(names)}
    f1s = f1_score(labels, pred, average=None, labels=list(range(len(names))), zero_division=0)

    idx = {n: i for i, n in enumerate(names)}
    pair_counts = {}
    for a, b in CONFUSION_PAIRS:
        if a in idx and b in idx:
            pair_counts[f"{a}->{b}"] = int(cm[idx[a], idx[b]])

    ece_raw, brier_raw = calibration(raw, labels)
    ece_cal, brier_cal = calibration(cal, labels)

    # [Step 5] Top-2 정확도 + 2순위 분포 — 추천은 1·2차 감정을 함께 쓰므로 1순위만 보면 부족하다.
    order = np.argsort(-logits, axis=1)
    top2_hit = (order[:, 0] == labels) | (order[:, 1] == labels)
    k = len(names)
    first_second = np.zeros((k, k), dtype=int)       # [1순위 예측, 2순위 예측] 횟수
    for a, b in zip(order[:, 0], order[:, 1]):
        first_second[a, b] += 1
    second_of_pred = {}
    for i, n in enumerate(names):
        row = first_second[i]
        if row.sum():
            j = int(row.argmax())
            second_of_pred[n] = {"most_common_second": names[j], "share": float(row[j] / row.sum())}
    return {
        "n_samples": int(len(labels)),
        "top2_accuracy": float(top2_hit.mean()),
        "first_second_matrix": first_second.tolist(),
        "second_of_pred": second_of_pred,
        "accuracy": float(accuracy_score(labels, pred)),
        "macro_f1": float(f1_score(labels, pred, average="macro", zero_division=0)),
        "per_class_recall": recall,
        "per_class_f1": {n: float(f1s[i]) for i, n in enumerate(names)},
        "confusion_matrix": cm.tolist(),
        "confusion_pairs": pair_counts,
        "confusion_pairs_total": int(sum(pair_counts.values())),
        "ece_raw": ece_raw, "brier_raw": brier_raw,
        "ece_with_T": ece_cal, "brier_with_T": brier_cal,
        "mean_confidence_with_T": float(cal.max(axis=1).mean()),
        "temperature_used": float(temperature),
    }


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(axis=1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=1, keepdims=True)


def print_summary(tag: str, s: dict, names: list):
    print(f"\n=== [{tag}] ===")
    print(f"샘플 {s['n_samples']}개 | Accuracy={s['accuracy']:.4f} | Top-2={s.get('top2_accuracy', float('nan')):.4f} "
          f"| Macro-F1={s['macro_f1']:.4f}")
    print("감정별 recall / F1:")
    for n in names:
        r = s["per_class_recall"][n]
        print(f"  {n:<10} recall={'-' if r is None else f'{r:.3f}'}  f1={s['per_class_f1'][n]:.3f}")
    print("Confusion Matrix (행=실제, 열=예측):")
    print("  ", names)
    for row in s["confusion_matrix"]:
        print("  ", row)
    print("헷갈림 쌍 혼동 횟수:", s["confusion_pairs"], f"(합계 {s['confusion_pairs_total']})")
    if s.get("second_of_pred"):
        print("1순위별 가장 흔한 2순위:")
        for n, v in s["second_of_pred"].items():
            print(f"  {n:<10} -> {v['most_common_second']:<10} ({v['share']:.0%})")
    print(f"Calibration  온도 없음: ECE={s['ece_raw']:.4f} Brier={s['brier_raw']:.4f}")
    print(f"             T={s['temperature_used']:.4f} 적용(서비스 경로): "
          f"ECE={s['ece_with_T']:.4f} Brier={s['brier_with_T']:.4f} | 평균 확신도={s['mean_confidence_with_T']:.3f}")


def print_compare(cur: dict, prev: dict):
    print("\n=== 이전 결과 대비 변화 ===")
    for k in ("accuracy", "macro_f1", "ece_with_T", "brier_with_T", "mean_confidence_with_T"):
        print(f"  {k:<24} {prev['projection'][k]:.4f} -> {cur['projection'][k]:.4f}  "
              f"({cur['projection'][k] - prev['projection'][k]:+.4f})")
    print(f"  헷갈림 쌍 합계           {prev['projection']['confusion_pairs_total']} -> "
          f"{cur['projection']['confusion_pairs_total']}")
    for pair, v in cur["projection"]["confusion_pairs"].items():
        pv = prev["projection"]["confusion_pairs"].get(pair)
        print(f"    {pair:<20} {pv} -> {v}")


def main():
    import clip
    import torch
    from model.emotion_classifier import EmotionProjection
    from model.emotion_prompts import build_prompt_ensemble_anchors
    from model.emotion_va_map import TRAINED_SYNC_EMOTIONS
    from feature_cache import get_features

    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="step0_baseline")
    ap.add_argument("--checkpoint", default="model/emotion_projection.pt")
    ap.add_argument("--clip-model", default="ViT-B/32")
    ap.add_argument("--hf-dataset", default="Woleek/EmoSet-118K")
    ap.add_argument("--max-per-class", type=int, default=300)
    ap.add_argument("--split", default="val", choices=["val", "test"],
                    help="test 는 최종 보고용 — 모델 선택이 끝난 뒤에만 쓸 것")
    ap.add_argument("--compare", default=None, help="이전 스냅샷 json 경로")
    ap.add_argument("--out-dir", default="results")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    names = list(TRAINED_SYNC_EMOTIONS)
    print(f"device: {device} | 평가 대상 감정: {names}")

    # ── 1) 체크포인트 메타데이터 ─────────────────────────────────────────
    ckpt = torch.load(args.checkpoint, map_location=device)
    meta = {k: v for k, v in ckpt.items() if not k.endswith("state_dict")}
    print("\n[체크포인트 메타데이터]")
    for k, v in meta.items():
        print(f"  {k}: {v}")
    # 주의: 학습 스크립트는 weight=0 이어도 margin/weight 키를 항상 저장한다 → 키 유무가 아니라 weight>0 로 판단
    has_hn = float(ckpt.get("hard_negative_weight", 0.0) or 0.0) > 0.0
    has_T = "temperature" in ckpt
    print(f"  → Hard Negative 학습 반영 체크포인트(weight>0): {'예' if has_hn else '아니오(weight=0 또는 구버전 — 재학습 필요)'}")
    print(f"  → Temperature fit 완료: {'예' if has_T else '아니오(1.0으로 동작)'}")
    temperature = float(ckpt.get("temperature", 1.0))

    # ── 2) 모델/데이터 ───────────────────────────────────────────────────
    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()
    anchors = build_prompt_ensemble_anchors(clip_model, device, TRAINED_SYNC_EMOTIONS)
    projection = EmotionProjection(dim=512).to(device)
    projection.load_state_dict(ckpt["projection_state_dict"])
    projection.eval()

    vf, vy, _ = get_features(args.split, args.max_per_class, clip_model, preprocess, device,
                             args.hf_dataset, args.clip_model)
    with torch.no_grad():
        vf_d = vf.to(device)
        zs_logits = (vf_d @ anchors.T).cpu().numpy()
        pj_logits = (projection(vf_d) @ anchors.T).cpu().numpy()
    labels_all = vy.numpy()


    # ── 3) 지표 ──────────────────────────────────────────────────────────
    # zero-shot 경로에는 서비스에서도 temperature를 쓰지 않으므로 T=1.0
    zs = summarize(labels_all, zs_logits, 1.0, names)
    pj = summarize(labels_all, pj_logits, temperature, names)
    print_summary("Zero-shot (프로젝션 미적용)", zs, names)
    print_summary("Projection (서비스 경로)", pj, names)

    result = {
        "tag": args.tag,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "max_per_class": args.max_per_class,
        "split": args.split,
        "checkpoint": args.checkpoint,
        "checkpoint_meta": {k: (v if isinstance(v, (int, float, str, bool, list)) else str(v))
                            for k, v in meta.items()},
        "hard_negative_applied": has_hn,
        "temperature_fitted": has_T,
        "zero_shot": zs,
        "projection": pj,
    }

    if args.compare and os.path.exists(args.compare):
        with open(args.compare, encoding="utf-8") as f:
            print_compare(result, json.load(f))

    os.makedirs(args.out_dir, exist_ok=True)
    out_path = os.path.join(args.out_dir, f"{args.tag}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n저장 완료: {out_path}  ← 이 파일(과 위 콘솔 출력)을 Claude에게 보내주세요")


if __name__ == "__main__":
    main()
