# -*- coding: utf-8 -*-
"""
EmoSet(Mikels 8분류) → SYNC 8감정 매핑 + 근사 V/A 좌표.

이 파일이 유일한 기준(single source of truth)이라, EmoSet 데이터 로더와
학습 스크립트, 그리고 나중에 clip_model.py에서 추론할 때도 전부 여기서
가져다 씀 — 값 하나를 여러 군데 흩어놓고 따로 관리하지 않기 위함.

[매핑 근거]
- amusement/excitement/contentment/sadness/anger는 SYNC 카테고리와
  의미가 거의 그대로 겹쳐서 직접 대응.
- awe → dreamy: "경외감(광활함, 압도됨)"과 "몽환적(atmospheric, ethereal)"이
  완전히 같진 않지만, SYNC 8개 중 가장 가까운 게 dreamy라 채택. 다른 항목보다
  근사가 느슨하다는 점은 감안할 것.
- disgust/fear는 억지로 끼워맞출 SYNC 카테고리가 없고, 음악 추천이라는
  맥락 자체에도 안 맞아서(혐오/공포 유발 이미지로 노래를 추천할 일이 없음)
  아예 학습셋에서 제외한다. EMOSET_TO_SYNC에 없는 키는 로더가 자동으로 스킵.
- romantic/melancholy는 EmoSet에 대응하는 원본 카테고리가 아예 없어서
  이번 학습 라운드에서는 손대지 않음(기존 zero-shot 그대로 유지, 저하도
  개선도 없음). 나중에 이 두 개만 별도로 소량 이미지를 모으거나
  ArtEmis 같은 다른 소스를 붙이는 걸 권장.

[V/A 값의 성격]
아래 수치는 Russell Circumplex 상에서 각 Mikels 감정이 대체로 위치하는
사분면·강도를 참고한 "근사치"이지, 특정 논문 하나에서 그대로 가져온 정밀
측정값이 아니다. clip_model.py의 _VA_ANCHORS와 마찬가지로 -1.0~+1.0
범위를 쓰고, 실제 학습 후 결과가 이상하면 이 값부터 조정해보면 된다.
"""

from typing import Dict, Optional, Tuple

# EmoSet 원본 카테고리 문자열(디렉터리명과 동일) → SYNC 카테고리
EMOSET_TO_SYNC: Dict[str, str] = {
    "amusement":   "happy",
    "excitement":  "energetic",
    "contentment": "calm",
    "sadness":     "sad",
    "anger":       "angry",
    "awe":         "dreamy",
    # "disgust", "fear" 는 의도적으로 누락 — get_sync_label()이 None을 반환하고
    # 로더가 해당 이미지를 스킵함
}

# 학습에 실제로 사용하는 SYNC 카테고리 (6개 — romantic/melancholy는 제외)
TRAINED_SYNC_EMOTIONS = ["happy", "energetic", "calm", "sad", "angry", "dreamy"]

# 이번 라운드에서 EmoSet 신호가 전혀 없는 카테고리 — 학습 스크립트가
# 이 목록을 보고 "그대로 둔다"는 로그를 남기도록 참조용으로 남겨둠
UNTRAINED_SYNC_EMOTIONS = ["romantic", "melancholy"]

# SYNC 카테고리 → (valence, arousal) 근사 좌표, 범위 -1.0 ~ +1.0
SYNC_VA_ANCHOR: Dict[str, Tuple[float, float]] = {
    "happy":     (0.7, 0.5),
    "energetic": (0.6, 0.9),
    "calm":      (0.6, -0.5),
    "sad":       (-0.6, -0.4),
    "angry":     (-0.7, 0.7),
    "dreamy":    (0.4, 0.0),
}


def get_sync_label(emoset_category: str) -> Optional[str]:
    """EmoSet 카테고리명 → SYNC 카테고리명. 매핑 없으면(disgust/fear) None."""
    return EMOSET_TO_SYNC.get(emoset_category)


def get_va(sync_emotion: str) -> Tuple[float, float]:
    """SYNC 카테고리명 → (valence, arousal). 매핑표에 없으면 예외."""
    return SYNC_VA_ANCHOR[sync_emotion]
