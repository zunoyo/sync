import requests
import json

BASE_URL = "http://localhost:8000"


def test_health():
    """서버 상태 확인"""
    response = requests.get(f"{BASE_URL}/health")
    print("=== 서버 상태 ===")
    print(response.json())
    print()


def test_text(text: str, description: str = ""):
    """텍스트 감정 분석 테스트"""
    payload = {
        "input_type": "text",
        "input_text": text,
        "image_url": None
    }

    response = requests.post(f"{BASE_URL}/analyze", json=payload)

    print(f"=== 텍스트 테스트: {description} ===")
    print(f"입력: {text}")

    if response.status_code == 200:
        result = response.json()
        print(f"주요 감정:   {result['primary_emotion']}")
        print(f"보조 감정:   {result['secondary_emotion']}")
        print(f"신뢰도:      {result['confidence']}")
        print(f"valence:    {result['valence']}")
        print(f"arousal:    {result['arousal']}")
        print(f"Last.fm 태그: {result['lastfm_tags']}")
    else:
        print(f"오류: {response.status_code} - {response.text}")
    print()


def test_image(image_url: str, description: str = ""):
    """이미지 감정 분석 테스트"""
    payload = {
        "input_type": "image",
        "input_text": None,
        "image_url": image_url
    }

    response = requests.post(f"{BASE_URL}/analyze", json=payload)

    print(f"=== 이미지 테스트: {description} ===")
    print(f"이미지 URL: {image_url}")

    if response.status_code == 200:
        result = response.json()
        print(f"주요 감정:   {result['primary_emotion']}")
        print(f"보조 감정:   {result['secondary_emotion']}")
        print(f"신뢰도:      {result['confidence']}")
        print(f"valence:    {result['valence']}")
        print(f"arousal:    {result['arousal']}")
        print(f"Last.fm 태그: {result['lastfm_tags']}")
    else:
        print(f"오류: {response.status_code} - {response.text}")
    print()


if __name__ == "__main__":
    # 서버 상태 확인
    test_health()

    # 텍스트 테스트
    test_text("비 오는 날 창가에서 혼자 커피 마시는 기분",  "감성적")
    test_text("신나게 달리고 싶다 에너지 넘치는 음악",     "활기참")
    test_text("조용한 카페에서 집중해서 공부할 때",        "차분함")
    test_text("사랑하는 사람과 드라이브하는 설레는 기분",  "로맨틱")
    test_text("기분이 너무 좋아서 춤추고 싶은 날",         "신남")
    test_text("혼자 있고 싶고 슬픈 감정이 밀려올 때",      "슬픔")
    test_text("밤에 혼자 드라이브하면서 감성에 젖을 때",   "몽환적")
    test_text("운동할 때 듣는 강렬하고 파워풀한 음악",     "강렬함")

    # 이미지 테스트 (공개 이미지 URL 사용)
    test_image(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/1280px-24701-nature-natural-beauty.jpg",
        "자연 풍경"
    )