from pydantic import BaseModel


class AnalyzeResponse(BaseModel):
    valence: float
    arousal: float
    lastfm_tags: list[str]
