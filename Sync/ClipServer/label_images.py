# -*- coding: utf-8 -*-
"""
실사용 이미지 라벨링 도구 — 폴더에 모은 이미지(앨범 커버·사진 등)에 8감정 중 하나를 붙여 감정별 폴더로 정리한다.

1) 라벨링 화면 만들기
     python label_images.py --src C:\\경로\\모은이미지폴더
   → data/image_labeling.html 생성. 브라우저로 열어 이미지마다 감정 버튼(또는 숫자키 1~8, 0=건너뛰기)을 누른다.
   → 끝나면 '라벨 CSV 내보내기'로 받은 image_labels.csv 를 data/ 에 둔다.

2) 감정별 폴더로 정리
     python label_images.py --src C:\\경로\\모은이미지폴더 --apply data\\image_labels.csv
   → data/real_images/<감정>/ 에 복사(원본은 그대로). 이 폴더를 그대로
     python diagnose_image.py --image-dir data/real_images   로 평가할 수 있다.

라벨 기준: 그 이미지를 보고 '어울리는 노래의 감정'을 고른다. 애매하면 0(건너뛰기) — 정리·평가에서 빠진다.
"""
import argparse
import csv
import json
import os
import shutil
from pathlib import Path

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]
KO = {"happy": "행복", "sad": "슬픔", "calm": "평온", "energetic": "활기", "romantic": "로맨틱", "melancholy": "우울/쓸쓸", "angry": "분노", "dreamy": "몽환"}
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


# ───────────────── 순수 함수(테스트 가능) ─────────────────
def list_images(src: str):
    return sorted(f for f in os.listdir(src) if f.lower().endswith(EXTS))


def read_labels(path: str):
    """CSV(file,emotion) → {file: emotion}. 알 수 없는 감정/빈 값은 제외."""
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            if (r.get("emotion") or "").strip() in EMOTIONS:
                out[r["file"]] = r["emotion"].strip()
    return out


def apply_labels(src: str, labels: dict, dst: str):
    """라벨된 이미지를 dst/<감정>/ 으로 복사. 같은 이름이 있으면 건너뜀(재실행 안전). 감정별 장수 반환."""
    counts = {e: 0 for e in EMOTIONS}
    for name, emo in sorted(labels.items()):
        s = os.path.join(src, name)
        if not os.path.isfile(s):
            continue
        d = os.path.join(dst, emo)
        os.makedirs(d, exist_ok=True)
        t = os.path.join(d, name)
        if not os.path.exists(t):
            shutil.copy2(s, t)
        counts[emo] += 1
    return counts


# ── 감정 정의 카드(라벨링 화면에 함께 띄우는 기준). 카드 문서와 같은 내용. ──
CARD_ORDER = "극성(밝은가·어두운가) → 활성도(끌어올리는가·가라앉히는가) → 세부 톤(아래 구분 질문)"
CARD_ROWS = [
    ("happy",      "밝고 따뜻한 기쁨, 미소",            "웃는 얼굴, 햇살, 생일·소풍, 따뜻한 색",        "속도감·흥분이 주인공이면 energetic"),
    ("energetic",  "들뜸, 에너지, 흥분",                "공연·군중, 춤, 운동, 네온·강한 대비, 움직임",  "분노·위협이 느껴지면 angry, 잔잔한 미소면 happy"),
    ("calm",       "현실적인 고요·평온·정돈",           "잔잔한 물, 책·차, 선명한 풍경, 자연광",        "빛이 비현실적이거나 흐릿하면 dreamy, 쓸쓸하면 melancholy"),
    ("romantic",   "설렘, 애정, 두 사람",               "커플, 꽃, 촛불, 노을 데이트, 핑크·레드 톤",    "사람·애정 요소 없이 예쁘기만 하면 calm/dreamy"),
    ("dreamy",     "몽환, 비현실, 떠 있는 느낌",        "파스텔, 안개, 빛 번짐(보케), 우주·별, 초현실",  "선명하고 현실적이면 calm, 어둡고 처지면 melancholy"),
    ("melancholy", "아련함·그리움, 조용하고 아름다운 슬픔", "저채도, 흐린 하늘, 빈 공간, 비 오는 창, 역광", "눈물·상실이 또렷하면 sad, 긴장·위협이면 angry"),
    ("sad",        "상실, 고통, 비탄",                  "우는 얼굴, 장례·이별, 무너진 모습, 시든 꽃",   "슬픔이 아름답고 조용하면 melancholy"),
    ("angry",      "분노, 긴장, 위협, 제어 안 되는 힘",  "불·폭발, 폭풍우, 강렬한 붉은·검은 톤, 일그러진 얼굴", "어둡지만 조용하고 내려앉으면 melancholy"),
]
# 위에서부터 차례로 적용한다(두 질문에 다 걸리면 위 규칙이 이긴다).
CARD_PAIRS = [
    ("힘·움직임·위협(불, 폭풍, 강한 붉은색, 일그러진 얼굴)이 있는가?", "angry", "melancholy"),
    ("눈물·이별·상실이 직접 보이거나, 보면 가슴이 아픈가?",            "sad",   "melancholy"),
    ("두 사람·애정의 대상(커플, 꽃, 촛불)이 중심인가?",                "romantic", "calm / dreamy / melancholy"),
    ("사람의 미소·축하·놀이가 중심인가?",                              "happy", "calm"),
    ("분위기가 '신나서 몸이 움직이는' 쪽인가(군중, 춤, 속도감)?",      "energetic", "happy"),
    ("빛·색이 현실에서 보기 힘든가(파스텔, 번짐, 안개, 초현실)?",      "dreamy", "calm"),
    ("조용함이 쓸쓸하고 허전한가(흐린 하늘, 빈 공간, 저채도)?",        "melancholy", "calm"),
]


def rules_html() -> str:
    rows = "".join(
        f"<tr><td><b>{k}</b> {KO.get(k, k)}</td><td>{feel}</td><td>{cue}</td><td>{alt}</td></tr>"
        for k, feel, cue, alt in CARD_ROWS)
    pairs = "".join(
        f"<li>{q} <b>예 → {y}</b> / 아니오 → {n}</li>" for q, y, n in CARD_PAIRS)
    return (
        '<details class="rules" id="rules"><summary>감정 정의 카드 — 헷갈리면 펼쳐 보세요 (판단 순서: 극성 → 활성도 → 세부 톤)</summary>'
        '<p class="ro">질문은 하나: <b>“이 이미지를 보며 틀고 싶은 음악은 어떤 감정인가?”</b>'
        ' 이미지 속 사람의 감정이 아니라, 보는 사람에게 일어나는 분위기를 고릅니다.</p>'
        f'<p class="ro">판단 순서: {CARD_ORDER}</p>'
        f'<table><thead><tr><th>감정</th><th>핵심 느낌</th><th>시각 단서</th><th>이런 경우는 다른 감정</th></tr></thead><tbody>{rows}</tbody></table>'
        '<p class="ro">헷갈릴 때는 위에서부터 차례로:</p>'
        f'<ol class="pairs">{pairs}</ol>'
        '<p class="ro">어느 감정도 아니면 0(건너뛰기). 억지로 고른 라벨은 모델에 노이즈가 됩니다.</p>'
        '</details>')


def labeling_html(src: str, files) -> str:
    items = [{"file": f, "img": Path(os.path.abspath(os.path.join(src, f))).as_uri()} for f in files]
    return (HTML.replace("__ITEMS__", json.dumps(items, ensure_ascii=False))
                .replace("__EMO__", json.dumps([[e, KO[e]] for e in EMOTIONS], ensure_ascii=False))
                .replace("__RULES__", rules_html()))


HTML = """<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>이미지 라벨링</title>
<style>
:root{--bg:#14090f;--card:#22121b;--fg:#f5eef0;--mut:#a8959e;--acc:#d9c08f;--line:#3a2530}
@media(prefers-color-scheme:light){:root{--bg:#f7f2f3;--card:#fff;--fg:#26151c;--mut:#7a6670;--acc:#8a6d3a;--line:#e2d6da}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,'Noto Sans KR',sans-serif}
main{max-width:760px;margin:0 auto;padding:20px 16px 40px}
.top{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px;color:var(--mut);font-size:14px}
.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-bottom:14px}.bar>i{display:block;height:100%;background:var(--acc);width:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
img{display:block;max-width:100%;max-height:440px;margin:0 auto 14px;border-radius:12px}
.hint{text-align:center;color:var(--mut);font-size:13px;margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
button{font:inherit;color:var(--fg);background:transparent;border:1px solid var(--line);border-radius:10px;padding:10px 6px;cursor:pointer}
button:hover{border-color:var(--acc)}button.on{background:var(--acc);color:#1a0f14;border-color:var(--acc);font-weight:700}
.nav{display:flex;gap:8px;margin-top:12px}.nav button{flex:1}
.cnt{margin-top:14px;color:var(--mut);font-size:13px;text-align:center}
@media(max-width:520px){.grid{grid-template-columns:repeat(2,1fr)}}
.rules{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 14px;margin-bottom:14px;font-size:13px}
.rules summary{cursor:pointer;font-weight:700;color:var(--acc)}
.rules table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
.rules th,.rules td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}
.rules th{color:var(--mut);font-weight:600}
.rules .ro{color:var(--mut);margin:6px 0}
.rules ol.pairs{margin:6px 0;padding-left:20px}.rules ol.pairs li{margin:3px 0}
</style>
<main>
<div class="top"><span id="pos"></span><span id="name"></span></div>
<div class="bar"><i id="bar"></i></div>
__RULES__
<div class="card">
  <img id="img" alt="">
  <p class="hint">이 이미지에 어울리는 <b>노래의 감정</b>을 고르세요. 키보드 1~8 = 감정, 0 = 애매함(건너뛰기), ← → 이동</p>
  <div class="grid" id="grid"></div>
  <div class="nav"><button id="prev">← 이전</button><button id="skip">0 · 건너뛰기</button><button id="next">다음 →</button></div>
</div>
<p class="cnt" id="cnt"></p>
<p class="cnt"><button id="export" style="padding:10px 18px">라벨 CSV 내보내기</button><br><span id="msg"></span></p>
</main>
<script>
const ITEMS=__ITEMS__, EMO=__EMO__, KEY='image_labels_v1:'+ITEMS.length+':'+(ITEMS[0]?ITEMS[0].file:'');
let i=0, L={};
try{L=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const $=id=>document.getElementById(id);
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(L))}catch(e){}};
function go(d){const n=i+d; if(n>=0&&n<ITEMS.length){i=n;show()}}
function pick(k){const f=ITEMS[i].file; if(k===''){delete L[f]} else {L[f]=k} save(); show(); setTimeout(()=>go(1),160)}
function show(){
  const it=ITEMS[i], cur=L[it.file];
  $('img').src=it.img; $('name').textContent=it.file;
  const n=Object.keys(L).length;
  $('pos').textContent=(i+1)+' / '+ITEMS.length+'  ·  라벨 '+n; $('bar').style.width=(n/ITEMS.length*100)+'%';
  $('grid').innerHTML='';
  EMO.forEach(([k,ko],j)=>{const b=document.createElement('button');b.textContent=(j+1)+' · '+ko+' ('+k+')';
    if(cur===k)b.classList.add('on'); b.onclick=()=>pick(k); $('grid').appendChild(b)});
  const c={}; Object.values(L).forEach(v=>c[v]=(c[v]||0)+1);
  $('cnt').textContent=EMO.map(([k,ko])=>ko+' '+(c[k]||0)).join(' · ');
}
const R=$('rules');
if(R){ try{R.open=localStorage.getItem('rules_open')==='1'}catch(e){}
       R.addEventListener('toggle',()=>{try{localStorage.setItem('rules_open',R.open?'1':'0')}catch(e){}}); }
$('prev').onclick=()=>go(-1); $('next').onclick=()=>go(1); $('skip').onclick=()=>pick('');
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft')go(-1); else if(e.key==='ArrowRight')go(1);
  else if(e.key==='0')pick(''); else if(e.key>='1'&&e.key<='8')pick(EMO[+e.key-1][0]);});
$('export').onclick=()=>{
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const lines=['file,emotion'].concat(ITEMS.filter(it=>L[it.file]).map(it=>q(it.file)+','+q(L[it.file])));
  const blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='image_labels.csv';a.click();
  $('msg').textContent=(lines.length-1)+'장 라벨됨 — 받은 image_labels.csv 를 ClipServer/data/ 에 두고 --apply 로 정리하세요';
};
show();
</script></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="이미지를 모아 둔 폴더(하위 폴더 없이 파일만)")
    ap.add_argument("--apply", default=None, help="내보낸 image_labels.csv — 감정별 폴더로 복사")
    ap.add_argument("--dst", default=os.path.join(DATA, "real_images"))
    args = ap.parse_args()
    if not os.path.isdir(args.src):
        raise SystemExit(f"폴더가 없습니다: {args.src}")

    if args.apply:
        labels = read_labels(args.apply)
        if not labels:
            raise SystemExit("읽을 수 있는 라벨이 없습니다(CSV 형식: file,emotion)")
        counts = apply_labels(args.src, labels, args.dst)
        print(f"\n정리 완료 → {args.dst}")
        for e in EMOTIONS:
            print(f"  {e:<11}{counts[e]:>4}장")
        print(f"\n평가: python diagnose_image.py --image-dir \"{args.dst}\"")
        return

    files = list_images(args.src)
    if not files:
        raise SystemExit(f"이미지가 없습니다({', '.join(EXTS)}): {args.src}")
    os.makedirs(DATA, exist_ok=True)
    out = os.path.join(DATA, "image_labeling.html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(labeling_html(args.src, files))
    print(f"이미지 {len(files)}장 → 라벨링 화면: {out}\n브라우저로 열어 라벨링 → '라벨 CSV 내보내기' → 받은 파일을 data/ 에 두고\n"
          f"  python label_images.py --src \"{args.src}\" --apply data\\image_labels.csv")


if __name__ == "__main__":
    main()
