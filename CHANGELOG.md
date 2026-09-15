# Sync — 변경 이력 (CHANGELOG)

---

## v1.1.0 — UI/UX 디자인 전면 개선 & Home 섹션 확장

### 디자인 시스템 (variables.css)
- 전체 컬러 팔레트를 **버건디 / 샴페인 골드** 계열로 교체
  - `--bg-base: #0d0508` / `--bg-surface: #170a10` / `--bg-mid: #21101a` / `--bg-card: #2b1624`
  - `--accent: #d9c08f` (샴페인 골드)
- 디스플레이 폰트 토큰 추가: `--font-display: 'Syne', 'Noto Sans KR', sans-serif`
- 그라데이션 프리셋(`--grad-1 ~ --grad-8`) 버건디/골드/플럼 계열로 전면 교체

### 인증 페이지 (Login / Signup)
- 기존 중앙 단일 카드 → **좌우 스플릿 레이아웃** 전환
  - 왼쪽 45%: 브랜딩 패널 (SYNC 로고 골드 52px + 태그라인 + 발광 데코 오브 2개)
  - 오른쪽 55%: 폼 패널 (유리모피즘 카드)
- 모바일(768px 이하) 자동 세로 스택 전환

### 상세 페이지 히어로 (ArtistDetail / AlbumDetail / GenreDetail / PlaylistDetail)
- 기존 단순 배경 → **에디토리얼 히어로 패턴**
  - `.detail-hero-bg`: 앨범아트 블러(60px) + 어둡게 처리한 배경 레이어
  - `.detail-hero-content`: z-index 1 위에 아트(200×200) + 제목(`clamp(28px, 4vw, 52px)`) 배치
  - 페이지 타입별 오버레이 그라데이션 (`h-album` amber / `h-genre` emerald / `h-playlist` magenta)

### Home 페이지 (Home.jsx)
- **"인기 차트 TOP 10"**: `TrackRow` 컴포넌트 → 전용 `.chart-row` 인라인 마크업으로 교체 (순위 + 썸네일 + 텍스트 + 플레이버튼)
- **"오늘의 추천" / "인기 아티스트"**: 카드 그리드 → **가로 스크롤 Shelf** (`cards-shelf`, scroll-snap)
- **신규 섹션 추가**
  - 🌍 나라별 TOP 차트: KR / US / JP / GB / FR 칩 선택 → 실시간 차트 리스트
  - ✨ 지금 인기있는 아티스트: 12개 카드 shelf
  - 🎼 장르별 추천: kpop / rnb soul / lofi chill / pop ballad 칩 선택 → 20개 카드 shelf
- 앨범아트 고해상도 처리: `\d+x\d+bb → 600x600bb` regex 치환 (`hiResArt()`)

### 카드 / 리스트 컴포넌트 (cards.css)
- `.cards-shelf`: 가로 스크롤 컨테이너 (scroll-snap-type: x mandatory, 스크롤바 숨김)
- `.chart-list` / `.chart-row` 계열: TOP 차트 전용 리스트 컴포넌트 신규 추가
- `.track-info`: `flex: 1 1 0; min-width: 0` — flex 레이아웃 텍스트 overflow 버그 수정
- `.track-album`: `flex: 0 0 180px` — 앨범명 고정 너비로 레이아웃 붕괴 방지

### 플레이리스트 페이지 (Playlists.jsx)
- 신규 컴포넌트 `PlaylistCoverMosaic`: 트랙 앨범아트 4장 → 2×2 CSS Grid 콜라주 커버 자동 생성
- 첫 번째 플레이리스트 피처드 히어로 배너 추가

### 프로필 / 친구 페이지
- 프로필 히어로: 버건디 그라데이션, 아바타 120px, 이름 `clamp(28px, 4vw, 48px)` display 폰트
- 친구 그리드: `minmax(130px, 1fr)` 자동 반응형 레이아웃

---

## v1.0.0 — Initial Release

- Spring Boot 4.0 백엔드 (포트 8081)
- Vite + React 19 프론트엔드 (포트 5173)
- MySQL 연동, JPA/Hibernate
- Spotify / Last.fm / iTunes / Google OAuth 연동
- Python FastAPI CLIP AI 서버 (포트 8000)
- 플레이리스트 CRUD, 친구 시스템, 재생 히스토리
- Sync AI: 텍스트/이미지 입력 → 감정 분석 → 음악 추천
