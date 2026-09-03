/**
 * SOUNDWAVE — Sidebar Component
 * lib-filter-pill + data-filter → LibraryFilter.filter()
 * data-kind 속성 → 필터링 대상 식별
 */
(function () {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  root.outerHTML = `
<aside class="sidebar">
  <div class="sidebar-top">

    <a class="logo" href="#" data-page="home">
      <div class="logo-icon">
        <svg viewBox="0 0 32 32" fill="#000" width="20" height="20">
          <circle cx="16" cy="16" r="13" fill="none" stroke="#000" stroke-width="2.5"/>
          <path d="M12.5 10.5v11l9-5.5-9-5.5z"/>
        </svg>
      </div>
      <span class="logo-text">SoundWave</span>
    </a>

    <ul class="nav-list">
      <li class="nav-item active" id="nav-home"><a href="#" data-page="home"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>홈</a></li>
      <li class="nav-item" id="nav-search"><a href="#" data-page="search"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>검색하기</a></li>
      <div class="nav-divider"></div>
      <li class="nav-item" id="nav-friends"><a href="#" data-page="friends"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>친구<span class="nav-badge" id="friend-nav-badge">2</span></a></li>
      <li class="nav-item" id="nav-sync"><a href="#" data-page="sync"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>Sync<span class="nav-badge" style="background:linear-gradient(90deg,var(--accent),var(--info));color:#000">AI</span></a></li>
      <div class="nav-divider"></div>
      <li class="nav-item" id="nav-playlist"><a href="#" data-page="playlist"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>플레이리스트 관리</a></li>
      <li class="nav-item" id="nav-profile"><a href="#" data-page="profile"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>회원정보</a></li>
    </ul>
  </div>

  <div class="sidebar-bottom">
    <div class="library-header">
      <button class="library-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
        내 라이브러리
      </button>
      <!-- 추가 버튼 → CreatePlaylistModal -->
      <button class="icon-btn" title="새 플레이리스트 추가"
              onclick="CreatePlaylistModal.show()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </button>
    </div>

    <!-- 필터 필 (lib-filter-pill + data-filter 로 LibraryFilter 연동) -->
    <div class="library-filters">
      <button class="filter-pill lib-filter-pill active" data-filter="all"
              onclick="LibraryFilter.filter('all')">전체</button>
      <button class="filter-pill lib-filter-pill" data-filter="playlist"
              onclick="LibraryFilter.filter('playlist')">플레이리스트</button>
      <button class="filter-pill lib-filter-pill" data-filter="artist"
              onclick="LibraryFilter.filter('artist')">아티스트</button>
      <button class="filter-pill lib-filter-pill" data-filter="album"
              onclick="LibraryFilter.filter('album')">앨범</button>
    </div>

    <!-- 라이브러리 목록: 실제 데이터로 채워짐 (js/library.js 의 LibraryFilter.renderSidebarList) -->
    <div class="library-list">
      <div class="library-empty-hint">불러오는 중...</div>
    </div>

  </div>
</aside>`;

  // library.js 는 이 스크립트보다 뒤에 로드되므로, DOM 준비 후 실제 데이터로 채운다.
  const _fillSidebar = () => { if (typeof LibraryFilter !== 'undefined') LibraryFilter.renderSidebarList(); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _fillSidebar);
  } else {
    _fillSidebar();
  }
})();
