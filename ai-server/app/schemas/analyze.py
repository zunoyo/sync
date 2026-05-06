from pydantic import BaseModel


class AnalyzeResponse(BaseModel):
    primary_emotion: str
    secondary_emotion: str
    emotion_scores: dict[str, float]
    lastfm_tags: list[str]
