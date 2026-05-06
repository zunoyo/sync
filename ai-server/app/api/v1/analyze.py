from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.analyze import AnalyzeResponse
from app.services.clip_service import analyze_image, analyze_text

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
):
    if file is None and not text:
        raise HTTPException(status_code=422, detail="file 또는 text 중 하나는 필수입니다.")
    if file is not None and text:
        raise HTTPException(status_code=422, detail="file과 text를 동시에 전송할 수 없습니다.")

    if file is not None:
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"지원하지 않는 이미지 형식입니다. 허용: {', '.join(ALLOWED_IMAGE_TYPES)}",
            )
        image_bytes = await file.read()
        result = analyze_image(image_bytes)
    else:
        result = analyze_text(text)

    return AnalyzeResponse(**result)
