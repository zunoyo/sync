from __future__ import annotations

import io
from functools import lru_cache

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

VALENCE_PROMPTS = {
    "positive": "a pleasant, beautiful, warm and uplifting feeling",
    "negative": "a dark, painful, miserable and hopeless atmosphere",
}

AROUSAL_PROMPTS = {
    "active": "an energetic, exciting, intense and active atmosphere",
    "calm":   "a soft, gentle, slow and quiet atmosphere",
}

# Russell Circumplex 4-quadrant Last.fm tags
QUADRANT_TAGS: dict[str, list[str]] = {
    "q1": ["happy", "upbeat", "energetic", "party", "feel good"],         # +V +A
    "q2": ["intense", "aggressive", "dark", "hard", "heavy"],             # -V +A
    "q3": ["sad", "melancholy", "depressing", "gloomy", "emotional"],     # -V -A
    "q4": ["chill", "relaxing", "peaceful", "ambient", "mellow"],         # +V -A
}

_ANCHOR_TEXTS = [
    VALENCE_PROMPTS["positive"],
    VALENCE_PROMPTS["negative"],
    AROUSAL_PROMPTS["active"],
    AROUSAL_PROMPTS["calm"],
]


@lru_cache(maxsize=1)
def _load_model() -> tuple[CLIPModel, CLIPProcessor]:
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()
    return model, processor


@lru_cache(maxsize=1)
def _anchor_features() -> torch.Tensor:
    """Cached L2-normalised text embeddings for the 4 anchor prompts."""
    model, processor = _load_model()
    inputs = processor(text=_ANCHOR_TEXTS, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        feats = model.get_text_features(**inputs)
    return feats / feats.norm(dim=-1, keepdim=True)  # [4, dim]


def _build_result(valence: float, arousal: float) -> dict:
    if valence >= 0 and arousal >= 0:
        tags = QUADRANT_TAGS["q1"]
    elif valence < 0 and arousal >= 0:
        tags = QUADRANT_TAGS["q2"]
    elif valence < 0 and arousal < 0:
        tags = QUADRANT_TAGS["q3"]
    else:
        tags = QUADRANT_TAGS["q4"]

    return {
        "valence": round(valence, 4),
        "arousal": round(arousal, 4),
        "lastfm_tags": tags,
    }


def analyze_image(image_bytes: bytes) -> dict:
    model, processor = _load_model()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    img_inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        image_feats = model.get_image_features(**img_inputs)
    image_feats = image_feats / image_feats.norm(dim=-1, keepdim=True)  # [1, dim]

    anchors = _anchor_features()  # [4, dim]
    sims = (image_feats @ anchors.T)[0].tolist()  # [4]
    v_pos, v_neg, a_act, a_calm = sims

    return _build_result(v_pos - v_neg, a_act - a_calm)


def analyze_text(text: str) -> dict:
    model, processor = _load_model()
    inputs = processor(text=[text], return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        query_feat = model.get_text_features(**inputs)
    query_feat = query_feat / query_feat.norm(dim=-1, keepdim=True)  # [1, dim]

    anchors = _anchor_features()  # [4, dim]
    sims = (query_feat @ anchors.T)[0].tolist()  # [4]
    v_pos, v_neg, a_act, a_calm = sims

    return _build_result(v_pos - v_neg, a_act - a_calm)
