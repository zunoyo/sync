# -*- coding: utf-8 -*-
"""
[Step 7] 텍스트 경로의 'angry 쏠림(허브)' 진단 + 보정.

증상: fresh 40문장에서 1순위가 angry 가 아닌 35문장 중 19문장(54%)의 2순위가 angry 였다
      (sad 7/7, romantic 4/4 …). romantic 의 2차 감정이 angry 인 건 의미상 말이 안 된다.
가설: 텍스트 경로는 프로젝션 없는 zero-shot 이라, 어떤 앵커(angry)는 문장 내용과 무관하게
      코사인 유사도가 전반적으로 높다(허브). 그러면 정답을 뺀 나머지 중 항상 그 앵커가 2등이 된다.
보정: 앵커별 평균 logit(편향)을 빼는 centering (+ 표준편차로 나누는 z-score).
      편향은 dev+heldout 에서 추정하고, fresh 에서만 평가한다 → fresh 는 편향 추정에 쓰지 않으므로 정직한 평가.
      (T 는 fresh 에서 맞춘다 — 기존 temperature_text 와 같은 방식. acc/top-2 는 T 와 무관.)

사용:
    python probe_text_bias.py                          # 진단 + 비교만 (체크포인트 안 건드림)
    python probe_text_bias.py --write --variant center # 좋은 변형을 골라 체크포인트에 저장(백업 생성)
저장 후 main.py 를 재시작하면 analyze_text 가 보정을 적용한다(model/clip_model.py 패치 필요).
"""

import argparse
import json
import os
import shutil

import numpy as np
import torch

FIT_SETS = ["data/text_eval_set.json", "data/text_eval_heldout.json"]   # 편향 추정용
EVAL_SET = "data/text_eval_fresh.json"                                  # 평가용(편향 추정에 쓰지 않음)


def make_transform(L_fit: np.ndarray, variant: str):
    """variant: none | center | zscore → (bias, scale)"""
    k = L_fit.shape[1]
    if variant == "none":
        return np.zeros(k, dtype=np.float32), np.ones(k, dtype=np.float32)
    bias = L_fit.mean(axis=0)
    if variant == "center":
        return bias.astype(np.float32), np.ones(k, dtype=np.float32)
    if variant == "zscore":
        scale = L_fit.std(axis=0) + 1e-8
        return bias.astype(np.float32), scale.astype(np.float32)
    raise ValueError(variant)


def apply(L: np.ndarray, bias: np.ndarray, scale: np.ndarray) -> np.ndarray:
    return (L - bias) / scale


def second_share(L: np.ndarray, names: list, target: str):
    """1순위가 target 이 아닌 문장 중, 2순위가 target 인 비율 → (비율, 분자, 분모)"""
    order = np.argsort(-L, axis=1)
    t = names.index(target)
    mask = order[:, 0] != t
    hit = int(((order[:, 1] == t) & mask).sum())
    return (hit / mask.sum() if mask.sum() else 0.0), hit, int(mask.sum())


def evaluate_variant(L_fit, L_eval, y_eval, names, variant):
    """순수 함수: 편향을 L_fit 에서 추정 → L_eval 에서 지표 계산. (T 는 L_eval 로 맞춤)"""
    from baseline_snapshot import summarize
    from calibrate_temperature import fit_temperature

    bias, scale = make_transform(L_fit, variant)
    Lt = apply(L_eval, bias, scale)
    T = fit_temperature(torch.tensor(Lt, dtype=torch.float32), torch.tensor(y_eval))
    s = summarize(y_eval, Lt, T, names)
    frac, hit, den = second_share(Lt, names, "angry")
    return {
        "variant": variant, "bias": bias.tolist(), "scale": scale.tolist(), "T": float(T),
        "accuracy": s["accuracy"], "top2_accuracy": s["top2_accuracy"], "macro_f1": s["macro_f1"],
        "per_class_recall": s["per_class_recall"],
        "angry_second_share": frac, "angry_second_hits": hit, "angry_second_denominator": den,
        "second_of_pred": s["second_of_pred"],
    }


def hub_table(L: np.ndarray, names: list, title: str):
    order = np.argsort(-L, axis=1)
    n = len(L)
    print(f"\n[허브 진단 — {title}, {n}문장]")
    print(f"  {'감정':<11}{'평균 logit':>11}{'1순위 비율':>11}{'2순위 비율':>11}")
    for i, nm in enumerate(names):
        print(f"  {nm:<11}{L[:, i].mean():>11.4f}{(order[:, 0] == i).mean():>11.0%}{(order[:, 1] == i).mean():>11.0%}")


def main():
    from calibrate_text_temperature import collect
    from model.clip_model import ClipModel

    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default="model/emotion_projection.pt")
    ap.add_argument("--out", default="results/step7_text_bias.json")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--variant", default="center", choices=["center", "zscore"],
                    help="--write 시 저장할 변형")
    args = ap.parse_args()

    model = ClipModel()
    names = list(model.emotions)

    def load(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)["items"]

    fit_logits, fit_labels = [], []
    for p in FIT_SETS:
        L, y, _, _ = collect(model, load(p))
        fit_logits.append(L)
        fit_labels.append(y)
    L_fit = np.concatenate(fit_logits)
    L_eval, y_eval, routes, _ = collect(model, load(EVAL_SET))

    hub_table(L_fit, names, "편향 추정 세트(dev+heldout)")
    hub_table(L_eval, names, "평가 세트(fresh)")

    results = {}
    for v in ("none", "center", "zscore"):
        results[v] = evaluate_variant(L_fit, L_eval, y_eval, names, v)

    print("\n[fresh 평가 — 편향은 dev+heldout 에서만 추정]")
    print(f"  {'변형':<8}{'acc':>7}{'top-2':>8}{'macro-F1':>10}{'angry가 2순위':>16}{'T':>9}")
    for v, r in results.items():
        print(f"  {v:<8}{r['accuracy']:>7.3f}{r['top2_accuracy']:>8.3f}{r['macro_f1']:>10.3f}"
              f"{r['angry_second_share']:>10.0%} ({r['angry_second_hits']}/{r['angry_second_denominator']}){r['T']:>9.4f}")

    print("\n감정별 recall (fresh):")
    print(f"  {'':<11}" + "".join(f"{v:>9}" for v in results))
    for n in names:
        print(f"  {n:<11}" + "".join(f"{results[v]['per_class_recall'][n]:>9.2f}" for v in results))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"emotions": names, "n_fit": int(len(L_fit)), "n_eval": int(len(L_eval)),
                   "variants": results}, f, ensure_ascii=False, indent=2)
    print(f"\n결과 저장: {args.out}")

    if args.write:
        r = results[args.variant]
        shutil.copyfile(args.checkpoint, args.checkpoint + ".bak_bias")
        ckpt = torch.load(args.checkpoint, map_location="cpu")
        ckpt["text_bias"] = r["bias"]
        ckpt["text_scale"] = r["scale"]
        ckpt["text_bias_emotions"] = names
        ckpt["temperature_text"] = float(r["T"])
        torch.save(ckpt, args.checkpoint)
        print(f"체크포인트에 text_bias({args.variant}) + temperature_text={r['T']:.4f} 저장 "
              f"(백업: {args.checkpoint}.bak_bias)")
    else:
        print("(측정만 했습니다. 반영하려면 --write --variant center|zscore 로 다시 실행하세요)")


if __name__ == "__main__":
    main()
