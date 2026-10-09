# -*- coding: utf-8 -*-
"""
[Step 5] results/*.json 을 한 장의 표로 모은다 (torch 불필요, 보고서/문서용).

- 이미지 스냅샷(baseline_snapshot.py 결과: "projection" 키)  → 이미지 표
- 텍스트 평가(calibrate_text_temperature.py 결과: "all" 키)  → 텍스트 표
결과는 콘솔에 출력하고 results/summary.md 로도 저장한다.

사용:
    python report_metrics.py
    python report_metrics.py --dir results --out results/summary.md

주의: 파일마다 평가 세트(split, 샘플 수)가 다르다. 표의 'split/n' 열이 다른 행끼리는 직접 비교하지 말 것.
      '(구)' 표시는 top-2 같은 최신 지표가 없던 시절의 결과라는 뜻이다.
"""

import argparse
import glob
import json
import os


def _f(v, nd=4):
    return "-" if v is None else f"{v:.{nd}f}"


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def image_rows(files):
    rows = []
    for p in files:
        d = load(p)
        if "projection" not in d:
            continue
        s = d["projection"]
        tag = d.get("tag", os.path.basename(p)[:-5])
        old = "top2_accuracy" not in s
        rows.append((
            tag + (" (구)" if old else ""),
            f"{d.get('split', 'val')}/{s['n_samples']}",
            _f(s["accuracy"]), _f(s.get("top2_accuracy")), _f(s["macro_f1"]),
            _f(s["ece_with_T"]), _f(s["brier_with_T"]), str(s["confusion_pairs_total"]),
        ))
    return rows


def text_rows(files):
    rows = []
    for p in files:
        d = load(p)
        if "all" not in d:
            continue
        a = d["all"]["text_T"]
        old = "top2_accuracy" not in a
        r = d.get("route_accuracy", {})
        route = " / ".join(
            f"{k} {v['correct']}/{v['n']}" for k, v in r.items() if v.get("n")
        )
        rows.append((
            os.path.basename(p)[:-5] + (" (구)" if old else ""),
            str(a["n_samples"]),
            _f(a["accuracy"]), _f(a.get("top2_accuracy")), _f(a["macro_f1"]),
            _f(a["ece_with_T"]), _f(a["brier_with_T"]), route or "-",
        ))
    return rows


def table(headers, rows):
    if not rows:
        return "(해당 결과 없음)\n"
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="results")
    ap.add_argument("--out", default="results/summary.md")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, "*.json")))
    files = [f for f in files if os.path.abspath(f) != os.path.abspath(args.out)]
    if not files:
        print(f"{args.dir}/ 에 json 이 없습니다.")
        return

    md = ["# CLIP 고도화 결과 요약\n",
          "## 이미지 (프로젝션, 서비스 경로 = 온도 적용)\n",
          table(["tag", "split/n", "acc", "top-2", "macro-F1", "ECE", "Brier", "헷갈림쌍"], image_rows(files)),
          "\n## 텍스트 (키워드/분류기 → CLIP, 텍스트 전용 온도)\n",
          table(["file", "n", "acc", "top-2", "macro-F1", "ECE", "Brier", "경로별 정답"], text_rows(files)),
          "\n> 텍스트 ECE/Brier 는 같은 문장으로 맞춘 T 로 계산한 값이라 낙관적이다. acc/macro-F1 은 T 와 무관하다.\n"]
    text = "\n".join(md)
    print(text)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"저장 완료: {args.out}")


if __name__ == "__main__":
    main()
