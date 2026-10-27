# -*- coding: utf-8 -*-
"""
쿠르님이 직접 정한 라벨(평가 이미지 약 119장)을 '학습에 쓰면' 쿠르님 기준 정확도가 얼마나 오르는지를 교차검증으로 잰다.

  python cv_user_labels.py --image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv ^
      --final data\\eval_final_labels.csv,data\\eval_final_labels_rest.csv ^
      --real-dir data\\train_images --real-dir-extra data\\train_images2,data\\train_images3 --emoset-class-weight dreamy=0.4

쿠르님 라벨 이미지를 K겹으로 나눠, 각 겹을 '학습에 한 번도 안 쓴' 상태로 예측해 정확도를 잰다(평가 이미지 한 장도 자기 자신 학습에는 안 쓰임).
비교하는 방법(전부 쿠르님 라벨 기준 정확도):
  기준  : 쿠르님 라벨 없이 학습(Claude 라벨 학습 데이터만)           — 지금 구조의 기준선
  B     : 기준 모델 위에 감정별 가산값을 쿠르님 라벨로 맞춤(겹마다 학습 쪽 이미지로만 맞춰 학습 안 쓴 겹에 적용)
  A     : 쿠르님 라벨 이미지를 학습 데이터에 가중해서 추가(--user-weights 후보별)
결과: 화면 + results/cv_user_labels.json. 모델 파일(emotion_projection.pt)은 건드리지 않는다.
"""
import argparse
import json
import os

import numpy as np
import torch

from eval_labelers import EMOTIONS, read_labels
from train_projection_v2 import (balance_factors, cos_logits, ece_np, emoset_class_weights, fit_class_bias, fit_T, parse_pairs,
                                 softmax_np, DEFAULT_HN_PAIRS, real_features, stratified_folds, train_projection)

ROOT = os.path.dirname(os.path.abspath(__file__))


def acc(z, y):
    return float((z.argmax(1) == y).mean())


def per_class(z, y, names):
    return {n: f"{int(((z.argmax(1) == i) & (y == i)).sum())}/{int((y == i).sum())}" for i, n in enumerate(names) if (y == i).any()}


def run_cv(emo, real, bal, user, anchors, *, real_w=30.0, user_weights=(30.0,), k=5, repeats=2, T=0.0406,
           emo_w=None, kw=None, log=print):
    """emo=(feats,y,va) EmoSet, real=(feats,y,va) 학습용 실사용, user=(feats,y,va) 쿠르님 라벨 평가 이미지.
    반환 dict. 순수 텐서 입력 — CLIP 없이 테스트 가능."""
    kw = kw or {}
    uf, uy, uv = user
    yn = uy.numpy()
    K = anchors.shape[0]
    W0 = torch.cat([emo_w if emo_w is not None else torch.ones(len(emo[1])),
                    torch.full((len(real[1]),), float(real_w)) * (bal if bal is not None else 1.0)])
    F0 = torch.cat([emo[0], real[0]]); Y0 = torch.cat([emo[1], real[1]]); V0 = torch.cat([emo[2], real[2]])

    # 기준: 쿠르님 라벨 없이 한 번만 학습
    proj0, _ = train_projection(F0, Y0, V0, W0, anchors, **kw)
    z0 = cos_logits(proj0, uf, anchors)
    res = {"n": int(len(yn)), "baseline": {"acc": acc(z0, yn), "per_class": None}}
    res["baseline"]["per_class"] = None
    log(f"[기준] 쿠르님 라벨 없이 학습: 정확도 {acc(z0, yn):.3f}")

    out = {"baseline": [acc(z0, yn)], "B_bias": []}
    A = {w: [] for w in user_weights}
    pc = {"baseline": z0}
    zA_last = {}
    for r in range(repeats):
        fold = stratified_folds(yn, k, seed=r)
        zB = np.zeros_like(z0)
        zA = {w: np.zeros_like(z0) for w in user_weights}
        for f in range(k):
            tr, te = fold != f, fold == f
            # B: 학습 쪽 이미지로 가산값을 맞춰 학습 안 쓴 겹에 적용
            b, _, _ = fit_class_bias(z0[tr] / T, yn[tr], K)
            zB[te] = z0[te] / T + b
            # A: 쿠르님 라벨(학습 겹)을 학습 데이터에 추가
            for w in user_weights:
                F_ = torch.cat([F0, uf[tr]]); Y_ = torch.cat([Y0, uy[tr]]); V_ = torch.cat([V0, uv[tr]])
                W_ = torch.cat([W0, torch.full((int(tr.sum()),), float(w))])
                proj, _ = train_projection(F_, Y_, V_, W_, anchors, **kw)
                zA[w][te] = cos_logits(proj, uf[te], anchors)
        out["B_bias"].append(acc(zB, yn))
        for w in user_weights:
            A[w].append(acc(zA[w], yn))
        zA_last = zA
        pc["B_bias"] = zB
        log(f"  반복 {r + 1}/{repeats}: B {out['B_bias'][-1]:.3f} | " + " | ".join(f"A(w={w:g}) {A[w][-1]:.3f}" for w in user_weights))
    for w in user_weights:
        out[f"A_w{w:g}"] = A[w]
        pc[f"A_w{w:g}"] = zA_last[w]
    summary = {k_: {"mean": float(np.mean(v)), "values": [float(x) for x in v]} for k_, v in out.items()}
    return {"n": int(len(yn)), "summary": summary, "per_class": {k_: per_class(z, yn, EMOTIONS) for k_, z in pc.items()},
            "_z": pc}


def train_final(emo, real, bal, user, anchors, *, real_w, user_w, emo_w=None, kw=None):
    """EmoSet + 학습용 실사용 + 쿠르님 라벨 이미지 전부로 최종 학습."""
    kw = kw or {}
    W = torch.cat([emo_w if emo_w is not None else torch.ones(len(emo[1])),
                   torch.full((len(real[1]),), float(real_w)) * (bal if bal is not None else 1.0),
                   torch.full((len(user[1]),), float(user_w))])
    F_ = torch.cat([emo[0], real[0], user[0]]); Y_ = torch.cat([emo[1], real[1], user[1]]); V_ = torch.cat([emo[2], real[2], user[2]])
    return train_projection(F_, Y_, V_, W, anchors, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image-dir", required=True)
    ap.add_argument("--human", default=None)
    ap.add_argument("--claude", default=None)
    ap.add_argument("--labels", default=None, help="통합 라벨 CSV(file,emotion) — 주면 --human/--claude/--final 불필요")
    ap.add_argument("--final", default=None, help="쉼표로 여러 개: data\\eval_final_labels.csv,data\\eval_final_labels_rest.csv")
    ap.add_argument("--real-dir", required=True)
    ap.add_argument("--real-dir-extra", default=None)
    ap.add_argument("--real-weight", type=float, default=30.0)
    ap.add_argument("--user-weights", default="30,60", help="쿠르님 라벨 이미지 1장의 학습 가중 후보(쉼표)")
    ap.add_argument("--emoset-class-weight", default="dreamy=0.4")
    ap.add_argument("--max-per-class", type=int, default=3000)
    ap.add_argument("--val-max-per-class", type=int, default=300)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--clip-model", default="ViT-B/32")
    ap.add_argument("--save-final", default=None, help="쿠르님 라벨 전부로 학습한 최종 체크포인트 저장 경로(예: model\\emotion_projection_v3.pt)")
    ap.add_argument("--t-user-only", action="store_true", help="--save-final 에서 이미지 온도를 쿠르님 라벨 교차검증 예측만으로 맞춘다(EmoSet val 을 섞지 않음 — 실제 이미지에서 확신도가 과하게 높아지는 것을 줄임)")
    ap.add_argument("--final-weight", type=float, default=60.0, help="--save-final 에서 쿠르님 라벨 1장의 가중(교차검증으로 고른 값)")
    ap.add_argument("--base", default=os.path.join(ROOT, "model", "emotion_projection.pt"))
    ap.add_argument("--T", type=float, default=0.0406, help="B(가산값)에 쓰는 이미지 온도(현재 v2e 값)")
    args = ap.parse_args()
    if not args.labels and not (args.human and args.claude and args.final):
        ap.error("--labels 또는 (--human, --claude, --final) 가 필요합니다")

    import clip
    from PIL import Image
    from feature_cache import get_features
    from model.emotion_mapper import EmotionMapper
    from model.emotion_prompts import build_prompt_ensemble_anchors
    from model.emotion_va_map import SERVICE_VA_ANCHOR, TRAINED_SYNC_EMOTIONS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    names = EmotionMapper().get_all_emotions()
    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()
    anchors = build_prompt_ensemble_anchors(clip_model, device, names).cpu()

    to_srv = torch.tensor([names.index(e) for e in TRAINED_SYNC_EMOTIONS])
    ef, el, ev = get_features("train", args.max_per_class, clip_model, preprocess, device, clip_name=args.clip_model)
    emo = (ef, to_srv[el], ev)
    rf, ry, _ = real_features(args.real_dir, names, clip_model, preprocess, device, args.clip_model)
    for extra in [x.strip() for x in str(args.real_dir_extra or "").split(",") if x.strip()]:
        if os.path.isdir(extra):
            rf2, ry2, _ = real_features(extra, names, clip_model, preprocess, device, args.clip_model)
            rf, ry = torch.cat([rf, rf2]), torch.cat([ry, ry2])
    rv = torch.tensor([SERVICE_VA_ANCHOR[names[int(i)]] for i in ry], dtype=torch.float32)
    bal = balance_factors(ry, len(names))
    emo_w = emoset_class_weights(emo[1], names, args.emoset_class_weight)

    # 쿠르님 라벨 평가 이미지(= eval_labelers --final 과 같은 정답 구성)
    if args.labels:      # build_label_pool.py 가 만든 통합 라벨(file,emotion)
        truth = read_labels(args.labels)
    else:
        human, claude = read_labels(args.human), read_labels(args.claude)
        final = {}
        for p in [x.strip() for x in args.final.split(",") if x.strip()]:
            final.update(read_labels(p))
        truth = {f: human[f] for f in human if f in claude and human[f] == claude[f]}
        truth.update(final)
    files = sorted(f for f in truth if os.path.exists(os.path.join(args.image_dir, f)))
    feats = []
    for i in range(0, len(files), 32):
        x = torch.stack([preprocess(Image.open(os.path.join(args.image_dir, f)).convert("RGB")) for f in files[i:i + 32]]).to(device)
        with torch.no_grad():
            e = clip_model.encode_image(x).float()
        feats.append((e / e.norm(dim=-1, keepdim=True)).cpu())
    uf = torch.cat(feats)
    uy = torch.tensor([names.index(truth[f]) for f in files], dtype=torch.long)
    uv = torch.tensor([SERVICE_VA_ANCHOR[truth[f]] for f in files], dtype=torch.float32)
    print(f"학습용 실사용 {len(ry)}장 | 쿠르님 라벨 평가 이미지 {len(files)}장 | CLIP {args.clip_model}")

    kw = dict(epochs=args.epochs, lr=1e-3, weight_decay=1e-4, hn_pairs=parse_pairs(DEFAULT_HN_PAIRS, names),
              hn_margin=0.1, hn_weight=1.0, seed=0, device=device)
    uw = [float(x) for x in args.user_weights.split(",") if x.strip()]
    if args.save_final and args.final_weight not in uw:
        uw.append(args.final_weight)     # 최종 가중의 교차검증 값도 같이 잰다(온도 보정·보고용)
    res = run_cv(emo, (rf, ry, rv), bal, (uf, uy, uv), anchors, real_w=args.real_weight,
                 user_weights=uw,
                 k=args.folds, repeats=args.repeats, T=args.T, emo_w=emo_w, kw=kw)

    print(f"\n[쿠르님 라벨 기준 정확도 — 학습에 안 쓴 겹 예측, n={res['n']}]")
    base = res["summary"]["baseline"]["mean"]
    for k_, v in res["summary"].items():
        print(f"  {k_:<10} {v['mean']:.1%}  ({v['mean'] - base:+.1%}p vs 기준)   반복별 {[round(x, 3) for x in v['values']]}")
    print("\n감정별 재현율(마지막 반복):")
    for k_, d in res["per_class"].items():
        print(f"  {k_:<10} {d}")
    print("\n참고: 현재 서비스 모델(v2e)의 같은 이미지 정확도는 eval_labelers --final 값(58.0%)입니다. 기준 행은 가산값 없이 새로 학습한 모델이라 조금 다를 수 있습니다.")
    zs = res.pop("_z")
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    with open(os.path.join(ROOT, "results", "cv_user_labels.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print("저장: results\\cv_user_labels.json")

    if args.save_final:
        key = f"A_w{args.final_weight:g}"
        proj, vah = train_final(emo, (rf, ry, rv), bal, (uf, uy, uv), anchors, real_w=args.real_weight,
                                user_w=args.final_weight, emo_w=emo_w, kw=kw)
        vf, vl, _ = get_features("val", args.val_max_per_class, clip_model, preprocess, device, clip_name=args.clip_model)
        yv = to_srv[vl].numpy()
        z_val = cos_logits(proj, vf, anchors, device)
        zc = zs[key]
        yn = uy.numpy()
        T = fit_T([(zc, yn, 1.0)] if args.t_user_only else [(z_val, yv, 0.5), (zc, yn, 0.5)])   # 온도는 학습에 안 쓴 예측으로(기본: EmoSet val + 쿠르님 라벨 교차검증, --t-user-only: 쿠르님 라벨만)
        pc_ = softmax_np(zc / T)
        cv_acc = float((pc_.argmax(1) == yn).mean())
        cv_ece = ece_np(pc_, yn)
        print(f"\n[최종 모델] 쿠르님 라벨 {len(yn)}장 전부 학습, 가중 {args.final_weight:g}")
        print(f"  이미지 온도 T = {T:.4f}")
        print(f"  쿠르님 라벨 교차검증(학습에 안 쓴 겹): 정확도 {cv_acc:.1%}, ECE {cv_ece:.3f}, 평균 확신도 {pc_.max(1).mean():.3f}")
        print(f"  EmoSet val: 정확도 {(softmax_np(z_val / T).argmax(1) == yv).mean():.3f}")
        ck = torch.load(args.base, map_location="cpu") if os.path.exists(args.base) else {}
        if args.clip_model != ck.get("clip_model", "ViT-B/32"):
            ck = {}
        ck.update({
            "clip_model": args.clip_model,
            "projection_state_dict": proj.cpu().state_dict(), "va_head_state_dict": vah.cpu().state_dict(),
            "trained_emotions": list(names), "temperature": float(T),
            "val_acc": float((softmax_np(z_val / T).argmax(1) == yv).mean()),
            "real_images": int(len(ry)), "user_label_images": int(len(yn)), "user_label_weight": args.final_weight,
            "image_class_bias": [0.0] * len(names), "image_class_bias_emotions": list(names),
        })
        ck.pop("temperature_both", None)
        torch.save(ck, args.save_final)
        with open(os.path.join(ROOT, "results", "user_label_eval.json"), "w", encoding="utf-8") as fh:
            json.dump({"accuracy": cv_acc, "n": int(len(yn)), "ece": cv_ece, "weight": args.final_weight,
                       "source": "쿠르님 라벨 교차검증(학습에 안 쓴 겹)", "t_user_only": bool(args.t_user_only)}, fh, ensure_ascii=False, indent=2)
        print(f"저장: {args.save_final}  (기존 emotion_projection.pt 는 그대로), results\\user_label_eval.json")


if __name__ == "__main__":
    main()
