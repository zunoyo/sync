/**
 * SOUNDWAVE — SavedLibrary
 * 저장한 아티스트 / 앨범 (내 라이브러리 - 아티스트, 앨범 탭)
 * 백엔드: /api/library/artists, /api/library/albums
 */
const SavedLibrary = (() => {

  let _artists = null;   // 캐시 (null = 아직 시도 안 함, 배열 = 성공적으로 가져온 결과)
  let _albums  = null;

  // 실패(401 등)한 결과는 캐시하지 않는다 — 로그인 전에 한 번 실패해서 캐시가
  // 없으면(null 유지), 로그인 직후 force 없이 불러도 다시 시도하게 된다.
  async function loadArtists(force) {
    if (_artists && !force) return _artists;
    try {
      const res = await fetch('/api/library/artists', { credentials: 'include' });
      if (!res.ok) return _artists || [];
      _artists = await res.json();
    } catch (e) { return _artists || []; }
    return _artists;
  }

  async function loadAlbums(force) {
    if (_albums && !force) return _albums;
    try {
      const res = await fetch('/api/library/albums', { credentials: 'include' });
      if (!res.ok) return _albums || [];
      _albums = await res.json();
    } catch (e) { return _albums || []; }
    return _albums;
  }

  function isArtistSaved(name) {
    return (_artists || []).some(a => a.artistName === name);
  }
  function isAlbumSaved(externalId) {
    return (_albums || []).some(a => a.albumExternalId === String(externalId));
  }
  function _artistEntry(name) { return (_artists || []).find(a => a.artistName === name); }
  function _albumEntry(externalId) { return (_albums || []).find(a => a.albumExternalId === String(externalId)); }

  /* ── iTunes 조회 — 실패(레이트리밋 등) 시 잠깐 대기 후 한 번 더 시도 ── */
  async function _fetchItunesJson(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (e) { /* 재시도 */ }
      if (attempt === 0) await new Promise(r => setTimeout(r, 600));
    }
    return { results: [] };
  }

  /** 저장 ↔ 해제 토글. 반환값: 토글 후 저장 상태(true=저장됨) */
  async function toggleArtist(name, imageUrl, externalId) {
    if (!_artists) await loadArtists();
    const existing = _artistEntry(name);
    if (existing) {
      try { await fetch(`/api/library/artists/${existing.id}`, { method: 'DELETE', credentials: 'include' }); } catch (e) {}
      _artists = _artists.filter(a => a.id !== existing.id);
      return false;
    }
    try {
      const res = await fetch('/api/library/artists', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName: name,
          artistImageUrl: imageUrl || null,
          artistExternalId: externalId ? String(externalId) : null,
        }),
      });
      if (!res.ok) return false;
      const saved = await res.json();
      _artists = [saved, ...(_artists || [])];
      return true;
    } catch (e) { return false; }
  }

  /** album: { externalId, name, artistName, artUrl, year } */
  async function toggleAlbum(album) {
    if (!_albums) await loadAlbums();
    const existing = _albumEntry(album.externalId);
    if (existing) {
      try { await fetch(`/api/library/albums/${existing.id}`, { method: 'DELETE', credentials: 'include' }); } catch (e) {}
      _albums = _albums.filter(a => a.id !== existing.id);
      return false;
    }
    try {
      const res = await fetch('/api/library/albums', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumExternalId: String(album.externalId),
          albumName:       album.name,
          artistName:      album.artistName || null,
          albumArtUrl:     album.artUrl || null,
          releaseYear:     album.year ? String(album.year) : null,
        }),
      });
      if (!res.ok) return false;
      const saved = await res.json();
      _albums = [saved, ...(_albums || [])];
      return true;
    } catch (e) { return false; }
  }

  /* ── Spotify 앨범 상세 폴백 — iTunes lookup이 아무것도 못 찾았을 때만 호출 ── */
  async function _fetchSpotifyAlbumDetail(artistName, albumName) {
    try {
      const res = await fetch(`/api/spotify/catalog/album-detail?artistName=${encodeURIComponent(artistName)}&albumName=${encodeURIComponent(albumName)}`, { credentials: 'include' });
      const data = await res.json();
      if (!data?.tracks?.length) return null;
      return data.tracks.map((t, i) => ({
        _id: t._id, name: t.name, artist: t.artist, album: t.album || albumName,
        albumArt: t.albumArt || null,
        durationMs: t.durationMs || 0, duration: t.duration || '—',
        previewUrl: t.previewUrl || null, spotifyId: t.spotifyId || null,
        trackNumber: t.trackNumber || (i + 1),
      }));
    } catch (e) { return null; }
  }

  /* ══ 저장한 앨범 클릭 시 — 단일 앨범 상세 페이지 (iTunes lookup) ══ */
  async function showAlbumDetail(externalId, albumName, artistName, albumArt) {
    if (typeof Navigation !== 'undefined') Navigation.switchPage('detail');
    const hero = document.getElementById('detail-hero');
    const list = document.getElementById('detail-track-list');
    if (!hero || !list) return;

    hero.className = 'detail-hero grad-4';
    hero.style.cssText = '';
    hero.innerHTML = `
      <div class="detail-hero-art">
        ${albumArt ? `<img src="${albumArt}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : '💿'}
      </div>
      <div class="detail-hero-info">
        <div class="detail-hero-type">앨범</div>
        <div class="detail-hero-name">${albumName}</div>
        ${artistName ? `<div class="detail-hero-desc">${artistName}</div>` : ''}
        <div class="detail-hero-meta" id="album-meta-txt">불러오는 중...</div>
        <div class="detail-hero-actions">
          <button class="play-btn-large" id="album-play-btn" disabled title="재생">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      </div>`;
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary)">곡 불러오는 중...</div>`;

    try {
      const data = await _fetchItunesJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(externalId)}&entity=song`);
      let tracks = (data.results || [])
        .filter(r => r.wrapperType === 'track')
        .map((r, i) => ({
          _id: 'it_' + r.trackId,
          name: r.trackName, artist: r.artistName, album: r.collectionName || albumName,
          albumArt: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '500x500bb') : albumArt,
          durationMs: r.trackTimeMillis || 0,
          duration: r.trackTimeMillis
            ? `${Math.floor(r.trackTimeMillis / 60000)}:${String(Math.floor((r.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}`
            : '—',
          previewUrl: r.previewUrl || null,
          trackNumber: r.trackNumber || (i + 1),
        }))
        .sort((a, b) => a.trackNumber - b.trackNumber);

      // iTunes에서 아무 트랙도 못 찾았으면 Spotify로 보완
      if (tracks.length === 0 && artistName && albumName) {
        const fallback = await _fetchSpotifyAlbumDetail(artistName, albumName);
        if (fallback) tracks = fallback;
      }

      window._albumDetailTracks = tracks;

      const metaEl = document.getElementById('album-meta-txt');
      if (metaEl) metaEl.textContent = `${tracks.length}곡`;
      const playBtn = document.getElementById('album-play-btn');
      if (playBtn && tracks.length) {
        playBtn.disabled = false;
        playBtn.onclick = () => Player.playTrack(tracks[0], tracks, 0);
      }

      list.innerHTML = tracks.length ? tracks.map((t, i) => `
        <div class="track-item"
             onclick="Player.playTrack(window._albumDetailTracks[${i}],window._albumDetailTracks,${i})">
          <div class="track-num-wrap">
            <span class="track-num">${i + 1}</span>
            <svg class="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div class="track-info">
            <div class="track-name">${t.name}</div>
            <div class="track-artist">${t.artist}</div>
          </div>
          <div class="track-actions">
            <button class="track-add-btn" title="플레이리스트에 추가"
                    onclick="event.stopPropagation();PlaylistPicker.open(window._albumDetailTracks[${i}], this)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <span class="track-duration">${t.duration}</span>
          </div>
        </div>`).join('')
        : `<div style="padding:40px;text-align:center;color:var(--text-secondary)">곡 정보를 찾을 수 없어요</div>`;
    } catch (e) {
      list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-secondary)">불러오기 실패</div>`;
    }
  }

  return { loadArtists, loadAlbums, isArtistSaved, isAlbumSaved, toggleArtist, toggleAlbum, showAlbumDetail };
})();
