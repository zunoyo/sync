# -*- coding: utf-8 -*-
"""
CLIP 이미지 임베딩 위에 얹는 감정 보정 레이어.

기존에 있던 512→256→ReLU→Dropout→8클래스짜리 MLP(EmotionClassifier)는
한 번도 실제로 쓰인 적이 없었고, 그 정도 크기를 제대로 학습시키려면 EmoSet
전체 규모의 데이터가 필요해서 "감정당 수백~수천 장" 수준에는 과합니다.
대신 여기서는 두 개의 훨씬 작은 모듈로 교체합니다:

1. EmotionProjection — CLIP 임베딩(512)에 작은 보정치만 더하는 residual
   레이어. 가중치를 0으로 초기화해서 학습 초반엔 사실상 원본 CLIP 임베딩과
   동일하게 동작하고(zero-shot 성능 밑으로 떨어지는 걸 방지하는 안전장치),
   데이터가 쌓일수록 필요한 만큼만 방향을 튼다. 학습 대상은 이 레이어뿐이고
   CLIP 백본 자체는 계속 얼려둔다(freeze).

2. VAHead — 보정된 임베딩에서 (valence, arousal) 두 값을 바로 회귀하는
   선형 레이어 하나. clip_model.py의 텍스트쪽 V/A 앵커 방식과는 별개로,
   이미지 쪽 V/A는 EmoSet 라벨로 직접 학습된 이 헤드를 쓰게 된다.

두 모듈 다 파라미터가 매우 작아서(프로젝션 약 26만 개, VA헤드 약 1천 개)
감정당 수백 장 규모의 EmoSet 서브셋으로도 방향성 있는 학습이 가능하다.
"""

import torch
import torch.nn as nn


class EmotionProjection(nn.Module):
    """CLIP 임베딩에 학습 가능한 보정치를 더하는 residual 레이어."""

    def __init__(self, dim: int = 512):
        super().__init__()
        self.proj = nn.Linear(dim, dim)
        # 0으로 초기화 → 학습 시작 시점엔 out == x (순수 CLIP과 동일)
        nn.init.zeros_(self.proj.weight)
        nn.init.zeros_(self.proj.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = x + self.proj(x)
        return out / out.norm(dim=-1, keepdim=True)


class VAHead(nn.Module):
    """보정된 임베딩 → (valence, arousal) 회귀."""

    def __init__(self, dim: int = 512):
        super().__init__()
        self.linear = nn.Linear(dim, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.tanh(self.linear(x))  # -1.0 ~ +1.0 범위로 클램프
