import clip
import torch
import numpy as np
import json
import re
from functools import lru_cache
from PIL import Image
from .emotion_mapper import EmotionMapper
from utils.logger import get_logger

logger = get_logger("clip_model")

# ── V/A 앵커 8개 (Russell Circumplex 4분면 정밀 커버) ────────────────────────
_VA_ANCHORS = [
    # Valence 축 (긍정/부정)
    "a pleasant, beautiful, warm and uplifting feeling",       # V+ 강
    "a happy, joyful and cheerful atmosphere",                 # V+ 중
    "a dark, painful, miserable and hopeless atmosphere",      # V- 강
    "a sad, gloomy and melancholic feeling",                   # V- 중
    # Arousal 축 (활기/차분)
    "an energetic, exciting, intense and active atmosphere",   # A+ 강
    "a lively, upbeat and dynamic feeling",                    # A+ 중
    "a soft, gentle, slow and quiet atmosphere",                # A- 강
    "a calm, peaceful and relaxing feeling",                   # A- 중
]

# ── 한국어 → 영어 번역 사전 ────────────────────────────────────────────────
# 긴 키워드가 먼저 매칭되도록 _SORTED_KEYWORDS에서 정렬 후 사용
_KO_EMOTION_KEYWORDS = {
    # ── 복합어 우선 (오매칭 방지) ─────────────────────────
    "밤 드라이브": "night drive and atmospheric",
    "기분 좋":    "feel good and happy",
    "비 오":      "rainy and melancholy",
    "빗소리":     "rain sound and nostalgic",
    "몽환":       "dreamy and ethereal",
    "설레":       "exciting and romantic",
    "두근":       "heart flutter and excitement",
    "로맨":       "romantic and loving",
    "연인":       "lover and romantic",
    "데이트":     "date and romantic",
    "에너지":     "energy and dynamic",
    "활기":       "energetic and vibrant",
    "파워":       "powerful and strong",
    "달리":       "running and energetic",
    "헬스":       "gym and fitness",
    "운동":       "workout and exercise",
    "행복":       "happy and cheerful",
    "즐거":       "joyful and fun",
    "파티":       "party and celebration",
    "신나":       "exciting and joyful",
    "슬프":       "sad and sorrowful",
    "우울":       "depressed and gloomy",
    "눈물":       "tears and crying",
    "혼자":       "alone and lonely",
    "실연":       "heartbreak and breakup",
    "이별":       "farewell and goodbye",
    "외로":       "lonely and isolated",
    "그리":       "miss and longing",
    "조용":       "quiet and peaceful",
    "차분":       "calm and serene",
    "휴식":       "rest and relax",
    "카페":       "calm cafe atmosphere",
    "공부":       "focus and concentrate",
    "명상":       "meditation and peace",
    "여유":       "leisurely and relaxed",
    "평온":       "tranquil and peaceful",
    "사랑":       "love and romance",
    "감성":       "sentimental and emotional",
    "노을":       "sunset and nostalgic",
    "추억":       "memory and nostalgia",
    "그날":       "that day and reminisce",
    "창가":       "window and contemplative",
    "분노":       "rage and furious",
    "격렬":       "intense and fierce",
    "강렬":       "powerful and aggressive",
    "새벽":       "late night and dreamy",
    "공상":       "fantasy and dreamy",
    "상상":       "imagination and dreamy",
    "감상":       "contemplative and atmospheric",
    # ── 1글자 (맨 마지막 — 형태소 경계 체크 적용) ─────────
    "춤":         "dance and celebrate",
    "웃":         "laugh and smile",
    "화":         "angry and intense",   # "운동화" 오매칭 방지 → _is_standalone 으로 처리
}

# 긴 키워드 우선 정렬 (모듈 로드 시 1회)
_SORTED_KEYWORDS = sorted(_KO_EMOTION_KEYWORDS.keys(), key=len, reverse=True)


def _is_standalone(text: str, start: int, end: int) -> bool:
    """
    1글자 키워드 오매칭 방지.
    바로 앞 문자가 한글이면 단어 중간(예: 운동'화')이므로 False 반환.
    """
    if end - start == 1:
        before = text[start - 1] if start > 0 else ""
        if re.match(r"[가-힣]", before):
            return False
    return True


def _translate_korean(text: str) -> str:
    """
    한국어 텍스트 → CLIP 영어 변환.

    개선 포인트:
    1. 긴 키워드 우선 매칭 (_SORTED_KEYWORDS)
    2. 이미 매칭된 위치 추적 → 중복/겹침 방지
    3. 1글자 키워드 형태소 경계 체크 (_is_standalone)
    4. 키워드 미매칭 한국어 입력 → fallback 영어 문장 반환
       (한국어 원문을 CLIP에 직접 입력하면 정확도 급락)
    """
    matched: list[str] = []
    used_spans: list[tuple[int, int]] = []

    for keyword in _SORTED_KEYWORDS:
        start = text.find(keyword)
        if start == -1:
            continue
        end = start + len(keyword)

        # 겹침 체크
        if any(s < end and start < e for s, e in used_spans):
            continue

        # 1글자 형태소 경계 체크
        if not _is_standalone(text, start, end):
            continue

        matched.append(_KO_EMOTION_KEYWORDS[keyword])
        used_spans.append((start, end))
        if len(matched) >= 3:
            break

    if matched:
        result = ", ".join(matched)
        logger.info(f"번역: '{text[:20]}' → '{result}'")
        return result

    # 한국어 포함이지만 키워드 미매칭 → CLIP용 fallback
    if re.search(r"[가-힣]", text):
        logger.info(f"번역 키워드 없음, fallback 사용: '{text[:20]}'")
        return "a music that matches this emotional feeling and mood"

    return text  # 영어 원문 그대로


@lru_cache(maxsize=1)
def _load_clip(model_name: str):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"CLIP 로딩: {model_name} on {device}")
    model, preprocess = clip.load(model_name, device=device)
    model.eval()
    return model, preprocess, device


@lru_cache(maxsize=1)
def _va_anchor_features(model_name: str) -> torch.Tensor:
    """V/A 앵커 8개를 CLIP으로 인코딩 후 캐싱 (서버 수명 동안 1회)"""
    model, _, device = _load_clip(model_name)
    with torch.no_grad():
        tokens = clip.tokenize(_VA_ANCHORS).to(device)
        feats  = model.encode_text(tokens)
        feats  = feats / feats.norm(dim=-1, keepdim=True)
    logger.info(f"V/A 앵커 임베딩 캐싱 완료 ({len(_VA_ANCHORS)}개)")
    return feats


class ClipModel:

    _EMOTION_DESCRIPTIONS = {
        "happy":      "joyful, cheerful and uplifting",
        "sad":        "sorrowful, heartbroken and tearful",
        "calm":       "peaceful, relaxing and serene",
        "energetic":  "powerful, exciting and dynamic",
        "romantic":   "loving, tender and intimate",
        "melancholy": "nostalgic, longing and bittersweet",
        "angry":      "intense, aggressive and fierce",
        "dreamy":     "atmospheric, ethereal and surreal",
    }

    def __init__(self, model_name: str = "ViT-B/32"):
        self.model_name = model_name
        self.model, self.preprocess, self.device = _load_clip(model_name)
        self.emotion_mapper   = EmotionMapper()
        self.emotions         = self.emotion_mapper.get_all_emotions()
        self.emotion_features = self._encode_emotion_prompts()
        _va_anchor_features(model_name)   # 앵커 사전 캐싱
        logger.info(f"ClipModel 초기화 완료: {self.emotions}")

    # ── 감정 프롬프트 인코딩 ────────────────────────────────────────────────
    def _build_emotion_prompts(self) -> list[str]:
        return [
            f"a {self._EMOTION_DESCRIPTIONS.get(e, e)} feeling music"
            for e in self.emotions
        ]

    def _encode_emotion_prompts(self) -> torch.Tensor:
        with torch.no_grad():
            tokens = clip.tokenize(self._build_emotion_prompts()).to(self.device)
            feats  = self.model.encode_text(tokens)
            feats  = feats / feats.norm(dim=-1, keepdim=True)
        return feats

    # ── V/A 동적 계산 — 앵커 8개 버전 ─────────────────────────────────────
    def _compute_va(self, embedding: np.ndarray) -> tuple[float, float]:
        """
        앵커 8개와 cosine similarity 계산 후 V/A 산출.

        인덱스 구조 (_VA_ANCHORS 순서와 동일):
          sims[0] = V+ 강,  sims[1] = V+ 중
          sims[2] = V- 강,  sims[3] = V- 중
          sims[4] = A+ 강,  sims[5] = A+ 중
          sims[6] = A- 강,  sims[7] = A- 중

        V = (V+강 + V+중)/2 − (V-강 + V-중)/2
        A = (A+강 + A+중)/2 − (A-강 + A-중)/2
        → 범위: −1.0 ~ +1.0 (이론상)
        """
        emb = torch.tensor(embedding, dtype=torch.float32).unsqueeze(0)
        emb = emb / emb.norm(dim=-1, keepdim=True)
        anchors = _va_anchor_features(self.model_name)
        sims    = (emb @ anchors.T)[0].tolist()

        v_pos  = (sims[0] + sims[1]) / 2
        v_neg  = (sims[2] + sims[3]) / 2
        a_act  = (sims[4] + sims[5]) / 2
        a_calm = (sims[6] + sims[7]) / 2

        return round(float(v_pos - v_neg), 4), round(float(a_act - a_calm), 4)

    # ── 분석 메서드 ─────────────────────────────────────────────────────────
    def analyze_text(self, text: str) -> dict:
        logger.info(f"텍스트 분석: {text[:30]}...")
        english_text = _translate_korean(text)
        with torch.no_grad():
            token = clip.tokenize([english_text], truncate=True).to(self.device)
            feat  = self.model.encode_text(token)
            feat  = feat / feat.norm(dim=-1, keepdim=True)
            probs = (feat @ self.emotion_features.T) \
                    .squeeze().softmax(dim=-1).cpu().numpy()
        return self._build_result(feat.cpu().numpy()[0], probs)

    def analyze_image(self, image: Image.Image) -> dict:
        logger.info("이미지 분석 시작")
        with torch.no_grad():
            img  = self.preprocess(image).unsqueeze(0).to(self.device)
            feat = self.model.encode_image(img)
            feat = feat / feat.norm(dim=-1, keepdim=True)
            probs = (feat @ self.emotion_features.T) \
                    .squeeze().softmax(dim=-1).cpu().numpy()
        return self._build_result(feat.cpu().numpy()[0], probs)

    def analyze_both(self, text: str, image: Image.Image) -> dict:
        """
        복합(텍스트+이미지) 분석.

        [수정] 기존에는 analyze_text()/analyze_image()를 각각 끝까지 돌려
        (softmax까지 완료된) 확률분포 두 개를 사후에 평균냈다. 텍스트와
        이미지가 서로 다른 감정을 가리키는 경우, 이 방식은 최고 확률이
        여러 클래스로 흩어져 신뢰도가 비정상적으로 낮게(예: 8클래스 기준
        랜덤 확률 12.5%에 가까운 수준까지) 나오는 문제가 있었다.

        대신 텍스트·이미지 각각의 정규화된 CLIP 임베딩을 구한 뒤, 그
        임베딩 자체를 평균·재정규화해서 "하나의 결합 임베딩"을 만들고,
        감정 유사도 softmax는 그 결합 임베딩에 대해 딱 한 번만 계산한다.
        텍스트·이미지가 같은 감정을 가리킬 때는 신뢰도가 서로 보강되고,
        다른 감정을 가리킬 때도 억지로 짓눌리지 않는 정직한 결과가 나온다.
        """
        logger.info("복합 분석 시작")
        english_text = _translate_korean(text)

        with torch.no_grad():
            token  = clip.tokenize([english_text], truncate=True).to(self.device)
            t_feat = self.model.encode_text(token)
            t_feat = t_feat / t_feat.norm(dim=-1, keepdim=True)

            img    = self.preprocess(image).unsqueeze(0).to(self.device)
            i_feat = self.model.encode_image(img)
            i_feat = i_feat / i_feat.norm(dim=-1, keepdim=True)

            combined = (t_feat + i_feat) / 2
            combined = combined / combined.norm(dim=-1, keepdim=True)

            probs = (combined @ self.emotion_features.T) \
                    .squeeze().softmax(dim=-1).cpu().numpy()

        return self._build_result(combined.cpu().numpy()[0], probs)

    # ── 결과 빌드 ───────────────────────────────────────────────────────────
    def _build_result(self, embedding: np.ndarray,
                      probabilities: np.ndarray) -> dict:
        top2       = probabilities.argsort()[-2:][::-1]
        primary    = self.emotions[top2[0]]
        secondary  = self.emotions[top2[1]]
        confidence = float(probabilities[top2[0]])
        valence, arousal = self._compute_va(embedding)

        logger.info(
            f"분석 결과: {primary} ({confidence:.2%}) "
            f"| V={valence:+.3f} A={arousal:+.3f}"
        )

        return {
            "primary_emotion":   primary,
            "secondary_emotion": secondary,
            "confidence":        round(confidence, 4),
            "probabilities":     probabilities.tolist(),
            "clip_embedding":    json.dumps(embedding.tolist()),
            "valence":           valence,
            "arousal":           arousal,
            "lastfm_tags":       json.dumps(
                self.emotion_mapper.get_lastfm_tags(primary)),
        }
