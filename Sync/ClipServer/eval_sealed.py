# -*- coding: utf-8 -*-
"""
봉인 테스트 세트 평가. 평가한 기록은 results\\sealed_eval_log.json 에 남고, 같은 태그로 두 번 평가하려면 --force 가 필요하다.

  python eval_sealed.py --checkpoint model\\emotion_projection.pt --tag v3_baseline

규칙: 모델 선택·하이퍼파라미터·온도 조정에 이 결과를 쓰지 않는다. 최종 모델은 --tag final 로 딱 한 번만 평가한다.
"""
import argparse
import hashlib
import json
import os
import time

import numpy as np

from eval_harness import bootstrap_ci, ece, metrics, wilson_ci

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--sealed-dir", default=os.path.join(DATA, "sealed_test"))
    ap.add_argument("--labels", default=os.path.join(DATA, "sealed_test_labels.csv"))
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    man_p = os.path.join(DATA, "sealed_manifest.json")
    if not os.path.exists(man_p):
        raise SystemExit("data\\sealed_manifest.json 이 없습니다. 먼저 build_label_pool.py 를 실행하세요.")
    man = json.load(open(man_p, encoding="utf-8"))
    for f, h in man["files"].items():
        p = os.path.join(a.sealed_dir, f)
        if not os.path.exists(p) or hashlib.sha256(open(p, "rb").read()).hexdigest() != h:
            raise SystemExit(f"봉인 파일이 바뀌었거나 없습니다: {f}")
    log_p = os.path.join(ROOT, "results", "sealed_eval_log.json")
    log = json.load(open(log_p, encoding="utf-8")) if os.path.exists(log_p) else []
    if any(r["tag"] == a.tag for r in log) and not a.force:
        raise SystemExit(f"태그 '{a.tag}' 는 이미 평가했습니다({[r['when'] for r in log if r['tag'] == a.tag][0]}). 다시 하려면 --force")

    import torch
    from PIL import Image
    import diagnose_image as di
    from eval_labelers import read_labels
    device = "cuda" if torch.cuda.is_available() else "cpu"
    clip_model, preprocess, names, anchors, proj, T = di.load_service(device, a.checkpoint)
    truth = read_labels(a.labels)
    files = sorted(f for f in truth if os.path.exists(os.path.join(a.sealed_dir, f)))
    y = np.array([names.index(truth[f]) for f in files])
    feats = []
    for i in range(0, len(files), 32):
        x = torch.stack([preprocess(Image.open(os.path.join(a.sealed_dir, f)).convert("RGB")) for f in files[i:i + 32]]).to(device)
        with torch.no_grad():
            e = clip_model.encode_image(x).float()
        feats.append(e / e.norm(dim=-1, keepdim=True))
    P = di.service_probs(torch.cat(feats), anchors, proj, T)
    m = metrics(P, y, names)
    correct = (P.argmax(1) == y)
    top2 = float(np.mean([y[i] in np.argsort(-P[i])[:2] for i in range(len(y))]))
    lo, hi = wilson_ci(int(correct.sum()), len(y))
    blo, bhi = bootstrap_ci(correct)
    print(f"\n[봉인 테스트 — {a.tag}] n={len(y)}  체크포인트 {os.path.basename(a.checkpoint)}")
    print(f"  정확도 {m['acc']:.1%}  (Wilson 95% {lo:.1%}~{hi:.1%}, bootstrap {blo:.1%}~{bhi:.1%})")
    print(f"  top-2 {top2:.1%} | Macro-F1 {m['macro_f1']:.3f} | NLL {m['nll']:.3f} | Brier {m['brier']:.3f} | ECE {m['ece']:.3f} | 평균 확신도 {m['mean_conf']:.3f}")
    print("  감정별 재현율:", " | ".join(f"{k} {v}" for k, v in m["recall"].items()))
    cm = np.array(m["confusion"])
    print("  혼동행렬(행=쿠르님 라벨, 열=예측):")
    print("  " + " " * 11 + "".join(f"{n[:5]:>6}" for n in names))
    for i in range(len(names)):
        if cm[i].sum():
            print(f"  {names[i]:<11}" + "".join(f"{cm[i, j]:>6}" for j in range(len(names))))
    print("  확신도 구간별(화면의 '신뢰도'가 실제 정답률과 맞는지):")
    conf = P.max(1)
    for lo_, hi_ in [(0, .4), (.4, .6), (.6, .8), (.8, 1.01)]:
        s = (conf >= lo_) & (conf < hi_)
        if s.any():
            print(f"    확신도 {lo_:.0%}~{min(hi_, 1):.0%}: {int(s.sum())}장({s.mean():.0%}), 실제 정답률 {correct[s].mean():.1%}, 평균 확신도 {conf[s].mean():.1%}")
    for thr in (0.8,):
        s = conf >= thr
        if s.any():
            lo_, hi_ = wilson_ci(int(correct[s].sum()), int(s.sum()))
            print(f"  확신도 ≥{thr:.0%}만 보면: 커버리지 {s.mean():.0%}, 정답률 {correct[s].mean():.1%} (95% {lo_:.1%}~{hi_:.1%}, n={int(s.sum())})")
    log.append({"tag": a.tag, "when": time.strftime("%Y-%m-%d %H:%M"), "checkpoint": os.path.basename(a.checkpoint), "n": len(y),
                "acc": m["acc"], "wilson95": [lo, hi], "top2": top2, "macro_f1": m["macro_f1"], "ece": m["ece"], "nll": m["nll"], "brier": m["brier"]})
    os.makedirs(os.path.dirname(log_p), exist_ok=True)
    json.dump(log, open(log_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    np.savez(os.path.join(ROOT, "results", f"sealed_preds_{a.tag}.npz"), files=np.array(files), y=y, P=P)
    print(f"\n기록: results\\sealed_eval_log.json ({len(log)}번째 평가). 이 결과로 모델·온도·가중치를 고르지 마세요.")


if __name__ == "__main__":
    main()
