# -*- coding: utf-8 -*-
"""
평가용 이미지 자동 수집 — 앨범 커버(iTunes) 약 70% + 일상 사진(Wikimedia Commons) 약 30%.

감정별 분위기 검색어로 모은 뒤 섞어서 c001.jpg / p001.jpg 처럼 '감정이 드러나지 않는' 이름으로 저장한다
(라벨링할 때 파일명에 끌리지 않도록). 검색어와 감정이 정확히 일치하지는 않으므로 반드시
label_images.py 로 직접 라벨링해야 한다 — 이 스크립트는 '모으는 시간'만 줄여 준다.

사용
  python collect_images.py                       # data/collected_images 에 약 150장
  python collect_images.py --covers 14 --photos 6   # 감정(8개)당 앨범 커버 14장, 사진 6장
  python label_images.py --src data/collected_images   # 이어서 라벨링

인터넷이 필요하다(iTunes Search API, Wikimedia Commons API — 둘 다 키 불필요). 이미 받은 폴더에 다시 실행하면
새 이미지로 덮어쓰지 않고 이어서 번호를 붙인다. 사진은 Commons 검색 결과라 품질이 들쭉날쭉할 수 있으니,
애매하거나 이상한 이미지는 라벨링 때 0(건너뛰기)으로 넘기면 된다.
평가·내부 용도로만 쓰고 앱에 싣거나 배포하지 말 것(앨범 아트는 저작권이 있다).
"""
import argparse
import io
import json
import os
import random
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "SyncGraduationProject/1.0 (evaluation only)"

# 감정별 분위기 검색어 (정확한 감정 라벨이 아니라 '이런 분위기가 모이도록' 하는 용도)
COVER_QUERIES = {
    "happy":      [("happy summer pop", "US"), ("신나는 여름 팝", "KR"), ("sunshine feel good", "US")],
    "sad":        [("sad ballad", "US"), ("이별 발라드", "KR"), ("heartbreak crying", "US")],
    "calm":       [("calm acoustic relaxing", "US"), ("잔잔한 어쿠스틱", "KR"), ("peaceful piano", "US")],
    "energetic":  [("workout energy edm", "US"), ("신나는 댄스 클럽", "KR"), ("party dance hits", "US")],
    "romantic":   [("romantic love song", "US"), ("달콤한 사랑 노래", "KR"), ("love duet", "US")],
    "melancholy": [("melancholy rainy night", "US"), ("쓸쓸한 새벽 감성", "KR"), ("nostalgic lonely indie", "US")],
    "angry":      [("angry metal rage", "US"), ("hard rock aggressive", "US"), ("힙합 분노 diss", "KR")],
    "dreamy":     [("dreamy shoegaze ambient", "US"), ("몽환 드림팝", "KR"), ("ethereal dream pop", "US")],
}
PHOTO_QUERIES = {
    "happy":      ["sunny day picnic", "children laughing park", "colorful balloons festival"],
    "sad":        ["lonely rainy window", "empty bench winter", "grey sky alone"],
    "calm":       ["quiet lake morning", "tea cup window light", "still water forest"],
    "energetic":  ["crowd concert lights", "running city night", "fireworks celebration"],
    "romantic":   ["couple sunset silhouette", "candlelight dinner roses", "love letter flowers"],
    "melancholy": ["foggy empty street", "autumn leaves rain", "old train station dusk"],
    "angry":      ["storm clouds lightning", "fire flames dark", "stormy sea waves"],
    "dreamy":     ["pastel clouds sky", "neon lights bokeh night", "misty mountains sunrise"],
}

# --more : 학습용 이미지를 모을 때 쓰는 두 번째 검색어 묶음(첫 묶음과 겹치지 않게, 약한 감정 위주로 더 다양하게)
MORE_COVER_QUERIES = {
    "happy":      [("upbeat happy kpop", "KR"), ("feel good summer vibes", "US"), ("cheerful acoustic pop", "US")],
    "sad":        [("sad songs cry", "US"), ("슬픈 노래 눈물", "KR"), ("lonely sad piano", "US")],
    "calm":       [("lofi chill study", "US"), ("잔잔한 재즈 카페", "KR"), ("sleep ambient calm", "US")],
    "energetic":  [("rock energy gym", "US"), ("hiphop hype", "US"), ("신나는 락 페스티벌", "KR")],
    "romantic":   [("romantic ballad wedding", "US"), ("러브송 설레는 고백", "KR"), ("valentine love songs", "US"), ("rnb slow jam love", "US")],
    "melancholy": [("nostalgia memory missing you", "US"), ("그리움 추억 발라드", "KR"), ("autumn melancholic indie folk", "US"), ("sad rainy day jazz", "US")],
    "angry":      [("heavy metal aggressive", "US"), ("punk rage", "US"), ("트랩 힙합 hard", "KR")],
    "dreamy":     [("dream pop synth", "US"), ("psychedelic floating", "US"), ("신비로운 몽환 앰비언트", "KR")],
}
MORE_PHOTO_QUERIES = {
    "happy":      ["people dancing joy", "ice cream summer", "birthday party"],
    "sad":        ["person crying", "dark room alone", "wilted flowers"],
    "calm":       ["zen garden", "sleeping cat sunlight", "calm beach morning"],
    "energetic":  ["sports action", "festival crowd", "skateboard jump"],
    "romantic":   ["wedding bouquet", "couple holding hands beach", "heart shaped lights"],
    "melancholy": ["lonely person fog", "empty classroom dusk", "rain on window night"],
    "angry":      ["explosion", "volcano eruption", "dark storm fist"],
    "dreamy":     ["pastel sunset gradient", "soap bubbles light", "northern lights"],
}

# --more2 : 약한 감정(melancholy·sad·calm·dreamy·romantic) 보강용 세 번째 검색어 묶음. 앞의 두 묶음과 겹치지 않게 따로 구성.
MORE2_COVER_QUERIES = {
    "happy":      [("good vibes playlist", "US"), ("행복한 아침 플레이리스트", "KR")],
    "sad":        [("breakup songs", "US"), ("눈물 나는 노래", "KR"), ("sad acoustic guitar", "US"), ("grief mourning piano", "US")],
    "calm":       [("sleep meditation music", "US"), ("힐링 휴식 음악", "KR"), ("nature sounds relax", "US"), ("spa massage", "US")],
    "energetic":  [("pump up workout", "US"), ("댄스 클럽 믹스", "KR")],
    "romantic":   [("slow dance love", "US"), ("연애 감성 사랑 노래", "KR"), ("love ballads 90s", "US")],
    "melancholy": [("lonely night alone", "US"), ("새벽 감성 외로움", "KR"), ("missing someone", "US"), ("wistful autumn", "US"),
                   ("nostalgic memories past", "US"), ("쓸쓸한 가을 노래", "KR"), ("regret and longing", "US")],
    "angry":      [("rage aggressive rap", "US"), ("분노 락 메탈", "KR")],
    "dreamy":     [("ethereal ambient space", "US"), ("dreamscape synthwave", "US"), ("몽환적인 분위기", "KR")],
}
MORE2_PHOTO_QUERIES = {
    "happy":      ["laughing friends outdoors", "sunflower field"],
    "sad":        ["tears on face", "funeral flowers", "abandoned toy"],
    "calm":       ["morning mist lake", "sleeping baby", "quiet library"],
    "energetic":  ["marathon runners", "mosh pit concert"],
    "romantic":   ["kiss silhouette", "red roses candles", "wedding rings"],
    "melancholy": ["empty swing", "old photograph faded", "rainy street night umbrella", "autumn park bench alone", "train window rain"],
    "angry":      ["clenched fist", "riot fire"],
    "dreamy":     ["lavender fields haze", "galaxy nebula", "floating lanterns night"],
}

# --more3 : melancholy·calm 전용 4번째 묶음. 이미지 정확도에서 가장 약한 두 감정(melancholy 5/20, calm 11/24)만 더 모은다.
#           melancholy 가 sad 로 새고 calm 이 dreamy 로 새므로, 두 감정의 '구분 기준'이 되는 이미지(그리움·조용한 일상)를 노린다.
MORE3_COVER_QUERIES = {
    "melancholy": [("nostalgic longing indie", "US"), ("그리운 시절 추억", "KR"), ("faded memories folk", "US"), ("late night reflection", "US"),
                   ("빈 방 외로운 밤", "KR"), ("bittersweet memories", "US"), ("homesick lonely city", "US"), ("가을 편지 그리움", "KR")],
    "calm":       [("morning coffee acoustic", "US"), ("고요한 숲 명상", "KR"), ("slow living soft piano", "US"), ("focus study ambient", "US"),
                   ("평온한 오후 재즈", "KR"), ("gentle lullaby soft", "US"), ("quiet sunday morning", "US"), ("잔잔한 숲속 피아노", "KR")],
}
MORE3_PHOTO_QUERIES = {
    "melancholy": ["abandoned house dusk", "empty road autumn mist", "old letters desk", "lonely lighthouse grey", "wet city street night alone"],
    "calm":       ["reading book armchair", "calm river sunrise", "candle quiet room", "snow quiet village", "meadow soft light"],
}

# --test : 봉인 테스트 세트(+능동 학습 후보 풀)용 5번째 묶음. 앞의 모든 묶음과 검색어를 겹치지 않게 새로 구성했고,
#          특정 약한 감정에만 치우치지 않게 8개 감정을 같은 비중으로 모은다.
TEST_COVER_QUERIES = {
    "happy":      [("joyful celebration pop", "US"), ("기분 좋은 드라이브 노래", "KR"), ("sunny afternoon indie pop", "US")],
    "sad":        [("tearful slow ballad", "US"), ("우울한 비 오는 날 노래", "KR"), ("heartache solo piano", "US")],
    "calm":       [("soft morning acoustic", "US"), ("편안한 휴식 클래식", "KR"), ("gentle nature ambience", "US")],
    "energetic":  [("adrenaline dance electronic", "US"), ("에너지 넘치는 운동 음악", "KR"), ("festival anthem", "US")],
    "romantic":   [("tender love ballad", "US"), ("달달한 연인 노래", "KR"), ("candlelight jazz love", "US")],
    "melancholy": [("wistful rainy city", "US"), ("쓸쓸한 겨울 감성", "KR"), ("dusk lonely folk", "US"), ("empty streets nostalgia", "US")],
    "angry":      [("furious hardcore", "US"), ("강렬한 락 분노", "KR"), ("brutal industrial", "US")],
    "dreamy":     [("hazy dreamlike synth", "US"), ("꿈속 같은 몽환", "KR"), ("lucid floating ambient", "US")],
}
TEST_PHOTO_QUERIES = {
    "happy":      ["smiling people sunshine", "colorful festival street", "playing children beach"],
    "sad":        ["sad person window", "rain on empty street", "dim room tears"],
    "calm":       ["peaceful meadow morning", "slow river reflection", "quiet cabin snow"],
    "energetic":  ["dance crowd lights", "fast motion city", "sports celebration"],
    "romantic":   ["couple evening walk", "roses candlelight", "wedding sunset"],
    "melancholy": ["foggy pier dusk", "bare trees grey", "deserted station night", "rainy window blur"],
    "angry":      ["thunderstorm dark", "fire burning", "aggressive crowd smoke"],
    "dreamy":     ["pastel clouds haze", "glowing lights bokeh", "misty forest light"],
}


# --rare : 라벨이 가장 적은 감정(melancholy·sad·happy) 전용 6번째 묶음. 앨범 커버로는 이 감정이 잘 안 모이므로 일상 사진 위주.
RARE_COVER_QUERIES = {
    "melancholy": [("nostalgic autumn evening", "US"), ("그리움 쓸쓸한 밤", "KR")],
    "sad":        [("crying alone ballad", "US"), ("이별 눈물 발라드", "KR")],
    "happy":      [("feel good summer hits", "US"), ("신나는 행복한 노래", "KR")],
}
RARE_PHOTO_QUERIES = {
    "melancholy": ["lonely bench autumn leaves", "empty playground dusk", "old photograph faded", "grey sky empty beach", "single streetlight fog", "abandoned train platform"],
    "sad":        ["person crying hands face", "funeral flowers grey", "empty chair hospital", "rain window lonely night", "wilted flower dark", "farewell airport"],
    "happy":      ["friends laughing together", "birthday party smiles", "kids jumping joy", "family picnic sunny", "graduation celebration", "dog playing park"],
}


# --bulk : 7번째 묶음. 새 봉인 테스트(300장 이상)와 능동 학습 후보를 한 번에 만들 큰 묶음.
#          앞의 모든 묶음과 검색어가 겹치지 않게 새로 썼고, 8감정을 같은 비중으로 모은다.
BULK_COVER_QUERIES = {
    "happy":      [("bright morning smile pop", "US"), ("웃음 가득한 하루", "KR"), ("sunshine good mood", "US"), ("happy whistle ukulele", "US")],
    "sad":        [("quiet weeping strings", "US"), ("혼자 우는 밤", "KR"), ("letting go goodbye", "US"), ("sorrow cello solo", "US")],
    "calm":       [("still afternoon piano", "US"), ("조용한 서재 음악", "KR"), ("soft rain study", "US"), ("peaceful breathing ambient", "US")],
    "energetic":  [("stadium anthem loud", "US"), ("질주 드라이브 비트", "KR"), ("high tempo electro", "US"), ("power workout bass", "US")],
    "romantic":   [("first love confession", "US"), ("두근거리는 마음", "KR"), ("slow waltz romance", "US"), ("honeymoon serenade", "US")],
    "melancholy": [("fading summer goodbye", "US"), ("지나간 날들 회상", "KR"), ("blue hour solitude", "US"), ("distant memory piano", "US")],
    "angry":      [("burning rage scream", "US"), ("폭발하는 분노", "KR"), ("war drums heavy", "US"), ("defiant shout rock", "US")],
    "dreamy":     [("weightless drifting sound", "US"), ("구름 위를 걷는", "KR"), ("blurred reverb guitar", "US"), ("sleepwalking synth", "US")],
}
BULK_PHOTO_QUERIES = {
    "happy":      ["market smiling vendor", "puppy running grass", "sunlit kitchen breakfast", "friends jumping sunset"],
    "sad":        ["single candle dark", "empty hospital corridor", "broken window grey", "rain soaked shoes"],
    "calm":       ["morning fog field", "wooden desk plant", "hammock garden shade", "clear pond stones"],
    "energetic":  ["bicycle race blur", "street dance crowd", "stage lights band", "surfing big wave"],
    "romantic":   ["two cups coffee table", "hands with ring", "flower bouquet window", "couple umbrella rain"],
    "melancholy": ["empty pier grey sea", "vintage radio dust", "snow empty street night", "leafless tree field"],
    "angry":      ["cracked earth drought", "smoke factory dark", "angry sky red clouds", "broken glass floor"],
    "dreamy":     ["jellyfish glowing water", "cotton candy sky", "light rays forest fog", "reflection puddle neon"],
}

# ───────────────── 네트워크(테스트에서 바꿔 끼움) ─────────────────
def fetch_bytes(url: str, timeout: int = 20, retries: int = 5) -> bytes:
    """429(요청 과다)/5xx 는 Retry-After 또는 점점 늘어나는 대기 후 재시도한다."""
    import urllib.error
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
            try:
                wait = float(e.headers.get("Retry-After", ""))
            except (TypeError, ValueError):
                wait = 0
            time.sleep(max(wait, 3 * (2 ** attempt)))
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries:
                raise
            time.sleep(2 * (attempt + 1))


def fetch_json(url: str):
    return json.loads(fetch_bytes(url).decode("utf-8"))


# ───────────────── 순수 함수(테스트 가능) ─────────────────
def itunes_url(term: str, country: str, limit: int = 50) -> str:
    q = urllib.parse.urlencode({"term": term, "media": "music", "entity": "album", "limit": limit, "country": country})
    return f"https://itunes.apple.com/search?{q}"


def parse_itunes(data: dict):
    """→ [(고유키, 큰 이미지 URL)]"""
    out = []
    for r in data.get("results", []):
        u = r.get("artworkUrl100") or r.get("artworkUrl60")
        if u and r.get("collectionId"):
            out.append((f"itunes:{r['collectionId']}", u.replace("100x100bb", "600x600bb").replace("60x60bb", "600x600bb")))
    return out


def commons_url(term: str, limit: int = 30) -> str:
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": limit,
        "gsrsearch": f"filetype:bitmap {term}", "prop": "imageinfo", "iiprop": "url|mime|size", "iiurlwidth": 640})
    return f"https://commons.wikimedia.org/w/api.php?{q}"


def parse_commons(data: dict):
    """→ [(고유키, 썸네일 URL)] — jpeg 이고 너무 작지 않은 것만."""
    out = []
    for p in (data.get("query", {}).get("pages", {}) or {}).values():
        info = (p.get("imageinfo") or [None])[0]
        if not info or info.get("mime") != "image/jpeg":
            continue
        if min(info.get("width", 0), info.get("height", 0)) < 400:
            continue
        u = info.get("thumburl") or info.get("url")
        if u:
            out.append((f"commons:{p.get('pageid')}", u))
    return out


def pick_round_robin(pools, n):
    """여러 검색어 결과(pools: 리스트의 리스트)에서 번갈아 가며 중복 없이 n개."""
    seen, out = set(), []
    i = 0
    while len(out) < n and any(i < len(p) for p in pools):
        for p in pools:
            if i < len(p) and p[i][0] not in seen:
                seen.add(p[i][0]); out.append(p[i])
                if len(out) >= n:
                    break
        i += 1
    return out


def next_index(folder: str, prefix: str) -> int:
    nums = [int(f[len(prefix):len(prefix) + 3]) for f in os.listdir(folder)
            if f.startswith(prefix) and f[len(prefix):len(prefix) + 3].isdigit()] if os.path.isdir(folder) else []
    return max(nums, default=0) + 1


def save_jpeg(raw: bytes, path: str, min_side: int = 200) -> bool:
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        return False
    if min(im.size) < min_side:
        return False
    im.save(path, quality=92)
    return True


# ───────────────── 수집 ─────────────────
def collect(out_dir, covers_per, photos_per, sleep=0.4, photo_sleep=2.0, log=print, seed=7,
            cover_queries=None, photo_queries=None, exclude_dirs=()):
    os.makedirs(out_dir, exist_ok=True)
    cover_queries = cover_queries or COVER_QUERIES
    photo_queries = photo_queries or PHOTO_QUERIES
    items = []   # (종류, 키, URL)
    key_emo = {}  # 고유키 → 검색에 쓴 감정(파일명으로는 드러나지 않음, 테스트 세트 균형 맞추기 전용)
    for emo in cover_queries:
        pools = []
        for term, country in cover_queries[emo]:
            try:
                pools.append(parse_itunes(fetch_json(itunes_url(term, country))))
            except Exception as e:
                log(f"  [iTunes 실패] {term}: {e}")
            time.sleep(sleep)
        got = pick_round_robin(pools, covers_per)
        log(f"  앨범 커버 {emo:<11}{len(got)}/{covers_per}")
        items += [("c", k, u) for k, u in got]
        key_emo.update({k: emo for k, _ in got})
    for emo in photo_queries:
        pools = []
        for term in photo_queries[emo]:
            try:
                pools.append(parse_commons(fetch_json(commons_url(term))))
            except Exception as e:
                log(f"  [Commons 실패] {term}: {e}")
            time.sleep(photo_sleep)   # Commons 는 연속 요청에 429 를 잘 준다
        got = pick_round_robin(pools, photos_per)
        log(f"  일상 사진 {emo:<11}{len(got)}/{photos_per}")
        items += [("p", k, u) for k, u in got]
        key_emo.update({k: emo for k, _ in got})

    seen_keys = set()
    state = os.path.join(out_dir, "_collected_keys.json")
    if os.path.exists(state):
        seen_keys = set(json.load(open(state, encoding="utf-8")))
    # 다른 폴더(예: 평가용)에 이미 받은 것은 제외 — 평가용/학습용이 겹치지 않게
    for d in exclude_dirs:
        f = os.path.join(d, "_collected_keys.json")
        if os.path.exists(f):
            seen_keys_ex = set(json.load(open(f, encoding="utf-8")))
            items = [it for it in items if it[1] not in seen_keys_ex]
    items = [it for it in items if it[1] not in seen_keys]
    random.Random(seed).shuffle(items)      # 같은 검색어(=비슷한 감정)가 연달아 나오지 않게
    idx = {"c": next_index(out_dir, "c"), "p": next_index(out_dir, "p")}
    saved = {"c": 0, "p": 0}
    qmap_path = os.path.join(out_dir, "_query_emotion.json")
    qmap = json.load(open(qmap_path, encoding="utf-8")) if os.path.exists(qmap_path) else {}
    for kind, key, url in items:
        try:
            raw = fetch_bytes(url)
        except Exception as e:
            log(f"  [다운로드 실패] {url[:70]}: {e}")
            continue
        name = f"{kind}{idx[kind]:03d}.jpg"
        if save_jpeg(raw, os.path.join(out_dir, name)):
            qmap[name] = key_emo.get(key, "")
            idx[kind] += 1; saved[kind] += 1; seen_keys.add(key)
        time.sleep(sleep / 2)
    json.dump(sorted(seen_keys), open(state, "w", encoding="utf-8"))
    json.dump(qmap, open(qmap_path, "w", encoding="utf-8"), ensure_ascii=False)
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None, help="기본: data/collected_images, --more 이면 data/collected_train")
    ap.add_argument("--test", action="store_true", help="봉인 테스트 세트·능동 학습 후보 풀: 새 검색어 묶음. data/collected_test 에 저장, 평가용·학습용 1~3차와 겹치는 이미지 제외. 감정당 --covers 30 --photos 10 권장")
    ap.add_argument("--bulk", action="store_true", help="새 봉인 테스트(300장 이상)·능동 학습 후보용 큰 묶음. data/collected_bulk 에 저장, 이전 모든 묶음과 겹치는 이미지 제외. 감정당 --covers 40 --photos 40 권장(약 600장)")
    ap.add_argument("--rare", action="store_true", help="희귀 감정(melancholy·sad·happy) 전용 수집: 일상 사진 위주. data/collected_rare 에 저장, 이전 모든 묶음·테스트 후보와 겹치는 이미지 제외. 감정당 --covers 8 --photos 30 권장")
    ap.add_argument("--more3", action="store_true", help="학습용 3차: melancholy·calm 전용 보강. data/collected_train3 에 저장, 평가용·1·2차 학습용과 겹치는 이미지 제외")
    ap.add_argument("--more2", action="store_true", help="학습용 2차: 약한 감정(melancholy·sad·calm·dreamy·romantic) 보강. data/collected_train2 에 저장, 평가용·1차 학습용과 겹치는 이미지 제외")
    ap.add_argument("--more", action="store_true", help="학습용: 두 번째 검색어 묶음 + 평가용 폴더(data/collected_images)와 겹치는 이미지 제외")
    ap.add_argument("--covers", type=int, default=13, help="감정당 앨범 커버 장수")
    ap.add_argument("--photos", type=int, default=6, help="감정당 일상 사진 장수")
    args = ap.parse_args()
    base = os.path.join(ROOT, "data")
    out = args.out or os.path.join(base, "collected_bulk" if args.bulk else "collected_rare" if args.rare else "collected_test" if args.test else "collected_train3" if args.more3 else "collected_train2" if args.more2 else "collected_train" if args.more else "collected_images")
    print(f"수집 시작 → {out}")
    if args.bulk:
        saved = collect(out, args.covers, args.photos, cover_queries=BULK_COVER_QUERIES, photo_queries=BULK_PHOTO_QUERIES,
                        exclude_dirs=[os.path.join(base, d) for d in ("collected_images", "collected_train", "collected_train2", "collected_train3", "collected_test", "collected_rare", "user_label_pool", "sealed_test")])
    elif args.rare:
        saved = collect(out, args.covers, args.photos, cover_queries=RARE_COVER_QUERIES, photo_queries=RARE_PHOTO_QUERIES,
                        exclude_dirs=[os.path.join(base, d) for d in ("collected_images", "collected_train", "collected_train2", "collected_train3", "collected_test")])
    elif args.test:
        saved = collect(out, args.covers, args.photos, cover_queries=TEST_COVER_QUERIES, photo_queries=TEST_PHOTO_QUERIES,
                        exclude_dirs=[os.path.join(base, d) for d in ("collected_images", "collected_train", "collected_train2", "collected_train3")])
    elif args.more3:
        saved = collect(out, args.covers, args.photos, cover_queries=MORE3_COVER_QUERIES, photo_queries=MORE3_PHOTO_QUERIES,
                        exclude_dirs=[os.path.join(base, "collected_images"), os.path.join(base, "collected_train"), os.path.join(base, "collected_train2")])
    elif args.more2:
        saved = collect(out, args.covers, args.photos, cover_queries=MORE2_COVER_QUERIES, photo_queries=MORE2_PHOTO_QUERIES,
                        exclude_dirs=[os.path.join(base, "collected_images"), os.path.join(base, "collected_train")])
    elif args.more:
        saved = collect(out, args.covers, args.photos, cover_queries=MORE_COVER_QUERIES, photo_queries=MORE_PHOTO_QUERIES,
                        exclude_dirs=[os.path.join(base, "collected_images")])
    else:
        saved = collect(out, args.covers, args.photos)
    total = saved["c"] + saved["p"]
    print(f"\n완료: 앨범 커버 {saved['c']}장 + 일상 사진 {saved['p']}장 = {total}장")
    print(f"다음: python label_images.py --src \"{out}\"")
    if total < 60:
        print("※ 60장보다 적습니다. 위 '실패' 줄을 확인하거나, 직접 모은 이미지를 이 폴더에 더 넣어도 됩니다.")


if __name__ == "__main__":
    main()
