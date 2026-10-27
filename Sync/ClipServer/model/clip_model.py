import os
import clip
import torch
import numpy as np
import json
import re
from functools import lru_cache
from typing import Optional
from PIL import Image
from .emotion_mapper import EmotionMapper
from .ko_keywords import KEYWORDS as KO_KEYWORDS, translate_keywords
from .emotion_classifier import EmotionProjection, VAHead
from .emotion_prompts import build_prompt_ensemble_anchors, EMOTION_PROMPTS
from .korean_emotion import classify_korean_emotion
from .late_fusion import geometric_fuse, apply_temperature, assess_conflict, fuse_va
from .text_head import TextHead, blend_probs
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

# ── 한국어 → 영어 번역 사전: model/ko_keywords.py 로 분리(감정 태그 포함, torch 없이 단독 테스트 가능) ──
# calibrate_gate.py 호환용으로 예전 이름(키워드 → 영어 표현)도 유지한다.
_KO_EMOTION_KEYWORDS = {k: v[0] for k, v in KO_KEYWORDS.items()}


def _translate_korean(text: str) -> str:
    """
    한국어 텍스트 → CLIP 영어 변환.

    개선 포인트:
    1. 긴 키워드 우선 매칭 (_SORTED_KEYWORDS)
    2. 이미 매칭된 위치 추적 → 중복/겹침 방지
    3. 1글자 키워드 형태소 경계 체크 (_is_standalone)
    4. [수정 4] 키워드 미매칭 시, 가벼운 한국어 감정분류(KoELECTRA 6-class,
       korean_emotion.py)로 한 번 더 시도 — angry/happy/sad/melancholy
       4개만 매핑 가능(모델 자체가 6개 라벨 중 이 4개만 SYNC와 의미가
       맞음, calm/energetic/romantic/dreamy는 커버 안 됨). 그마저도 안
       걸리면(모델 미로드/저확신/매핑 없는 라벨) 최종 fallback 영어 문장
       반환 (한국어 원문을 CLIP에 직접 입력하면 정확도 급락)
    """
    kw = translate_keywords(text)
    if kw is not None:
        result, dominant = kw
        logger.info(f"번역: '{text[:20]}' → '{result}' (키워드 감정={dominant})")
        return result

    # 키워드 미매칭 → 가벼운 한국어 감정분류로 한 번 더 시도
    if re.search(r"[가-힣]", text):
        kote_result = classify_korean_emotion(text)
        if kote_result is not None:
            sync_emotion, conf = kote_result
            prompt = f"a {EMOTION_PROMPTS[sync_emotion][0]} feeling music"
            logger.info(
                f"번역(감정분류): '{text[:20]}' → '{prompt}' "
                f"(감정={sync_emotion}, {conf:.2%})"
            )
            return prompt

        # 감정분류도 실패(미로드/저확신/매핑없음) → 최종 fallback
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


def _fusion_settings():
    """config.Settings 의 FUSION_MODE / FUSION_W_IMG (환경변수·.env 로도 바꿀 수 있음). 못 읽으면 기본값."""
    try:
        from config import settings
        return settings.FUSION_MODE, float(settings.FUSION_W_IMG)
    except Exception:
        return "late", 0.5


class ClipModel:

    # 감정 프롬프트 정의는 model/emotion_prompts.py 하나로 통일 (아래
    # _encode_emotion_prompts 자리를 build_prompt_ensemble_anchors 호출로
    # 대체 — train_emotion_projection.py / evaluate_projection.py /
    # calibrate_temperature.py도 전부 같은 함수를 씀)

    # EmoSet으로 학습한 체크포인트가 있으면 여기서 로드. 파일이 없거나 로드에
    # 실패해도 서버가 죽지 않고 그냥 순수 zero-shot(has_projection=False)으로
    # 동작함 — 학습 전/재학습 중에도 서버는 항상 정상 기동되도록 하기 위함.
    text_head = None   # _load_text_head() 가 채움(테스트용 __new__ 인스턴스에서도 속성이 있도록 기본값)

    EMOTION_PROJECTION_PATH = os.path.join(
        os.path.dirname(__file__), "emotion_projection.pt"
    )

    def __init__(self, model_name: str = "ViT-B/32"):
        self.model_name = model_name
        self.fusion_mode, self.fusion_w_img = _fusion_settings()
        self.model, self.preprocess, self.device = _load_clip(model_name)
        self.emotion_mapper   = EmotionMapper()
        self.emotions         = self.emotion_mapper.get_all_emotions()
        self.emotion_features = build_prompt_ensemble_anchors(
            self.model, self.device, self.emotions
        )
        _va_anchor_features(model_name)   # 앵커 사전 캐싱
        self._load_projection_checkpoint()
        self._load_text_head()
        self._load_measured_accuracy()
        logger.info(f"ClipModel 초기화 완료: {self.emotions}")

    def _load_measured_accuracy(self):
        """
        화면의 '모델 정확도'에 쓸 입력 종류별 실측 정확도(model/measured_accuracy.json,
        update_measured_accuracy.py 가 results/*.json 에서 만든다). 없으면 None → 예전 동작.
        """
        self.measured_accuracy = {}
        path = os.path.join(os.path.dirname(__file__), "measured_accuracy.json")
        if not os.path.exists(path):
            return
        try:
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
            self.measured_accuracy = {k: float(v["accuracy"]) for k, v in d.items()
                                      if isinstance(v, dict) and v.get("accuracy") is not None}
            logger.info(f"measured_accuracy.json 로드: {self.measured_accuracy}")
        except Exception as e:
            logger.warning(f"measured_accuracy.json 읽기 실패, 예전 표시 방식 사용: {e}")

    def _acc_for(self, kind: str):
        """kind: text | image | both. 실측값이 없으면 이미지/복합은 체크포인트 val_acc(예전 방식), 텍스트는 None."""
        v = getattr(self, "measured_accuracy", {}).get(kind)
        if v is not None:
            return v
        return None if kind == "text" else self.projection_val_acc

    def _load_text_head(self):
        """model/text_head.pt(train_text_head.py 가 저장)가 있으면 한국어 텍스트 경로에 학습된 헤드를 합친다."""
        self.text_head = TextHead.load(
            os.path.join(os.path.dirname(__file__), "text_head.pt"), self.emotions)
        if self.text_head is not None:
            logger.info(f"text_head.pt 로드 완료 (feat={self.text_head.feat}, a={self.text_head.a:.2f}, "
                        f"T={self.text_head.T:.3f})")

    def _load_projection_checkpoint(self):
        self.has_projection = False
        self.projection = None
        self.va_head = None
        self.projection_val_acc = None
        # Temperature Scaling(calibrate_temperature.py) — 체크포인트에 키가
        # 없으면(아직 보정 안 한 구버전 체크포인트) 1.0으로 두어 기존 동작과
        # 완전히 동일하게(no-op) 유지한다.
        self.temperature = 1.0
        self.image_class_bias = torch.zeros(len(self.emotions), device=self.device)
        # 텍스트 전용 T — calibrate_text_temperature.py 가 저장. 없으면 이미지 기준 T 를 그대로 사용(기존 동작)
        self.temperature_text = None
        # 텍스트 앵커 편향 보정(probe_text_bias.py 가 저장) — 특정 감정 앵커가 모든 문장과 두루 가까워
        # 2순위를 독차지하는 '허브' 현상을 줄인다. 없으면 None(기존 동작).
        self.text_bias = None
        self.text_scale = None
        # 복합 입력 후기 융합 확률의 온도 — eval_fusion.py --save-temperature 가 저장. 없으면 None(no-op)
        self.temperature_both = None
        if not os.path.exists(self.EMOTION_PROJECTION_PATH):
            logger.info("emotion_projection.pt 없음 — 순수 zero-shot으로 동작")
            return
        try:
            ckpt = torch.load(self.EMOTION_PROJECTION_PATH, map_location=self.device)
            ck_clip = ckpt.get("clip_model", "ViT-B/32")
            if ck_clip != self.model_name:
                raise ValueError(f"체크포인트는 CLIP {ck_clip} 용인데 서버는 {self.model_name} 로 떠 있음 — "
                                 f"config.py 의 CLIP_MODEL 을 맞추세요")
            projection = EmotionProjection(dim=512).to(self.device)
            va_head    = VAHead(dim=512).to(self.device)
            projection.load_state_dict(ckpt["projection_state_dict"])
            va_head.load_state_dict(ckpt["va_head_state_dict"])
            projection.eval()
            va_head.eval()
            self.projection = projection
            self.va_head = va_head
            self.has_projection = True
            self.projection_val_acc = ckpt.get("val_acc")  # EmoSet 검증셋 기준 학습 시점 정확도
            self.temperature = ckpt.get("temperature", 1.0)  # calibrate_temperature.py가 fit한 값
            self.temperature_text = ckpt.get("temperature_text")  # calibrate_text_temperature.py가 fit한 값(없으면 None)
            self.temperature_both = ckpt.get("temperature_both")  # eval_fusion.py 가 fit한 값(없으면 None)
            # train_projection_v2.py --fit-class-bias 가 저장한 감정별 logit 가산값(없으면 0 → 기존 동작)
            self.image_class_bias = torch.zeros(len(self.emotions), device=self.device)
            icb = ckpt.get("image_class_bias")
            if icb is not None:
                if list(ckpt.get("image_class_bias_emotions", self.emotions)) == list(self.emotions):
                    self.image_class_bias = torch.tensor(icb, dtype=torch.float32, device=self.device)
                else:
                    logger.warning("image_class_bias 의 감정 순서가 서비스와 달라 무시합니다")
            tb = ckpt.get("text_bias")
            if tb is not None and self.temperature_text:
                if list(ckpt.get("text_bias_emotions", self.emotions)) == list(self.emotions):
                    self.text_bias = torch.tensor(tb, dtype=torch.float32, device=self.device)
                    ts = ckpt.get("text_scale")
                    self.text_scale = (torch.tensor(ts, dtype=torch.float32, device=self.device)
                                       if ts is not None else torch.ones_like(self.text_bias))
                else:
                    logger.warning("text_bias 의 감정 순서가 서비스와 달라 무시합니다")
            logger.info(
                f"emotion_projection.pt 로드 완료 "
                f"(val_acc={ckpt.get('val_acc', '?')}, epoch={ckpt.get('epoch', '?')}, "
                f"temperature={self.temperature:.4f})"
            )
        except Exception as e:
            logger.error(f"emotion_projection.pt 로드 실패, zero-shot으로 폴백: {e}")
            self.has_projection = False

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

    # ── EmotionProjection / VAHead 적용 (학습 안 됐으면 원본 그대로 통과) ──
    def _apply_projection(self, feat: torch.Tensor) -> torch.Tensor:
        """이미지 임베딩에 학습된 보정을 적용. 체크포인트 없으면 feat 그대로 반환."""
        if not self.has_projection:
            return feat
        with torch.no_grad():
            return self.projection(feat)

    def _image_va(self, corrected_feat: torch.Tensor) -> tuple[float, float]:
        """
        이미지 쪽 V/A. 학습된 VAHead가 있으면 그걸로 직접 회귀값을 내고,
        없으면 기존 텍스트 앵커 8개 기반 _compute_va()로 폴백한다.
        """
        if self.has_projection:
            with torch.no_grad():
                va = self.va_head(corrected_feat).squeeze(0).tolist()
            return round(float(va[0]), 4), round(float(va[1]), 4)
        return self._compute_va(corrected_feat.cpu().numpy()[0])

    def _text_va(self, probs: np.ndarray):
        """
        텍스트 V/A = 감정 확률 × 감정별 기준 좌표의 가중평균.
        기존 방식(앵커 8개와의 코사인 차이)은 텍스트 임베딩에서 값이 ±0.02 안쪽으로 몰려
        어떤 문장이든 좌표가 정중앙(중립/보통)에 찍혔다. 이미지 쪽 VAHead 가 학습한 것과
        같은 좌표계(model/emotion_va_map.SERVICE_VA_ANCHOR)를 써서 두 경로의 스케일을 맞춘다.
        좌표표를 못 읽으면 None → _build_result 가 기존 방식으로 폴백한다.
        """
        try:
            from .emotion_va_map import SERVICE_VA_ANCHOR
            v = sum(float(p) * SERVICE_VA_ANCHOR[e][0] for p, e in zip(probs, self.emotions))
            a = sum(float(p) * SERVICE_VA_ANCHOR[e][1] for p, e in zip(probs, self.emotions))
            return round(v, 4), round(a, 4)
        except Exception as e:  # 감정 이름이 표에 없는 경우 등
            logger.warning(f"텍스트 V/A 좌표 계산 실패, 기존 방식으로 폴백: {e}")
            return None

    # ── 경로별 순전파 (analyze_* 와 평가 스크립트가 공유) ───────────────────
    def _text_forward(self, text: str):
        """텍스트 → (CLIP 텍스트 임베딩, 감정 확률[서비스 경로: 허브 보정 + 텍스트 전용 T])."""
        english_text = _translate_korean(text)
        with torch.no_grad():
            token = clip.tokenize([english_text], truncate=True).to(self.device)
            feat  = self.model.encode_text(token)
            feat  = feat / feat.norm(dim=-1, keepdim=True)
            logits = (feat @ self.emotion_features.T).squeeze()
            if self.text_bias is not None:
                logits = (logits - self.text_bias) / self.text_scale
            # [수정 5] analyze_image()에는 있고 여기엔 빠져 있던 temperature 스케일링을 동일하게 적용.
            # 이게 없으면 raw cosine similarity(보통 0.2~0.35대로 서로 비슷비슷함)가 그대로 softmax 에 들어가
            # 입력마다 거의 균등분포(8개 기준 ~12.5%)로 뭉개진다.
            if self.has_projection:
                # 텍스트 경로는 projection 이 없는 zero-shot 이라 logit 분포가 이미지와 다르다 →
                # 텍스트 전용 T 가 보정돼 있으면 그걸 쓰고, 없으면 기존처럼 이미지 기준 T 사용
                logits = logits / (self.temperature_text or self.temperature)
            probs = logits.softmax(dim=-1).cpu().numpy()
        # 학습된 텍스트 헤드(한국어만): KoELECTRA 특징 위 8감정 선형 헤드 확률과 CLIP 경로 확률을 합친다.
        # 헤드가 없거나 KoELECTRA 를 못 쓰면 p_head 가 None → 기존 확률 그대로.
        if self.text_head is not None and re.search(r"[가-힣]", text):
            p_head = self.text_head.predict(text)
            if p_head is not None:
                probs = blend_probs(p_head, probs, self.text_head.a, self.text_head.T)
        return feat, probs

    def _image_forward(self, image: Image.Image):
        """이미지 → (원본 임베딩, 보정된 임베딩, 감정 확률[서비스 경로: 프로젝션 + 온도], V/A)."""
        with torch.no_grad():
            img  = self.preprocess(image).unsqueeze(0).to(self.device)
            feat = self.model.encode_image(img)
            feat = feat / feat.norm(dim=-1, keepdim=True)
            corrected = self._apply_projection(feat)
            logits = (corrected @ self.emotion_features.T).squeeze()
            # calibrate_temperature.py로 학습된 T가 있으면 여기서 나눔 — 순수 zero-shot(has_projection=False)일 땐
            # 그 분포로 T를 fit한 적이 없으므로 적용하지 않는다.
            if self.has_projection:
                logits = logits / self.temperature + self.image_class_bias
            probs = logits.softmax(dim=-1).cpu().numpy()
            va = self._image_va(corrected)
        return feat, corrected, probs, va

    # ── 분석 메서드 ─────────────────────────────────────────────────────────
    def analyze_text(self, text: str) -> dict:
        logger.info(f"텍스트 분석: {text[:30]}...")
        feat, probs = self._text_forward(text)
        return self._build_result(feat.cpu().numpy()[0], probs, va=self._text_va(probs),
                                  model_val_accuracy=self._acc_for("text"))

    def analyze_image(self, image: Image.Image) -> dict:
        logger.info("이미지 분석 시작")
        _, corrected, probs, va = self._image_forward(image)
        result = self._build_result(corrected.cpu().numpy()[0], probs, va=va,
                                    model_val_accuracy=self._acc_for("image"))
        result["reliability"] = self._image_reliability(probs)
        return result

    # 이미지 단독 입력의 '확실/보통/애매' 표시. 1·2위 확률 차이(margin)로 나눈다.
    # 기준은 교차검증(281장 × 3회, aug_experiments.py)에서 미리 정했고 봉인 테스트(99장)로 한 번 확인했다
    # (확실 72.2%, 보통 58.6%, 애매 37.5% 적중). 텍스트·복합 입력은 검증하지 않아 표시하지 않는다.
    RELIABILITY_HIGH = 0.38
    RELIABILITY_LOW = 0.18

    def _image_reliability(self, probs) -> str:
        s = np.sort(np.asarray(probs, dtype=float))
        margin = float(s[-1] - s[-2])
        if margin >= self.RELIABILITY_HIGH:
            return "high"
        if margin >= self.RELIABILITY_LOW:
            return "mid"
        return "low"

    def analyze_parts(self, text: str, image: Image.Image) -> dict:
        """
        복합 입력의 재료만 한 번에 계산해 돌려준다(평가 스크립트용 — 가중치·방식을 바꿔가며 비교할 때
        CLIP 을 다시 돌리지 않도록). 서버는 analyze_both() 를 쓴다.
        """
        t_feat, p_txt = self._text_forward(text)
        _, i_corr, p_img, va_img = self._image_forward(image)
        with torch.no_grad():
            combined = (t_feat + i_corr) / 2
            combined = combined / combined.norm(dim=-1, keepdim=True)
            logits = (combined @ self.emotion_features.T).squeeze()
            if self.has_projection:
                logits = logits / self.temperature
            p_early = logits.softmax(dim=-1).cpu().numpy()
        return {
            "p_img": p_img, "p_txt": p_txt, "p_early": p_early,
            "va_img": va_img, "va_txt": self._text_va_or_anchor(p_txt, t_feat),
            "embedding": combined.cpu().numpy()[0],
        }

    def _text_va_or_anchor(self, p_txt, t_feat):
        va = self._text_va(p_txt)
        return va if va is not None else self._compute_va(t_feat.cpu().numpy()[0])

    def analyze_both(self, text: str, image: Image.Image,
                     mode: Optional[str] = None, w_img: Optional[float] = None) -> dict:
        """
        복합(텍스트+이미지) 분석.

        mode="late"(기본): 후기 융합. 이미지·텍스트를 각각 보정된 서비스 경로로 돌려 확률을 구한 뒤
            가중 기하평균으로 합친다(model/late_fusion.py). 두 경로의 1순위가 다르면 conflict 플래그를 켠다.
            V/A 도 이미지(VAHead)·텍스트(확률×기준좌표)를 같은 가중치로 섞는다.
        mode="early": 예전 방식(두 임베딩 0.5:0.5 평균 → 이미지용 T 하나). 비교·롤백용.

        [배경] 적응형 Gated Fusion 은 3번 시도했지만(절대 유사도 → top1-top2 margin → margin z-score)
        매번 같은 방향으로 실패했다: 이미지 쪽은 EmoSet 으로 지도학습된 분류기, 텍스트 쪽은 학습을 받지 않은
        zero-shot 이라 어떤 확신 지표를 써도 이미지가 구조적으로 더 '확신 있어' 보인다. 학습 없이 두 경로를
        각자의 보정된 확률로 합치는 후기 융합은 이 문제를 피한다. (짝 데이터 ~100개로 검증: eval_fusion.py)
        """
        logger.info("복합 분석 시작")
        mode  = mode or self.fusion_mode
        w_img = self.fusion_w_img if w_img is None else w_img
        parts = self.analyze_parts(text, image)

        if mode == "early":
            va = (round((parts["va_img"][0] + parts["va_txt"][0]) / 2, 4),
                  round((parts["va_img"][1] + parts["va_txt"][1]) / 2, 4))
            result = self._build_result(parts["embedding"], parts["p_early"], va=va,
                                        model_val_accuracy=self._acc_for("both"))
            result["fusion_mode"] = "early"
            return result

        fused = geometric_fuse(parts["p_img"], parts["p_txt"], w_img)
        fused = apply_temperature(fused, self.temperature_both)   # 짝 데이터로 보정해 둔 값이 있을 때만(없으면 no-op)
        va = fuse_va(parts["va_img"], parts["va_txt"], w_img)
        info = assess_conflict(parts["p_img"], parts["p_txt"], self.emotions)
        result = self._build_result(parts["embedding"], fused, va=va,
                                    model_val_accuracy=self._acc_for("both"))
        result.update(info)
        result["fusion_mode"] = "late"
        if info["conflict"]:
            logger.info(f"입력 간 불일치({info['conflict_level']}): 이미지={info['image_emotion']} "
                        f"({info['image_confidence']:.0%}) / 텍스트={info['text_emotion']} "
                        f"({info['text_confidence']:.0%}) → 융합={result['primary_emotion']} "
                        f"({result['confidence']:.0%})")
        return result

    # ── 결과 빌드 ───────────────────────────────────────────────────────────
    def _build_result(self, embedding: np.ndarray,
                      probabilities: np.ndarray,
                      va: tuple[float, float] = None,
                      model_val_accuracy: float = None) -> dict:
        top2       = probabilities.argsort()[-2:][::-1]
        primary    = self.emotions[top2[0]]
        secondary  = self.emotions[top2[1]]
        confidence = float(probabilities[top2[0]])
        # va가 이미 주어졌으면(이미지/복합 경로 — VAHead 또는 모달리티별 평균)
        # 그대로 쓰고, 없으면(텍스트 경로) 기존 앵커 8개 방식으로 계산
        valence, arousal = va if va is not None else self._compute_va(embedding)

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
            # '평소 얼마나 잘 맞히는지' — 이번 요청 하나의 신뢰도(confidence)와는 다른 값.
            # model/measured_accuracy.json 이 있으면 입력 종류(텍스트/이미지/복합)별 실측 정확도,
            # 없으면 예전처럼 이미지·복합은 EmoSet 검증셋 val_acc, 텍스트 전용은 None.
            "model_val_accuracy": (
                round(float(model_val_accuracy), 4) if model_val_accuracy is not None else None
            ),
        }
