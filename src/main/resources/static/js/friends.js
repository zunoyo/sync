/**
 * SOUNDWAVE — Friends Page Modules
 *
 * 모듈 구성
 *   FriendsPage         — 친구 목록 렌더
 *   FriendDetailModal   — 친구가 공유한 플레이리스트 + 트랙 재생/저장
 *   AddFriendModal      — 친구 요청 발송
 *   FriendRequestsModal — 수신 친구 요청 수락/거절
 *
 * v2 변경사항 (백엔드 연동)
 *   - FRIENDS/FRIEND_PLAYLISTS/FRIEND_REQUESTS mock 데이터 대신 실제 /api/friends/* 사용
 *   - 친구의 공유 플레이리스트: GET /api/friends/{friendUserId}/playlists
 *   - 공유 플레이리스트 트랙: GET /api/playlists/{id}/tracks (본인 소유 또는 친구+공개일 때만 열람 허용)
 *   - "내 플레이리스트에 저장"은 js/playlist-picker.js 의 PlaylistPicker 팝오버 재사용
 *   - 온라인/오프라인 실시간 접속 상태는 백엔드에 없는 개념이라 온라인 섹션 하나로 통합
 */

const _FRIENDS_GRADS = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];
function _friendsHashPick(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) & 0x7FFFFFFF;
  return _FRIENDS_GRADS[h % _FRIENDS_GRADS.length];
}
function _friendsInitials(name) {
  const s = String(name || '?').trim();
  return s.slice(0, 2) || '?';
}


/* ══════════════════════════════════════
   FriendsPage — 친구 목록
══════════════════════════════════════ */
const FriendsPage = (() => {

  let _friends = [];

  async function render() {
    try {
      const res = await fetch('/api/friends', { credentials: 'include' });
      _friends = res.ok ? await res.json() : [];
    } catch (e) { _friends = []; }

    // 실시간 온라인 상태 데이터가 없으므로 오프라인 섹션은 숨기고 하나로 통합
    const offlineWrap = document.getElementById('friends-offline-grid')?.closest('.section');
    if (offlineWrap) offlineWrap.style.display = 'none';

    const countEl = document.getElementById('online-count');
    if (countEl) countEl.textContent = `내 친구 (${_friends.length})`;

    const grid = document.getElementById('friends-online-grid');
    if (!grid) return;

    if (!_friends.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:36px;margin-bottom:12px">👋</div>
          <div style="font-size:14px">아직 친구가 없어요. "+ 친구 추가"로 시작해보세요.</div>
        </div>`;
    } else {
      grid.innerHTML = _friends.map(f => {
        const u = f.friend || {};
        const name = u.displayName || u.username || '알 수 없음';
        const nameEsc = String(name).replace(/'/g, "\\'");
        return `
          <div class="friend-card" onclick="FriendDetailModal.show(${u.id}, '${nameEsc}')">
            <div class="friend-avatar ${_friendsHashPick(u.id)}" style="color:#000">
              ${_friendsInitials(name)}
            </div>
            <div class="friend-info">
              <div class="friend-name">${name}</div>
              <div class="friend-status">@${u.username || ''}</div>
            </div>
            <svg class="friend-card-chevron" width="16" height="16"
                 viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
            </svg>
          </div>`;
      }).join('');
    }

    FriendRequestsModal.updateBadge();
  }

  return { render };
})();


/* ══════════════════════════════════════
   FriendDetailModal — 친구의 공유 플레이리스트
══════════════════════════════════════ */
const FriendDetailModal = (() => {

  let _friendUserId     = null;
  let _playlists        = [];
  let _expandedPlaylist = null;
  let _trackCache       = {};   // playlistId -> track[]

  /* ── 표시 ── */
  async function show(friendUserId, friendName) {
    _friendUserId     = friendUserId;
    _expandedPlaylist = null;
    _trackCache       = {};

    const modal = document.getElementById('friend-detail-modal');
    if (!modal) return;

    _setEl('fdm-avatar', el => {
      el.className   = `fdm-avatar ${_friendsHashPick(friendUserId)}`;
      el.textContent = _friendsInitials(friendName);
    });
    _setEl('fdm-name', el => { el.textContent = friendName || '친구'; });
    _setEl('fdm-status', el => { el.style.display = 'none'; });  // 온라인 상태 정보 없음

    const container = document.getElementById('fdm-playlists');
    if (container) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-secondary)">불러오는 중...</div>`;
    }

    modal.classList.remove('hidden');

    try {
      const res = await fetch(`/api/friends/${friendUserId}/playlists`, { credentials: 'include' });
      _playlists = res.ok ? await res.json() : [];
    } catch (e) { _playlists = []; }

    _renderPlaylists();
  }

  function hide() {
    document.getElementById('friend-detail-modal')?.classList.add('hidden');
    _expandedPlaylist = null;
  }

  /* ── 플레이리스트 아코디언 토글 (열 때 트랙 로드) ── */
  async function togglePlaylist(plId) {
    _expandedPlaylist = _expandedPlaylist === plId ? null : plId;

    if (_expandedPlaylist && !_trackCache[plId]) {
      try {
        const res = await fetch(`/api/playlists/${plId}/tracks`, { credentials: 'include' });
        const raw = res.ok ? await res.json() : [];
        _trackCache[plId] = raw.map(t => ({
          _id: t.id, trackDbId: t.id,
          name:   t.spotifyTrackName  || t.lastfmTrackName,
          artist: t.spotifyArtistName || t.lastfmArtistName,
          album:  t.spotifyAlbumName  || '',
          albumArt:   t.spotifyAlbumArtUrl || null,
          durationMs: t.spotifyDurationMs  || 0,
          duration: t.spotifyDurationMs
            ? `${Math.floor(t.spotifyDurationMs / 60000)}:${String(Math.floor((t.spotifyDurationMs % 60000) / 1000)).padStart(2, '0')}`
            : '—',
          previewUrl: t.spotifyPreviewUrl || null,
          spotifyId:  t.spotifyTrackId    || null,
        }));
      } catch (e) { _trackCache[plId] = []; }
    }
    _renderPlaylists();
  }

  /* ── 내부 렌더 ── */
  function _renderPlaylists() {
    const container = document.getElementById('fdm-playlists');
    if (!container) return;

    if (!_playlists.length) {
      container.innerHTML = `
        <div style="padding:40px 24px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:32px;margin-bottom:10px">🎵</div>
          <div style="font-size:13px">공유한 플레이리스트가 없어요</div>
        </div>`;
      return;
    }

    container.innerHTML = _playlists.map(pl => {
      const expanded = _expandedPlaylist === pl.id;
      const tracks   = _trackCache[pl.id] || [];
      window['_fdmTracks_' + pl.id] = tracks;

      return `
        <div class="fdm-playlist">
          <div class="fdm-playlist-header" onclick="FriendDetailModal.togglePlaylist(${pl.id})">
            <div class="fdm-playlist-art ${pl.gradient || 'grad-1'}">${pl.emoji || '🎵'}</div>
            <div class="fdm-playlist-info">
              <div class="fdm-playlist-name">${pl.playlistName}</div>
              <div class="fdm-playlist-count">${expanded ? tracks.length + '곡' : '탭해서 보기'}</div>
            </div>
            <div class="fdm-chevron ${expanded ? 'open' : ''}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
              </svg>
            </div>
          </div>
          <div class="fdm-track-list ${expanded ? 'open' : ''}">
            ${expanded && !tracks.length
              ? `<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:12px">곡이 없어요</div>`
              : ''}
            ${tracks.map((t, i) => `
              <div class="fdm-track"
                   onclick="Player.playTrack(window._fdmTracks_${pl.id}[${i}], window._fdmTracks_${pl.id}, ${i})">
                <span class="fdm-track-num">${i + 1}</span>
                ${t.albumArt
                  ? `<div class="fdm-track-art" style="overflow:hidden">
                       <img src="${t.albumArt}" style="width:100%;height:100%;object-fit:cover"
                            onerror="this.parentElement.textContent='🎵'"></div>`
                  : `<div class="fdm-track-art grad-4">🎵</div>`}
                <div class="fdm-track-info">
                  <div class="fdm-track-name">${t.name}</div>
                  <div class="fdm-track-artist">${t.artist}</div>
                </div>
                <span class="fdm-track-dur">${t.duration}</span>
                <button class="fdm-play-btn" title="내 플레이리스트에 저장"
                        onclick="event.stopPropagation();PlaylistPicker.open(window._fdmTracks_${pl.id}[${i}], this)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  </svg>
                </button>
                <button class="fdm-play-btn" title="재생"
                        onclick="event.stopPropagation();
                                 Player.playTrack(window._fdmTracks_${pl.id}[${i}], window._fdmTracks_${pl.id}, ${i});
                                 FriendDetailModal.hide()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');
  }

  /* ── 헬퍼 ── */
  function _setEl(id, fn) {
    const el = document.getElementById(id);
    if (el) fn(el);
  }

  return { show, hide, togglePlaylist };
})();


/* ══════════════════════════════════════
   AddFriendModal — 친구 요청 발송
══════════════════════════════════════ */
const AddFriendModal = (() => {

  function show() {
    const modal = document.getElementById('add-friend-modal');
    if (!modal) return;
    _reset();
    modal.classList.remove('hidden');
    document.getElementById('afm-input')?.focus();
  }

  function hide() {
    document.getElementById('add-friend-modal')?.classList.add('hidden');
  }

  async function sendRequest() {
    const input = document.getElementById('afm-input');
    const errEl = document.getElementById('afm-error');
    const sucEl = document.getElementById('afm-success');
    const btn   = document.getElementById('afm-btn');
    const value = input?.value.trim();

    _clearMsg();
    if (!value) { _showMsg(errEl, '사용자명 또는 이메일을 입력해주세요.'); return; }

    if (btn) { btn.disabled = true; btn.textContent = '요청 중...'; }

    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: value }),
      });
      if (res.ok) {
        _showMsg(sucEl, '✅ 친구 요청을 보냈어요! 상대방이 수락하면 친구가 됩니다.');
        setTimeout(hide, 1500);
      } else {
        _showMsg(errEl, '해당 사용자를 찾을 수 없거나 이미 요청을 보냈어요.');
        if (btn) { btn.disabled = false; btn.textContent = '친구 요청 보내기'; }
      }
    } catch (e) {
      _showMsg(errEl, '요청을 보내지 못했어요.');
      if (btn) { btn.disabled = false; btn.textContent = '친구 요청 보내기'; }
    }
  }

  /* ── 내부 ── */
  function _reset() {
    const input = document.getElementById('afm-input');
    const btn   = document.getElementById('afm-btn');
    if (input) input.value = '';
    if (btn)   { btn.disabled = false; btn.textContent = '친구 요청 보내기'; }
    _clearMsg();
  }

  function _clearMsg() {
    ['afm-error', 'afm-success'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
  }

  function _showMsg(el, msg) {
    if (!el) return;
    el.textContent   = msg;
    el.style.display = 'block';
  }

  return { show, hide, sendRequest };
})();


/* ══════════════════════════════════════
   FriendRequestsModal — 친구 요청 수락/거절
══════════════════════════════════════ */
const FriendRequestsModal = (() => {

  let _requests = [];

  async function _load() {
    try {
      const res = await fetch('/api/friends/requests', { credentials: 'include' });
      _requests = res.ok ? await res.json() : [];
    } catch (e) { _requests = []; }
  }

  /* ── 표시 ── */
  async function show() {
    const modal = document.getElementById('friend-requests-modal');
    if (!modal) return;
    await _load();
    _render();
    modal.classList.remove('hidden');
  }

  function hide() {
    document.getElementById('friend-requests-modal')?.classList.add('hidden');
  }

  /* ── 수락 ── */
  async function accept(id) {
    try {
      await fetch(`/api/friends/accept/${id}`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    await _load();
    _render();
    updateBadge();
    if (typeof FriendsPage !== 'undefined') FriendsPage.render();
  }

  /* ── 거절 ── */
  async function decline(id) {
    try {
      await fetch(`/api/friends/reject/${id}`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    await _load();
    _render();
    updateBadge();
  }

  /* ── 배지 업데이트 ── */
  async function updateBadge() {
    await _load();
    const badge = document.getElementById('friend-nav-badge');
    const btn   = document.getElementById('frm-open-btn-badge');
    const count = _requests.length;

    if (badge) { badge.textContent = count; badge.style.display = count ? '' : 'none'; }
    if (btn)   { btn.textContent   = count; btn.style.display   = count ? '' : 'none'; }
  }

  /* ── 내부 렌더 ── */
  function _render() {
    const container = document.getElementById('frm-list');
    const titleEl   = document.getElementById('frm-title');

    if (titleEl) {
      titleEl.textContent = _requests.length ? `친구 요청 ${_requests.length}건` : '친구 요청';
    }
    if (!container) return;

    if (!_requests.length) {
      container.innerHTML = `
        <div style="padding:48px 24px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:40px;margin-bottom:12px">🎉</div>
          <div style="font-size:14px;font-weight:700;color:var(--text-base);margin-bottom:4px">
            모두 처리됐어요!</div>
          <div style="font-size:13px">새로운 친구 요청이 없어요</div>
        </div>`;
      return;
    }

    container.innerHTML = _requests.map(req => {
      const u = req.user || {};   // 요청을 보낸 사람
      const name = u.displayName || u.username || '알 수 없음';
      return `
        <div class="frm-item">
          <div class="frm-avatar ${_friendsHashPick(u.id)}" style="color:#000">
            ${_friendsInitials(name)}
          </div>
          <div class="frm-info">
            <div class="frm-name">${name}</div>
            <div class="frm-meta">@${u.username || ''}</div>
          </div>
          <div class="frm-actions">
            <button class="frm-accept"  onclick="FriendRequestsModal.accept(${req.id})">수락</button>
            <button class="frm-decline" onclick="FriendRequestsModal.decline(${req.id})">거절</button>
          </div>
        </div>`;
    }).join('');
  }

  function getCount() { return _requests.length; }

  return { show, hide, accept, decline, updateBadge, getCount };
})();
