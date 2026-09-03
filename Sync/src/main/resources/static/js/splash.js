/**
 * SOUNDWAVE — Splash Controller
 *
 * 앱 첫 진입 시 로고 애니메이션을 재생하고,
 * 완료 후 AuthModal.init() 을 호출합니다.
 *
 * 타이밍
 *   0ms       : 스플래시 표시
 *   200ms     : 로고 아이콘 바운스 인
 *   800ms     : 타이틀 페이드 업
 *   1000ms    : 태그라인 페이드 업
 *   1200ms    : 로딩 닷 등장
 *   2300ms    : 페이드아웃 시작 (0.75s)
 *   3050ms~   : 스플래시 완전히 숨김 → AuthModal.init()
 *
 * 세션 정책
 *   새 탭으로 열 때마다 로그인 모달을 표시합니다.
 *   sessionStorage 의 'sw_tab' 키로 탭 생존 여부를 추적합니다.
 *   같은 탭에서 새로고침(F5)하면 로그인이 유지됩니다.
 */

/* ── 탭 세션 초기화 ─────────────────────────────────────
   새 탭에서 처음 열리면 localStorage 의 sw_user 를 지워
   AuthModal.init() 이 로그인 모달을 표시하도록 합니다.
   같은 탭에서 새로고침하면 sessionStorage 가 살아있으므로
   로그인 상태가 그대로 유지됩니다.
────────────────────────────────────────────────────── */
(function () {
  try {
    // ── 방법 1: URL 파라미터 확인 (콜백 URL에 spotify= 있을 때)
    const isSpotifyReturn = window.location.search.includes('spotify=');

    // ── 방법 2: localStorage 플래그 확인 (sessionStorage 초기화 대비)
    //    navigation.js / auth-modal.js 에서 Spotify 이동 직전에 플래그 설정
    const hasRedirectFlag = localStorage.getItem('sw_spotify_redirect') === '1';

    const skipClear = isSpotifyReturn || hasRedirectFlag;

    if (hasRedirectFlag) {
      // 플래그 사용했으면 즉시 제거
      localStorage.removeItem('sw_spotify_redirect');
    }

    if (!sessionStorage.getItem('sw_tab') && !skipClear) {
      localStorage.removeItem('sw_user');   // 새 탭에서만 세션 초기화
    }
    sessionStorage.setItem('sw_tab', '1');
  } catch (e) { /* 시크릿 모드 등 storage 차단 환경 무시 */ }
})();

(function () {

  /* 단 한 번만 실행되도록 플래그 */
  let done = false;

  function afterSplash() {
    if (done) return;
    done = true;

    const splash = document.getElementById('splash-screen');
    if (splash) splash.style.display = 'none';

    /* 비로그인 시 모달 표시, 로그인 상태면 아무것도 안 함 */
    if (typeof AuthModal !== 'undefined') {
      AuthModal.init();
    }
  }

  function startFadeOut() {
    const splash = document.getElementById('splash-screen');
    if (!splash) { afterSplash(); return; }

    /* CSS transition 시작 */
    splash.classList.add('fading');

    /* transitionend 가 발화하면 완전히 숨김 */
    splash.addEventListener('transitionend', afterSplash, { once: true });

    /* CSS transition 이 실행되지 않는 환경(prefers-reduced-motion 등) 대비 폴백 */
    setTimeout(afterSplash, 1000);
  }

  /* 2300ms 후 페이드아웃 시작 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(startFadeOut, 2300);
    });
  } else {
    setTimeout(startFadeOut, 2300);
  }

})();
