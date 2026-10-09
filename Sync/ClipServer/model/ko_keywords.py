# -*- coding: utf-8 -*-
"""
한국어 감정 키워드 사전 + 매칭 (순수 파이썬 — torch/clip 없이 단독 테스트 가능).

배경: 기존 사전(약 54개)은 happy/sad/angry 계열 위주라서 calm/dreamy/energetic/romantic/melancholy
문장 대부분이 사전에 안 걸렸고, 그 문장들이 KoELECTRA 분류기로 넘어가면 분류기가 이 감정들을 모르기 때문에
"고요한 숲속에서 마음이 편안해지는 느낌"을 happy 99%로 확신하는 식의 오분류가 났다(분류기 정확도 8/15).
→ 감정별로 일반적인 한국어 감정 어휘를 넓게 추가하고, 각 키워드에 감정 태그를 붙였다.

매칭 규칙:
  1. 긴 키워드 우선, 겹치는 구간은 건너뜀, 1글자 키워드는 앞 글자가 한글이면 제외(예: 운동'화').
  2. 매칭된 키워드들을 감정 태그로 집계해서 가장 많이 나온 감정의 표현만 남긴다(동률이면 같이 유지).
     → "노을 + 손잡" 같이 서로 다른 감정이 섞여 CLIP 입력이 흐려지는 것을 줄인다.
  3. 최대 3개까지 ", " 로 이어 CLIP 영어 입력으로 쓴다.

영어 표현은 emotion_prompts.py 의 감정별 앵커 문구(예: calm = peaceful/relaxing/serene)와 어휘를 맞췄다.
"""

import re
from typing import Dict, List, Optional, Tuple

# 키워드 → (CLIP 영어 입력, 감정 태그)
KEYWORDS: Dict[str, Tuple[str, str]] = {
    # ══ 기존 사전 (영어 표현 유지, 태그만 추가) ══════════════════════
    "밤 드라이브": ("night drive and atmospheric", "dreamy"),
    "기분 좋":    ("feel good and happy", "happy"),
    "비 오":      ("rainy and melancholy", "melancholy"),
    "빗소리":     ("rain sound and nostalgic", "melancholy"),
    "몽환":       ("dreamy and ethereal", "dreamy"),
    "설레":       ("exciting and romantic", "romantic"),
    "두근":       ("heart flutter and excitement", "romantic"),
    "로맨":       ("romantic and loving", "romantic"),
    "연인":       ("lover and romantic", "romantic"),
    "데이트":     ("date and romantic", "romantic"),
    "에너지":     ("energy and dynamic", "energetic"),
    "활기":       ("energetic and vibrant", "energetic"),
    "파워":       ("powerful and strong", "energetic"),
    "달리":       ("running and energetic", "energetic"),
    "헬스":       ("gym and fitness", "energetic"),
    "운동":       ("workout and exercise", "energetic"),
    "행복":       ("happy and cheerful", "happy"),
    "즐거":       ("joyful and fun", "happy"),
    "파티":       ("party and celebration", "energetic"),
    "신나":       ("exciting and joyful", "happy"),
    "슬프":       ("sad and sorrowful", "sad"),
    "우울":       ("depressed and gloomy", "sad"),
    "눈물":       ("tears and crying", "sad"),
    "혼자":       ("alone and lonely", "melancholy"),
    "실연":       ("heartbreak and breakup", "sad"),
    "이별":       ("farewell and goodbye", "sad"),
    "외로":       ("lonely and isolated", "melancholy"),
    "그리워":     ("miss and longing", "melancholy"),
    "그리움":     ("miss and longing", "melancholy"),
    "그리운":     ("miss and longing", "melancholy"),
    "그리웠":     ("miss and longing", "melancholy"),
    "조용":       ("quiet and peaceful", "calm"),
    "차분":       ("calm and serene", "calm"),
    "휴식":       ("rest and relax", "calm"),
    "카페":       ("calm cafe atmosphere", "calm"),
    "공부":       ("focus and concentrate", "calm"),
    "명상":       ("meditation and peace", "calm"),
    "여유":       ("leisurely and relaxed", "calm"),
    "평온":       ("tranquil and peaceful", "calm"),
    "사랑":       ("love and romance", "romantic"),
    "감성":       ("sentimental and emotional", "melancholy"),
    "노을":       ("sunset and nostalgic", "melancholy"),
    "추억":       ("memory and nostalgia", "melancholy"),
    "그날":       ("that day and reminisce", "melancholy"),
    "창가":       ("window and contemplative", "melancholy"),
    "분노":       ("rage and furious", "angry"),
    "격렬":       ("intense and fierce", "angry"),
    "강렬":       ("powerful and aggressive", "angry"),
    "새벽":       ("late night and dreamy", "dreamy"),
    "공상":       ("fantasy and dreamy", "dreamy"),
    "상상":       ("imagination and dreamy", "dreamy"),
    "감상":       ("contemplative and atmospheric", "melancholy"),
    "춤":         ("dance and celebrate", "energetic"),
    "웃":         ("laugh and smile", "happy"),
    "화":         ("angry and intense", "angry"),   # 1글자 — "운동화" 오매칭은 _is_standalone 으로 방지

    # ══ calm ═══════════════════════════════════════════════════════
    "고요":   ("quiet, still and peaceful", "calm"),
    "편안":   ("peaceful, relaxing and serene", "calm"),
    "편히":   ("peaceful and relaxing", "calm"),
    "편한":   ("relaxed and comfortable", "calm"),
    "잔잔":   ("gentle, soothing and calm", "calm"),
    "평화":   ("peaceful and serene", "calm"),
    "포근":   ("soft, warm and soothing", "calm"),
    "느긋":   ("slow, relaxed and unhurried", "calm"),
    "나른":   ("lazy, relaxed and unhurried", "calm"),
    "한가":   ("leisurely and relaxed", "calm"),
    "숨 돌":  ("relaxing and soothing", "calm"),
    "쉬고 싶": ("relaxing and quiet", "calm"),
    "힐링":   ("healing and soothing", "calm"),
    "안정":   ("settled, grounded and calm", "calm"),
    "가라앉": ("calming down and settled", "calm"),
    "느슨":   ("loose, relaxed and unhurried", "calm"),
    "늘어지": ("slow and unhurried", "calm"),
    "천천히": ("slow and unhurried", "calm"),
    "고즈넉": ("quiet, still and serene", "calm"),
    "한적":   ("quiet and peaceful", "calm"),
    "정적":   ("stillness and quiet", "calm"),
    "릴랙스": ("relaxing and soothing", "calm"),
    "느릿":   ("slow and unhurried", "calm"),
    "책 읽":  ("quiet reading and calm", "calm"),
    "책장":   ("quiet reading and calm", "calm"),
    "독서":   ("quiet reading and calm", "calm"),
    "낮잠":   ("peaceful nap and relaxing", "calm"),
    "잠들기 전": ("soothing and gentle before sleep", "calm"),
    "자기 전":   ("soothing and gentle before sleep", "calm"),
    "커피 향":   ("warm, quiet and relaxing", "calm"),
    "차 한 잔":  ("warm, quiet and relaxing", "calm"),
    "피아노":    ("gentle piano and calm", "calm"),
    "숲길":      ("peaceful forest and calm", "calm"),

    # ══ dreamy ═════════════════════════════════════════════════════
    "몽상":   ("dreamy and imaginative", "dreamy"),
    "몽롱":   ("hazy, dreamlike and floating", "dreamy"),
    "환상":   ("fantasy, ethereal and dreamlike", "dreamy"),
    "신비":   ("mystical and ethereal", "dreamy"),
    "비현실": ("surreal and dreamlike", "dreamy"),
    "초현실": ("surreal and ethereal", "dreamy"),
    "아득":   ("faraway, hazy and dreamlike", "dreamy"),
    "유영":   ("floating and drifting dreamlike", "dreamy"),
    "둥둥":   ("floating and drifting dreamlike", "dreamy"),
    "떠다니": ("floating, drifting and dreamlike", "dreamy"),
    "붕 떠":  ("floating and dreamlike", "dreamy"),
    "붕 뜬":  ("floating and dreamlike", "dreamy"),
    "구름":   ("hazy, floating and dreamlike", "dreamy"),
    "안개":   ("hazy, misty and dreamlike", "dreamy"),
    "흐릿":   ("hazy, blurry and dreamlike", "dreamy"),
    "꿈속":   ("dreamlike and surreal", "dreamy"),
    "꿈결":   ("dreamlike and floating", "dreamy"),
    "꿈꾸":   ("dreamlike and imaginative", "dreamy"),
    "꿈 같":  ("dreamlike and surreal", "dreamy"),
    "은하":   ("cosmic, ethereal and dreamlike", "dreamy"),
    "우주":   ("cosmic, ethereal and atmospheric", "dreamy"),
    "오로라": ("ethereal and mystical atmosphere", "dreamy"),
    "동화":   ("fairytale and dreamlike", "dreamy"),
    "판타지": ("fantasy and dreamlike", "dreamy"),
    "비몽사몽": ("between sleep and waking, dreamlike", "dreamy"),
    "들락 말락": ("between sleep and waking, dreamlike", "dreamy"),
    "솜사탕": ("soft, sweet and dreamlike", "dreamy"),
    "달빛":   ("moonlit, ethereal and dreamlike", "dreamy"),
    "네온":   ("neon, atmospheric and dreamlike", "dreamy"),
    "현실감": ("surreal and dreamlike", "dreamy"),
    "별빛":   ("starlit, ethereal and dreamlike", "dreamy"),
    "별이 쏟": ("starry, ethereal and dreamlike", "dreamy"),
    "시간이 멈": ("timeless, suspended and dreamlike", "dreamy"),

    # ══ energetic ══════════════════════════════════════════════════
    "힘찬":   ("powerful, exciting and dynamic", "energetic"),
    "힘이 나": ("powerful and upbeat", "energetic"),
    "힘껏":   ("powerful and driving", "energetic"),
    "텐션":   ("high-energy and pumped-up", "energetic"),
    "의욕":   ("fast-paced and bursting with energy", "energetic"),
    "뛰쳐":   ("high-energy and bursting with motion", "energetic"),
    "질주":   ("fast-paced and driving", "energetic"),
    "스퍼트": ("fast-paced and driving", "energetic"),
    "빠른":   ("fast-paced and driving", "energetic"),
    "비트":   ("driving beat and high-energy", "energetic"),
    "템포":   ("fast tempo and driving", "energetic"),
    "박동":   ("pounding, driving and high-energy", "energetic"),
    "쿵쿵":   ("pounding, driving and high-energy", "energetic"),
    "흔들":   ("dance and high-energy", "energetic"),
    "클럽":   ("club, dance and high-energy", "energetic"),
    "페스티벌": ("festival, dance and high-energy", "energetic"),
    "달려":   ("running and energetic", "energetic"),
    "러닝":   ("running and energetic", "energetic"),
    "점프":   ("jumping and high-energy", "energetic"),
    "열정":   ("passionate, powerful and driving", "energetic"),
    "불타":   ("fiery, powerful and driving", "energetic"),
    "하이텐션": ("high-energy and pumped-up", "energetic"),
    "에너제틱": ("energetic and dynamic", "energetic"),
    "신바람": ("upbeat and high-energy", "energetic"),
    "들썩":   ("upbeat, dance and high-energy", "energetic"),
    "저절로 움직": ("upbeat and bursting with motion", "energetic"),
    "파이팅": ("powerful, upbeat and motivating", "energetic"),
    "흥겹":   ("upbeat, lively and dance", "energetic"),
    "신나게": ("upbeat, lively and high-energy", "energetic"),
    "날아갈 것": ("upbeat, uplifting and fast-paced", "energetic"),

    # ══ romantic ═══════════════════════════════════════════════════
    "연애":   ("love, tender and romantic", "romantic"),
    "고백":   ("confession of love and romantic", "romantic"),
    "프러포즈": ("proposal, tender and romantic", "romantic"),
    "청혼":   ("proposal, tender and romantic", "romantic"),
    "첫사랑": ("first love, sweet and tender", "romantic"),
    "짝사랑": ("sweet longing and tender love", "romantic"),
    "손잡":   ("holding hands, tender and romantic", "romantic"),
    "손 잡":  ("holding hands, tender and romantic", "romantic"),
    "키스":   ("intimate, passionate and romantic", "romantic"),
    "포옹":   ("intimate, warm and affectionate", "romantic"),
    "속삭":   ("soft, intimate and romantic", "romantic"),
    "달콤":   ("sweet, tender and romantic", "romantic"),
    "와인":   ("intimate, soft and romantic", "romantic"),
    "기념일": ("anniversary, tender and romantic", "romantic"),
    "커플":   ("couple, tender and romantic", "romantic"),
    "애인":   ("lover, tender and romantic", "romantic"),
    "남자친구": ("lover, tender and romantic", "romantic"),
    "여자친구": ("lover, tender and romantic", "romantic"),
    "남친":   ("lover, tender and romantic", "romantic"),
    "여친":   ("lover, tender and romantic", "romantic"),
    "그 사람": ("tender longing and romantic", "romantic"),
    "눈만 마주": ("tender, affectionate and romantic", "romantic"),
    "눈 마주": ("tender, affectionate and romantic", "romantic"),
    "간질":   ("fluttering, sweet and romantic", "romantic"),
    "풋풋":   ("fresh, sweet and romantic", "romantic"),
    "분위기 있": ("intimate, soft and romantic", "romantic"),
    "낭만":   ("romantic and heartfelt", "romantic"),
    "사랑하는": ("loving, tender and romantic", "romantic"),
    "사랑에 빠": ("falling in love, tender and romantic", "romantic"),
    "스킨십": ("intimate and affectionate", "romantic"),
    "신혼":   ("tender, warm and romantic", "romantic"),
    "썸":     ("flirty, sweet and romantic", "romantic"),
    "들떠":   ("fluttering, sweet and romantic", "romantic"),
    "가슴이 뛰": ("fluttering, heartfelt and romantic", "romantic"),

    # ══ melancholy ═════════════════════════════════════════════════
    "센치":   ("nostalgic, wistful and bittersweet", "melancholy"),
    "쓸쓸":   ("wistful and tinged with quiet sadness", "melancholy"),
    "허전":   ("wistful and subdued", "melancholy"),
    "공허":   ("hollow, wistful and pensive", "melancholy"),
    "아련":   ("nostalgic, wistful and bittersweet", "melancholy"),
    "아릿":   ("nostalgic, wistful and bittersweet", "melancholy"),
    "시큰":   ("bittersweet and wistful", "melancholy"),
    "애틋":   ("bittersweet longing and tender", "melancholy"),
    "그립":   ("nostalgic longing and bittersweet", "melancholy"),
    "옛 생각": ("nostalgic and reflective", "melancholy"),
    "옛날":   ("nostalgic and reflective", "melancholy"),
    "지난날": ("nostalgic and reflective", "melancholy"),
    "지나간": ("nostalgic and reflective", "melancholy"),
    "지난 일": ("nostalgic and reflective", "melancholy"),
    "어린 시절": ("nostalgic childhood and bittersweet", "melancholy"),
    "돌아갈 수 없": ("bittersweet longing for something lost", "melancholy"),
    "낡은":   ("nostalgic and wistful", "melancholy"),
    "오래된": ("nostalgic and wistful", "melancholy"),
    "일기장": ("nostalgic and reflective", "melancholy"),
    "빈 놀이터": ("empty, nostalgic and wistful", "melancholy"),
    "텅 빈":  ("empty, wistful and pensive", "melancholy"),
    "허무":   ("empty, wistful and pensive", "melancholy"),
    "향수":   ("nostalgic and bittersweet", "melancholy"),
    "회상":   ("nostalgic and reflective", "melancholy"),
    "해 질 녘": ("sunset, nostalgic and wistful", "melancholy"),
    "낙엽":   ("autumn, wistful and nostalgic", "melancholy"),
    "곱씹":   ("pensive, reflective and subdued", "melancholy"),
    "회한":   ("regretful, wistful and pensive", "melancholy"),
    "돌아보": ("reflective and pensive", "melancholy"),
    "센티":   ("nostalgic, wistful and bittersweet", "melancholy"),
    "멜랑콜리": ("melancholic and pensive", "melancholy"),

    # ══ sad ════════════════════════════════════════════════════════
    "슬퍼":   ("sorrowful, heartbroken and tearful", "sad"),
    "슬픈":   ("sorrowful, heartbroken and tearful", "sad"),
    "슬픔":   ("sorrowful, heartbroken and tearful", "sad"),
    "서글":   ("sorrowful and tearful", "sad"),
    "서러":   ("sorrowful, heartbroken and tearful", "sad"),
    "먹먹":   ("heavy-hearted, sorrowful and tearful", "sad"),
    "찢어":   ("heartbroken and tearful", "sad"),
    "무너지": ("heartbroken and devastated", "sad"),
    "상실":   ("grief, loss and sorrowful", "sad"),
    "떠나보": ("grief, loss and heartbroken", "sad"),
    "울고 싶": ("tearful and heartbroken", "sad"),
    "울다":   ("tearful and heartbroken", "sad"),
    "울음":   ("tearful and sorrowful", "sad"),
    "흐느":   ("sobbing, tearful and sorrowful", "sad"),
    "절망":   ("hopeless, sorrowful and heartbroken", "sad"),
    "좌절":   ("discouraged, sorrowful and heartbroken", "sad"),
    "자책":   ("guilty, sorrowful and heartbroken", "sad"),
    "괴로":   ("painful, sorrowful and heartbroken", "sad"),
    "허탈":   ("deflated, sorrowful and heartbroken", "sad"),
    "눈앞이 뿌옇": ("tearful and sorrowful", "sad"),
    "마음이 무겁": ("heavy-hearted and sorrowful", "sad"),
    "마음이 아프": ("heartbroken and tearful", "sad"),
    "위로":   ("comforting, sorrowful and tearful", "sad"),
    "사랑하던": ("heartbroken after lost love, tearful", "sad"),

    # ══ angry ══════════════════════════════════════════════════════
    "열받":   ("furious, hostile and intense", "angry"),
    "열 받":  ("furious, hostile and intense", "angry"),
    "열이 올": ("furious and agitated", "angry"),
    "짜증":   ("irritated, agitated and aggressive", "angry"),
    "화나":   ("angry, intense and aggressive", "angry"),
    "분해":   ("furious and frustrated", "angry"),
    "분이 안": ("furious and frustrated", "angry"),
    "분이 풀": ("furious and frustrated", "angry"),
    "분통":   ("furious and frustrated", "angry"),
    "억울":   ("frustrated, furious and raw", "angry"),
    "부글":   ("simmering with rage and tense", "angry"),
    "치밀":   ("rage and furious", "angry"),
    "뒤집힐": ("agitated, furious and tense", "angry"),
    "속이 뒤집": ("agitated, furious and tense", "angry"),
    "무례":   ("hostile and confrontational", "angry"),
    "부당":   ("unfair, furious and confrontational", "angry"),
    "빡치":   ("furious, hostile and intense", "angry"),
    "빡쳐":   ("furious, hostile and intense", "angry"),
    "부숴":   ("destructive, aggressive and furious", "angry"),
    "집어던":  ("destructive, aggressive and furious", "angry"),
    "소리 지":  ("screaming, raw and furious", "angry"),
    "소리치":  ("screaming, raw and furious", "angry"),
    "이를 악":  ("gritted teeth, tense and furious", "angry"),
    "격분":   ("outraged, furious and intense", "angry"),
    "증오":   ("hateful, hostile and furious", "angry"),
    "울분":   ("outraged, furious and raw", "angry"),
    "미치겠":  ("agitated, frustrated and intense", "angry"),
    "시달":   ("stressed, agitated and hard-edged", "angry"),
    "스트레스": ("stressed, agitated and hard-edged", "angry"),
    "폭발하기": ("about to explode, tense and furious", "angry"),
    "폭발 직전": ("about to explode, tense and furious", "angry"),
    "터질 것": ("tense, agitated and furious", "angry"),
    "터져 나": ("tense, agitated and furious", "angry"),

    # ══ happy ══════════════════════════════════════════════════════
    "기뻐":   ("joyful, cheerful and uplifting", "happy"),
    "기쁘":   ("joyful, cheerful and uplifting", "happy"),
    "기쁨":   ("joyful, cheerful and uplifting", "happy"),
    "뿌듯":   ("proud, content and happy", "happy"),
    "만족":   ("content, bright and happy", "happy"),
    "콧노래": ("light-hearted, cheerful and happy", "happy"),
    "술술":   ("light, bright and happy", "happy"),
    "칭찬":   ("proud, warm and happy", "happy"),
    "선물":   ("warm, delighted and happy", "happy"),
    "좋은 소식": ("joyful, bright and uplifting", "happy"),
    "합격":   ("joyful, triumphant and happy", "happy"),
    "가벼워": ("light-hearted and happy", "happy"),
    "입꼬리": ("smiling, light-hearted and happy", "happy"),
    "해피":   ("happy and cheerful", "happy"),
    "홀가분": ("light, relieved and happy", "happy"),
    "신이 나": ("joyful, bright and happy", "happy"),
    "예뻐 보": ("bright, warm and happy", "happy"),
}

# 여러 감정 문장에 두루 쓰여서 신호가 약한 키워드 — 감정 집계에서 0.5표로 센다
WEAK = {"혼자", "외로", "그 사람", "창가", "감성", "공부", "카페", "그날", "사랑", "노을", "상상", "감상", "웃", "화"}

# WEAK 중에서도 '웃', '화'는 감정어 자체(웃음/화남)라 단독으로도 신호가 된다 — 0.5표로 세는 이유는
# 1글자라 오매칭 위험이 있어서일 뿐. 나머지(혼자·그 사람·카페 등)는 상황 단어라 감정을 정하지 못한다.
_CONTEXT_ONLY = WEAK - {"웃", "화"}

# 긴 키워드 우선 정렬 (모듈 로드 시 1회)
_SORTED = sorted(KEYWORDS.keys(), key=len, reverse=True)

MAX_PHRASES = 3


def _is_standalone(text: str, start: int, end: int) -> bool:
    """1글자 키워드 오매칭 방지 — 바로 앞 문자가 한글이면 단어 중간(예: 운동'화')이므로 제외."""
    if end - start == 1:
        before = text[start - 1] if start > 0 else ""
        if re.match(r"[가-힣]", before):
            return False
    return True


def match_keywords(text: str) -> List[Tuple[str, str, int, str]]:
    """
    text 안의 모든 키워드를 (감정, 영어 표현, 위치, 키워드)로 반환(겹침 제거, 위치순).
    감정 집계 필터는 적용하지 않은 원본 매칭 — 디버깅/평가용.
    """
    found: List[Tuple[str, str, int, str]] = []
    spans: List[Tuple[int, int]] = []
    for kw in _SORTED:
        start = text.find(kw)
        if start == -1:
            continue
        end = start + len(kw)
        if any(s < end and start < e for s, e in spans):
            continue
        if not _is_standalone(text, start, end):
            continue
        english, emotion = KEYWORDS[kw]
        found.append((emotion, english, start, kw))
        spans.append((start, end))
    found.sort(key=lambda x: x[2])
    return found


def translate_keywords(text: str) -> Optional[Tuple[str, str]]:
    """
    키워드 매칭 → (CLIP 영어 입력, 지배 감정 태그). 하나도 안 걸리면 None.
    매칭을 감정 태그로 집계해 최다 감정의 표현만 남기고(동률이면 모두 유지), 최대 3개를 이어 붙인다.
    """
    found = match_keywords(text)
    if not found:
        return None
    # 약한 키워드만 걸린 문장은 신호가 부족하다(예: '그 사람' 하나로 romantic 확정 → 오분류).
    # 키워드 경로를 쓰지 않고 분류기/폴백으로 넘긴다.
    if all(kw in _CONTEXT_ONLY for _, _, _, kw in found):
        return None
    counts: Dict[str, float] = {}
    for emotion, _, _, kw in found:
        counts[emotion] = counts.get(emotion, 0.0) + (0.5 if kw in WEAK else 1.0)
    top = max(counts.values())
    top_emotions = {e for e, c in counts.items() if c == top}
    kept = [(e, eng) for e, eng, _, _ in found if e in top_emotions][:MAX_PHRASES]
    seen, phrases = set(), []
    for _, eng in kept:
        if eng not in seen:
            seen.add(eng)
            phrases.append(eng)
    dominant = kept[0][0]
    return ", ".join(phrases), dominant
