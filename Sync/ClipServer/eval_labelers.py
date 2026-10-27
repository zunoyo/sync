# -*- coding: utf-8 -*-
"""
라벨러에 따라 이미지 정확도가 어떻게 달라지는지 본다 — "정답"이 사람마다 갈리는 감정(melancholy·calm·sad·dreamy)을 가려내기 위한 평가.

  python eval_labelers.py --image-dir data\\collected_images --human data\\image_labels.csv --claude data\\ai_labels_eval.csv

같은 이미지를 사람(A)과 Claude(B)가 모두 라벨한 것만 대상으로, 서비스 모델의 1순위 예측을
  1) 사람 라벨 기준   2) Claude 라벨 기준   3) 두 사람이 일치한 이미지만(= 정답이 확실한 이미지)
  4) 둘 중 아무 라벨이나 맞으면 인정   으로 각각 잰다. 그리고 모델-사람, 모델-Claude 일치율을
  사람-Claude 일치율과 나란히 놓는다. 모델과 사람의 일치율이 사람-Claude 일치율 수준이면 '정답이 갈리는 만큼'
  이미 맞힌 것이라 정확도를 더 올리기 어렵다(라벨 쪽 한계).
결과: 화면 + results/labeler_eval.json + results/labeler_eval_detail.csv(이미지별 예측·두 라벨).
모델 파일은 건드리지 않는다.
"""
import argparse
import csv
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]


def read_labels(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return {r["file"]: r["emotion"].strip() for r in csv.DictReader(fh) if (r.get("emotion") or "").strip() in EMOTIONS}


def rate(hit, n):
    return round(hit / n, 4) if n else None


def summarize(pred: dict, human: dict, claude: dict) -> dict:
    """pred/human/claude: 파일명 → 감정. 셋 다 있는 파일만 대상."""
    files = sorted(set(pred) & set(human) & set(claude))
    n = len(files)
    agreed = [f for f in files if human[f] == claude[f]]
    out = {
        "n": n,
        "human_claude_agree": rate(len(agreed), n),
        "model_human_agree": rate(sum(pred[f] == human[f] for f in files), n),
        "model_claude_agree": rate(sum(pred[f] == claude[f] for f in files), n),
        "acc_on_agreed": rate(sum(pred[f] == human[f] for f in agreed), len(agreed)),
        "n_agreed": len(agreed),
        "acc_accept_either": rate(sum(pred[f] in (human[f], claude[f]) for f in files), n),
        "acc_on_disagreed_accept_either": None,
    }
    dis = [f for f in files if human[f] != claude[f]]
    out["n_disagreed"] = len(dis)
    out["acc_on_disagreed_accept_either"] = rate(sum(pred[f] in (human[f], claude[f]) for f in dis), len(dis))
    per = {}
    for e in EMOTIONS:
        ag = [f for f in agreed if human[f] == e]
        if ag:
            per[e] = {"n_agreed": len(ag), "recall": rate(sum(pred[f] == e for f in ag), len(ag))}
    out["per_class_on_agreed"] = per
    out["disagree_pairs"] = {f"{a}/{b}": c for (a, b), c in
                             Counter((human[f], claude[f]) for f in dis).most_common(10)}
    out["miss_pairs_on_agreed"] = {f"{a}→{b}": c for (a, b), c in
                                   Counter((human[f], pred[f]) for f in agreed if pred[f] != human[f]).most_common(10)}
    return out


def predict_folder(image_dir, ckpt):
    import numpy as np
    import torch
    from PIL import Image
    from diagnose_image import load_service, service_probs
    device = "cuda" if torch.cuda.is_available() else "cpu"
    clip_model, preprocess, names, anchors, proj, T = load_service(device, ckpt)
    exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
    files = sorted(f for f in os.listdir(image_dir) if f.lower().endswith(exts))
    pred, top2 = {}, {}
    for i in range(0, len(files), 32):
        chunk = files[i:i + 32]
        x = torch.stack([preprocess(Image.open(os.path.join(image_dir, f)).convert("RGB")) for f in chunk]).to(device)
        with torch.no_grad():
            f = clip_model.encode_image(x).float()
            f = f / f.norm(dim=-1, keepdim=True)
        p = service_probs(f, anchors, proj, T)
        for fn, row in zip(chunk, p):
            order = np.argsort(-row)
            pred[fn] = names[int(order[0])]
            top2[fn] = names[int(order[1])]
    return pred, top2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image-dir", required=True, help="평가용 이미지 폴더(파일이 한 폴더에 있는 data\\collected_images)")
    ap.add_argument("--human", required=True, help="사람이 붙인 라벨 CSV(file,emotion), 예: data\\image_labels.csv")
    ap.add_argument("--claude", required=True, help="Claude 가 붙인 라벨 CSV, 예: data\\ai_labels_eval.csv")
    ap.add_argument("--checkpoint", default=None, help="기본 model/emotion_projection.pt")
    ap.add_argument("--final", default=None, help="review_disagreements.py 로 정한 최종 라벨 CSV(쉼표로 여러 개: data\\eval_final_labels.csv,data\\eval_final_labels_rest.csv). 일치한 이미지는 그 라벨, 나머지는 이 라벨로 정확도를 잰다")
    args = ap.parse_args()

    human, claude = read_labels(args.human), read_labels(args.claude)
    pred, top2 = predict_folder(args.image_dir, args.checkpoint)
    r = summarize(pred, human, claude)
    if not r["n"]:
        raise SystemExit("세 가지(예측·사람 라벨·Claude 라벨)가 모두 있는 이미지가 없습니다. 파일명을 확인하세요.")
    print(f"\n사람·Claude 둘 다 라벨한 이미지 {r['n']}장")
    print(f"  사람-Claude 일치율      {r['human_claude_agree']:.1%}   ← 정답이 갈리는 정도(기준선)")
    print(f"  모델-사람 일치율        {r['model_human_agree']:.1%}")
    print(f"  모델-Claude 일치율      {r['model_claude_agree']:.1%}")
    print(f"  두 라벨러가 일치한 {r['n_agreed']}장에서 정확도   {r['acc_on_agreed']:.1%}   ← 정답이 확실한 이미지")
    print(f"  둘 중 하나라도 맞으면 인정     {r['acc_accept_either']:.1%}")
    if r["n_disagreed"]:
        print(f"  라벨이 갈린 {r['n_disagreed']}장에서(둘 중 하나 인정) {r['acc_on_disagreed_accept_either']:.1%}")
    print("\n일치한 이미지의 감정별 재현율:")
    for e, v in r["per_class_on_agreed"].items():
        print(f"  {e:<11} n={v['n_agreed']:<3} recall={v['recall']}")
    print("\n라벨러가 자주 갈린 쌍 (사람/Claude):", r["disagree_pairs"])
    print("일치한 이미지에서 모델이 틀린 쌍 (정답→예측):", r["miss_pairs_on_agreed"])

    if args.final:
        final = {}
        for path in [x.strip() for x in args.final.split(",") if x.strip()]:
            final.update(read_labels(path))
        truth = {f: human[f] for f in human if f in claude and human[f] == claude[f]}
        truth.update({f: final[f] for f in final})          # 쿠르님이 정한 라벨이 우선(갈린 이미지·사람 라벨 없던 이미지)
        files = sorted(set(truth) & set(pred))
        hit = [f for f in files if pred[f] == truth[f]]
        n_agreed = sum(1 for f in files if f in human and f in claude and human[f] == claude[f] and f not in final)
        print(f"\n[최종 라벨 기준] {len(files)}장 (두 라벨러 일치 {n_agreed}장 + 쿠르님이 정한 {len(files) - n_agreed}장)")
        print(f"  정확도 {len(hit)}/{len(files)} = {len(hit) / max(len(files), 1):.1%}")
        mine = [f for f in files if f in final]
        cl = [f for f in mine if f in claude]
        if cl:
            print(f"  쿠르님 라벨 vs Claude 라벨 일치 {sum(final[f] == claude[f] for f in cl)}/{len(cl)}장")
        print(f"  쿠르님이 정한 {len(mine)}장 중 모델 정답 {sum(pred[f] == truth[f] for f in mine)}장")
        print("  감정별 재현율:", {e: f"{sum(pred[f] == e for f in files if truth[f] == e)}/{sum(truth[f] == e for f in files)}" for e in EMOTIONS if any(truth[f] == e for f in files)})
        print("  틀린 쌍(정답→예측):", dict(Counter((truth[f], pred[f]) for f in files if pred[f] != truth[f]).most_common(8)))
        r["final"] = {"n": len(files), "acc": round(len(hit) / max(len(files), 1), 4)}
        os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
        with open(os.path.join(ROOT, "results", "final_eval_detail.csv"), "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.writer(fh); w.writerow(["file", "final", "model_top1"])
            for f in files:
                w.writerow([f, truth[f], pred[f]])

    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    with open(os.path.join(ROOT, "results", "labeler_eval.json"), "w", encoding="utf-8") as fh:
        json.dump(r, fh, ensure_ascii=False, indent=2)
    with open(os.path.join(ROOT, "results", "labeler_eval_detail.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "human", "claude", "model_top1", "model_top2"])
        for f in sorted(set(pred) & set(human) & set(claude)):
            w.writerow([f, human[f], claude[f], pred[f], top2[f]])
    print("\n저장: results\\labeler_eval.json, results\\labeler_eval_detail.csv")


if __name__ == "__main__":
    main()
