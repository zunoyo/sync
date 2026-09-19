# -*- coding: utf-8 -*-
"""
EmoSet-118K 로더 — Hugging Face 미러(Woleek/EmoSet-118K)에서 스트리밍으로
받아 SYNC 6개 카테고리로 필터링/매핑한다.

원래 EmoSet 공식 배포는 신청서를 쓰고 Google Drive에서 받아야 하는데,
동일한 데이터가 Hugging Face에 그대로 올라가 있어서(신청 불필요) 그쪽을 쓴다.
row 하나는 {"image": PIL.Image, "label": int, "emotion": str, ...} 형태.

streaming=True로 받기 때문에 30GB 전체를 미리 다운로드하지 않고, 필요한
클래스당 장수(max_per_class)를 채우는 즉시 멈춘다 — 처음 파이프라인
검증할 땐 이게 훨씬 빠르다. 대신 매번 실행할 때마다 그만큼 다시 스트리밍
해서 읽어와야 하니, 나중에 본 학습(전체 데이터) 단계에서는
load_dataset(..., streaming=False)로 로컬에 캐싱해두고 쓰는 걸 권장.

필요 패키지: pip install datasets
"""

from typing import List, Tuple

import torch
from datasets import load_dataset
from torch.utils.data import Dataset

from model.emotion_va_map import get_sync_label, get_va, TRAINED_SYNC_EMOTIONS

SYNC_IDX = {name: i for i, name in enumerate(TRAINED_SYNC_EMOTIONS)}

# EmoSet-118K의 실제 split 이름 (Hugging Face 기준: train/val/test)
_HF_SPLIT = {"train": "train", "val": "val", "test": "test"}


class EmoSetForSync(Dataset):
    """
    split: "train" | "val" | "test"
    preprocess: CLIP 전처리 함수 (clip.load()의 두 번째 반환값)
    max_per_class: 클래스당 최대 샘플 수. None이면 해당 split 전체를 다 읽음
                   (val/test는 몇천 장 수준이라 괜찮지만, train은 94.5k라 매우
                   오래 걸리니 처음엔 반드시 작은 값으로 시작할 것).
    hf_dataset: Hugging Face 데이터셋 이름. 기본 미러가 내려가 있으면
                "zhang-ge-hao/EmoSet-118K-hf" 같은 다른 미러로 바꿔서 시도.
    """

    def __init__(self, split: str, preprocess, max_per_class: int = None,
                 hf_dataset: str = "Woleek/EmoSet-118K"):
        self.preprocess = preprocess

        stream = load_dataset(hf_dataset, split=_HF_SPLIT[split], streaming=True)

        self.samples: List[Tuple] = []  # (PIL.Image, sync_idx, valence, arousal)
        per_class_count = {name: 0 for name in TRAINED_SYNC_EMOTIONS}

        for row in stream:
            emoset_emotion = row["emotion"]
            sync_emotion = get_sync_label(emoset_emotion)
            if sync_emotion is None:
                continue  # disgust / fear — 매핑 없음, 스킵

            if max_per_class is not None and per_class_count[sync_emotion] >= max_per_class:
                if all(c >= max_per_class for c in per_class_count.values()):
                    break  # 모든 클래스가 다 찼으면 스트림을 더 읽을 필요 없음
                continue

            valence, arousal = get_va(sync_emotion)
            image = row["image"].convert("RGB")
            self.samples.append((image, SYNC_IDX[sync_emotion], valence, arousal))
            per_class_count[sync_emotion] += 1

        self._log_summary(split, per_class_count)

    def _log_summary(self, split: str, per_class_count: dict):
        total = sum(per_class_count.values())
        print(f"[EmoSetForSync] split={split}: 총 {total}장 로드")
        for name, count in per_class_count.items():
            print(f"  - {name:10s}: {count}장")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        image, sync_idx, valence, arousal = self.samples[idx]
        image = self.preprocess(image)
        return (
            image,
            torch.tensor(sync_idx, dtype=torch.long),
            torch.tensor([valence, arousal], dtype=torch.float32),
        )
