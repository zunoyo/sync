# -*- coding: utf-8 -*-
"""
EmotionProjection + VAHead 학습 스크립트.

CLIP(ViT-B/32)은 완전히 얼려두고, EmoSet-118K를 6개 SYNC 카테고리로
매핑한 서브셋으로 다음 세 개를 학습한다:
  1. EmotionProjection — 이미지 임베딩 보정 (contrastive/cross-entropy)
  2. VAHead            — (valence, arousal) 회귀 (MSE)
  3. Hard Negative margin loss — happy↔energetic, calm↔dreamy 두 쌍만
                                   타겟팅해서 정답-오답 코사인 유사도 간격을
                                   강제로 벌림 (--hard-negative-weight 0으로
                                   끄면 이전 버전과 동일하게 동작, --hard-negative-pairs 로 쌍 변경 가능)

사용 예:
    python train_emotion_projection.py \
        --epochs 10 \
        --max-per-class 300 \
        --out model/emotion_projection.pt

먼저 --max-per-class를 500~1000 정도의 작은 값으로 걸어서 파이프라인이
끝까지 도는지, loss가 실제로 떨어지는지부터 확인해보는 걸 권장합니다.
"""

import argparse

import clip
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from model.emotion_classifier import EmotionProjection, VAHead
from feature_cache import get_features
from model.emotion_va_map import TRAINED_SYNC_EMOTIONS, UNTRAINED_SYNC_EMOTIONS
from model.emotion_prompts import build_prompt_ensemble_anchors

# 프롬프트 정의는 model/emotion_prompts.py 하나로 통일 — clip_model.py /
# evaluate_projection.py / calibrate_temperature.py도 전부 같은 함수를 써서
# 학습·추론 프롬프트가 어긋나는 사고를 구조적으로 막는다.

# Hard Negative Contrastive Learning — Phase 0/1에서 확인된 confusion pair만
# 타겟팅한다(감정 전체 쌍이 아니라 이 둘만): happy↔energetic, calm↔dreamy.
# 이 쌍의 이미지가 배치에 들어오면, 정답 클래스와의 코사인 유사도가 헷갈리는
# 클래스와의 유사도보다 최소 margin만큼 크도록 강제하는 항을 loss에 더한다.
# (Phase 1에서 프롬프트만으로는 이 두 쌍의 projection 경로 confusion이 전혀
# 안 줄었던 것에 대한 직접적인 대응 — 텍스트가 아니라 이미지-라벨로 직접
# 학습시키는 방식)
# 기본값은 기존과 동일(happy↔energetic, calm↔dreamy). Step 0 기준선에서 projection 경로의
# 오분류 상위가 happy→calm(43), happy→energetic(35), calm→happy(31), calm→sad(30) 이어서
# 4개 쌍만으로는 전체 오류의 일부(114/382)만 겨냥한다 — --hard-negative-pairs 로 쌍을 늘려 실험한다.
# 형식: "정답:오답,정답:오답,..."  (정답 클래스 이미지가 오답 클래스 쪽으로 가까워지는 것을 벌함)
DEFAULT_HN_PAIRS = "happy:energetic,energetic:happy,calm:dreamy,dreamy:calm"


def parse_hn_pairs(spec: str, names):
    pairs = []
    for item in [x.strip() for x in spec.split(",") if x.strip()]:
        pos, neg = [t.strip() for t in item.split(":")]
        if pos not in names or neg not in names:
            raise SystemExit(f"--hard-negative-pairs 의 '{item}' 는 학습 대상 감정 {list(names)} 에 없는 이름입니다")
        pairs.append((names.index(pos), names.index(neg)))
    return pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hf-dataset", default="Woleek/EmoSet-118K",
                         help="EmoSet-118K가 올라간 Hugging Face 데이터셋 이름")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--max-per-class", type=int, default=1500,
                         help="클래스당 최대 이미지 수 (None이면 전체 사용, 118K 기준 매우 오래 걸림)")
    parser.add_argument("--va-loss-weight", type=float, default=1.0,
                         help="분류 loss 대비 VA 회귀 loss 가중치")
    parser.add_argument("--hard-negative-margin", type=float, default=0.1,
                         help="happy/energetic, calm/dreamy 쌍에서 정답 코사인 유사도가 "
                              "오답보다 최소 이만큼 커지도록 강제하는 margin")
    parser.add_argument("--hard-negative-weight", type=float, default=1.0,
                         help="분류/VA loss 대비 hard negative margin loss 가중치 "
                              "(0으로 주면 이 loss 항을 끄고 Phase 1과 동일하게 동작)")
    parser.add_argument("--hard-negative-pairs", default=DEFAULT_HN_PAIRS,
                         help="hard negative 쌍 목록 '정답:오답,...' (기본: happy↔energetic, calm↔dreamy 양방향)")
    parser.add_argument("--val-max-per-class", type=int, default=None,
                         help="val 크기(클래스당). 기본값=--max-per-class. 학습 데이터를 키워도 300으로 고정하면 val 캐시·비교 기준이 유지됨")
    parser.add_argument("--seed", type=int, default=0,
                         help="초기화/셔플 시드 — A/B 비교에서 시드 차이가 결과에 섞이지 않도록 고정")
    parser.add_argument("--cache-dir", default="feature_cache",
                         help="CLIP 임베딩 캐시 폴더 (feature_cache.py 참고)")
    parser.add_argument("--out", default="emotion_projection.pt")
    parser.add_argument("--clip-model", default="ViT-B/32")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(args.seed)
    print(f"device: {device} | seed={args.seed}")
    print(f"학습 대상 카테고리: {TRAINED_SYNC_EMOTIONS}")
    print(f"이번 라운드에서 그대로 두는 카테고리(EmoSet에 대응 없음): {UNTRAINED_SYNC_EMOTIONS}")

    # ── CLIP 로딩 (완전히 얼림) ──────────────────────────────────────────
    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()
    for p in clip_model.parameters():
        p.requires_grad = False

    text_anchors = build_prompt_ensemble_anchors(clip_model, device, TRAINED_SYNC_EMOTIONS)  # (6, 512)

    hn_pairs = parse_hn_pairs(args.hard_negative_pairs, list(TRAINED_SYNC_EMOTIONS))
    print(f"hard negative 쌍(정답→오답): "
          f"{[(TRAINED_SYNC_EMOTIONS[p], TRAINED_SYNC_EMOTIONS[n]) for p, n in hn_pairs]} "
          f"| margin={args.hard_negative_margin}, weight={args.hard_negative_weight}")

    # ── 데이터 (Hugging Face에서 스트리밍) ──────────────────────────────────
    # CLIP 은 얼려 있고 증강도 없으므로 임베딩을 한 번만 계산해 캐시한다(feature_cache.py).
    # val 도 max_per_class 로 맞춘다 → baseline_snapshot/calibrate_temperature 와 같은 캐시를 공유
    val_max = args.val_max_per_class if args.val_max_per_class is not None else args.max_per_class
    tr_f, tr_y, tr_va = get_features("train", args.max_per_class, clip_model, preprocess, device,
                                     args.hf_dataset, args.clip_model, args.cache_dir)
    va_f, va_y, va_va = get_features("val", val_max, clip_model, preprocess, device,
                                     args.hf_dataset, args.clip_model, args.cache_dir)
    train_loader = DataLoader(TensorDataset(tr_f, tr_y, tr_va), batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(TensorDataset(va_f, va_y, va_va), batch_size=args.batch_size, shuffle=False)

    # ── 학습 대상 모듈 ──────────────────────────────────────────────────
    projection = EmotionProjection(dim=512).to(device)
    va_head = VAHead(dim=512).to(device)
    optimizer = torch.optim.Adam(
        list(projection.parameters()) + list(va_head.parameters()), lr=args.lr
    )
    ce_loss_fn = nn.CrossEntropyLoss()
    mse_loss_fn = nn.MSELoss()

    temperature = 0.07  # CLIP 관례값

    def run_epoch(loader, train: bool):
        projection.train(train)
        va_head.train(train)
        total_loss = total_ce = total_mse = total_hn = 0.0
        correct = total = 0

        for image_features, labels, va_targets in loader:
            image_features = image_features.to(device)
            labels, va_targets = labels.to(device), va_targets.to(device)

            with torch.set_grad_enabled(train):
                corrected = projection(image_features)
                cos_sim = corrected @ text_anchors.T          # (B, 6) — margin loss는 이 raw 코사인 유사도로 계산
                logits = cos_sim / temperature
                ce_loss = ce_loss_fn(logits, labels)

                va_pred = va_head(corrected)
                mse_loss = mse_loss_fn(va_pred, va_targets)

                # ── Hard Negative margin loss — 지정한 (정답, 오답) 쌍마다, 정답 클래스 이미지에서
                #    cos(정답) - cos(오답) 이 margin 이상이 되도록 hinge 로 강제
                hn_terms = []
                for pos_i, neg_i in hn_pairs:
                    m = labels == pos_i
                    if m.any():
                        hn_terms.append(torch.relu(
                            args.hard_negative_margin - (cos_sim[m, pos_i] - cos_sim[m, neg_i])))
                hn_loss = torch.cat(hn_terms).mean() if hn_terms else torch.zeros((), device=device)

                loss = ce_loss + args.va_loss_weight * mse_loss + args.hard_negative_weight * hn_loss

                if train:
                    optimizer.zero_grad()
                    loss.backward()
                    optimizer.step()

            total_loss += loss.item() * labels.size(0)
            total_ce += ce_loss.item() * labels.size(0)
            total_mse += mse_loss.item() * labels.size(0)
            total_hn += hn_loss.item() * labels.size(0)
            correct += (logits.argmax(dim=-1) == labels).sum().item()
            total += labels.size(0)

        return total_loss / total, total_ce / total, total_mse / total, total_hn / total, correct / total

    # ── 학습 루프 ───────────────────────────────────────────────────────
    best_val_acc = 0.0
    for epoch in range(1, args.epochs + 1):
        train_loss, train_ce, train_mse, train_hn, train_acc = run_epoch(train_loader, train=True)
        val_loss, val_ce, val_mse, val_hn, val_acc = run_epoch(val_loader, train=False)

        print(f"[epoch {epoch}/{args.epochs}] "
              f"train loss={train_loss:.4f}(ce={train_ce:.4f}, va_mse={train_mse:.4f}, "
              f"hn={train_hn:.4f}, acc={train_acc:.2%}) | "
              f"val loss={val_loss:.4f}(ce={val_ce:.4f}, va_mse={val_mse:.4f}, "
              f"hn={val_hn:.4f}, acc={val_acc:.2%})")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save({
                "projection_state_dict": projection.state_dict(),
                "va_head_state_dict":    va_head.state_dict(),
                "trained_emotions":      TRAINED_SYNC_EMOTIONS,
                "val_acc":               val_acc,
                "epoch":                 epoch,
                "hard_negative_margin":  args.hard_negative_margin,
                "hard_negative_weight":  args.hard_negative_weight,
                "hard_negative_pairs":   args.hard_negative_pairs,
                "max_per_class":         args.max_per_class,
                "epochs_requested":      args.epochs,
            }, args.out)
            print(f"  → 개선됨 (val_acc={val_acc:.2%}), {args.out} 저장")

    print(f"학습 완료. 최고 val_acc={best_val_acc:.2%}, 체크포인트: {args.out}")


if __name__ == "__main__":
    main()
