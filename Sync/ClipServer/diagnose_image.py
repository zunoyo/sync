# -*- coding: utf-8 -*-
"""
이미지 경로 진단 — "서비스에서 쓰는 그대로(8감정)" 이미지 성능을 감정별로 본다.

[왜 필요한가]
지금까지의 이미지 정확도(test 80.6%)는 학습 대상 6감정 앵커만으로 잰 값이다. 그런데 서비스는 8감정 앵커로
softmax 를 하므로, 학습하지 않은 romantic/melancholy 앵커가 sad/calm/dreamy 이미지의 확률을 빼앗을 수 있다.
복합 평가에서 이미지만의 일치쌍 정확도가 0.53 이었던 것과도 맞닿아 있다. 이 스크립트가
  1) EmoSet test 를 6앵커(학습 평가 방식) vs 8앵커(서비스 방식)로 나란히 재서 차이를 보이고,
  2) 8앵커에서 정답이 어디로 새는지(혼동행렬), 감정별 재현율, 확신도 대비 정확도를 보이고,
  3) (선택) 직접 모은 실사용 이미지 폴더를 같은 방식으로 잰다.

사용
  python diagnose_image.py                          # EmoSet test(캐시 있으면 바로) 진단
  python diagnose_image.py --image-dir data/real_images   # 폴더명 = 감정(happy, sad, ..., romantic, melancholy ...)
결과는 화면과 results/image_diag.json 에 남는다. 모델 파일은 건드리지 않는다.
"""
import argparse
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))


# ───────────────── 순수 함수(테스트 가능) ─────────────────
def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def ece(probs: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    conf = probs.max(1)
    hit = (probs.argmax(1) == y).astype(float)
    edges = np.linspace(0, 1, bins + 1)
    tot = 0.0
    for i in range(bins):
        m = (conf > edges[i]) & (conf <= edges[i + 1]) if i else (conf >= edges[0]) & (conf <= edges[1])
        if m.any():
            tot += m.mean() * abs(hit[m].mean() - conf[m].mean())
    return float(tot)


def diagnose(probs: np.ndarray, y: np.ndarray, names, true_ids=None) -> dict:
    """probs[N,K] (서비스 K감정), y[N] (K감정 기준 정답 인덱스). true_ids = 실제로 정답이 나오는 감정 인덱스들."""
    K = len(names)
    pred = probs.argmax(1)
    cm = np.zeros((K, K), dtype=int)
    for t, p in zip(y, pred):
        cm[t, p] += 1
    ids = sorted(set(y.tolist())) if true_ids is None else list(true_ids)
    per = {}
    for i in ids:
        n = int(cm[i].sum())
        per[names[i]] = {"n": n, "recall": round(float(cm[i, i] / n), 3) if n else None,
                         "precision": round(float(cm[i, i] / cm[:, i].sum()), 3) if cm[:, i].sum() else None}
    top2 = np.argsort(-probs, axis=1)[:, :2]
    conf = probs.max(1)
    return {
        "n": int(len(y)),
        "acc": round(float((pred == y).mean()), 4),
        "top2": round(float(np.mean([y[i] in top2[i] for i in range(len(y))])), 4),
        "ece": round(ece(probs, y), 4),
        "mean_conf": round(float(conf.mean()), 4),
        "pred_share": {names[i]: round(float((pred == i).mean()), 3) for i in range(K)},
        "per_class": per,
        "confusion": cm.tolist(),
    }


def mask_to(probs: np.ndarray, keep_idx) -> np.ndarray:
    """keep_idx 감정만 남겨 다시 정규화(= 6앵커로 잰 것과 같은 효과를 서비스 확률에서 흉내)."""
    out = np.zeros_like(probs)
    out[:, keep_idx] = probs[:, keep_idx]
    return out / np.clip(out.sum(1, keepdims=True), 1e-12, None)


def print_report(tag: str, d: dict, names):
    print(f"\n=== {tag} (n={d['n']}) ===")
    print(f"acc={d['acc']:.3f}  top2={d['top2']:.3f}  ECE={d['ece']:.3f}  평균 확신도={d['mean_conf']:.3f}")
    print("예측 비율:", "  ".join(f"{k}={v:.0%}" for k, v in d["pred_share"].items()))
    print("감정별 재현율/정밀도:")
    for k, v in d["per_class"].items():
        print(f"  {k:<11} n={v['n']:<5} recall={v['recall']}  precision={v['precision']}")
    cm = np.array(d["confusion"])
    print("혼동행렬 (행=정답, 열=예측)")
    print("            " + " ".join(f"{n[:5]:>6}" for n in names))
    for i, n in enumerate(names):
        if cm[i].sum():
            print(f"  {n:<9} " + " ".join(f"{c:>6}" for c in cm[i]))


# ───────────────── 모델/데이터 ─────────────────
CLIP_NAME = "ViT-B/32"   # load_service 가 체크포인트의 clip_model 로 갱신
CLASS_BIAS = None   # load_service 가 체크포인트의 image_class_bias 를 담아 두면 service_probs 가 logit 에 더한다(없으면 기존 동작)


def load_service(device, ckpt_path=None):
    import clip
    import torch
    from model.emotion_classifier import EmotionProjection
    from model.emotion_mapper import EmotionMapper
    from model.emotion_prompts import build_prompt_ensemble_anchors
    ck = torch.load(ckpt_path or os.path.join(ROOT, "model", "emotion_projection.pt"), map_location=device)
    global CLIP_NAME
    CLIP_NAME = ck.get("clip_model", "ViT-B/32")
    clip_model, preprocess = clip.load(CLIP_NAME, device=device)
    print(f"CLIP 백본: {CLIP_NAME}")
    clip_model.eval()
    names = EmotionMapper().get_all_emotions()
    anchors = build_prompt_ensemble_anchors(clip_model, device, names)
    proj = EmotionProjection(dim=512).to(device)
    proj.load_state_dict(ck["projection_state_dict"])
    proj.eval()
    global CLASS_BIAS
    CLASS_BIAS = None
    b = ck.get("image_class_bias")
    if b is not None and list(ck.get("image_class_bias_emotions", names)) == list(names):
        CLASS_BIAS = torch.tensor(b, dtype=torch.float32, device=device)
        print("감정별 가산값 적용:", {n: round(float(v), 2) for n, v in zip(names, b)})
    return clip_model, preprocess, names, anchors, proj, float(ck.get("temperature", 1.0))


def service_probs(feats, anchors, proj, T):
    import torch
    with torch.no_grad():
        corrected = proj(feats)
        logits = (corrected @ anchors.T) / T
        if CLASS_BIAS is not None:
            logits = logits + CLASS_BIAS
        return logits.softmax(-1).cpu().numpy()


def folder_features(image_dir, clip_model, preprocess, names, device):
    import torch
    from PIL import Image
    feats, ys, paths = [], [], []
    exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
    for emo in sorted(os.listdir(image_dir)):
        d = os.path.join(image_dir, emo)
        if not os.path.isdir(d):
            continue
        if emo not in names:
            print(f"[건너뜀] 폴더 '{emo}' 는 서비스 감정 {names} 에 없음")
            continue
        for f in sorted(os.listdir(d)):
            if f.lower().endswith(exts):
                paths.append(os.path.join(d, f)); ys.append(names.index(emo))
    batch = []
    for i, p in enumerate(paths):
        batch.append(preprocess(Image.open(p).convert("RGB")))
        if len(batch) == 32 or i == len(paths) - 1:
            with torch.no_grad():
                f = clip_model.encode_image(torch.stack(batch).to(device)).float()
                feats.append((f / f.norm(dim=-1, keepdim=True)).cpu())
            batch = []
    return torch.cat(feats).to(device), np.array(ys), paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="test")
    ap.add_argument("--max-per-class", type=int, default=300, help="step5 평가와 같은 값(캐시 재사용)")
    ap.add_argument("--image-dir", default=None, help="폴더명=감정인 실사용 이미지 폴더(선택)")
    ap.add_argument("--checkpoint", default=None, help="평가할 체크포인트(기본 model/emotion_projection.pt, 예: model/emotion_projection_v2.pt)")
    args = ap.parse_args()

    import torch
    from feature_cache import get_features
    from model.emotion_va_map import TRAINED_SYNC_EMOTIONS
    device = "cuda" if torch.cuda.is_available() else "cpu"
    clip_model, preprocess, names, anchors, proj, T = load_service(device, args.checkpoint)
    print(f"서비스 감정(순서): {names} | 이미지 T={T:.4f}")
    trained_idx = [names.index(n) for n in TRAINED_SYNC_EMOTIONS]
    out = {"names": names, "T": T}

    feats, labels6, _ = get_features(args.split, args.max_per_class, clip_model, preprocess, device, clip_name=CLIP_NAME)
    feats = feats.to(device)
    y = np.array([trained_idx[i] for i in labels6.numpy()])
    p8 = service_probs(feats, anchors, proj, T)
    p6 = mask_to(p8, trained_idx)
    d6 = diagnose(p6, y, names, trained_idx)
    d8 = diagnose(p8, y, names, trained_idx)
    print_report("EmoSet test — 6앵커(학습 평가 방식)", d6, names)
    print_report("EmoSet test — 8앵커(서비스 방식)", d8, names)
    leak = float(p8[:, [names.index('romantic'), names.index('melancholy')]].sum(1).mean())
    print(f"\n[요약] 6앵커 {d6['acc']:.3f} → 8앵커 {d8['acc']:.3f} (차이 {d8['acc'] - d6['acc']:+.3f}) | "
          f"romantic+melancholy 가 가져가는 평균 확률 {leak:.1%}")
    out.update({"emoset_6anchor": d6, "emoset_8anchor": d8, "rm_leak": leak})

    if args.image_dir:
        f2, y2, paths = folder_features(args.image_dir, clip_model, preprocess, names, device)
        p = service_probs(f2, anchors, proj, T)
        d = diagnose(p, y2, names)
        print_report(f"실사용 이미지 {args.image_dir} — 8앵커(서비스 방식)", d, names)
        out["real_images"] = d

    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    path = os.path.join(ROOT, "results", "image_diag.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print(f"\n저장: {path}")


if __name__ == "__main__":
    main()
