from pydantic import BaseModel
from typing import Optional


class AnalyzeResponse(BaseModel):
    """
    Spring Boot ClipResponseDTO와 동일한 구조 유지
    """
    primary_emotion:   str
    secondary_emotion: Optional[str]
    valence:           float           # 동적 계산값 (-1.0 ~ +1.0 범위로 변경)
    arousal:           float           # 동적 계산값 (-1.0 ~ +1.0 범위로 변경)
    confidence:        float
    clip_embedding:    str
    lastfm_tags:       str
    input_summary:     Optional[str]
    model_val_accuracy: Optional[float] = None  # 이미지 분석에만 채워짐(텍스트 전용이면 None)


class HealthResponse(BaseModel):
    status:  str
    message: str
