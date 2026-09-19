from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # 서버 설정
    HOST:   str  = "0.0.0.0"
    PORT:   int  = 8000
    RELOAD: bool = True

    # CLIP 모델
    CLIP_MODEL: str = "ViT-B/32"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8081",
    ]

    # 추천 설정
    MAX_LASTFM_TRACKS:  int = 20
    MAX_SPOTIFY_TRACKS: int = 10

    class Config:
        env_file = ".env"


settings = Settings()
