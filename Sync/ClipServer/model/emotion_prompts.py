# -*- coding: utf-8 -*-
"""
감정별 프롬프트 앙상블 — 유일한 기준(single source of truth).

이전에는 clip_model.py의 _EMOTION_DESCRIPTIONS와 train_emotion_projection.py의
EMOTION_DESCRIPTIONS를 "반드시 동일하게 맞출 것"이라는 주석 하나로 수동
동기화했는데, 이 방식은 둘 중 하나만 고치고 잊어버리면 학습/추론 프롬프트가
어긋나는 사고로 이어진다. 이제 clip_model.py / train_emotion_projection.py /
evaluate_projection.py / calibrate_temperature.py 전부 이 파일 하나만 보고
텍스트 앵커를 만든다.

Phase 0 평가(evaluate_projection.py)의 confusion matrix에서 가장 크게
오분류된 두 쌍을 타겟팅해서, 감정당 프롬프트를 1개 → 5개로 늘렸다:
  - happy ↔ energetic  (175/300 오분류) — 둘 다 긍정적(V+)이지만 arousal이
    다르다. happy는 "따뜻하고 차분한 기쁨" 쪽으로, energetic은 "격렬하고
    빠른 에너지" 쪽으로 문장을 갈라놓았다.
  - calm ↔ dreamy       (142/300 오분류) — 둘 다 저-arousal이지만, calm은
    "고요하고 안정된" 느낌인 반면 dreamy는 "몽환적이고 붕 뜬" 느낌이라는
    질적 차이가 있다. calm은 정적임(stillness)을, dreamy는 비현실감
    (surreal/floating)을 강조해서 문장을 갈라놓았다.

각 프롬프트는 " feeling music" 접미사를 붙여서 "a {description} feeling
music" 형태로 인코딩한다 — 기존 단일-프롬프트 버전과 동일한 템플릿 관례를
유지해서, 프롬프트 문구 자체 외의 변수를 최대한 줄였다.

[2차 수정 — 1차 결과 반영]
1차 버전(감정당 5개 균일 확장)을 evaluate_projection.py로 측정한 결과:
  - projection 적용 경로: happy↔energetic, calm↔dreamy 두 쌍 모두 순개선
    거의 없음(오분류 건수가 한쪽만 줄고 반대쪽이 그만큼 늚) — projection이
    이미 학습으로 이 confusion을 흡수하고 있어서, 프롬프트만으로는 이
    경로에 거의 영향을 못 준다는 뜻.
  - zero-shot 경로: energetic recall이 크게 개선(1%→40%)됐지만, 원래
    타겟이 아니었던 sad가 부작용으로 악화(recall 69%→52%, calm/angry로
    새는 오분류 증가)됐고, dreamy→calm 오분류도 더 나빠짐(142→203).
그래서 이번엔:
  - sad는 원래 단일 프롬프트로 되돌림(애초에 타겟이 아니었던 걸 건드려서
    생긴 부작용을 원상복구).
  - dreamy는 "soft, blurry"처럼 calm의 "soothing, gentle"과 의미가 겹치는
    표현을 빼고, "surreal / illusory / otherworldly / drifting through a
    dream"처럼 비현실감을 더 명확히 강조하는 쪽으로 다시 썼다.
이 조정도 가설일 뿐이라, evaluate_projection.py로 재학습 후 다시 측정해서
실제로 개선됐는지 확인해야 한다.

[3차 수정 — 손튜닝 중단, 이번 라운드 최종 확정]
2차 버전(dreamy를 "surreal/illusory/otherworldly/drifting through a dream"
쪽으로 재작성)을 측정한 결과, dreamy→calm 오분류가 203→207로 더 나빠졌다
(1차보다 나쁨). 또한 sad를 단일 프롬프트로 되돌렸는데도 recall이
69%(원본)로 복구되지 않고 52%에 머물렀다 — sad 자체는 안 건드렸지만
옆의 calm/energetic/dreamy 앵커가 계속 바뀌면서 sad로 가던 표가 그쪽으로
샌 것으로 보인다(zero-shot은 앵커 N개가 서로 상대 경쟁하는 구조라, 하나만
고쳐도 나머지 전부의 경계가 같이 움직임).
두 번의 시도 모두 목표(calm/dreamy 분리)가 개선되지 않았고, projection
적용 경로(실제 서비스가 쓰는 경로)는 세 버전 내내 79% 근처에서 전혀
움직이지 않았다 — 프롬프트 손튜닝으로는 이 confusion pair를 못 줄인다는
결론. 그래서 dreamy는 1차 버전(203, recall 8.7% — 2차보다 나음)으로
되돌리고, 여기서 수동 프롬프트 조정은 중단한다. 다음 단계는 Hard Negative
Contrastive Learning — 실제 이미지 데이터로 이 confusion pair를 직접
갈라놓도록 학습시키는 방법으로 넘어간다.
"""

from typing import Dict, List

import clip
import torch

EMOTION_PROMPTS: Dict[str, List[str]] = {
    "happy": [
        "joyful, cheerful and uplifting",
        "warm, heartfelt and genuinely happy",
        "bright and pleasantly content",
        "relaxed, easygoing and happy",
        "light-hearted and smiling",
    ],
    "energetic": [
        "powerful, exciting and dynamic",
        "high-intensity, driving and adrenaline-filled",
        "fast-paced and bursting with energy",
        "upbeat, pumped-up and electrifying",
        "intense, active and full of motion",
    ],
    "calm": [
        "peaceful, relaxing and serene",
        "quiet, still and undisturbed",
        "tranquil and full of stillness",
        "soothing, gentle and unhurried",
        "settled, grounded and calm",
    ],
    "dreamy": [
        "atmospheric, ethereal and surreal",
        "hazy, floating and dreamlike",
        "soft, blurry and imaginative",
        "mystical, faraway and trance-like",
        "suspended between sleep and waking",
    ],
    "sad": [
        "sorrowful, heartbroken and tearful",
    ],
    "angry": [
        "intense, aggressive and fierce",
        "furious, hostile and confrontational",
        "tense and charged with anger",
        "raw and forceful with rage",
        "agitated and hard-edged",
    ],
    "romantic": [
        "loving, tender and intimate",
        "affectionate and warm between two people",
        "soft, passionate and romantic",
        "sweet and heartfelt with longing",
        "intimate, close and affectionate",
    ],
    "melancholy": [
        "nostalgic, longing and bittersweet",
        "wistful and tinged with quiet sadness",
        "reflective and melancholic",
        "bittersweet longing for something lost",
        "subdued and pensive",
    ],
}


def _prompts_for(emotion: str) -> List[str]:
    return [f"a {desc} feeling music" for desc in EMOTION_PROMPTS[emotion]]


def build_prompt_ensemble_anchors(model, device, emotions: List[str]) -> torch.Tensor:
    """
    emotions 순서대로 각 감정의 프롬프트 여러 개를 CLIP 텍스트 인코더에
    통과시킨 뒤, 프롬프트별 정규화 → 평균 → 재정규화해서 감정당 프로토타입
    벡터 하나를 만든다 (표준 CLIP prompt-ensembling 방식).

    반환값 shape: (len(emotions), 512), 각 행이 단위벡터로 정규화된 상태.
    """
    with torch.no_grad():
        prototypes = []
        for emotion in emotions:
            prompts = _prompts_for(emotion)
            tokens = clip.tokenize(prompts).to(device)
            feats = model.encode_text(tokens)
            feats = feats / feats.norm(dim=-1, keepdim=True)  # 프롬프트별 정규화
            proto = feats.mean(dim=0)
            proto = proto / proto.norm()  # 평균 후 재정규화
            prototypes.append(proto)
    return torch.stack(prototypes, dim=0)
