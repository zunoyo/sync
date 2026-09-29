# -*- coding: utf-8 -*-
"""
가벼운 한국어 감정분류(KoELECTRA 6-class)로 _translate_korean()의 키워드
사전이 못 잡는 문장을 보강한다.

배경: clip_model.py의 _translate_korean()은 ~54개 하드코딩 키워드 사전으로
매칭을 시도하고, 하나도 안 걸리면 의미 없는 fallback 문장
("a music that matches this emotional feeling and mood")으로 빠진다 —
Gated Fusion 테스트 중 실측으로 확인된 것처럼, 이 fallback 문장은 CLIP에
사실상 아무 신호도 주지 못한다.

사용 모델: Jinuuuu/KoELECTRA_fine_tunning_emotion
  - KoELECTRA-base, 약 1.1억 파라미터(~440MB), single-label
  - 라벨 6개(실측 id2label — 모델 카드엔 한국어로 나와 있지만 실제
    model.config.id2label은 영어 문자열이다): angry/anxious/embarrassed/
    happy/heartache/sad

한계 (중요): SYNC 8개 감정 중 이 모델 라벨과 의미가 맞아떨어지는 건
  angry→angry, happy→happy, sad→sad, heartache→melancholy
4개뿐이다. calm/energetic/romantic/dreamy는 이 모델이 아예 다루지 않는
카테고리라 이번 개선의 영향을 받지 않고 여전히 키워드 사전에만 의존한다.
즉 이번 변경은 "angry/happy/sad/melancholy 계열 문장 중 키워드 사전에 안
걸리던 것들의 번역 품질이 좋아진다"는 뜻이지, 8개 감정 전체가 좋아진다는
뜻이 아니다. 나머지 4개 감정의 커버리지를 넓히려면 이 모델과는 다른(더
포괄적인) 분류기가 필요하다 — 이번 라운드 범위 밖.

안전장치: transformers 미설치, 모델 다운로드 실패, 추론 중 예외 등 어떤
이유로든 실패하면 classify_korean_emotion()은 None을 반환하고,
clip_model.py는 그 경우 기존 키워드 사전 방식(또는 최종 fallback)으로
그대로 동작한다 — 이 모듈이 있든 없든 서버가 죽지 않는다.
"""
from functools import lru_cache
from typing import Optional, Tuple

try:
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    _TRANSFORMERS_AVAILABLE = True
except ImportError:
    _TRANSFORMERS_AVAILABLE = False

from utils.logger import get_logger

logger = get_logger("korean_emotion")

_MODEL_NAME = "Jinuuuu/KoELECTRA_fine_tunning_emotion"
_CONFIDENCE_THRESHOLD = 0.5

# 모델 라벨(영어, model.config.id2label 실측값) -> SYNC 8개 감정. 의미가
# 안 맞는 라벨(anxious/embarrassed)은 매핑하지 않는다 — 그 경우
# clip_model.py가 기존 키워드 방식으로 폴백한다.
_LABEL_TO_SYNC = {
    "angry": "angry",
    "happy": "happy",
    "sad": "sad",
    "heartache": "melancholy",
}


@lru_cache(maxsize=1)
def _load_model():
    """모델 로드(서버 수명 동안 1회). 실패해도 예외를 던지지 않고 None 반환."""
    if not _TRANSFORMERS_AVAILABLE:
        logger.info("transformers 미설치 — 한국어 감정분류 보강 비활성화(키워드 방식만 사용)")
        return None
    try:
        tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
        model = AutoModelForSequenceClassification.from_pretrained(_MODEL_NAME)
        model.eval()
        logger.info(
            f"한국어 감정분류 모델 로드 완료: {_MODEL_NAME} "
            f"(id2label={model.config.id2label})"
        )
        return tokenizer, model
    except Exception as e:
        logger.error(f"한국어 감정분류 모델 로드 실패, 키워드 방식만 사용: {e}")
        return None


def classify_korean_emotion(text: str) -> Optional[Tuple[str, float]]:
    """
    한국어 문장 -> (SYNC 감정 이름, confidence) 또는 None.

    None이 반환되는 경우(전부 clip_model.py에서 기존 키워드 방식으로 폴백):
      - 모델이 아예 로드 안 됨(미설치/다운로드 실패/추론 예외)
      - 예측된 라벨이 SYNC 8개와 매핑 안 되는 라벨(불안/당황)
      - confidence가 _CONFIDENCE_THRESHOLD(0.5) 미만
    """
    loaded = _load_model()
    if loaded is None:
        return None
    tokenizer, model = loaded

    try:
        with torch.no_grad():
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=64)
            logits = model(**inputs).logits.squeeze(0)
            probs = torch.softmax(logits, dim=-1)
            top_idx = int(torch.argmax(probs))
            top_label = model.config.id2label[top_idx]
            top_conf = float(probs[top_idx])
    except Exception as e:
        logger.error(f"한국어 감정분류 추론 실패, 키워드 방식으로 폴백: {e}")
        return None

    sync_emotion = _LABEL_TO_SYNC.get(top_label)
    if sync_emotion is None:
        logger.info(f"한국어 감정분류: '{top_label}'({top_conf:.2%}) — SYNC 매핑 없음, 키워드 방식 폴백")
        return None
    if top_conf < _CONFIDENCE_THRESHOLD:
        logger.info(f"한국어 감정분류: '{top_label}'({top_conf:.2%}) — 확신도 낮음, 키워드 방식 폴백")
        return None

    logger.info(f"한국어 감정분류: '{top_label}'({top_conf:.2%}) -> SYNC '{sync_emotion}'")
    return sync_emotion, top_conf
