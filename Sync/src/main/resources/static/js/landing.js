/**
 * LandingView — 커서 반응형 랜딩 화면
 *
 * 비로그인 + 이 브라우저에서 처음 접속할 때만 표시된다(localStorage 'sw_landing_seen').
 * 로고를 클릭하면 페이드아웃 후 콜백을 호출해 기존 스플래시 애니메이션으로 자연스럽게 넘어간다.
 * React의 components/Landing.jsx와 동일한 동작을 하는 바닐라 버전.
 */
const LandingView = (() => {

  const LANDING_SEEN_KEY = 'sw_landing_seen';

  function hasSeen() {
    try { return localStorage.getItem(LANDING_SEEN_KEY) === '1'; } catch (e) { return true; }
  }
  function markSeen() {
    try { localStorage.setItem(LANDING_SEEN_KEY, '1'); } catch (e) { /* 시크릿 모드 등 무시 */ }
  }

  function shouldShow() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) return false;
    return !hasSeen();
  }

  function show(onFadeStart, onDone) {
    const root = document.createElement('div');
    root.className = 'landing-root';
    root.style.setProperty('--mx', '50%');
    root.style.setProperty('--my', '50%');
    root.style.setProperty('--fl', '0px');

    root.innerHTML = `
      <div class="landing-cursor" id="landingCursor"></div>
      <div class="landing-flashlight">
        <div class="landing-content" id="landingContent">
          <div class="landing-center">
            <h1 class="landing-logo landing-logo--clickable" id="landingLogo">SYNC</h1>
          </div>
          <div class="landing-rings" aria-hidden="true">
            <div class="landing-ring" style="width:80%;padding-bottom:80%"></div>
            <div class="landing-ring" style="width:60%;padding-bottom:60%;opacity:.4"></div>
            <div class="landing-ring" style="width:40%;padding-bottom:40%;opacity:.25"></div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(root);

    const cursor = root.querySelector('#landingCursor');
    const content = root.querySelector('#landingContent');
    const logo = root.querySelector('#landingLogo');

    let moved = false;
    let size = 0, target = 0, raf = null;

    function reveal() {
      if (moved) return;
      moved = true;
      target = 340;
      content.classList.add('is-revealed');
    }
    function onMove(cx, cy) {
      reveal();
      root.style.setProperty('--mx', cx + 'px');
      root.style.setProperty('--my', cy + 'px');
      cursor.style.left = cx + 'px';
      cursor.style.top = cy + 'px';
    }
    function onMouseMove(e) { onMove(e.clientX, e.clientY); }
    function onTouchMove(e) { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }
    function onMouseDown() { if (moved) target = 480; }
    function onMouseUp() { if (moved) target = 340; }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    function tick() {
      size += (target - size) * 0.12;
      root.style.setProperty('--fl', size + 'px');
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function cleanup() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(raf);
    }

    logo.addEventListener('click', () => {
      markSeen();
      root.classList.add('landing-fading');
      // 페이드가 "시작"하는 이 순간 바로 스플래시를 뒤에 켜둔다 — 650ms 페이드가 끝나갈
      // 때 뒤에 아무것도 없어 실제 웹사이트가 비치는 대신, 이미 자리 잡은 스플래시가 비치도록.
      onFadeStart?.();
      setTimeout(() => {
        cleanup();
        root.remove();
        onDone?.();
      }, 650);
    });
  }

  return { show, shouldShow };
})();
