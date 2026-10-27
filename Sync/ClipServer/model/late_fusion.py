# -*- coding: utf-8 -*-
"""
복합(이미지+텍스트) 입력 후기 융합(late fusion) — numpy 전용(torch/CLIP 없이 단독 테스트 가능).

배경(§16.6): 예전 analyze_both()는 두 임베딩을 0.5:0.5 로 평균한 뒤 이미지용 온도 T 하나로 확률을 냈다.
  - 텍스트 전용 T(temperature_text)와 앵커 허브 보정(text_bias)을 쓰지 않았고,
  - 이미지·텍스트 1순위가 달라도(예: 석양 사진 + "그리움") 그 사실이 결과에 드러나지 않았다.
Gated Fusion 은 3번 실패했다(이미지 쪽이 구조적으로 더 확신 있어 보임). 그래서 학습 없이 쓸 수 있는 후기 융합으로 간다:

  1) 이미지 경로, 텍스트 경로를 각각 '보정된 서비스 경로'로 돌려 확률 p_img, p_txt 를 얻는다.
  2) 두 확률을 (가중) 기하평균으로 합친다:  p ∝ p_img^w · p_txt^(1-w)
     - 곱(product of experts, w+(1-w)=2)은 둘이 일치할 때 확률을 제곱으로 키워 과신하기 쉬워 쓰지 않는다.
       지수 합이 1 인 기하평균은 일치할 때 한쪽 확률 수준을 유지하고, 충돌할 때는 두 경로가 모두 어느 정도
       가능하다고 본 감정 쪽으로 모인다.
  3) 두 경로의 1순위가 다르면 conflict 플래그를 켠다(화면의 '입력 간 불일치' 표시용).
"""
from typing import Dict, List, Optional

import numpy as np

EPS = 1e-8


def _norm(p) -> np.ndarray:
    p = np.asarray(p, dtype=np.float64)
    p = np.clip(p, 0.0, None)
    s = p.sum()
    return p / s if s > 0 else np.full_like(p, 1.0 / len(p))


def geometric_fuse(p_img, p_txt, w_img: float = 0.5) -> np.ndarray:
    """가중 기하평균 융합. w_img=1 이면 이미지만, 0 이면 텍스트만."""
    pi, pt = _norm(p_img), _norm(p_txt)
    w = float(np.clip(w_img, 0.0, 1.0))
    lp = w * np.log(pi + EPS) + (1.0 - w) * np.log(pt + EPS)
    lp -= lp.max()
    return _norm(np.exp(lp))


def apply_temperature(p, T: Optional[float]) -> np.ndarray:
    """확률에 온도를 적용(log 확률 / T 후 재정규화). T=None/1.0 이면 그대로."""
    p = _norm(p)
    if not T or abs(T - 1.0) < 1e-9:
        return p
    lp = np.log(p + EPS) / float(T)
    lp -= lp.max()
    return _norm(np.exp(lp))


def agreement(p_img, p_txt) -> float:
    """두 분포의 겹침(Bhattacharyya 계수, 0~1). 1 이면 같은 분포, 0 이면 겹치는 감정이 없음."""
    return float(np.sum(np.sqrt(_norm(p_img) * _norm(p_txt))))


def assess_conflict(p_img, p_txt, emotions: List[str]) -> Dict:
    """
    conflict      : 두 경로의 1순위 감정이 다르면 True (화면 표시 기준)
    conflict_level: 'none' | 'soft' | 'hard'
        soft = 1순위는 다르지만 서로의 상위 2개 안에 상대 1순위가 있음(예: happy vs energetic)
        hard = 상대 1순위가 상위 2개에도 없음(예: sad vs energetic) → 정말 반대 방향
    agreement     : Bhattacharyya 계수
    """
    pi, pt = _norm(p_img), _norm(p_txt)
    ti, tt = int(pi.argmax()), int(pt.argmax())
    conflict = ti != tt
    level = "none"
    if conflict:
        top2_i = set(np.argsort(-pi)[:2].tolist())
        top2_t = set(np.argsort(-pt)[:2].tolist())
        level = "soft" if (tt in top2_i or ti in top2_t) else "hard"
    return {
        "conflict": bool(conflict),
        "conflict_level": level,
        "agreement": round(agreement(pi, pt), 4),
        "image_emotion": emotions[ti],
        "text_emotion": emotions[tt],
        "image_confidence": round(float(pi[ti]), 4),
        "text_confidence": round(float(pt[tt]), 4),
    }


def fuse_va(va_img, va_txt, w_img: float = 0.5):
    """V/A 도 확률과 같은 가중치로 섞는다."""
    w = float(np.clip(w_img, 0.0, 1.0))
    return (round(w * va_img[0] + (1 - w) * va_txt[0], 4),
            round(w * va_img[1] + (1 - w) * va_txt[1], 4))
