# -*- coding: utf-8 -*-
"""
zero-shot vs EmotionProjection 체크포인트 비교 평가 스크립트.

train_emotion_projection.py로 학습한 emotion_projection.pt가 실제로 zero-shot
대비 얼마나 개선됐는지를 "같은 val set" 위에서 측정한다. 지금까지는 학습
스크립트 로그에 val_acc만 남고, 그 val_acc가 zero-shot보다 나은지 비교할
기준이 없었다 — 이 스크립트가 그 기준을 만든다.

측정 항목 (연구 문서 11장 "평가 지표" 기준):
  - Accuracy       (zero-shot vs projection)
  - Macro-F1 / Weighted-F1 / Per-class F1
  - Confusion Matrix
  - ECE (Expected Calibration Error) / Brier Score
                     softmax confidence가 실제 정답 확률과 얼마나 어긋나는지.
                     예: confidence 0.9로 예측한 샘플들의 실제 정답률이 0.9와
                     거리가 멀면 ECE가 커짐 — "이 모델의 92% 확신을 92%로
                     믿어도 되는가"에 대한 답.
  - V/A MAE        (SYNC_VA_ANCHOR 고정 타겟 대비 — "진짜" 연속 라벨이 아직
                     없으므로, 이 수치는 어디까지나 고정 앵커에 얼마나 잘
                     맞췄는지이지 실제 이미지별 감정 강도 예측력의 증거는 아님.
                     인스턴스 단위 V/A 라벨이 생기면(EMOTIC 등) 그때 의미가
                     생기는 지표라 지금은 참고용으로만 볼 것.)

--max-per-class는 학습 때 쓴 값과 맞춰야 val_acc 로그와 직접 비교된다.

사용 예:
    python evaluate_projection.py \
        --checkpoint model/emotion_projection.pt \
        --max-per-class 300

필요 패키지: scikit-learn (requirements.txt에 추가됨)
"""

import argparse

import clip
import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report

from model.clip_model import _VA_ANCHORS
from model.emotion_classifier import EmotionProjection, VAHead
from model.emotion_va_map import TRAINED_SYNC_EMOTIONS
from model.emotion_prompts import build_prompt_ensemble_anchors
from emoset_dataset import EmoSetForSync


def build_va_anchor_features(model, device):
    """clip_model.py._va_anchor_features와 동일한 8-anchor V/A 임베딩."""
    with torch.no_grad():
        tokens = clip.tokenize(_VA_ANCHORS).to(device)
        feats = model.encode_text(tokens)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats


def compute_calibration(probs: np.ndarray, labels: np.ndarray, n_bins: int = 10):
    """ECE(Expected Calibration Error)와 multiclass Brier Score.
    연구 문서 11장이 요구하는 calibration 확인 항목.

    ECE: confidence를 n_bins 구간으로 나누고, 각 구간에서
         |실제 정답률 - 평균 confidence|를 구간 크기로 가중 평균.
    Brier: (predicted prob - one-hot label)^2 을 클래스 축으로 합산 후 평균.
           둘 다 0에 가까울수록 잘 보정된 것.
    """
    confidences = probs.max(axis=1)
    predictions = probs.argmax(axis=1)
    accuracies = (predictions == labels).astype(float)

    bin_edges = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(labels)
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        mask = (confidences > lo) & (confidences <= hi) if i > 0 \
            else (confidences >= lo) & (confidences <= hi)
        if mask.sum() == 0:
            continue
        bin_acc = accuracies[mask].mean()
        bin_conf = confidences[mask].mean()
        ece += (mask.sum() / n) * abs(bin_acc - bin_conf)

    onehot = np.eye(probs.shape[1])[labels]
    brier = float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))

    return float(ece), brier


def compute_va_zero_shot(feat: torch.Tensor, va_anchor_feats: torch.Tensor):
    """clip_model.py의 ClipModel._compute_va와 동일한 계산 (단일 샘플용)."""
    sims = (feat @ va_anchor_feats.T)[0].tolist()
    v_pos, v_neg = (sims[0] + sims[1]) / 2, (sims[2] + sims[3]) / 2
    a_act, a_calm = (sims[4] + sims[5]) / 2, (sims[6] + sims[7]) / 2
    return v_pos - v_neg, a_act - a_calm


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="model/emotion_projection.pt")
    parser.add_argument("--clip-model", default="ViT-B/32")
    parser.add_argument("--hf-dataset", default="Woleek/EmoSet-118K")
    parser.add_argument("--max-per-class", type=int, default=300,
                         help="학습 때와 같은 값을 써야 학습 로그의 val_acc와 직접 비교 가능")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")

    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()

    text_anchors = build_prompt_ensemble_anchors(clip_model, device, TRAINED_SYNC_EMOTIONS)  # (6, 512)
    va_anchor_feats = build_va_anchor_features(clip_model, device)  # (8, 512)

    val_set = EmoSetForSync("val", preprocess, max_per_class=args.max_per_class,
                             hf_dataset=args.hf_dataset)
    loader = torch.utils.data.DataLoader(val_set, batch_size=64, shuffle=False, num_workers=2)

    projection = EmotionProjection(dim=512).to(device)
    va_head = VAHead(dim=512).to(device)
    ckpt = torch.load(args.checkpoint, map_location=device)
    projection.load_state_dict(ckpt["projection_state_dict"])
    va_head.load_state_dict(ckpt["va_head_state_dict"])
    projection.eval()
    va_head.eval()
    print(f"체크포인트 로드 완료 (학습 시점 val_acc={ckpt.get('val_acc', '?')}, "
          f"epoch={ckpt.get('epoch', '?')})")

    labels_all, zs_preds, pj_preds = [], [], []
    zs_probs_all, pj_probs_all = [], []
    zs_va_err, pj_va_err = [], []

    with torch.no_grad():
        for images, labels, va_targets in loader:
            images = images.to(device)
            labels_np = labels.numpy()
            va_targets_np = va_targets.numpy()

            feat = clip_model.encode_image(images).float()
            feat = feat / feat.norm(dim=-1, keepdim=True)

            # ── zero-shot (프로젝션 미적용) ──
            # main.py의 실제 추론 경로와 동일하게 temperature 없이 그대로 softmax
            zs_logits = feat @ text_anchors.T
            zs_probs = zs_logits.softmax(dim=-1).cpu().numpy()
            zs_pred = zs_logits.argmax(dim=-1).cpu().numpy()
            zs_va = np.stack([
                compute_va_zero_shot(feat[i:i + 1], va_anchor_feats)
                for i in range(feat.size(0))
            ])

            # ── projection 적용 ──
            corrected = projection(feat)
            pj_logits = corrected @ text_anchors.T
            pj_probs = pj_logits.softmax(dim=-1).cpu().numpy()
            pj_pred = pj_logits.argmax(dim=-1).cpu().numpy()
            pj_va = va_head(corrected).cpu().numpy()

            labels_all.append(labels_np)
            zs_preds.append(zs_pred)
            pj_preds.append(pj_pred)
            zs_probs_all.append(zs_probs)
            pj_probs_all.append(pj_probs)
            zs_va_err.append(np.abs(zs_va - va_targets_np))
            pj_va_err.append(np.abs(pj_va - va_targets_np))

    labels_all = np.concatenate(labels_all)
    zs_preds = np.concatenate(zs_preds)
    pj_preds = np.concatenate(pj_preds)
    zs_probs_all = np.concatenate(zs_probs_all)
    pj_probs_all = np.concatenate(pj_probs_all)
    zs_va_err = np.concatenate(zs_va_err)
    pj_va_err = np.concatenate(pj_va_err)

    names = TRAINED_SYNC_EMOTIONS

    def report(tag, preds):
        acc = accuracy_score(labels_all, preds)
        macro_f1 = f1_score(labels_all, preds, average="macro")
        weighted_f1 = f1_score(labels_all, preds, average="weighted")
        print(f"\n=== {tag} ===")
        print(f"Accuracy={acc:.4f}  Macro-F1={macro_f1:.4f}  Weighted-F1={weighted_f1:.4f}")
        print(classification_report(labels_all, preds, target_names=names, digits=3))
        print("Confusion Matrix (행=실제, 열=예측):")
        print(names)
        print(confusion_matrix(labels_all, preds))
        return acc, macro_f1

    zs_acc, zs_f1 = report("Zero-shot (프로젝션 미적용)", zs_preds)
    pj_acc, pj_f1 = report("Projection 적용", pj_preds)

    print("\n=== 개선폭 ===")
    print(f"Accuracy : {zs_acc:.4f} -> {pj_acc:.4f}  ({pj_acc - zs_acc:+.4f})")
    print(f"Macro-F1 : {zs_f1:.4f} -> {pj_f1:.4f}  ({pj_f1 - zs_f1:+.4f})")

    zs_ece, zs_brier = compute_calibration(zs_probs_all, labels_all)
    pj_ece, pj_brier = compute_calibration(pj_probs_all, labels_all)
    print("\n=== Calibration (ECE / Brier Score, 낮을수록 좋음) ===")
    print(f"Zero-shot  ECE={zs_ece:.4f}  Brier={zs_brier:.4f}")
    print(f"Projection ECE={pj_ece:.4f}  Brier={pj_brier:.4f}")

    print("\n=== V/A MAE (SYNC_VA_ANCHOR 고정 타겟 대비 — 참고용) ===")
    print(f"Zero-shot  V-MAE={zs_va_err[:, 0].mean():.4f}  A-MAE={zs_va_err[:, 1].mean():.4f}")
    print(f"Projection V-MAE={pj_va_err[:, 0].mean():.4f}  A-MAE={pj_va_err[:, 1].mean():.4f}")
    print("(주의: 타겟이 감정당 고정값이라 이 MAE는 '고정 앵커에 얼마나 가까워졌는지'를")
    print(" 보는 것이지 실제 이미지별 감정 강도 예측력의 증거는 아님)")


if __name__ == "__main__":
    main()
