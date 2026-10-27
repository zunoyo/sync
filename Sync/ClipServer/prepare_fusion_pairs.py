# -*- coding: utf-8 -*-
"""
복합 입력 평가 준비 — 이미지 자동 배정 + 라벨링 화면 생성.

EmoSet 은 Hugging Face 에서 스트리밍으로만 받기 때문에 로컬에 '폴더'가 없다. 이 스크립트가
  1) data/fusion_pairs_template.csv 의 image_hint 마다 EmoSet 의 해당 감정 이미지를 받아 data/fusion_images/<감정>/NNN.jpg 로 저장하고
     (쌍마다 서로 다른 이미지, 기본은 val 이 아닌 test split — 프로젝션 학습(train)에 안 쓰인 이미지)
  2) image_path 가 채워진 data/fusion_pairs.csv 를 만들고(true_emotion 은 비워 둠)
  3) 사람이 이미지+문장만 보고 정답을 고르는 data/fusion_labeling.html 을 만든다.
     (라벨링이 text_label/image_hint 에 끌리지 않도록 화면에는 이미지와 문장만 보여 준다)

사용
  python prepare_fusion_pairs.py                 # test split 에서 이미지 배정 (처음 한 번, 인터넷 필요)
  # → data/fusion_labeling.html 을 브라우저로 열어 100쌍 라벨링 → 'CSV 내보내기' → 받은 파일을 data/fusion_pairs.csv 로 덮어쓰기
  python eval_fusion.py --grid --cv

이미 data/fusion_pairs.csv 가 있으면(라벨링 중일 수 있음) 덮어쓰지 않는다. 다시 만들려면 --force.
"""
import argparse
import csv
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
EMOTIONS = ["happy", "sad", "calm", "energetic", "romantic", "melancholy", "angry", "dreamy"]
KO = {"happy": "행복", "sad": "슬픔", "calm": "평온", "energetic": "활기", "romantic": "로맨틱", "melancholy": "우울/쓸쓸", "angry": "분노", "dreamy": "몽환"}


# ───────────────── 순수 함수(테스트 가능) ─────────────────
def hint_class(hint: str) -> str:
    """'sad (EmoSet: sadness)' → 'sad'"""
    return hint.split()[0].strip()


def need_per_class(rows) -> Counter:
    return Counter(hint_class(r["image_hint"]) for r in rows)


def assign_images(rows, saved: dict):
    """saved: {감정: [상대경로,...]} — 행마다 해당 감정의 다음 이미지를 하나씩 배정(중복 없음)."""
    used = Counter()
    out = []
    for r in rows:
        c = hint_class(r["image_hint"])
        lst = saved.get(c, [])
        if used[c] >= len(lst):
            raise SystemExit(f"{c} 이미지가 부족합니다({used[c] + 1}번째 필요, {len(lst)}장 저장됨)")
        r = dict(r)
        r["image_path"] = lst[used[c]]
        used[c] += 1
        out.append(r)
    return out


def labeling_html(rows) -> str:
    items = [{"pair_id": r["pair_id"], "text": r["text"], "img": os.path.relpath(
        os.path.join(ROOT, r["image_path"]), DATA).replace("\\", "/")} for r in rows]
    cols = ["pair_id", "kind", "text", "text_label", "image_hint", "image_path", "true_emotion", "true_emotion_alt", "note"]
    return (HTML.replace("__ITEMS__", json.dumps(items, ensure_ascii=False))
                .replace("__ROWS__", json.dumps(rows, ensure_ascii=False))
                .replace("__COLS__", json.dumps(cols))
                .replace("__EMO__", json.dumps([[e, KO[e]] for e in EMOTIONS], ensure_ascii=False)))


HTML = """<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>복합 입력 라벨링</title>
<style>
:root{--bg:#14090f;--card:#22121b;--fg:#f5eef0;--mut:#a8959e;--acc:#d9c08f;--line:#3a2530}
@media(prefers-color-scheme:light){:root{--bg:#f7f2f3;--card:#fff;--fg:#26151c;--mut:#7a6670;--acc:#8a6d3a;--line:#e2d6da}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,'Noto Sans KR',sans-serif}
main{max-width:760px;margin:0 auto;padding:20px 16px 40px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;color:var(--mut);font-size:14px}
.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-bottom:16px}.bar>i{display:block;height:100%;background:var(--acc);width:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
img{display:block;max-width:100%;max-height:420px;margin:0 auto 14px;border-radius:12px}
.text{font-size:20px;font-weight:700;text-align:center;margin:0 0 6px}.hint{text-align:center;color:var(--mut);font-size:13px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
button{font:inherit;color:var(--fg);background:transparent;border:1px solid var(--line);border-radius:10px;padding:10px 6px;cursor:pointer}
button:hover{border-color:var(--acc)}button.on{background:var(--acc);color:#1a0f14;border-color:var(--acc);font-weight:700}button.alt{outline:2px dashed var(--acc)}
.nav{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.nav button{flex:1}
.mode{margin:12px 0 0;text-align:center;color:var(--mut);font-size:13px}
.done{color:var(--acc)}
@media(max-width:520px){.grid{grid-template-columns:repeat(2,1fr)}}
</style>
<main>
<div class="top"><span id="pos"></span><span id="saved">자동 저장됨(이 브라우저)</span></div>
<div class="bar"><i id="bar"></i></div>
<div class="card">
  <img id="img" alt="">
  <p class="text" id="text"></p>
  <p class="hint">이 이미지와 문장을 <b>함께</b> 봤을 때 전체가 전하는 감정을 고르세요.</p>
  <div class="grid" id="grid"></div>
  <p class="mode"><label><input type="checkbox" id="altmode"> 두 번째로 허용할 감정도 고르기(애매할 때만, 체크한 뒤 버튼을 누르면 2순위로 저장)</label></p>
  <div class="nav"><button id="prev">← 이전</button><button id="skip">건너뛰기</button><button id="next">다음 →</button></div>
</div>
<p class="mode"><button id="export" style="padding:10px 18px">CSV 내보내기</button><br><span id="msg"></span></p>
</main>
<script>
const ITEMS=__ITEMS__, ROWS=__ROWS__, COLS=__COLS__, EMO=__EMO__, KEY='fusion_labels_v1';
let i=0, L={};
try{L=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const $=id=>document.getElementById(id);
function save(){try{localStorage.setItem(KEY,JSON.stringify(L))}catch(e){}}
function show(){
  const it=ITEMS[i], cur=L[it.pair_id]||{};
  $('img').src=it.img; $('text').textContent=it.text;
  const n=Object.values(L).filter(v=>v.t).length;
  $('pos').textContent=(i+1)+' / '+ITEMS.length+'  ·  완료 '+n; $('bar').style.width=(n/ITEMS.length*100)+'%';
  $('grid').innerHTML='';
  EMO.forEach(([k,ko])=>{const b=document.createElement('button');b.textContent=ko+' ('+k+')';
    if(cur.t===k)b.classList.add('on'); if(cur.a===k)b.classList.add('alt');
    b.onclick=()=>{const c=L[it.pair_id]||(L[it.pair_id]={});
      if($('altmode').checked && c.t && k!==c.t){c.a=(c.a===k?'':k)} else {c.t=k; if(c.a===k)c.a=''}
      save(); show(); if(!$('altmode').checked) setTimeout(()=>{if(i<ITEMS.length-1){i++;show()}},180)};
    $('grid').appendChild(b)});
}
$('prev').onclick=()=>{if(i>0){i--;show()}}; $('next').onclick=$('skip').onclick=()=>{if(i<ITEMS.length-1){i++;show()}};
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')$('prev').click();if(e.key==='ArrowRight')$('next').click()});
$('export').onclick=()=>{
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const lines=[COLS.join(',')];
  ROWS.forEach(r=>{const c=L[r.pair_id]||{}; const o=Object.assign({},r,{true_emotion:c.t||'',true_emotion_alt:c.a||''});
    lines.push(COLS.map(k=>q(o[k])).join(','))});
  const blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fusion_pairs.csv';a.click();
  const n=Object.values(L).filter(v=>v.t).length;
  $('msg').textContent=n+'쌍 라벨링됨 — 받은 fusion_pairs.csv 를 ClipServer/data/ 에 덮어쓰세요'+(n<ITEMS.length?' (미완료 '+(ITEMS.length-n)+'쌍은 평가에서 제외됩니다)':'');
};
show();
</script></html>"""


# ───────────────── 이미지 내려받기(HF 스트리밍) ─────────────────
def download_images(need: Counter, split: str, out_dir: str, skip: int = 0) -> dict:
    from emoset_dataset import iter_emoset_rows   # datasets 필요
    from model.emotion_va_map import TRAINED_SYNC_EMOTIONS
    saved = {c: [] for c in TRAINED_SYNC_EMOTIONS}
    seen = Counter()
    cap = max(need.values()) + skip
    for img, sync_idx, _, _ in iter_emoset_rows(split, max_per_class=cap):
        c = TRAINED_SYNC_EMOTIONS[sync_idx]
        seen[c] += 1
        if seen[c] <= skip or len(saved[c]) >= need.get(c, 0):
            continue
        d = os.path.join(out_dir, c)
        os.makedirs(d, exist_ok=True)
        name = f"{len(saved[c]) + 1:03d}.jpg"
        img.save(os.path.join(d, name), quality=92)
        saved[c].append(os.path.relpath(os.path.join(d, name), ROOT).replace("\\", "/"))
        if all(len(saved[k]) >= need.get(k, 0) for k in need):
            break
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="test", choices=["val", "test"], help="프로젝션 학습(train)에 안 쓰인 split")
    ap.add_argument("--skip", type=int, default=0, help="각 감정의 앞쪽 N장은 건너뜀(다른 이미지를 쓰고 싶을 때)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    tpl = os.path.join(DATA, "fusion_pairs_template.csv")
    out = os.path.join(DATA, "fusion_pairs.csv")
    if os.path.exists(out) and not args.force:
        raise SystemExit(f"{out} 가 이미 있습니다(라벨링 중일 수 있어 덮어쓰지 않음). 다시 만들려면 --force")
    with open(tpl, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    need = need_per_class(rows)
    print("필요한 이미지:", dict(need))
    saved = download_images(need, args.split, os.path.join(DATA, "fusion_images"), args.skip)
    rows = assign_images(rows, saved)
    with open(out, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    html = os.path.join(DATA, "fusion_labeling.html")
    with open(html, "w", encoding="utf-8") as fh:
        fh.write(labeling_html(rows))
    print(f"\n완료: {out}\n라벨링 화면: {html}  (브라우저로 열기)\n다 끝나면 'CSV 내보내기' → 받은 파일을 data/fusion_pairs.csv 로 덮어쓰고  python eval_fusion.py --grid --cv")


if __name__ == "__main__":
    main()
