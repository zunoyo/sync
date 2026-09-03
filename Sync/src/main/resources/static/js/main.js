/**
 * SOUNDWAVE — Main Entry Point
 */
async function init() {
  // ── 서버 세션 상태를 먼저 동기화 ────────────────────────
  // Google/Naver 로그인은 서버 리다이렉트로 완료되므로, 페이지가
  // 새로 로드될 때 로그인 여부를 서버에 다시 확인해야 정확하다.
  // 이후의 Auth.isLoggedIn()/Auth.getUser() 호출이 전부 이 값을 기준으로 동작한다.
  if (typeof Auth !== 'undefined' && typeof Auth.syncWithServer === 'function') {
    await Auth.syncWithServer();
  }

  Player.init();
  RightPanel.init();
  HomePage.init();
  Navigation.init();
  History.init();           /* 앞으로/뒤로 버튼 활성화 */
  // TrackList.renderAll() → HomePage.init() 이 비동기로 처리

  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });

  document.querySelectorAll('.rp-tab').forEach(btn => {
    btn.addEventListener('click', function () { RightPanel.switchTab(this.dataset.tab); });
  });

  const avatarBtn = document.getElementById('avatar-btn');
  const dropdown  = document.getElementById('avatar-dropdown');
  if (avatarBtn && dropdown) {
    avatarBtn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    dropdown.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => {
      if (!dropdown.contains(e.target) && e.target !== avatarBtn) {
        dropdown.classList.remove('open');
      }
    });
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('focus', () => Navigation.switchPage('search'));

  // Spotify SDK 초기화 (로그인된 사용자)
  // Auth 상태는 위에서 syncWithServer()로 이미 확정됐으므로 대기 없이 바로 확인 가능
  if (typeof SpotifyPlayer !== 'undefined' &&
      typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
    SpotifyPlayer.init();
  }

  if (typeof ProfileModule !== 'undefined') ProfileModule.init();
  if (typeof SearchPage !== 'undefined') SearchPage.init();
  console.log('🎵 SoundWave initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function switchPage(id)     { Navigation.switchPage(id); }
function togglePlay()       { Player.togglePlay(); }
function toggleShuffle()    { Player.toggleShuffle(); }
function toggleRepeat()     { Player.toggleRepeat(); }
function togglePlayerLike() { Player.toggleLike(); }
function togglePanel()      { RightPanel.toggle(); }
function closePanel()       { RightPanel.close(); }
function syncSend()         { SyncPage.sendMessage(); }
