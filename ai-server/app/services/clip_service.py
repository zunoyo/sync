from __future__ import annotations

import io
from functools import lru_cache
from typing import Optional

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

EMOTIONS = ["happy", "sad", "calm", "energetic", "melancholic", "dark", "dreamy", "romantic"]

EMOTION_PROMPTS = {
    "happy":       "a happy, joyful, bright and cheerful scene",
    "sad":         "a sad, sorrowful, tearful and gloomy scene",
    "calm":        "a calm, peaceful, serene and tranquil scene",
    "energetic":   "an energetic, exciting, dynamic and powerful scene",
    "melancholic": "a melancholic, nostalgic, bittersweet and longing scene",
    "dark":        "a dark, mysterious, eerie and intense scene",
    "dreamy":      "a dreamy, ethereal, surreal and soft scene",
    "romantic":    "a romantic, tender, passionate and intimate scene",
}

LASTFM_TAG_MAP: dict[str, list[str]] = {
    "happy":       ["happy", "feel good", "upbeat", "cheerful", "fun"],
    "sad":         ["sad", "melancholy", "tearjerker", "emotional", "heartbreak"],
    "calm":        ["chill", "relaxing", "ambient", "peaceful", "mellow"],
    "energetic":   ["energetic", "upbeat", "workout", "hype", "party"],
    "melancholic": ["melancholic", "nostalgic", "bittersweet", "reflective", "longing"],
    "dark":        ["dark", "heavy", "intense", "gloomy", "brooding"],
    "dreamy":      ["dreamy", "ethereal", "atmospheric", "shoegaze", "space"],
    "romantic":    ["romantic", "love", "sensual", "tender", "intimate"],
}


@lru_cache(maxsize=1)
def _load_model() -> tuple[CLIPModel, CLIPProcessor]:
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()
    return model, processor


def _softmax(scores: list[float]) -> list[float]:
    t = torch.tensor(scores)
    return torch.softmax(t, dim=0).tolist()


def analyze_image(image_bytes: bytes) -> dict:
    model, processor = _load_model()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    prompts = list(EMOTION_PROMPTS.values())

    inputs = processor(text=prompts, images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits_per_image[0].tolist()

    probs = _softmax(logits)
    return _build_result(probs)


def analyze_text(text: str) -> dict:
    model, processor = _load_model()
    emotion_texts = list(EMOTION_PROMPTS.values())

    # 입력 텍스트와 각 감성 프롬프트 간 유사도 계산
    all_texts = [text] + emotion_texts
    inputs = processor(text=all_texts, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        text_features = model.get_text_features(**inputs)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

    query = text_features[0]
    emotion_feats = text_features[1:]
    sims = (query @ emotion_feats.T).tolist()
    probs = _softmax(sims)
    return _build_result(probs)


def _build_result(probs: list[float]) -> dict:
    emotion_scores = {emotion: round(prob, 4) for emotion, prob in zip(EMOTIONS, probs)}
    sorted_emotions = sorted(emotion_scores.items(), key=lambda x: x[1], reverse=True)

    primary = sorted_emotions[0][0]
    secondary = sorted_emotions[1][0]

    # primary + secondary 태그 합집합 (중복 제거, primary 우선)
    tags = LASTFM_TAG_MAP[primary] + [
        t for t in LASTFM_TAG_MAP[secondary] if t not in LASTFM_TAG_MAP[primary]
    ]

    return {
        "primary_emotion": primary,
        "secondary_emotion": secondary,
        "emotion_scores": emotion_scores,
        "lastfm_tags": tags,
    }
