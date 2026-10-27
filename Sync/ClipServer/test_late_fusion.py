# -*- coding: utf-8 -*-
"""
후기 융합 단위 테스트 — torch/CLIP/모델 가중치 없이 돈다.
  python test_late_fusion.py
A) model/late_fusion.py 의 수학적 성질  B) ClipModel.analyze_both() 의 배선(torch·clip 은 가짜로 대체)
"""
import contextlib
import sys
import types

import numpy as np

from model.late_fusion import geometric_fuse, apply_temperature, assess_conflict, agreement, fuse_va

E8 = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def onehot(i, conf, k=8):
    p = np.full(k, (1 - conf) / (k - 1)); p[i] = conf
    return p


def test_math():
    # 일치: 융합 확신도가 두 경로의 확신도를 넘지 않는다(곱처럼 제곱으로 키우지 않음)
    a, b = onehot(0, 0.7), onehot(0, 0.6)
    f = geometric_fuse(a, b)
    assert f.argmax() == 0 and abs(f.sum() - 1) < 1e-9
    assert f.max() <= max(a.max(), b.max()) + 1e-6, f.max()
    # 가중치 극단
    assert geometric_fuse(a, onehot(1, 0.9), 1.0).argmax() == 0
    assert geometric_fuse(a, onehot(1, 0.9), 0.0).argmax() == 1
    # 충돌: 1순위가 다르면 확신도가 낮아진다(한쪽 확신도보다 낮음)
    x, y = onehot(1, 0.8), onehot(3, 0.8)
    f2 = geometric_fuse(x, y)
    assert f2.max() < 0.8, f2.max()
    # 대칭(w=0.5)
    assert np.allclose(geometric_fuse(x, y), geometric_fuse(y, x))
    # 확률 하나가 0 이어도 NaN 이 안 난다
    z = np.zeros(8); z[2] = 1.0
    assert np.isfinite(geometric_fuse(z, x)).all()
    # 겹침
    assert abs(agreement(a, a) - 1) < 1e-9 and agreement(z, onehot(3, 1.0)) < 1e-3
    # 온도: T>1 이면 평평, T<1 이면 뾰족
    assert apply_temperature(f2, 2.0).max() < f2.max() < apply_temperature(f2, 0.5).max()
    assert np.allclose(apply_temperature(f2, None), f2)
    print("A) 수학적 성질 OK")


def test_conflict():
    a = onehot(0, 0.8); b = onehot(0, 0.5)
    assert assess_conflict(a, b, E8)["conflict"] is False
    # soft: happy(이미지) vs energetic(텍스트), 이미지 2순위가 energetic
    pi = np.full(8, 0.02); pi[0] = 0.55; pi[3] = 0.33; pi /= pi.sum()
    pt = onehot(3, 0.7)
    r = assess_conflict(pi, pt, E8)
    assert r["conflict"] and r["conflict_level"] == "soft", r
    # hard: sad vs energetic
    r = assess_conflict(onehot(1, 0.8), onehot(3, 0.8), E8)
    assert r["conflict"] and r["conflict_level"] == "hard" and r["image_emotion"] == "sad" and r["text_emotion"] == "energetic", r
    assert fuse_va((0.5, 0.5), (-0.5, -0.5)) == (0.0, 0.0)
    print("B) 충돌 판정 OK")


def _install_fakes():
    torch = types.ModuleType("torch")
    nn = types.ModuleType("torch.nn")
    class Module:
        def __init__(self, *a, **k): pass
        def __call__(self, *a, **k): return self.forward(*a, **k)
    nn.Module = Module
    nn.Linear = lambda *a, **k: object()
    nn.init = types.SimpleNamespace(zeros_=lambda *a, **k: None)
    torch.nn = nn
    torch.Tensor = np.ndarray
    torch.no_grad = lambda: contextlib.nullcontext()
    torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    sys.modules["torch"] = torch; sys.modules["torch.nn"] = nn
    clip = types.ModuleType("clip"); sys.modules["clip"] = clip


def test_analyze_both_wiring():
    try:
        import torch  # noqa: F401  (진짜 torch 가 있으면 가짜는 쓰지 않고 이 테스트는 건너뜀)
        print("C) 진짜 torch 가 설치돼 있어 배선 테스트는 건너뜀(서버에서 eval_fusion.py 로 확인)")
        return
    except ImportError:
        pass
    _install_fakes()
    from model.clip_model import ClipModel
    from model.emotion_mapper import EmotionMapper

    m = ClipModel.__new__(ClipModel)
    m.emotion_mapper = EmotionMapper(); m.emotions = m.emotion_mapper.get_all_emotions()
    m.projection_val_acc = 0.8; m.temperature_both = None
    m.fusion_mode, m.fusion_w_img = "late", 0.5
    names = m.emotions
    sad, ene = names.index("sad"), names.index("energetic")
    fake = {"p_img": onehot(sad, 0.85), "p_txt": onehot(ene, 0.8), "p_early": onehot(sad, 0.6),
            "va_img": (-0.6, -0.4), "va_txt": (0.6, 0.9), "embedding": np.ones(4) / 2}
    m.analyze_parts = lambda text, image: dict(fake)

    r = m.analyze_both("신나", None)
    assert r["fusion_mode"] == "late" and r["conflict"] is True and r["conflict_level"] == "hard"
    assert r["image_emotion"] == "sad" and r["text_emotion"] == "energetic"
    assert r["confidence"] < 0.8 and abs(r["valence"]) < 1e-6 and abs(r["arousal"] - 0.25) < 1e-6, r
    assert set(["primary_emotion", "secondary_emotion", "confidence", "clip_embedding", "lastfm_tags", "valence", "arousal"]) <= set(r)
    # early 모드는 예전 값 그대로, conflict 키 없음
    r0 = m.analyze_both("신나", None, mode="early")
    assert r0["fusion_mode"] == "early" and "conflict" not in r0 and r0["primary_emotion"] == "sad"
    # 일치하면 conflict False
    fake["p_txt"] = onehot(sad, 0.7); fake["va_txt"] = (-0.5, -0.3)
    r1 = m.analyze_both("슬퍼", None)
    assert r1["conflict"] is False and r1["primary_emotion"] == "sad"
    # temperature_both 적용
    m.temperature_both = 2.0
    assert m.analyze_both("슬퍼", None)["confidence"] < r1["confidence"]
    print("C) analyze_both 배선 OK")


if __name__ == "__main__":
    test_math(); test_conflict(); test_analyze_both_wiring()
    print("모든 테스트 통과")
