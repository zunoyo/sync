# -*- coding: utf-8 -*-
"""
EmoSet 이미지 → CLIP 임베딩 캐시.

CLIP 백본은 학습 내내 완전히 얼려 있고 전처리에도 랜덤 증강이 없어서, 같은 이미지는 항상 같은
512차원 임베딩이 나온다. 그런데 기존 train/calibrate/baseline 스크립트는 실행할 때마다
  (1) Hugging Face에서 이미지를 다시 받아오고  (2) 매 epoch 마다 CLIP 이미지 인코더를 CPU로 다시 돌렸다.
→ epoch 10번 = 인코딩 10번. 학습에서 시간의 대부분이 이 낭비였다.

이 모듈은 (split, 클래스당 장수, CLIP 모델, 데이터셋) 조합마다 임베딩을 한 번만 계산해서
feature_cache/*.pt 로 저장하고, 이후엔 파일에서 바로 읽는다(이미지 다운로드도 생략).
첫 실행은 예전과 비슷한 시간이 걸리지만, 두 번째부터는 학습 한 번이 분 단위로 끝난다.
(--max-per-class 를 키우면 새 캐시가 따로 만들어진다.)
"""

import os

import torch


def cache_path(cache_dir: str, hf_dataset: str, clip_name: str, split: str, max_per_class) -> str:
    tag = f"{hf_dataset}_{clip_name}_{split}_{max_per_class}".replace("/", "-").replace(" ", "")
    return os.path.join(cache_dir, f"feats_{tag}.pt")


def get_features(split, max_per_class, clip_model, preprocess, device,
                 hf_dataset="Woleek/EmoSet-118K", clip_name="ViT-B/32", cache_dir="feature_cache"):
    """returns (feats[N,512] L2정규화 float32, labels[N] long, va_targets[N,2] float32) — 전부 CPU 텐서"""
    path = cache_path(cache_dir, hf_dataset, clip_name, split, max_per_class)
    if os.path.exists(path):
        d = torch.load(path, map_location="cpu", weights_only=True)
        print(f"[feature_cache] {split}: 캐시 사용 {path} ({len(d['labels'])}장)")
        return d["feats"], d["labels"], d["va"]

    from emoset_dataset import iter_emoset_rows  # 캐시가 있으면 datasets 패키지/네트워크가 아예 필요 없음

    print(f"[feature_cache] {split}: 캐시 없음 → 임베딩 계산 후 {path} 에 저장 (이번 한 번만 오래 걸림)")
    feats, labels, vas = [], [], []
    batch_imgs, batch_y, batch_va = [], [], []
    done = 0

    def flush():
        nonlocal done
        if not batch_imgs:
            return
        with torch.no_grad():
            f = clip_model.encode_image(torch.stack(batch_imgs).to(device)).float()
            f = f / f.norm(dim=-1, keepdim=True)
        feats.append(f.cpu())
        labels.append(torch.tensor(batch_y, dtype=torch.long))
        vas.append(torch.tensor(batch_va, dtype=torch.float32))
        done += len(batch_imgs)
        batch_imgs.clear(); batch_y.clear(); batch_va.clear()
        if done % 640 == 0:
            print(f"  ... {done}장 임베딩 완료")

    # 이미지를 리스트에 쌓지 않고 64장씩 바로 인코딩 → 메모리 일정(수천 장 단위에서도 안전)
    for image, y, v, a in iter_emoset_rows(split, max_per_class, hf_dataset):
        batch_imgs.append(preprocess(image)); batch_y.append(y); batch_va.append([v, a])
        if len(batch_imgs) == 64:
            flush()
    flush()

    out = {"feats": torch.cat(feats), "labels": torch.cat(labels), "va": torch.cat(vas)}
    os.makedirs(cache_dir, exist_ok=True)
    torch.save(out, path)
    return out["feats"], out["labels"], out["va"]
