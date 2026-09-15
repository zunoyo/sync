from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from schemas.request  import AnalyzeRequest
from schemas.response import AnalyzeResponse, HealthResponse
from model.clip_model  import ClipModel
from utils.image_utils import load_image, load_image_from_bytes
from utils.logger      import get_logger

logger = get_logger("main")

clip_model: ClipModel = None

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


# ── lifespan ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global clip_model
    logger.info("SoundWave CLIP 서버 시작")
    clip_model = ClipModel(model_name=settings.CLIP_MODEL)
    logger.info("서버 준비 완료")
    yield
    logger.info("SoundWave CLIP 서버 종료")


# ── FastAPI 앱 ─────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "SoundWave CLIP Server (Improved)",
    description = "8감정 Zero-shot + Russell Circumplex V/A 동적 계산",
    version     = "2.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── 공통 분석 로직 ─────────────────────────────────────────────────────────
def _run_analysis(input_type: str,
                  input_text: Optional[str],
                  image_url:  Optional[str],
                  image_bytes: Optional[bytes],
                  summary: str) -> AnalyzeResponse:
    """
    JSON / multipart 두 엔드포인트가 공유하는 핵심 분석 함수
    """
    result = None

    if input_type == "text":
        if not input_text:
            raise HTTPException(400, "input_text가 필요합니다")
        result  = clip_model.analyze_text(input_text)
        summary = input_text[:50]

    elif input_type == "image":
        if image_bytes:
            image = load_image_from_bytes(image_bytes)
        elif image_url:
            image = load_image(image_url)
        else:
            raise HTTPException(400, "image_url 또는 파일이 필요합니다")
        if image is None:
            raise HTTPException(400, "이미지를 불러올 수 없습니다")
        result  = clip_model.analyze_image(image)
        summary = summary or "이미지 감정 분석"

    elif input_type == "both":
        if not input_text:
            raise HTTPException(400, "input_text가 필요합니다")
        if image_bytes:
            image = load_image_from_bytes(image_bytes)
        elif image_url:
            image = load_image(image_url)
        else:
            raise HTTPException(400, "image_url 또는 파일이 필요합니다")
        if image is None:
            raise HTTPException(400, "이미지를 불러올 수 없습니다")
        result  = clip_model.analyze_both(input_text, image)
        summary = input_text[:50]

    else:
        raise HTTPException(400, "input_type은 text/image/both 중 하나")

    logger.info(f"분석 완료: {result['primary_emotion']} "
                f"({result['confidence']:.2%}) "
                f"V={result['valence']:+.3f} A={result['arousal']:+.3f}")

    return AnalyzeResponse(
        primary_emotion   = result["primary_emotion"],
        secondary_emotion = result["secondary_emotion"],
        valence           = result["valence"],
        arousal           = result["arousal"],
        confidence        = result["confidence"],
        clip_embedding    = result["clip_embedding"],
        lastfm_tags       = result["lastfm_tags"],
        input_summary     = summary,
    )


# ── 엔드포인트 ─────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", message="CLIP 서버가 정상 작동 중입니다")


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_json(request: AnalyzeRequest):
    """
    JSON 방식 (Soundwave / src 호환)
    Spring Boot EmotionVectorService → application/json
    """
    try:
        return _run_analysis(
            input_type  = request.input_type,
            input_text  = request.input_text,
            image_url   = request.image_url,
            image_bytes = None,
            summary     = "",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"분석 오류: {e}")
        raise HTTPException(500, f"서버 오류: {str(e)}")


@app.post("/analyze/upload", response_model=AnalyzeResponse)
async def analyze_upload(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str]        = Form(default=None),
):
    """
    multipart/form-data 방식 (src2 호환)
    파일 업로드로 이미지 직접 전송 가능
    """
    if file is None and not text:
        raise HTTPException(422, "file 또는 text 중 하나는 필수입니다")
    if file is not None and text:
        raise HTTPException(422, "file과 text를 동시에 전송할 수 없습니다")

    try:
        if file is not None:
            if file.content_type not in ALLOWED_IMAGE_TYPES:
                raise HTTPException(
                    415,
                    f"지원하지 않는 이미지 형식. 허용: {', '.join(ALLOWED_IMAGE_TYPES)}"
                )
            image_bytes = await file.read()
            return _run_analysis(
                input_type  = "image",
                input_text  = None,
                image_url   = None,
                image_bytes = image_bytes,
                summary     = "이미지 감정 분석",
            )
        else:
            return _run_analysis(
                input_type  = "text",
                input_text  = text,
                image_url   = None,
                image_bytes = None,
                summary     = "",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"분석 오류: {e}")
        raise HTTPException(500, f"서버 오류: {str(e)}")


# ── 직접 실행 ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host   = settings.HOST,
        port   = settings.PORT,
        reload = settings.RELOAD,
    )
