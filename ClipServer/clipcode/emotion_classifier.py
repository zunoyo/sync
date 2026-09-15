import torch
import torch.nn as nn


class EmotionClassifier(nn.Module):
    """
    CLIP 임베딩 위에 얹는 감정 분류 레이어
    Zero-shot 방식 이후 정확도 개선이 필요할 때 사용
    """

    def __init__(self, input_dim: int = 512, num_classes: int = 8):
        super(EmotionClassifier, self).__init__()

        self.classifier = nn.Sequential(
            nn.Linear(input_dim, 256),  # 512 → 256
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_classes)  # 256 → 8개 감정
        )

    def forward(self, x):
        return self.classifier(x)