# SoundWave Frontend (React 전환 — 완료 + Spotify 전체 재생 + 원본 대조 보완)

Vite + React 18 + react-router-dom. 백엔드(Spring Boot, `com.graduate.Sync`, 포트 8081)와는
별도 프로세스로 실행하고, 개발 중에는 `/api`, `/oauth` 요청을 vite.config.js 프록시로
8081에 전달합니다.

## 실행 방법
```
npm install
npm run dev       # http://localhost:5173
```
백엔드(Spring Boot, 8081)와 CLIP 파이썬 서버(포트 8000)도 함께 띄워야 전체 기능이 동작합니다.
**둘 중 하나라도 안 띄우면 브라우저 콘솔에 502(Bad Gateway) 에러가 잔뜩 뜨는데, 이건 프론트 코드
문제가 아니라 프록시 대상 서버가 안 떠 있어서 나는 정상적인 증상입니다.** CLIP 서버는 프론트 포트와
무관하게 `python main.py`(기본 8000 포트)만 띄우면 됩니다 — 브라우저가 CLIP 서버에 직접 접속하는 게
아니라 Spring Boot 백엔드가 서버 대 서버로 호출하는 구조라 CORS 등의 영향을 받지 않습니다.

## 전체 단계

**1~7단계** — Home/Search/GenreDetail, Playlists, Sync AI, Friends, Profile, Spotify 전체 재생까지
원본 SPA의 모든 주요 화면 이관 완료

**8단계** — 원본과 대조해 찾은 실제 기능 누락 보완: 아티스트/앨범 상세 페이지 신설(저장 기능 복원),
사이드바 라이브러리 필터·그룹 확장, 홈 빠른 액세스 링크 연결, 재생 중 곡 좋아요 버튼, 가사 동기화·
파형 시각화(LyricsContext 신설)

**9단계** — 스플래시 화면 신설, 로그인 모달 복원(AuthModal/AuthModalContext — Topbar 로그인 버튼과
PlaylistPicker의 비로그인 게이트에서 사용), 관련 아티스트 mock 섹션, 홈 히어로 아이콘·섹션 "모두 보기"
버튼·Playlists 검색창 등 장식 요소 보완

**10단계** — 초정밀 재검토: 원본 `onclick=` 핸들러 145개 전수 대조 + React 코드 className CSS 교차검증
스크립트로 실제 버그 발견/수정 (우측 패널 `.rp-queue-list`/`.rp-related-list`가 CSS에 없는 클래스였던
것을 `.rp-queue`/`.rp-related`로 수정, "관련 아티스트" 섹션이 잘못된 탭에 있던 것을 Now Playing 탭으로
이동, 큐 탭 라벨 텍스트 수정), Spotify 연동/Premium 안내 배너 보강

**11단계 (이번) — 로그인 모달 자동 표시 복원**

원본은 스플래시가 끝나면 로그인 상태가 아닐 때 로그인 모달을 자동으로 띄웁니다. 9단계에서 이 부분을
의도적으로 뺐었는데(서버 세션 체크가 더 정확하다고 판단해서), 이번에 원본과 동일하게 다시 맞췄습니다.

- 앱이 로드되고 로그인 여부 확인이 끝난 시점에, 로그인 상태가 아니면 로그인 모달이 자동으로 열립니다
  (스플래시가 화면을 덮고 있는 동안 열려도 스플래시가 사라지는 순간 자연스럽게 드러남 — z-index 순서상
  원본과 동일한 시퀀스로 보입니다)
- 세션당 한 번만 자동으로 뜨고(닫으면 다시 뜨지 않음), `/login`·`/signup` 페이지로 직접 들어온 경우는
  이미 같은 역할이라 자동 팝업을 건너뜁니다
- 백엔드가 꺼져 있어서 `/api/users/me`가 실패하는 경우에도 "로그인 안 된 상태"로 정상 처리되어 모달이
  뜹니다 — 원본과 달리 React 프론트는 백엔드 없이도 셸 자체는 정상적으로 로드됩니다

**13단계 (이번) — iTunes API CORS 오류 수정**

브라우저 콘솔에서 iTunes Search API 호출이 CORS 정책에 막혀 실패하는 게 확인됐습니다
(`itunes.apple.com`이 `Access-Control-Allow-Origin` 헤더를 내려주지 않는 경우가 있음 — 원본 앱도
브라우저에서 직접 호출하는 방식이라 똑같이 불안정할 수 있는 구조였음). Vite 개발 서버에 `/itunes-api`
프록시를 추가해서, 브라우저가 iTunes에 직접 요청하는 대신 dev 서버를 거쳐 서버 대 서버로 요청하도록
바꿨습니다 — 이러면 CORS 자체가 적용되지 않습니다. `api/itunes.js`, `api/artist.js`, `pages/Search.jsx`의
모든 `https://itunes.apple.com/...` 호출을 `/itunes-api/...`로 교체.

⚠️ 참고: 이 프록시는 `npm run dev` 환경에서만 동작합니다. 나중에 프로덕션 빌드로 배포할 때는 별도로
(nginx나 백엔드 경유 등) 동일한 프록시를 구성해야 CORS 문제가 재발하지 않습니다.


- Spotify Web Playback SDK는 실제 Premium 계정으로 아직 테스트해보지 않은 상태

## 폴더 구조
```
src/
  api/        client.js, itunes.js, genres.js, playlists.js, savedLibrary.js, sync.js,
              friends.js, profile.js, spotifyPlayer.js, spotifySearch.js, artist.js
  context/    AuthContext, PlayerContext, LyricsContext, ToastContext, PlaylistPickerContext,
              FriendsContext, LibraryContext, AuthModalContext
  components/ Sidebar, Topbar, PlayerBar, RightPanel, Layout, TrackRow,
              CreatePlaylistModal, PlaylistPickerPopover, SyncAnalysis,
              FriendDetailModal, AddFriendModal, FriendRequestsModal, Splash, AuthModal
  pages/      Home, Search, GenreDetail, ArtistDetail, AlbumDetail,
              Playlists, PlaylistDetail, Sync, Friends, Profile, Login, Signup
  styles/     원본 CSS 그대로 이관
```
