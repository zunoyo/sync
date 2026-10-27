# -*- coding: utf-8 -*-
"""쿠르님 라벨 풀 + 학습 데이터 로딩(ablation_cv.py 와 같은 구성). head_experiments.py 가 사용."""
import os

import torch


def load_pool(args, log=print):
    """args: image_dir, labels, real_dir, real_dir_extra, emoset_class_weight, max_per_class, clip_model.
    반환 dict(emo, real, bal, user, anchors, names, files, emo_w, hn_pairs, kw_common)."""
    import clip
    from PIL import Image
    from eval_labelers import read_labels
    from feature_cache import get_features
    from model.emotion_mapper import EmotionMapper
    from model.emotion_prompts import build_prompt_ensemble_anchors
    from model.emotion_va_map import SERVICE_VA_ANCHOR, TRAINED_SYNC_EMOTIONS
    from train_projection_v2 import DEFAULT_HN_PAIRS, balance_factors, emoset_class_weights, parse_pairs, real_features

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
    truth = read_labels(args.labels)
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
    log(f"학습용 실사용 {len(ry)}장 | 쿠르님 라벨 이미지 {len(files)}장")
    return dict(emo=emo, real=(rf, ry, rv), bal=bal, user=(uf, uy, uv), anchors=anchors, names=names, files=files, emo_w=emo_w,
                hn_pairs=parse_pairs(DEFAULT_HN_PAIRS, names), kw_common=dict(weight_decay=1e-4, hn_margin=0.1, seed=0, device=device))
