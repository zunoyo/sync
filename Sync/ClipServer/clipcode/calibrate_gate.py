# -*- coding: utf-8 -*-
"""
Gated Fusion(analyze_both, model/clip_model.py [수정 3-2])의 gate 계산을
위한 모달리티별 margin 기준값(평균/표준편차)을 계산한다.

배경: analyze_both()는 이미지·텍스트 임베딩을 항상 0.5:0.5로 섞는 대신,
둘 중 더 "확신하는" 쪽에 더 많은 비중을 주는 Gated Fusion을 시도했다.
확신도 프록시로 top1-top2 유사도 margin을 썼는데, 절대값을 직접 비교하면
실전에서 깨진다는 게 실측으로 확인됐다:

  - 이미지 쪽(i_corrected)은 EmoSet으로 지도학습된 EmotionProjection의
    출력이라 margin이 원래 크게 나오도록 훈련돼 있다.
  - 텍스트 쪽(t_feat)은 학습을 전혀 받지 않은 순수 zero-shot CLIP이라
    margin이 구조적으로 훨씬 작다.
  - 그 결과 텍스트가 아무리 명확해도("exciting and joyful") margin이
    의미 없는 fallback 문장보다도 작게 나오는 역전 현상까지 발생했다.

즉 "학습된 분류기"와 "순수 zero-shot"의 confidence를 같은 척도(절대값)로
비교하는 것 자체가 불공정하다. 이 스크립트는 그 대신 "이 modality가
평소(자기 자신의 분포 기준) 얼마나 확신하는지" 기준선을 각각 구해서,
실제 요청이 들어왔을 때 z-score(기준 대비 몇 표준편차 위/아래인지)로
비교하게 만든다 — 절대 스케일이 아니라 상대적 위치로 비교하므로
학습형/zero-shot 비대칭 문제를 원천적으로 피한다.

- 이미지 쪽 기준값: EmoSet val 이미지 전체에서 margin 분포의 평균/표준편차
- 텍스트 쪽 기준값: 실제 서비스의 한국어→영어 번역 결과들
  (clip_model.py의 _KO_EMOTION_KEYWORDS 값 전체 + fallback 문장)에서
  margin 분포의 평균/표준편차 — 실제 유저 입력이 CLIP에 들어가기 직전
  형태 그대로라 대표성이 있다 (별도 텍스트 데이터셋을 새로 구할 필요 없음).

실행하면 --checkpoint의 .pt 파일에 4개 키
(gate_img_margin_mean/std, gate_text_margin_mean/std)를 추가해서 저장한다.
clip_model.py는 이 4개 키가 모두 있으면 z-score 기반 gate를 쓰고, 없으면
(아직 이 스크립트를 안 돌렸으면) 안전하게 gate=0.5(기존 고정 평균)로
동작한다 — 재학습 불필요, 서버 재시작만 하면 적용됨.

사용 예:
    python calibrate_gate.py --checkpoint model/emotion_projection.pt --max-per-class 300
"""
import argparse

import clip
import torch

from model.emotion_classifier import EmotionProjection
from model.emotion_prompts import build_prompt_ensemble_anchors
from model.clip_model import _KO_EMOTION_KEYWORDS
from emoset_dataset import EmoSetForSync

# clip_model.py의 EmotionMapper.get_all_emotions()가 반환하는 것과 반드시
# 같은 8개 구성이어야 실제 서비스(analyze_both)와 동일한 앵커로 margin을
# 잰다 (서버 시작 로그의 "ClipModel 초기화 완료: [...]" 순서 그대로).
ALL_SYNC_EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic",
                      "melancholy", "angry", "dreamy"]


def margin(sims: torch.Tensor) -> torch.Tensor:
    """(N, C) 유사도 행렬 -> (N,) top1-top2 margin"""
    top2 = torch.topk(sims, k=2, dim=-1).values
    return top2[:, 0] - top2[:, 1]


def collect_image_margins(clip_model, projection, anchors, loader, device):
    margins = []
    with torch.no_grad():
        for images, _labels, _va in loader:
            images = images.to(device)
            feat = clip_model.encode_image(images).float()
            feat = feat / feat.norm(dim=-1, keepdim=True)
            corrected = projection(feat)
            sims = corrected @ anchors.T
            margins.append(margin(sims).cpu())
    return torch.cat(margins, dim=0)


def collect_text_margins(clip_model, anchors, device):
    # 실제 _translate_korean()이 만들어내는 것과 동일한 형태의 텍스트 모음
    # (키워드 매칭 성공 시 나오는 번역 문구 전체 + 키워드 매칭 실패 시
    # 나오는 fallback 문구 1개)
    fallback = "a music that matches this emotional feeling and mood"
    corpus = sorted(set(_KO_EMOTION_KEYWORDS.values())) + [fallback]
    with torch.no_grad():
        tokens = clip.tokenize(corpus, truncate=True).to(device)
        feat = clip_model.encode_text(tokens).float()
        feat = feat / feat.norm(dim=-1, keepdim=True)
        sims = feat @ anchors.T
    return margin(sims).cpu(), corpus


def preview_gate(img_mean, img_std, text_mean, text_std,
                  img_margin_val, text_margin_val, label):
    iz = (img_margin_val - img_mean) / max(img_std, 1e-6)
    tz = (text_margin_val - text_mean) / max(text_std, 1e-6)
    gate = torch.sigmoid(torch.tensor(iz - tz)).item()
    print(f"  [{label}] img_margin={img_margin_val:.4f} text_margin={text_margin_val:.4f} "
          f"-> img_z={iz:+.2f} text_z={tz:+.2f} -> gate={gate:.4f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="model/emotion_projection.pt")
    parser.add_argument("--clip-model", default="ViT-B/32")
    parser.add_argument("--hf-dataset", default="Woleek/EmoSet-118K")
    parser.add_argument("--max-per-class", type=int, default=300)
    parser.add_argument("--output", default=None,
                         help="지정 안 하면 --checkpoint를 그대로 덮어씀")
    args = parser.parse_args()
    output_path = args.output or args.checkpoint

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")

    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()
    anchors = build_prompt_ensemble_anchors(clip_model, device, ALL_SYNC_EMOTIONS)

    ckpt = torch.load(args.checkpoint, map_location=device)
    projection = EmotionProjection(dim=512).to(device)
    projection.load_state_dict(ckpt["projection_state_dict"])
    projection.eval()

    # ── 이미지 쪽 margin 기준값 ──────────────────────────────────────────
    val_set = EmoSetForSync("val", preprocess, max_per_class=args.max_per_class,
                             hf_dataset=args.hf_dataset)
    val_loader = torch.utils.data.DataLoader(val_set, batch_size=64, shuffle=False, num_workers=2)
    img_margins = collect_image_margins(clip_model, projection, anchors, val_loader, device)
    img_mean, img_std = float(img_margins.mean()), float(img_margins.std())
    print(f"\n=== 이미지 margin 기준값 ({len(img_margins)}장, EmoSet val) ===")
    print(f"mean={img_mean:.4f}  std={img_std:.4f}  "
          f"(min={float(img_margins.min()):.4f}, max={float(img_margins.max()):.4f})")

    # ── 텍스트 쪽 margin 기준값 ──────────────────────────────────────────
    text_margins, corpus = collect_text_margins(clip_model, anchors, device)
    text_mean, text_std = float(text_margins.mean()), float(text_margins.std())
    print(f"\n=== 텍스트 margin 기준값 ({len(corpus)}개, 실제 번역 문구) ===")
    print(f"mean={text_mean:.4f}  std={text_std:.4f}  "
          f"(min={float(text_margins.min()):.4f}, max={float(text_margins.max()):.4f})")

    # ── 검산: 방금 서버에서 실측했던 두 케이스로 gate가 어떻게 나올지 미리 확인 ──
    # 주의: z-score는 "이미지 vs 텍스트" 스케일 차이는 바로잡지만, 같은
    # 텍스트 분포 안에서의 순서 자체(margin이 큰 게 항상 더 "명확한"
    # 입력인지)는 바꾸지 못한다. 실측값(fallback margin=0.0167 >
    # "exciting and joyful" margin=0.0076)이 그대로면, 이 두 케이스만
    # 놓고 보면 여전히 fallback 쪽 gate가 더 낮게(텍스트 비중 더 크게)
    # 나올 수 있다 — happy/energetic처럼 서로 가까운 두 앵커 사이에 걸친
    # 입력이라 margin이 작아지는 것뿐일 가능성이 있어서다(Phase 1에서도
    # 이미 확인된 known 혼동쌍). 아래 숫자를 있는 그대로 확인할 것 — 미리
    # "이래야 정상"이라고 단정하지 않는다.
    print("\n=== 미리보기: 실측 사례 재계산 (있는 그대로 확인용) ===")
    preview_gate(img_mean, img_std, text_mean, text_std,
                 0.1294, 0.0167, "fallback 텍스트(애매)")
    preview_gate(img_mean, img_std, text_mean, text_std,
                 0.1294, 0.0076, "'exciting and joyful'(명확)")
    print("(이 두 값은 z-score로도 순서가 안 뒤집힐 수 있음 — 아래 '중요'")
    print(" 참고. 대신 '이미지가 항상 90%+ 지배'하던 이전 문제가 풀렸는지가")
    print(" 이번 수정의 핵심 검증 포인트: gate가 0.5 근처로 돌아왔는지 볼 것)")

    ckpt["gate_img_margin_mean"] = img_mean
    ckpt["gate_img_margin_std"] = img_std
    ckpt["gate_text_margin_mean"] = text_mean
    ckpt["gate_text_margin_std"] = text_std
    torch.save(ckpt, output_path)
    print(f"\n체크포인트에 gate 기준값 저장 완료: {output_path}")
    print("main.py(CLIP 서버)를 재시작하면 다음 요청부터 z-score 기반 gate가 적용됩니다.")


if __name__ == "__main__":
    main()
