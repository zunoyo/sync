# -*- coding: utf-8 -*-
"""
Temperature Scaling(Guo et al., 2017)으로 emotion_projection.pt의 confidence를
보정한다.

evaluate_projection.py로 측정한 결과, projection 적용 후 정확도는 크게
올랐지만(40.3%->78.8%) ECE는 오히려 악화됐다(0.2326->0.5943) — 모델이 답은
더 잘 맞히는데, softmax confidence 숫자 자체는 이전보다 못 믿을 만해졌다는
뜻이다(Sync AI 페이지의 골드 신뢰도 게이지가 바로 이 숫자를 씀).

이 스크립트는 단일 스칼라 온도 T를 학습해서 softmax(logits/T)가 같은
val set에서 NLL을 최소화하도록 만든다. T>1이면 confidence를 전반적으로
눌러서(덜 과신하게) 보정한다.

중요: argmax(=분류 결과, primary_emotion)는 절대 바뀌지 않는다. T는 모든
클래스의 logit을 같은 비율로 나누는 것뿐이라 순위를 바꾸지 않고 숫자의
스케일만 조정한다 — 그래서 아래 출력의 "보정 전/후 Accuracy"는 항상 동일해야
정상이다(다르면 코드 어딘가 문제가 있다는 신호).

주의: 여기서 fit하는 T는 evaluate_projection.py와 같은 val set(기본
300장/클래스) 위에서 fit하고, 같은 set으로 ECE를 재측정한다. T가 스칼라
1개뿐이라 오버피팅 위험은 낮지만, 엄밀하게 하려면 --eval-split test로
별도 test split에서 최종 ECE를 한 번 더 확인하는 걸 권장한다(추가 다운로드
필요, 지금은 선택 사항).

실행하면 --checkpoint의 .pt 파일에 "temperature" 키를 추가해서 같은 경로에
덮어쓴다. clip_model.py는 이 키를 읽어서 이미지 분석 경로(has_projection=True)
에서 자동으로 나눠준다 — 서버 코드는 이미 반영돼 있으니 체크포인트만
다시 생성하면 다음 main.py 재시작부터 바로 적용된다.

사용 예:
    python calibrate_temperature.py --checkpoint model/emotion_projection.pt --max-per-class 300
    python calibrate_temperature.py --eval-split test  # (선택) test split로 최종 검증까지
"""

import argparse

import clip
import torch
from sklearn.metrics import accuracy_score

from model.emotion_classifier import EmotionProjection, VAHead
from model.emotion_va_map import TRAINED_SYNC_EMOTIONS
from model.emotion_prompts import build_prompt_ensemble_anchors
from feature_cache import get_features
from evaluate_projection import compute_calibration


def fit_temperature(logits: torch.Tensor, labels: torch.Tensor) -> float:
    """
    NLL을 최소화하는 T를 로그 스케일 그리드에서 탐색한 뒤, 최적점 주변을
    한 번 더 촘촘하게 재탐색해서 정밀화한다.

    (참고: 처음엔 LBFGS로 구현했는데, 여기서 다루는 "logit"이 일반적인
    신경망 logit이 아니라 CLIP 코사인 유사도(대략 0.15~0.35의 아주 좁은
    범위)라서 T=1 근처에서 gradient가 거의 0에 가까워 LBFGS가 초기값
    근처(T=0.93)에서 사실상 멈춰버리는 문제가 있었다 — 실제로는 훨씬
    작은 T(대략 0.03~0.05대)에서 NLL이 크게 더 낮아지는 구간이 존재하는데
    그쪽을 전혀 탐색하지 못했음. 그리드서치는 이 문제 자체가 없다.)
    """
    nll = torch.nn.CrossEntropyLoss()

    def loss_at(t: float) -> float:
        with torch.no_grad():
            return nll(logits / t, labels).item()

    # 1차: 넓은 로그 스케일 그리드 (T=0.001 ~ 10)
    coarse = torch.logspace(-3, 1, steps=161)
    coarse_losses = [loss_at(t.item()) for t in coarse]
    best_t = coarse[int(torch.tensor(coarse_losses).argmin())].item()

    # 2차: 최적점 주변을 선형 스케일로 재탐색해서 정밀화
    lo, hi = best_t * 0.3, best_t * 3.0
    fine = torch.linspace(lo, hi, steps=121)
    fine_losses = [loss_at(t.item()) for t in fine]
    best_t = fine[int(torch.tensor(fine_losses).argmin())].item()

    return best_t


def collect_logits(clip_model, projection, text_anchors, loader, device):
    logits_list, labels_list = [], []
    with torch.no_grad():
        for images, labels, _va in loader:
            images = images.to(device)
            feat = clip_model.encode_image(images).float()
            feat = feat / feat.norm(dim=-1, keepdim=True)
            corrected = projection(feat)
            logits = corrected @ text_anchors.T  # (B, 6) — softmax 전 raw cosine sim
            logits_list.append(logits.cpu())
            labels_list.append(labels)
    return torch.cat(logits_list, dim=0), torch.cat(labels_list, dim=0)


def report(tag, logits, labels, temperature=1.0):
    probs = (logits / temperature).softmax(dim=-1).numpy()
    labels_np = labels.numpy()
    acc = accuracy_score(labels_np, probs.argmax(axis=1))
    ece, brier = compute_calibration(probs, labels_np)
    print(f"{tag:10s} Accuracy={acc:.4f}  ECE={ece:.4f}  Brier={brier:.4f}")
    return acc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="model/emotion_projection.pt")
    parser.add_argument("--clip-model", default="ViT-B/32")
    parser.add_argument("--hf-dataset", default="Woleek/EmoSet-118K")
    parser.add_argument("--max-per-class", type=int, default=300,
                         help="T를 fit할 val set 크기 — evaluate_projection.py와 맞출 것")
    parser.add_argument("--eval-split", default=None, choices=[None, "test"],
                         help="지정하면 val로 T를 fit한 뒤 이 split에서 최종 ECE를 한 번 더 검증")
    parser.add_argument("--output", default=None,
                         help="지정 안 하면 --checkpoint를 그대로 덮어씀")
    args = parser.parse_args()
    output_path = args.output or args.checkpoint

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}")

    clip_model, preprocess = clip.load(args.clip_model, device=device)
    clip_model.eval()
    text_anchors = build_prompt_ensemble_anchors(clip_model, device, TRAINED_SYNC_EMOTIONS)

    ckpt = torch.load(args.checkpoint, map_location=device)
    projection = EmotionProjection(dim=512).to(device)
    projection.load_state_dict(ckpt["projection_state_dict"])
    projection.eval()

    vf, vy, _ = get_features("val", args.max_per_class, clip_model, preprocess, device,
                             args.hf_dataset, args.clip_model)
    with torch.no_grad():
        logits_val = (projection(vf.to(device)) @ text_anchors.T).cpu()
    labels_val = vy

    print(f"\n=== T 학습 전 (val, {len(labels_val)}장) ===")
    report("보정 전", logits_val, labels_val, temperature=1.0)

    temperature = fit_temperature(logits_val.clone(), labels_val)

    print(f"\n학습된 Temperature: T={temperature:.4f}")
    print(f"\n=== T 학습 후 (val, 같은 데이터 — fit에 쓴 set이라 참고용) ===")
    acc_after = report("보정 후", logits_val, labels_val, temperature=temperature)
    print("(Accuracy가 보정 전후 동일해야 정상 — T는 argmax를 바꾸지 않고 confidence")
    print(" 스케일만 조정함. 다르면 코드에 문제가 있다는 신호)")

    if args.eval_split == "test":
        print(f"\n=== 최종 검증 (test split — T를 학습할 때 쓰지 않은 데이터) ===")
        tf, ty, _ = get_features("test", args.max_per_class, clip_model, preprocess, device,
                                 args.hf_dataset, args.clip_model)
        with torch.no_grad():
            logits_test = (projection(tf.to(device)) @ text_anchors.T).cpu()
        labels_test = ty
        report("보정 전", logits_test, labels_test, temperature=1.0)
        report("보정 후", logits_test, labels_test, temperature=temperature)

    ckpt["temperature"] = temperature
    torch.save(ckpt, output_path)
    print(f"\n체크포인트에 temperature 저장 완료: {output_path}")
    print("main.py(CLIP 서버)를 재시작하면 다음 요청부터 자동으로 적용됩니다.")


if __name__ == "__main__":
    main()
