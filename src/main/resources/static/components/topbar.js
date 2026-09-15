/**
 * SOUNDWAVE — Topbar Component
 * auth.js 보다 나중에 로드되므로 Auth.getUser() 사용 가능
 * topbar-user-name / topbar-user-email — AuthModal._refreshTopbar() 타겟 ID
 */
(function () {
  const user        = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
  const initials    = (user?.username || 'SW').slice(0, 2).toUpperCase();
  const displayName = user?.display_name || user?.username || 'SoundWave 사용자';
  const email       = user?.email || '';

  const root = document.getElementById('topbar-root');
  if (!root) return;

  root.outerHTML = `
<header class="topbar">

  <!-- 뒤로 / 앞으로 -->
  <div class="topbar-nav">
    <button class="nav-arrow-btn" onclick="history.back()" title="뒤로">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
      </svg>
    </button>
    <button class="nav-arrow-btn" onclick="history.forward()" title="앞으로">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
      </svg>
    </button>
  </div>

  <!-- 검색창 -->
  <div class="search-container" id="search-bar" style="display:none">
    <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0
               9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49
               19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01
               14 9.5 11.99 14 9.5 14z"/>
    </svg>
    <input class="search-input" id="search-input" type="text"
           placeholder="아티스트, 곡, 팟캐스트 검색...">
  </div>

  <!-- 우측 메뉴 -->
  <div class="topbar-right">
    <button class="topbar-outline-btn">업그레이드</button>

    <div class="dropdown" id="avatar-dropdown">
      <div class="avatar" id="avatar-btn" title="${displayName}">${initials}</div>
      <div class="dropdown-menu">

        <!-- 사용자 정보 (id 추가 → 로그인 후 동적 갱신) -->
        <div style="padding:12px 16px 8px;border-bottom:1px solid rgba(255,255,255,.07);
                    margin-bottom:4px">
          <div id="topbar-user-name"
               style="font-size:13px;font-weight:700;color:var(--text-base)">
            ${displayName}
          </div>
          <div id="topbar-user-email"
               style="font-size:11px;color:var(--text-secondary);margin-top:2px">
            ${email}
          </div>
        </div>

        <button class="dropdown-item" onclick="switchPage('profile')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58
                     c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96
                     c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84
                     c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96
                     c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05
                     .3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92
                     3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05
                     .24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56
                     1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12
                     -.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6
                     3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
          설정
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item danger" onclick="Auth.logout()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4
                     5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
          로그아웃
        </button>
      </div>
    </div>

  </div>
</header>`;
})();
