# -*- coding: utf-8 -*-
"""
화면의 '모델 정확도'에 쓸 입력 종류별 실측 정확도를 results/*.json 에서 모아 model/measured_accuracy.json 으로 만든다.

  텍스트  results/step9_text_head.json  → eval.fresh2.blend.accuracy   (학습·선택에 안 쓴 봉인 평가셋, 합성 경로)
  이미지  results/image_diag.json       → real_images.acc               (실사진 평가셋, 서비스 방식 8앵커)
  복합    results/step8_fusion.json     → methods[main].accuracy        (이미지+텍스트 100쌍, 후기 융합)

주의
  - 이미지/복합 값은 현재 서비스 체크포인트(model/emotion_projection.pt)로 잰 결과여야 한다. 먼저
      python diagnose_image.py --image-dir data\\real_images_ai
      python eval_fusion.py --grid --cv --w 0.1
    를 서비스 모델 기준으로 다시 돌린 뒤 이 스크립트를 실행할 것(다른 체크포인트로 돌린 결과가 남아 있을 수 있다).
  - 복합 100쌍은 일부러 이미지·텍스트가 충돌하게 만든 쌍이 70%라 '평소'보다 낮게 나오는 평가셋이다.
    --both text|image 로 바꾸면 복합 입력에도 해당 단일 경로 값을 표시한다.
  - 평가 문장·이미지는 작성자가 직접 라벨링한 소규모 세트라 ±몇 %p 는 잡음이다(n 도 같이 기록).

  python update_measured_accuracy.py            # 기본(복합=융합 실측)
  python update_measured_accuracy.py --both image
"""
import argparse
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    p = os.path.join(ROOT, "results", name)
    if not os.path.exists(p):
        print(f"(없음) results/{name}")
        return None
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def collect(both="fusion", image_source="claude", sealed_tag="v4"):
    out = {}
    d = _load("step9_text_head.json")
    if d and "fresh2" in d.get("eval", {}):
        e = d["eval"]["fresh2"]["blend"]
        out["text"] = {"accuracy": e["accuracy"], "n": e["n"], "source": "step9_text_head.json eval.fresh2.blend"}
    d = _load("image_diag.json")
    if d and "real_images" in d:
        r = d["real_images"]
        out["image"] = {"accuracy": r["acc"], "n": r.get("n"), "source": "image_diag.json real_images (서비스 방식 8앵커)"}
    if image_source == "user":
        u = _load("user_label_eval.json")
        if u:
            out["image"] = {"accuracy": u["accuracy"], "n": u["n"], "source": "user_label_eval.json " + u.get("source", "")}
    if image_source == "sealed":
        lg = _load("sealed_eval_log.json")
        hit = [r for r in (lg or []) if r["tag"] == sealed_tag]
        if hit:
            r = hit[-1]
            lo, hi = r["wilson95"]
            out["image"] = {"accuracy": r["acc"], "n": r["n"],
                            "source": f"봉인 테스트(학습·선택에 안 쓴 새 이미지) {r['checkpoint']} 95% 구간 {lo:.1%}~{hi:.1%}",
                            "ci95": [lo, hi]}
        else:
            print(f"(없음) sealed_eval_log.json 에 태그 '{sealed_tag}' 평가가 없습니다")
    d = _load("step8_fusion.json")
    if d and "methods" in d:
        m = d["methods"][d.get("main", "late_w0.10")]
        out["fusion"] = {"accuracy": m["accuracy"], "n": m["n"], "source": f"step8_fusion.json {d.get('main')} (충돌쌍 70%)"}
    if both == "fusion" and "fusion" in out:
        out["both"] = out["fusion"]
    elif both in ("text", "image") and both in out:
        out["both"] = dict(out[both], source=out[both]["source"] + " (복합 입력에도 단일 경로 값 표시)")
    out.pop("fusion", None)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--both", default="fusion", choices=["fusion", "text", "image"])
    ap.add_argument("--image-source", default="claude", choices=["claude", "user", "sealed"],
                    help="user = cv_user_labels.py --save-final 이 만든 results/user_label_eval.json(쿠르님 라벨 교차검증) 값을 이미지 정확도로 표시")
    ap.add_argument("--sealed-tag", default="v4", help="--image-source sealed 일 때 eval_sealed.py --tag 값")
    ap.add_argument("--out", default=os.path.join(ROOT, "model", "measured_accuracy.json"))
    args = ap.parse_args()
    res = collect(args.both, args.image_source, args.sealed_tag)
    if not res:
        raise SystemExit("읽을 결과가 없습니다 — results/ 의 step9_text_head.json, image_diag.json, step8_fusion.json 확인")
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)
    print("저장:", args.out)
    for k, v in res.items():
        print(f"  {k:<6} {v['accuracy']:.3f} (n={v['n']})  ← {v['source']}")
    print("서버를 재시작하면 화면의 '모델 정확도'에 반영됩니다.")


if __name__ == "__main__":
    main()
