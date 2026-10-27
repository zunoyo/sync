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


def fusion_rows(files):
    """eval_fusion.py 결과(step8_fusion.json: 'methods' 키) → 복합 입력 표 행."""
    rows, notes = [], []
    for p in files:
        d = load(p)
        if "methods" not in d:
            continue
        for name, m in d["methods"].items():
            c, a = m.get("conflict_pairs"), m.get("agree_pairs")
            star = " ★" if name == d.get("main") else ""
            rows.append((
                name + star, str(m["n"]),
                _f(m["accuracy"]), _f(m["top2_accuracy"]), _f(m["macro_f1"]),
                _f(m["ece"]), _f(m["brier"]), _f(m["mean_confidence"]),
                f"{_f(c['accuracy'])} (n={c['n']})" if c else "-",
                f"{_f(a['accuracy'])} (n={a['n']})" if a else "-",
            ))
        fq = d.get("conflict_flag", {}).get("flag_vs_kind", {})
        notes.append(
            f"- conflict 플래그: 켜진 쌍 {fq.get('flagged', '-')}개, kind=conflict 대비 정밀도 {_f(fq.get('precision'), 3)} / 재현율 {_f(fq.get('recall'), 3)}"
            f", 수준 분포 {d.get('conflict_flag', {}).get('levels', {})}")
        cv = d.get("temperature_cv")
        if cv:
            notes.append(f"- 온도 보정 교차검증: ECE {_f(cv['ece_before'])} → {_f(cv['ece_cv'])}, Brier {_f(cv['brier_before'])} → {_f(cv['brier_cv'])}")
        if d.get("temperature_both") is not None:
            notes.append(f"- 저장된 temperature_both = {d['temperature_both']:.4f}")
    return rows, notes


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
    f_rows, f_notes = fusion_rows(files)
    if f_rows:
        md += ["\n## 복합 입력 (이미지+텍스트, 사람이 정답을 붙인 짝 데이터)\n",
               table(["방식", "n", "acc", "top-2", "macro-F1", "ECE", "Brier", "평균 확신도", "충돌 쌍 acc", "일치 쌍 acc"], f_rows),
               "\n".join(f_notes) + "\n",
               "\n> early = 예전 방식(임베딩 0.5:0.5 평균 → 이미지용 T), late_wX = 가중 기하평균 후기 융합(X = 이미지 경로 가중치), ★ = 서버 설정. "
               "짝 데이터가 작아 몇 %p 차이는 방향만 본다. 정답은 쌍 전체가 전하는 감정을 사람이 정한 값이다.\n"]
    text = "\n".join(md)
    print(text)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"저장 완료: {args.out}")


if __name__ == "__main__":
    main()
