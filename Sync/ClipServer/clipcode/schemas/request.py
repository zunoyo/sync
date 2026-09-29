from pydantic import BaseModel
from typing import Optional


class AnalyzeRequest(BaseModel):
    """
    JSON 요청 스키마 (Soundwave / src 호환)
    Spring Boot EmotionVectorService → POST /analyze (application/json)
    """
    input_type: str                    # text / image / both
    input_text: Optional[str] = None
    image_url:  Optional[str] = None
