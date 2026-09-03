/**
 * SOUNDWAVE — Navigation & Page Modules
 *
 * PlaylistPage 는 js/library.js 에서 정의됩니다.
 * FriendsPage  는 js/friends.js  에서 정의됩니다.
 */

/* ══ Navigation ══════════════════════════════════════════ */
const Navigation = (() => {

  /** 페이지 전환 + 브라우저 히스토리 기록 */
  function switchPage(pageId, context = null) {
    History.push(pageId, context);
    _doSwitch(pageId, context);
  }

  /** popstate(앞으로/뒤로 버튼) 에서 호출 — 히스토리 기록 없이 복원 */
  function _restore(pageId, context) {
    _doSwitch(pageId, context);
  }

  function _doSwitch(pageId, context) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById('page-' + pageId)?.classList.add('active');
    document.getElementById('nav-'  + pageId)?.classList.add('active');

    const sb = document.getElementById('search-bar');
    if (sb) sb.style.display = pageId === 'search' ? 'block' : 'none';

    if (pageId === 'friends')  FriendsPage.render();
    if (pageId === 'sync')     SyncPage.init();
    if (pageId === 'playlist') PlaylistPage.render();
    if (pageId === 'profile')  ProfilePage.populate();
    if (pageId === 'detail')   DetailPage.populate(context);
  }

  function init() {
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); switchPage(el.dataset.page); });
    });
  }

  return { init, switchPage, _restore };
})();


/* ══ TrackList ═══════════════════════════════════════════ */
const TrackList = (() => {
  function renderItem(track, i) {
    const playing = Player.getState().currentTrack?.id === track.id;
    return `
      <div class="track-item ${playing ? 'active' : ''}"
           onclick="Player.playTrack(TRACKS[${i}])">
        <div class="track-num-wrap">
          ${playing
            ? `<div class="eq-bars">
                 <div class="eq-bar"></div><div class="eq-bar"></div>
                 <div class="eq-bar"></div><div class="eq-bar"></div>
               </div>`
            : `<span class="track-num">${track.id}</span>`}
          <svg class="track-play-icon" width="16" height="16"
               viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div class="track-art ${track.gradient}">${track.emoji}</div>
        <div class="track-info">
          <div class="track-name ${playing ? 'playing' : ''}">${track.name}</div>
          <div class="track-artist">${track.artist}</div>
        </div>
        <div class="track-album">${track.album}</div>
        <div class="track-actions">
          <button class="track-like-btn"
                  onclick="event.stopPropagation();this.classList.toggle('liked')"
                  title="좋아요">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3
                       7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3
                       19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <span class="track-duration">${track.duration}</span>
        </div>
      </div>`;
  }

  function renderAll() {
    const c = document.getElementById('track-list');
    if (c) c.innerHTML = TRACKS.map((t, i) => renderItem(t, i)).join('');
  }

  return { renderAll };
})();


/* ══ ProfilePage ═════════════════════════════════════════ */
const ProfilePage = (() => {

  function populate() {
    const user = Auth.getUser();
    if (!user) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('f-name',     user.display_name);
    set('f-email',    user.email);
    set('f-username', user.username);
    const nameEl   = document.querySelector('.profile-name');
    const avatarEl = document.getElementById('profile-avatar-display');
    if (nameEl)   nameEl.textContent   = user.display_name || user.username || 'SoundWave 사용자';
    if (avatarEl) avatarEl.textContent = (user.username || 'SW').slice(0, 2).toUpperCase();

    _loadSpotifyStatus();
  }

  /* ── Spotify 상태 캐시 (5분) — 반복 DB 쿼리 방지 ── */
  let _statusCache   = null;
  let _statusCacheAt = 0;
  const STATUS_TTL   = 5 * 60 * 1000;

  /* ── Spotify 연동 상태 렌더 ── */
  function _renderSpotifyStatus(data) {
    const section = document.getElementById('spotify-status-section');
    if (!section) return;
        if (data.connected) {
      const expired = data.isExpired;
      section.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:16px;background:${expired ? 'rgba(255,165,0,.08)' : 'rgba(30,215,96,.08)'};
                    border:1px solid ${expired ? 'rgba(255,165,0,.3)' : 'rgba(30,215,96,.2)'};
                    border-radius:12px">
          <div>
            <div style="font-size:14px;font-weight:700;color:${expired ? '#ffa500' : '#1ed760'}">
              ${expired ? '⚠ 토큰 만료' : '✅ 연동됨'}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
              @${data.spotifyUserId || ''}
              ${expired ? ' · 재연동하면 전체 재생이 가능해요' : ' · 전체 재생 활성화'}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${expired ? `<button onclick="ProfilePage._reconnectSpotify()"
                    style="background:#1ed760;border:none;color:#000;padding:8px 16px;
                           border-radius:50px;font-size:12px;font-weight:700;
                           cursor:pointer;font-family:inherit">재연동하기</button>` : ''}
            <button onclick="ProfilePage._disconnectSpotify()"
                    style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);
                           color:var(--text-secondary);padding:8px 16px;border-radius:50px;
                           font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
              연동 해제
            </button>
          </div>
        </div>`;
    } else {
      section.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:16px;background:var(--bg-mid);border-radius:12px;
                    border:1px solid rgba(255,255,255,.07)">
          <div>
            <div style="font-size:14px;font-weight:700">연동 안 됨</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
              Premium 계정 연동 시 음악 전체 재생 가능
            </div>
          </div>
          <button onclick="ProfilePage._connectSpotify()"
                  style="background:#1ed760;border:none;color:#000;padding:8px 18px;
                         border-radius:50px;font-size:12px;font-weight:700;
                         cursor:pointer;font-family:inherit">
            Spotify 연동
          </button>
        </div>`;
    }
  }

  /* ── Spotify 연동 상태 로드 (캐시 5분) ── */
  async function _loadSpotifyStatus(forceRefresh = false) {
    if (!forceRefresh && _statusCache &&
        Date.now() - _statusCacheAt < STATUS_TTL) {
      _renderSpotifyStatus(_statusCache);
      return;
    }
    try {
      const res  = await fetch('/api/spotify/status', { credentials: 'include' });
      if (!res.ok) throw new Error('401');
      const data = await res.json();
      _statusCache   = data;
      _statusCacheAt = Date.now();
      _renderSpotifyStatus(data);
    } catch(e) {
      const section = document.getElementById('spotify-status-section');
      if (section) section.innerHTML =
        '<div style="font-size:13px;color:var(--text-secondary)">상태를 불러올 수 없어요.</div>';
    }
  }

  async function _connectSpotify() {
    // Spotify 이동 전 localStorage 플래그 설정 (리다이렉트 후 세션 유지용)
    try { localStorage.setItem('sw_spotify_redirect', '1'); } catch(e) {}
    window.location.href = '/api/spotify/connect';
  }

  async function _disconnectSpotify() {
    if (!confirm('Spotify 연동을 해제할까요?')) return;
    _statusCache = null;
    await fetch('/api/spotify/disconnect', { method: 'DELETE' });
    _loadSpotifyStatus();
  }

  async function _reconnectSpotify() {
    _statusCache = null;
    await fetch('/api/spotify/disconnect', { method: 'DELETE' });
    try { localStorage.setItem('sw_spotify_redirect', '1'); } catch(e) {}
    window.location.href = '/api/spotify/connect';
  }

  return { populate, _connectSpotify, _disconnectSpotify, _reconnectSpotify };
})();


/* ══ SyncPage ════════════════════════════════════════════ */
const SyncPage = (() => {
  let initialized    = false;
  let attachedImages = [];

  function init() {
    if (!initialized) { _bindEvents(); _renderMoods(); initialized = true; }
    _renderRecommendations();
  }

  function _renderMoods() {
    const c = document.getElementById('sync-moods');
    if (!c) return;
    c.innerHTML = SYNC_MOODS.map(m =>
      `<button class="mood-pill" onclick="this.classList.toggle('active')">${m}</button>`
    ).join('');
  }

  function _bindEvents() {
    const ab = document.getElementById('sync-attach-btn');
    const fi = document.getElementById('sync-file-input');
    const ta = document.getElementById('sync-textarea');
    if (ab && fi) {
      ab.addEventListener('click', () => fi.click());
      fi.addEventListener('change', e => {
        Array.from(e.target.files).forEach(file => {
          if (!file.type.startsWith('image/')) return;
          const r = new FileReader();
          r.onload = ev => { attachedImages.push({ name: file.name, src: ev.target.result }); _renderPreviews(); };
          r.readAsDataURL(file);
        });
        fi.value = '';
      });
    }
    if (ta) {
      ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
      });
    }
  }

  function _renderPreviews() {
    const c = document.getElementById('sync-image-previews');
    if (!c) return;
    c.innerHTML = attachedImages.map((img, i) => `
      <div class="sync-img-preview">
        <img src="${img.src}" alt="${img.name}" title="${img.name}">
        <button class="sync-img-remove" onclick="SyncPage.removeImage(${i})" title="제거">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59
                     6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>`).join('');
  }

  function _renderRecommendations() {
    const c = document.getElementById('sync-results');
    if (!c) return;
    c.innerHTML = `
      <div class="ai-response">
        <div class="ai-response-header">
          <div class="ai-icon">🤖</div>
          <div>
            <div class="ai-name">Sync AI</div>
            <div style="font-size:11px;color:var(--text-secondary)">지금 당신을 위한 추천</div>
          </div>
        </div>
        <p class="ai-text">당신의 최근 청취 패턴을 분석했어요. 에너지 넘치는 K-Pop과 함께 집중력을 높여보세요! 🎵</p>
      </div>
      ${TRACKS.slice(0, 5).map((t, i) => `
        <div class="sync-track-rec" onclick="Player.playTrack(TRACKS[${i}])">
          <div class="track-art ${t.gradient}"
               style="width:44px;height:44px;border-radius:6px;display:flex;
                      align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
            ${t.emoji}</div>
          <div style="flex:1;overflow:hidden">
            <div style="font-size:14px;font-weight:700;color:var(--text-base);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${t.name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${t.artist}</div>
          </div>
          <span class="sync-match-badge">${95 - i * 5}% 일치</span>
        </div>`).join('')}`;
  }

  function sendMessage() {
    const ta = document.getElementById('sync-textarea');
    if (ta) ta.value = '';
    attachedImages = [];
    _renderPreviews();
    setTimeout(_renderRecommendations, 500);
  }

  function removeImage(i) { attachedImages.splice(i, 1); _renderPreviews(); }

  return { init, sendMessage, removeImage };
})();


/* ══ Profile 전역 함수 ═══════════════════════════════════ */
window.saveBasicInfo = function () {
  const name = document.getElementById('f-name')?.value.trim();
  const email = document.getElementById('f-email')?.value.trim();
  const username = document.getElementById('f-username')?.value.trim();
  if (!name || !email || !username) return alert('모든 필드를 입력해주세요.');
  Auth.updateUser({ display_name: name, email, username });
  const avatarBtn = document.getElementById('avatar-btn');
  if (avatarBtn) avatarBtn.textContent = username.slice(0, 2).toUpperCase();
  const nameEl = document.querySelector('.profile-name');
  if (nameEl) nameEl.textContent = name;
  const avatarEl = document.getElementById('profile-avatar-display');
  if (avatarEl) avatarEl.textContent = username.slice(0, 2).toUpperCase();
  alert('✅ 저장되었습니다.');
};

window.changePassword = function () {
  const curPw = document.getElementById('f-cur-pw')?.value;
  const newPw = document.getElementById('f-new-pw')?.value;
  const newPw2 = document.getElementById('f-new-pw2')?.value;
  const hint = document.getElementById('pw-hint');
  if (!curPw || !newPw || !newPw2) return alert('모든 필드를 입력해주세요.');
  if (newPw.length < 8) return alert('새 비밀번호는 8자 이상이어야 합니다.');
  if (newPw !== newPw2) {
    if (hint) { hint.textContent = '비밀번호가 일치하지 않습니다.'; hint.className = 'form-hint error'; }
    return;
  }
  const result = Auth.changePassword(curPw, newPw);
  if (result.ok) alert('✅ 비밀번호가 변경되었습니다.');
  else alert('❌ ' + result.msg);
};

window.validatePw = function () {
  const pw = document.getElementById('f-new-pw')?.value || '';
  const pw2 = document.getElementById('f-new-pw2')?.value || '';
  const hint = document.getElementById('pw-hint');
  if (!hint) return;
  if (!pw)                   { hint.textContent = '영문, 숫자, 특수문자 8자 이상';  hint.className = 'form-hint'; }
  else if (pw.length < 8)   { hint.textContent = '8자 이상 입력해주세요';           hint.className = 'form-hint error'; }
  else if (pw2 && pw !== pw2){ hint.textContent = '비밀번호가 일치하지 않습니다.';  hint.className = 'form-hint error'; }
  else if (pw2 && pw === pw2){ hint.textContent = '비밀번호가 일치합니다. ✓';       hint.className = 'form-hint success'; }
  else                       { hint.textContent = '비밀번호를 확인해주세요';         hint.className = 'form-hint'; }
};
