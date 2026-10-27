# -*- coding: utf-8 -*-
"""
텍스트 헤드 — 한국어 문장 → SYNC 8감정 확률.

배경: 텍스트 경로는 (한국어 → 키워드 사전/KoELECTRA로 영어 번역 → CLIP 텍스트 인코더 → 감정 앵커 유사도)의
zero-shot 구조라, 사전에 없는 표현은 의미 없는 고정 문장으로 빠지고 정확도가 0.68~0.78 에 머물렀다.
이 헤드는 KoELECTRA 은닉 상태(korean_emotion.encode_features) 위에 문장 데이터로 학습한 8감정 로지스틱 회귀를
얹은 것이다. 서비스에서는 기존 CLIP 경로 확률과 로그 확률 가중평균(+온도)으로 합친다
(blend_probs). 가중치 a·온도 T 는 train_text_head.py 가 학습 문장의 교차검증 예측으로 정한다.

이 파일은 numpy 만 쓴다(학습 스크립트·단위 테스트가 CLIP/torch 없이 돌 수 있도록).
체크포인트(model/text_head.pt)가 없거나 감정 순서가 다르면 load()는 None → 기존 동작 그대로.
"""
import os
from typing import Optional, Sequence

import numpy as np

HIDDEN = 768
# feat 이름 → 특징 슬라이스(korean_emotion.encode_features 의 [CLS | 평균 | 6라벨 확률] 순서)
FEAT_SLICES = {
    "cls": slice(0, HIDDEN),
    "clsmean": slice(0, 2 * HIDDEN),
    "all": slice(0, 2 * HIDDEN + 6),
}


def softmax(z: np.ndarray, axis: int = -1) -> np.ndarray:
    z = z - z.max(axis=axis, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)


def blend_probs(p_head: np.ndarray, p_clip: np.ndarray, a: float, T: float = 1.0, eps: float = 1e-8) -> np.ndarray:
    """로그 확률 가중평균: softmax((a·log p_head + (1-a)·log p_clip) / T). a=1 이면 헤드만, a=0 이면 CLIP 경로만."""
    lg = a * np.log(np.asarray(p_head) + eps) + (1.0 - a) * np.log(np.asarray(p_clip) + eps)
    return softmax(lg / max(float(T), 1e-6), axis=-1)


class TextHead:
    def __init__(self, W, b, mean, std, emotions, feat="clsmean", a=0.5, T=1.0, meta=None):
        self.W = np.asarray(W, dtype=np.float64)          # (d, K)
        self.b = np.asarray(b, dtype=np.float64)          # (K,)
        self.mean = np.asarray(mean, dtype=np.float64)    # (d,)
        self.std = np.asarray(std, dtype=np.float64)      # (d,)
        self.emotions = list(emotions)
        self.feat = feat
        self.a = float(a)
        self.T = float(T)
        self.meta = meta or {}

    # ── 확률 ────────────────────────────────────────────────────────────
    def proba_from_features(self, X: np.ndarray) -> np.ndarray:
        """X: (n, FEAT_DIM) 전체 특징(encode_features 출력) 또는 이미 슬라이스된 (n, d)."""
        X = np.asarray(X, dtype=np.float64)
        d = self.W.shape[0]
        if X.shape[1] != d:
            X = X[:, FEAT_SLICES[self.feat]]
        Z = (X - self.mean) / self.std
        return softmax(Z @ self.W + self.b, axis=1)

    def predict(self, text: str) -> Optional[np.ndarray]:
        """문장 하나 → (K,) 확률. KoELECTRA 를 못 쓰면 None."""
        from .korean_emotion import encode_one
        f = encode_one(text)
        if f is None:
            return None
        return self.proba_from_features(f[None, :])[0]

    # ── 저장/로드 ───────────────────────────────────────────────────────
    def save(self, path: str):
        import torch
        torch.save({
            "W": self.W.astype(np.float32), "b": self.b.astype(np.float32),
            "mean": self.mean.astype(np.float32), "std": self.std.astype(np.float32),
            "emotions": self.emotions, "feat": self.feat, "a": self.a, "T": self.T, "meta": self.meta,
        }, path)

    @classmethod
    def load(cls, path: str, emotions: Sequence[str]) -> Optional["TextHead"]:
        if not os.path.exists(path):
            return None
        import torch
        try:
            d = torch.load(path, map_location="cpu", weights_only=False)
            if list(d["emotions"]) != list(emotions):
                return None
            return cls(d["W"], d["b"], d["mean"], d["std"], d["emotions"], d.get("feat", "clsmean"),
                       d.get("a", 0.5), d.get("T", 1.0), d.get("meta"))
        except Exception:
            return None
