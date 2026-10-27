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
    model_val_accuracy: Optional[float] = None  # 입력 종류별 실측 정확도(model/measured_accuracy.json). 파일이 없으면 이미지·복합만 val_acc, 텍스트 전용은 None

    reliability:        Optional[str]   = None   # 이미지 단독 입력만: "high"(확실) | "mid"(보통) | "low"(애매). 1·2위 확률 차이 기준. 그 외 입력은 None

    # ── 복합(both) 입력일 때만 채워지는 후기 융합 정보. 그 외 입력은 모두 None ──
    fusion_mode:        Optional[str]   = None   # "late" | "early"
    conflict:           Optional[bool]  = None   # 이미지·텍스트 1순위 감정이 다르면 True ("입력 간 불일치" 표시용)
    conflict_level:     Optional[str]   = None   # "none" | "soft"(상대 1순위가 내 상위 2개 안) | "hard"
    agreement:          Optional[float] = None   # 두 경로 확률 분포의 겹침 0~1
    image_emotion:      Optional[str]   = None
    text_emotion:       Optional[str]   = None
    image_confidence:   Optional[float] = None
    text_confidence:    Optional[float] = None


class HealthResponse(BaseModel):
    status:  str
    message: str
