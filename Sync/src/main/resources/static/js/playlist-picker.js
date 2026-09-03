/**
 * SOUNDWAVE — PlaylistPicker
 * 곡 우측의 "+" 버튼 → 내 플레이리스트 목록 팝오버 → 클릭해서 추가
 * 백엔드: GET/POST /api/playlists, POST /api/playlists/{id}/tracks
 */
const PlaylistPicker = (() => {

  let _playlists   = null;   // 캐시
  let _pendingTrack = null;
  let _popoverEl    = null;

  /* ── 다양한 트랙 객체 형태 → PlaylistTrackDTO 로 매핑 ──
     실제 DB(playlist_track)는 spotify_track_id/name/artist_name 이 NOT NULL 이라
     진짜 Spotify ID가 없는 트랙(iTunes 검색 결과 등)은 안정적인 대체 ID를 채워서 보낸다. */
  function _toDTO(track) {
    const name   = track.name   || track.trackName  || '제목 없음';
    const artist = track.artist || track.artistName || '아티스트 미상';
    const rawId  = track.spotifyId || track._id || (name + '|' + artist);
    const fallbackId = 'ext_' + String(rawId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 90);

    return {
      spotifyTrackId:     track.spotifyId || fallbackId,
      spotifyTrackName:   name,
      spotifyArtistName:  artist,
      spotifyAlbumName:   track.album  || null,
      spotifyAlbumArtUrl: track.albumArt || null,
      spotifyPreviewUrl:  track.previewUrl || null,
      spotifyDurationMs:  track.durationMs || null,
      lastfmTrackName:    name,
      lastfmArtistName:   artist,
    };
  }

  function _toast(msg) {
    let t = document.getElementById('sw-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sw-toast';
      t.className = 'sw-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  async function _loadPlaylists(force) {
    if (_playlists && !force) return _playlists;
    try {
      const res = await fetch('/api/playlists', { credentials: 'include' });
      if (!res.ok) return _playlists || [];
      _playlists = await res.json();
    } catch (e) { return _playlists || []; }
    return _playlists;
  }

  function invalidateCache() { _playlists = null; }

  function close() {
    if (_popoverEl) _popoverEl.remove();
    _popoverEl = null;
    document.removeEventListener('click', _outsideClick, true);
    document.removeEventListener('keydown', _onEsc, true);
  }

  function _outsideClick(e) {
    if (_popoverEl && !_popoverEl.contains(e.target)) close();
  }
  function _onEsc(e) { if (e.key === 'Escape') close(); }

  function _position(pop, anchorEl) {
    const rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    if (!rect) { pop.style.top = '96px'; pop.style.right = '32px'; return; }
    let top  = window.scrollY + rect.bottom + 6;
    let left = window.scrollX + rect.right - 260;
    if (left < 8) left = 8;
    const maxTop = window.scrollY + window.innerHeight - 260;
    if (top > maxTop) top = window.scrollY + rect.top - 266;
    pop.style.top  = top  + 'px';
    pop.style.left = left + 'px';
  }

  async function open(track, anchorEl) {
    if (!track) return;
    if (typeof Auth !== 'undefined' && Auth.getUser && !Auth.getUser()) {
      if (typeof AuthModal !== 'undefined' && AuthModal.show) AuthModal.show('login');
      else alert('로그인이 필요해요.');
      return;
    }
    close();
    _pendingTrack = track;

    const pop = document.createElement('div');
    pop.className = 'pl-picker-popover';
    pop.innerHTML = `
      <div class="pl-picker-header">플레이리스트에 추가</div>
      <div class="pl-picker-list" id="pl-picker-list">불러오는 중...</div>
      <div class="pl-picker-new">
        <input type="text" id="pl-picker-new-name" placeholder="새 플레이리스트 이름" maxlength="100">
        <button onclick="PlaylistPicker._createAndAdd()">만들기</button>
      </div>`;
    document.body.appendChild(pop);
    _popoverEl = pop;
    _position(pop, anchorEl);
    setTimeout(() => {
      document.addEventListener('click', _outsideClick, true);
      document.addEventListener('keydown', _onEsc, true);
    }, 0);

    const playlists = await _loadPlaylists();
    const listEl = document.getElementById('pl-picker-list');
    if (!listEl) return;

    if (!playlists.length) {
      listEl.innerHTML = `<div class="pl-picker-empty">아직 만든 플레이리스트가 없어요</div>`;
      return;
    }
    listEl.innerHTML = playlists.map(pl => `
      <button class="pl-picker-item" onclick="PlaylistPicker._addTo(${pl.id}, this)">
        <span>${pl.playlistName}</span>
      </button>`).join('');
  }

  async function _addTo(playlistId, btnEl) {
    if (!_pendingTrack) return;
    if (btnEl) btnEl.disabled = true;
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_toDTO(_pendingTrack)),
      });
      if (res.status === 201)      _toast('✅ 플레이리스트에 추가했어요');
      else if (res.status === 409) _toast('이미 추가된 곡이에요');
      else if (res.status === 401) _toast('로그인이 필요해요');
      else                          _toast('추가하지 못했어요');
    } catch (e) {
      _toast('추가하지 못했어요');
    }
    close();
  }

  async function _createAndAdd() {
    const input = document.getElementById('pl-picker-new-name');
    const name  = input && input.value.trim();
    if (!name) { input && input.focus(); return; }
    try {
      const GRADS = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];
      const gradient = GRADS[Math.floor(Math.random() * GRADS.length)];
      const res = await fetch('/api/playlists', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistName: name, public: false, source: 'user_created', emoji: '🎵', gradient }),
      });
      if (!res.ok) throw new Error('create failed');
      const created = await res.json();
      invalidateCache();
      if (typeof LibraryFilter !== 'undefined') LibraryFilter.refresh();
      await _addTo(created.id, null);
    } catch (e) {
      _toast('플레이리스트를 만들지 못했어요');
    }
  }

  /* ── 좋아요(하트) 토글 — "좋아요 표시한 곡" 플레이리스트에 추가/제거 ── */
  async function toggleLike(track, btnEl) {
    if (!track) return;
    if (typeof Auth !== 'undefined' && Auth.getUser && !Auth.getUser()) {
      if (typeof AuthModal !== 'undefined' && AuthModal.show) AuthModal.show('login');
      else alert('로그인이 필요해요.');
      return;
    }
    if (btnEl) btnEl.disabled = true;
    try {
      const res = await fetch('/api/playlists/liked/toggle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_toDTO(track)),
      });
      if (res.status === 401) { _toast('로그인이 필요해요'); return; }
      if (!res.ok) { _toast('처리하지 못했어요'); return; }

      const result = await res.json();
      if (btnEl) btnEl.classList.toggle('liked', result.liked);
      _toast(result.liked
        ? `'${result.playlistName}'에 저장했어요`
        : `'${result.playlistName}'에서 제거했어요`);

      invalidateCache();
      if (typeof LibraryFilter !== 'undefined') LibraryFilter.refresh();
    } catch (e) {
      _toast('처리하지 못했어요');
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }

  return { open, close, invalidateCache, toggleLike, _addTo, _createAndAdd };
})();
