import base64
import io
import requests
from PIL import Image
from io import BytesIO
from utils.logger import get_logger

logger = get_logger("image_utils")


def load_image_from_url(url: str) -> Image.Image:
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        image = Image.open(BytesIO(response.content))
        logger.info(f"URL 이미지 로드 성공: {url[:50]}...")
        return image.convert("RGB")
    except Exception as e:
        logger.error(f"URL 이미지 로드 실패: {e}")
        return None


def load_image_from_base64(base64_str: str) -> Image.Image:
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        image_bytes = base64.b64decode(base64_str)
        image = Image.open(BytesIO(image_bytes))
        logger.info("base64 이미지 로드 성공")
        return image.convert("RGB")
    except Exception as e:
        logger.error(f"base64 이미지 로드 실패: {e}")
        return None


def load_image_from_bytes(data: bytes) -> Image.Image:
    """multipart 업로드 바이트 → PIL Image (clip2 방식 추가)"""
    try:
        image = Image.open(io.BytesIO(data))
        logger.info("bytes 이미지 로드 성공")
        return image.convert("RGB")
    except Exception as e:
        logger.error(f"bytes 이미지 로드 실패: {e}")
        return None


def load_image(image_url: str) -> Image.Image:
    """URL / base64 / 로컬 경로 자동 감지"""
    if image_url.startswith("data:image"):
        return load_image_from_base64(image_url)
    elif image_url.startswith("http"):
        return load_image_from_url(image_url)
    else:
        try:
            image = Image.open(image_url)
            return image.convert("RGB")
        except Exception as e:
            logger.error(f"로컬 이미지 로드 실패: {e}")
            return None
