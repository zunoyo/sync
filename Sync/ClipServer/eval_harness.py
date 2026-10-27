# -*- coding: utf-8 -*-
"""
평가 도구 모음(0단계) — 모델/CLIP 없이 numpy 만으로 돌아가는 순수 함수들.
  wilson_ci        : 비율의 Wilson 95% 신뢰구간
  bootstrap_ci     : 이미지 단위 부트스트랩 95% 신뢰구간(반복 평균 정답 벡터 지원)
  mcnemar_exact    : 같은 이미지에서 두 모델 비교(정확 이항 검정, 양측)
  crossfit_T       : 겹마다 '그 겹을 뺀' 예측으로 온도를 맞춰 적용(자기 겹으로 온도를 맞추지 않음)
  metrics          : 정확도, Macro-F1, NLL, Brier, ECE, 혼동행렬, 감정별 재현율·예측 감정별 ECE
"""
import math

import numpy as np


def wilson_ci(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def bootstrap_ci(correct, n_boot=2000, seed=0, alpha=0.05):
    """correct: [n] 또는 [R,n](반복별 정오). 이미지를 복원추출해 평균 정확도의 신뢰구간."""
    c = np.asarray(correct, dtype=float)
    if c.ndim == 2:
        c = c.mean(0)
    rng = np.random.default_rng(seed)
    n = len(c)
    idx = rng.integers(0, n, size=(n_boot, n))
    m = c[idx].mean(1)
    return (float(np.quantile(m, alpha / 2)), float(np.quantile(m, 1 - alpha / 2)))


def mcnemar_exact(correct_a, correct_b):
    """b = A만 맞음, c = B만 맞음. 정확 이항(양측) p. 반환 (b, c, p)."""
    a = np.asarray(correct_a, dtype=bool)
    b_ = np.asarray(correct_b, dtype=bool)
    b = int((a & ~b_).sum())
    c = int((~a & b_).sum())
    n = b + c
    if n == 0:
        return b, c, 1.0
    k = min(b, c)
    p = sum(math.comb(n, i) for i in range(0, k + 1)) / (2 ** n) * 2
    return b, c, float(min(1.0, p))


def _softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def _fit_T(z, y, grid=None):
    grid = np.exp(np.linspace(np.log(0.01), np.log(0.3), 120)) if grid is None else grid
    best, bt = 1e18, float(grid[0])
    for T in grid:
        p = _softmax(z / T)
        nll = float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-9, 1)).mean())
        if nll < best:
            best, bt = nll, float(T)
    return bt


def crossfit_T(z, y, fold):
    """각 겹의 확률은 '그 겹을 제외한 나머지 예측'으로 맞춘 온도로 계산 → 확률 [n,K]."""
    p = np.zeros_like(z, dtype=float)
    Ts = []
    for f in np.unique(fold):
        te, tr = fold == f, fold != f
        T = _fit_T(z[tr], y[tr])
        Ts.append(T)
        p[te] = _softmax(z[te] / T)
    return p, Ts


def ece(p, y, bins=10):
    conf, hit = p.max(1), (p.argmax(1) == y).astype(float)
    edges, tot = np.linspace(0, 1, bins + 1), 0.0
    for i in range(bins):
        m = (conf > edges[i]) & (conf <= edges[i + 1]) if i else (conf >= 0) & (conf <= edges[1])
        if m.any():
            tot += m.mean() * abs(hit[m].mean() - conf[m].mean())
    return float(tot)


def metrics(p, y, names):
    """p[n,K] 확률, y[n]. 반환 dict."""
    K = len(names)
    n = len(y)
    pred = p.argmax(1)
    cm = np.zeros((K, K), dtype=int)
    for t, q in zip(y, pred):
        cm[t, q] += 1
    f1s = []
    for k in range(K):
        tp = cm[k, k]
        fp = cm[:, k].sum() - tp
        fn = cm[k, :].sum() - tp
        f1s.append(0.0 if tp == 0 else 2 * tp / (2 * tp + fp + fn))
    present = [k for k in range(K) if cm[k].sum() > 0]
    onehot = np.eye(K)[y]
    per_pred_ece = {}
    for k in range(K):
        m = pred == k
        if m.sum() >= 5:
            per_pred_ece[names[k]] = {"n": int(m.sum()), "ece": round(ece(p[m], y[m], bins=5), 3)}
    return {
        "n": int(n),
        "acc": float((pred == y).mean()),
        "macro_f1": float(np.mean([f1s[k] for k in present])),
        "nll": float(-np.log(np.clip(p[np.arange(n), y], 1e-9, 1)).mean()),
        "brier": float(((p - onehot) ** 2).sum(1).mean()),
        "ece": ece(p, y),
        "mean_conf": float(p.max(1).mean()),
        "confusion": cm.tolist(),
        "recall": {names[k]: f"{int(cm[k, k])}/{int(cm[k].sum())}" for k in present},
        "ece_by_pred": per_pred_ece,
    }
