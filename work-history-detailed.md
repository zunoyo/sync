# Sync 프로젝트 변경 이력 (work-history-detailed.md)

> 작성일: 2026-09-15  
> 대상 프로젝트: `/Users/gimjunho/Downloads/sync-sungmin-2/Sync`  
> 백엔드: Spring Boot 4.0 (포트 8081) · 프론트엔드: Vite + React 19 (포트 5173)

---

## 1. 파일별 변경사항

---

### `src/main/resources/application.properties`

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| `google.redirect.uri` | `/login/oauth2/code/google` | `http://localhost:8081/api/oauth/google/callback` |
| `lastfm.api.key` | (없음) | Last.fm API 키 추가 |
| `lastfm.secret` | (없음) | Last.fm 시크릿 추가 |

---

### `src/main/java/com/graduate/Sync/api/HomeApiController.java`

#### 추가된 import
```java
import java.util.LinkedHashSet;
```

#### 추가된 유틸리티 메서드 `hiResArt()`
아트워크 URL의 해상도 토큰(`\d+x\d+bb`)을 `600x600bb`로 교체해 고해상도 이미지를 반환한다.
```java
private static String hiResArt(Object raw) {
    if (raw == null) return null;
    return raw.toString().replaceAll("\\d+x\\d+bb", "600x600bb");
}
```

#### 추가된 상수 맵

**`GENRE_TERMS`** — iTunes 검색 쿼리 매핑
```
kpop        → k-pop
rnb soul    → r&b soul
lofi chill  → lofi
pop ballad  → ballad
```

**`COUNTRY_NAMES`** — Last.fm geo.gettoptracks 국가명 매핑 (KR 제외)
```
US → united states
JP → japan
GB → united kingdom
FR → france
```

#### 신규 엔드포인트 ①: `GET /api/home/top-charts`
- 쿼리 파라미터: `country` (기본값 `KR`)
- **KR**: Apple RSS Marketing Feed (`https://rss.marketingtools.apple.com/api/v2/kr/music/most-played/100/songs.json`) 파싱 → `feed.results[]`에서 `name`, `artistName`, `hiResArt(artworkUrl100)` 추출 → 상위 10개 반환
- **US/JP/GB/FR**: Last.fm `geo.gettoptracks` (country 파라미터 = COUNTRY_NAMES 변환값) → 10개 반환
- **그 외**: Last.fm 글로벌 `chart.gettoptracks` 폴백 → 10개 반환
- iTunes `RestTemplate` 응답 파싱: `content-type: text/javascript` 문제로 `String.class`로 받은 뒤 Jackson `ObjectMapper.readValue()` 처리

#### 신규 엔드포인트 ②: `GET /api/home/artist-recommend`
- 쿼리 파라미터: `seedArtist`
- Last.fm `artist.getsimilar` → 유사 아티스트 5명 추출
- 각 아티스트에 대해 Last.fm `artist.gettoptracks` 호출 → 3곡씩 → 최대 15곡 반환

#### 신규 엔드포인트 ③: `GET /api/home/genre-chart`
- 쿼리 파라미터: `genre` (기본값 `kpop`)
- iTunes Search API (`https://itunes.apple.com/search?term=...&media=music&entity=song&country=us&limit=50`) 호출
- `GENRE_TERMS` 맵으로 검색어 변환
- `collectionId` 기준 `LinkedHashSet`으로 앨범 중복 제거
- 최대 20곡 반환, `hiResArt()` 적용

---

### `sync-frontend/src/styles/variables.css`

전체 팔레트를 버건디/샴페인골드 계열로 교체.

| 토큰 | 변경 전 | 변경 후 |
|------|---------|---------|
| `--bg-base` | `#0f0f0f` 계열 | `#0d0508` |
| `--bg-surface` | 기존 어두운 회색 | `#170a10` |
| `--bg-mid` | 기존 값 | `#21101a` |
| `--bg-card` | 기존 값 | `#2b1624` |
| `--bg-card-alt` | (없음) | `#2f1a28` |
| `--accent` | 기존 색상 | `#d9c08f` (샴페인 골드) |
| `--accent-dark` | 기존 값 | `#c9a876` |
| `--accent-shadow` | 기존 값 | `rgba(217, 192, 143, 0.35)` |
| `--text-base` | 기존 값 | `#f5eef0` |
| `--text-secondary` | 기존 값 | `rgba(245, 238, 240, 0.72)` |
| `--text-muted` | 기존 값 | `rgba(245, 238, 240, 0.45)` |
| `--negative` | 기존 값 | `#e0637a` |
| `--warning` | 기존 값 | `#e0a458` |
| `--info` | 기존 값 | `#b3527a` |
| `--border` | 기존 값 | `rgba(245, 238, 240, 0.14)` |
| `--border-light` | 기존 값 | `rgba(245, 238, 240, 0.25)` |
| `--font-display` | (없음) | `'Syne', 'Noto Sans KR', 'Helvetica Neue', sans-serif` |
| `--grad-1 ~ --grad-8` | 기존 색상 | 버건디/골드/플럼 계열 그라데이션으로 전면 교체 |

---

### `sync-frontend/src/styles/components/cards.css`

#### `.card` hover 개선
```css
/* 추가 */
transform: translateY(-3px);
box-shadow: 0 10px 28px rgba(0,0,0,.45);
```

#### `.card-art`
- `border-radius`: `var(--radius-md)` → `14px`

#### `.card.artist .card-art`
- `border-radius: 50%` (원형 유지)

#### 신규 클래스: `.cards-shelf` (가로 스크롤 컨테이너)
```css
.cards-shelf {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 8px;
  scrollbar-width: none;
}
.cards-shelf::-webkit-scrollbar { display: none; }
.cards-shelf .card { flex: 0 0 152px; width: 152px; scroll-snap-align: start; }
.cards-shelf .card .card-art { width: 124px; height: 124px; aspect-ratio: unset; }
```

#### 신규 클래스: `.chart-list` / `.chart-row` 계열 (TOP 10 리스트 전용)
```css
.chart-list { display: flex; flex-direction: column; gap: 2px; }
.chart-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: var(--radius-md); cursor: pointer; }
.chart-row:hover { background: var(--bg-card); }
.chart-rank { width: 24px; flex-shrink: 0; text-align: center; color: var(--text-muted); font-weight: 700; font-size: 14px; }
.chart-thumb { width: 48px; height: 48px; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
.chart-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.chart-info { flex: 1; min-width: 0; display: flex; flex-direction: column; text-align: left; }
.chart-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chart-artist { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chart-play { opacity: 0; width: 32px; height: 32px; background: var(--accent); border-radius: 50%; }
.chart-row:hover .chart-play { opacity: 1; }
```

#### `.track-info` 플렉스 버그 수정
```css
/* 변경 전 */
flex: 1;
overflow: hidden;

/* 변경 후 */
flex: 1 1 0;
min-width: 0;
overflow: hidden;
```

#### `.track-album` 플렉스 버그 수정
```css
/* 변경 전 */
flex: 1;

/* 변경 후 */
flex: 0 0 180px;
min-width: 0;
```
미디어 쿼리 임계값: `900px` → `1100px`

---

### `sync-frontend/src/styles/pages/auth.css`

#### `.auth-title` 폰트 추가
```css
/* 추가 */
font-family: var(--font-display);
font-weight: 800;
```

---

### `sync-frontend/src/styles/pages/auth-standalone.css`

**전체 재작성**. 기존 중앙 정렬 단일 카드 레이아웃 → 좌/우 스플릿 레이아웃.

| 클래스 | 내용 |
|--------|------|
| `.auth-standalone-body` | `display: flex; align-items: stretch; min-height: 100vh` |
| `.auth-split-layout` | `display: flex; width: 100%; min-height: 100vh` |
| `.auth-left-panel` | 45% 너비, `linear-gradient(135deg, #2a1020 → #170a10 → #0d0508)`, 브랜딩 영역 |
| `.auth-left-panel .auth-logo-text` | Syne 52px, font-weight 800, accent 색상 |
| `.auth-tagline` | 부제목 텍스트, 최대 너비 240px |
| `.auth-deco-orb-1` | 420px 발광 오브, top-right, 골드 계열 |
| `.auth-deco-orb-2` | 300px 발광 오브, bottom-left, 버건디 계열 |
| `.auth-right-panel` | `flex: 1`, 폼 영역, `background: var(--bg-base)` |
| `@media (max-width: 768px)` | 스플릿 해제 → `flex-direction: column` |

---

### `sync-frontend/src/styles/pages/detail.css`

에디토리얼 히어로 패턴으로 재설계.

| 클래스 | 내용 |
|--------|------|
| `.detail-hero` | `min-height: 340px; display: flex; align-items: flex-end; padding: 40px; position: relative; overflow: hidden` |
| `.detail-hero-bg` | `position: absolute; inset: 0; filter: blur(60px) brightness(0.4) saturate(1.5)` — 배경 블러 레이어 |
| `.detail-hero.h-album::after` | 앨범용 오버레이 그라데이션 (amber 계열) |
| `.detail-hero.h-genre::after` | 장르용 오버레이 그라데이션 (emerald 계열) |
| `.detail-hero.h-playlist::after` | 플레이리스트용 오버레이 그라데이션 (magenta 계열) |
| `.detail-hero-content` | `position: relative; z-index: 1; display: flex; align-items: flex-end; gap: 32px` |
| `.detail-hero-art` | `width: 200px; height: 200px; box-shadow: 0 20px 48px rgba(0,0,0,.6)` |
| `.detail-hero-name` | `font-family: var(--font-display); font-size: clamp(28px,4vw,52px); font-weight: 800` |
| `.detail-hero-type` | 타입 레이블 (ALBUM / GENRE / PLAYLIST), 12px uppercase |

---

### `sync-frontend/src/styles/pages/friends.css`

| 클래스 | 변경 내용 |
|--------|----------|
| `.friends-grid` | `grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 16px` |
| `.friend-card` | `background: var(--bg-mid); border-radius: var(--radius-lg); padding: 20px 12px; text-align: center` |

---

### `sync-frontend/src/styles/pages/playlist.css`

| 신규 클래스 | 내용 |
|------------|------|
| `.pl-hero-banner` | 플레이리스트 피처드 히어로 배너 컨테이너 |
| `.pl-hero-art` | 히어로 아트 (모자이크 커버 또는 단일 이미지) |
| `.pl-hero-name` | 히어로 플레이리스트 이름, display 폰트 |

---

### `sync-frontend/src/styles/pages/profile.css`

| 클래스 | 변경 내용 |
|--------|----------|
| `.profile-hero` | `min-height: 280px; align-items: flex-end; background: linear-gradient(135deg, #2a1020, #170a10, #0d0508)` |
| `.profile-avatar` | `width/height: 120px` (기존 104px) |
| `.profile-name` | `font-family: var(--font-display); font-size: clamp(28px,4vw,48px); font-weight: 800` |

---

### `sync-frontend/src/pages/Home.jsx`

#### 추가된 state
```jsx
const [topCharts, setTopCharts] = useState([]);
const [topChartsCountry, setTopChartsCountry] = useState('KR');
const [artistRec, setArtistRec] = useState([]);
const [genreChart, setGenreChart] = useState([]);
const [genreSelected, setGenreSelected] = useState('kpop');
```

#### 추가된 useEffect (3개)
1. `topChartsCountry` 변경 시 `/api/home/top-charts?country=` 호출 → `setTopCharts`
2. 컴포넌트 마운트 시 `/api/home/artist-recommend?seedArtist=IU` 호출 → `setArtistRec`
3. `genreSelected` 변경 시 `/api/home/genre-chart?genre=` 호출 → `setGenreChart`

#### "인기 차트 TOP 10" 섹션 리팩터링
- **변경 전**: `<div className="track-list">` + `<TrackRow>` 컴포넌트 반복
- **변경 후**: `<div className="chart-list">` + 인라인 `.chart-row` 마크업
  ```jsx
  <div className="chart-list">
    {topTracks.map((t, i) => (
      <div key={i} className="chart-row" onClick={() => togglePlay(t)}>
        <span className="chart-rank">{i + 1}</span>
        <div className="chart-thumb"><img src={t.albumArt} alt="" /></div>
        <div className="chart-info">
          <span className="chart-title">{t.name}</span>
          <span className="chart-artist">{t.artist}</span>
        </div>
        <button className="chart-play"><Play size={14} /></button>
      </div>
    ))}
  </div>
  ```

#### "오늘의 추천" 레이아웃 변경
- `<div className="cards-grid">` → `<div className="cards-shelf">`

#### "인기 아티스트" 레이아웃 변경
- `<div className="cards-grid artist-grid">` → `<div className="cards-shelf artist-grid">`

#### 신규 섹션: "🌍 나라별 TOP 차트"
- KR / US / JP / GB / FR 국가 칩 버튼
- `topChartsCountry` 상태와 연동
- `.chart-list` + `.chart-row` 레이아웃으로 렌더링

#### 신규 섹션: "✨ 지금 인기있는 아티스트"
- `artistRec` 데이터 → `.cards-shelf` 12개 카드

#### 신규 섹션: "🎼 장르별 추천"
- kpop / rnb soul / lofi chill / pop ballad 장르 칩 버튼
- `genreSelected` 상태와 연동
- `genreChart` 데이터 → `.cards-shelf` 20개 카드

---

### `sync-frontend/src/pages/Login.jsx`

- 기존 `<div className="auth-page">` 단일 구조 → `.auth-split-layout` 래퍼로 교체
- 왼쪽 `.auth-left-panel`: SYNC 로고 + 태그라인 + `.auth-deco-orb-1`, `.auth-deco-orb-2`
- 오른쪽 `.auth-right-panel`: 기존 폼 내용 그대로
- 로그인 핸들러(`handleSubmit`) 및 OAuth 로직 미변경

---

### `sync-frontend/src/pages/Signup.jsx`

- Login.jsx와 동일한 스플릿 레이아웃 구조 적용
- 회원가입 핸들러 미변경

---

### `sync-frontend/src/pages/ArtistDetail.jsx`

- 히어로 섹션 구조 변경: 기존 단순 배경 → 에디토리얼 히어로 패턴
  - `.detail-hero` + `.detail-hero-bg` (블러 배경) + `.detail-hero-content` (z-index 1)
- 아트: 원형 160×160px (`border-radius: 50%`)

---

### `sync-frontend/src/pages/AlbumDetail.jsx`

- 히어로 섹션 → 에디토리얼 패턴 (`h-album` 클래스 + amber 오버레이)
- `.detail-hero-bg` 배경이미지 = 앨범 아트

---

### `sync-frontend/src/pages/GenreDetail.jsx`

- 히어로 섹션 → 에디토리얼 패턴 (`h-genre` 클래스 + emerald 오버레이)

---

### `sync-frontend/src/pages/PlaylistDetail.jsx`

- 히어로 섹션 → 에디토리얼 패턴 (`h-playlist` 클래스 + magenta 오버레이)
- 트랙 리스트에 `has-art` 클래스 추가 (아트 표시 여부)

---

### `sync-frontend/src/pages/Playlists.jsx`

- `import PlaylistCoverMosaic from '../components/PlaylistCoverMosaic'` 추가
- `visiblePlaylists[0]`에 피처드 히어로 배너(`.pl-hero-banner`) 렌더링
- 커버 이미지 없는 플레이리스트: `<PlaylistCoverMosaic tracks={pl.tracks} />` 사용

---

## 2. 신규 생성된 파일

| 파일 경로 | 설명 |
|-----------|------|
| `sync-frontend/src/components/PlaylistCoverMosaic.jsx` | 트랙 앨범아트 4개를 2×2 CSS Grid 콜라주로 표시하는 컴포넌트 |

### `PlaylistCoverMosaic.jsx` 전체 구조
```jsx
export default function PlaylistCoverMosaic({ tracks = [], size = '100%' }) {
  // tracks에서 중복 albumArt 제거 후 최대 4개 추출
  const arts = [...new Map(
    tracks.filter(t => t?.albumArt).map(t => [t.albumArt, t.albumArt])
  ).values()].slice(0, 4);

  if (arts.length === 0) return null;
  if (arts.length === 1) return <img src={arts[0]} ... />;

  // 4칸을 채우기 위해 null 패딩
  const cells = [...arts]; while (cells.length < 4) cells.push(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: size, height: size }}>
      {cells.map((src, i) => (
        <div key={i} style={{ background: 'var(--bg-card)' }}>
          {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
      ))}
    </div>
  );
}
```

---

## 3. 신규 추가된 백엔드 API 엔드포인트

| 메서드 | 경로 | 파라미터 | 데이터 소스 | 반환 |
|--------|------|----------|------------|------|
| `GET` | `/api/home/top-charts` | `country` (기본 `KR`) | KR: Apple RSS / 기타: Last.fm | 최대 10곡 `[{name, artist, albumArt}]` |
| `GET` | `/api/home/artist-recommend` | `seedArtist` | Last.fm similar + top tracks | 최대 15곡 `[{name, artist, albumArt}]` |
| `GET` | `/api/home/genre-chart` | `genre` (기본 `kpop`) | iTunes Search API (country=us) | 최대 20곡 `[{name, artist, albumArt, album}]` (앨범 중복 제거) |

---

## 4. 신규 추가된 CSS 클래스 / 컴포넌트

### `cards.css`

| 클래스 | 용도 |
|--------|------|
| `.cards-shelf` | 가로 스크롤 카드 컨테이너 (scroll-snap 포함) |
| `.chart-list` | TOP 10 트랙 리스트 컨테이너 |
| `.chart-row` | 개별 차트 행 (순위 + 썸네일 + 정보 + 플레이 버튼) |
| `.chart-rank` | 순위 숫자 (24px 고정 너비) |
| `.chart-thumb` | 48×48px 썸네일 |
| `.chart-info` | 제목/아티스트 텍스트 컨테이너 |
| `.chart-title` | 트랙 제목 (ellipsis overflow) |
| `.chart-artist` | 아티스트명 (ellipsis overflow) |
| `.chart-play` | hover 시 나타나는 플레이 버튼 (32px 원형) |

### `detail.css`

| 클래스 | 용도 |
|--------|------|
| `.detail-hero` | 에디토리얼 히어로 래퍼 |
| `.detail-hero-bg` | 블러 배경 이미지 레이어 |
| `.detail-hero-content` | z-index 1 콘텐츠 영역 |
| `.detail-hero-art` | 200×200px 아트 |
| `.detail-hero-info` | 텍스트 정보 영역 |
| `.detail-hero-type` | 타입 레이블 (ALBUM/GENRE/PLAYLIST) |
| `.detail-hero-name` | clamp(28px,4vw,52px) 히어로 제목 |
| `.detail-hero.h-album::after` | 앨범 타입별 오버레이 |
| `.detail-hero.h-genre::after` | 장르 타입별 오버레이 |
| `.detail-hero.h-playlist::after` | 플레이리스트 타입별 오버레이 |

### `auth-standalone.css`

| 클래스 | 용도 |
|--------|------|
| `.auth-standalone-body` | 스플릿 레이아웃 전체 래퍼 |
| `.auth-split-layout` | 좌/우 패널 flex 컨테이너 |
| `.auth-left-panel` | 45% 브랜딩 패널 |
| `.auth-tagline` | 로고 하단 태그라인 |
| `.auth-deco-orb` | 발광 장식 오브 베이스 클래스 |
| `.auth-deco-orb-1` | 골드 계열 대형 오브 (우상단) |
| `.auth-deco-orb-2` | 버건디 계열 오브 (좌하단) |
| `.auth-right-panel` | 폼 영역 패널 |
| `.auth-msg-error` | 에러 메시지 박스 |
| `.auth-msg-success` | 성공 메시지 박스 |
| `.auth-social-btn` | 소셜 로그인 버튼 (구글/네이버) |
| `.auth-footer` | 페이지 전환 링크 영역 |

### `playlist.css`

| 클래스 | 용도 |
|--------|------|
| `.pl-hero-banner` | 피처드 플레이리스트 히어로 배너 |
| `.pl-hero-art` | 히어로 아트 (모자이크 또는 커버) |
| `.pl-hero-name` | 히어로 플레이리스트 이름 |

### `variables.css`

| 토큰 | 용도 |
|------|------|
| `--font-display` | 히어로 제목용 디스플레이 폰트 (`'Syne', 'Noto Sans KR'`) |
| `--bg-card-alt` | 대체 카드 배경색 |
| `--text-near` | `rgba(245,238,240,0.8)` 준-기본 텍스트 |
| `--text-light` | `#faf6f7` 밝은 텍스트 |
| `--border-sep` | `rgba(245,238,240,0.4)` 구분선 |
| `--radius-2xl` | `20px` 대형 반경 |
| `--radius-pill` | `500px` 필 반경 |

### React 신규 컴포넌트

| 컴포넌트 | 파일 | 용도 |
|----------|------|------|
| `PlaylistCoverMosaic` | `src/components/PlaylistCoverMosaic.jsx` | 2×2 앨범아트 모자이크 커버 생성 |

---

## 5. 삭제되거나 더 이상 안 쓰는 코드

### `Home.jsx` — "인기 차트 TOP 10" 섹션의 `<TrackRow>` 사용 제거
- **변경 전**: `<div className="track-list">` 안에 `<TrackRow>` 컴포넌트를 반복하여 트랙 목록 렌더링
- **변경 후**: `<div className="chart-list">` 안에 `.chart-row` 인라인 마크업으로 교체
- `TrackRow` 컴포넌트 파일 자체는 다른 곳에서 여전히 사용 가능하므로 삭제하지 않음

### `auth-standalone.css` — 기존 단일 카드 레이아웃 클래스 교체
- 기존 중앙 정렬 단일 `.auth-wrap` / `.auth-card` 패턴 → `.auth-split-layout` 기반 스플릿 패턴으로 전면 대체

### `cards.css` — `.cards-grid` 사용 축소
- "오늘의 추천"·"인기 아티스트" 섹션의 `cards-grid`가 `cards-shelf`로 교체됨
- `.cards-grid` 클래스 자체는 CSS에 남아있으나 해당 섹션에서는 더 이상 사용하지 않음

### `application.properties` — Google redirect URI 변경
- 구 경로 `/login/oauth2/code/google` → `http://localhost:8081/api/oauth/google/callback` 으로 변경, 구 경로는 더 이상 유효하지 않음

---

## 부록: 주요 버그 수정 목록

| 버그 | 원인 | 해결 |
|------|------|------|
| Last.fm KR 차트 오류 | Last.fm `geo.gettoptracks`가 한국 미지원 | KR은 Apple RSS Marketing Feed로 대체 |
| iTunes `country=kr` 결과 0건 | iTunes KR 카탈로그에 k-pop 데이터 부족 | `country=us`로 고정, `kpop→k-pop` 검색어 변환 |
| iTunes `text/javascript` 파싱 실패 | `RestTemplate.getForEntity(url, Map.class)` 미지원 content-type | `String.class`로 수신 후 Jackson `ObjectMapper.readValue()` 파싱 |
| `cards-shelf` 카드 크기 불일치 | `align-items` 기본값(stretch)으로 카드가 최장 형제 높이로 늘어남 | `align-items: flex-start` + `.card-art { width: 124px; height: 124px; aspect-ratio: unset }` 고정 |
| "인기 차트 TOP 10" 레이아웃 붕괴 | `track-info: flex:1`과 `track-album: flex:1` 동시 사용 + `min-width:0` 누락 | `track-info: flex: 1 1 0; min-width: 0`, `track-album: flex: 0 0 180px; min-width: 0` |
| 포트 8081 점유 | 기존 Spring Boot 프로세스 종료 안 됨 | `lsof -ti:8081 \| xargs kill -9` |
