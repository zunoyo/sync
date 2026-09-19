import json
import os


class EmotionMapper:
    """
    감정 → Last.fm 태그 매핑
    V/A는 clip_model에서 동적으로 계산하므로 여기서 제거
    """

    def __init__(self):
        data_path = os.path.join(
            os.path.dirname(__file__), "../data/emotion_tags.json"
        )
        with open(data_path, "r", encoding="utf-8") as f:
            self.emotion_tags = json.load(f)

    def get_lastfm_tags(self, emotion: str) -> list:
        """감정 → Last.fm 태그 목록"""
        return self.emotion_tags.get(emotion, {}) \
                                .get("lastfm_tags", ["pop", "music"])

    def get_all_emotions(self) -> list:
        """전체 감정 키 목록"""
        return list(self.emotion_tags.keys())
