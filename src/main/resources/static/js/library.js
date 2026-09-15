/**
 * SOUNDWAVE — Library Modules
 *
 * 모듈 구성
 *   History            — history.pushState 기반 앞으로/뒤로 가기
 *   DetailPage         — 플레이리스트(실제 DB)·아티스트·앨범 상세 뷰 (공통)
 *   CreatePlaylistModal — 플레이리스트 생성 모달 (실제 백엔드 저장)
 *   LibraryFilter      — 사이드바 라이브러리 필터 (전체/플레이리스트/아티스트/앨범) + 실데이터 로드
 *   PlaylistPage       — 플레이리스트 관리 페이지 (아티스트·앨범 탭 포함, 실데이터)
 *
 * v2 변경사항 (백엔드 연동)
 *   - 플레이리스트: GET/POST/DELETE /api/playlists, /api/playlists/{id}/tracks
 *   - 저장한 아티스트/앨범: js/saved-library.js 의 SavedLibrary 모듈 사용
 *   - 곡 추가는 js/playlist-picker.js 의 PlaylistPicker 팝오버로 처리
 *   - 예전 mock(TRACKS/PLAYLISTS/ARTISTS/ALBUMS) 기반 렌더링은 DetailPage._populateGeneric()
 *     에 남겨둠 (showCollection 등 다른 곳에서 재사용될 가능성 대비, 하위 호환용)
 */


/* ── 플레이리스트 카드/사이드바에서 공통으로 쓰는 이모지·그라디언트 해시 폴백 ──
   pl.emoji/pl.gradient 가 저장돼 있으면 그 값을 쓰고, 없을 때만(레거시 데이터)
   id 기반 해시로 항상 같은 조합이 나오게 한다 — 홈 화면 빠른 액세스, 사이드바,
   플레이리스트 관리 페이지가 전부 이 규칙을 따라야 어디서 봐도 같은 모양으로 보인다. */
const _PL_GRADS  = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];
const _PL_EMOJIS = ['🎵','🎸','🎤','💜','🔥','🌙','⭐','🎧','🚗','💎','🌊','👑'];
function _plHashPick(seed, arr) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) & 0x7FFFFFFF;
  return arr[h % arr.length];
}
function _plGradient(pl) { return pl.gradient || _plHashPick('g' + pl.id, _PL_GRADS); }
function _plEmoji(pl)    { return pl.emoji    || _plHashPick('e' + pl.id, _PL_EMOJIS); }


/* ══════════════════════════════════════
   History — 앞으로 / 뒤로 가기
══════════════════════════════════════ */
const History = (() => {
  let _ready = false;

  function init() {
    if (_ready) return;
    _ready = true;

    history.replaceState({ pageId: 'home', context: null }, '');

    window.addEventListener('popstate', e => {
      if (e.state) Navigation._restore(e.state.pageId, e.state.context);
    });
  }

  function push(pageId, context = null) {
    history.pushState({ pageId, context }, '');
  }

  return { init, push };
})();


/* ══════════════════════════════════════
   DetailPage — 상세 뷰 (플레이리스트/아티스트/앨범/컬렉션)
══════════════════════════════════════ */
const DetailPage = (() => {

  /* ── 외부 진입점 ── */

  // 실제 DB 플레이리스트 상세
  function showPlaylist(id) {
    Navigation.switchPage('detail', { type: 'playlist-real', id });
  }

  // 아티스트 상세는 실데이터 기반 HomePage 모듈에 위임
  function showArtist(name) {
    if (typeof HomePage !== 'undefined') HomePage._showArtistDetail(name);
  }

  // 앨범 상세(저장한 앨범 카드 클릭)는 SavedLibrary 에 위임
  // entity: { albumExternalId, albumName, artistName, albumArtUrl }
  function showAlbum(entity) {
    if (!entity) return;
    if (typeof SavedLibrary !== 'undefined') {
      SavedLibrary.showAlbumDetail(entity.albumExternalId, entity.albumName,
                                    entity.artistName, entity.albumArtUrl);
    }
  }

  // 홈 카드 등 임시/목업 컬렉션 표시 (하위 호환)
  function showCollection(name, emoji, gradient, trackIds) {
    Navigation.switchPage('detail', { type: 'collection', name, emoji, gradient, trackIds });
  }

  /* ── Navigation 이 'detail' 로 전환된 후 호출 ── */
  function populate(config) {
    if (!config) return;
    if (config.type === 'playlist-real') { _populateRealPlaylist(config.id); return; }
    _populateGeneric(config);
  }

  /* ── 실제 플레이리스트 상세 (DB) ── */
  async function _populateRealPlaylist(id) {
    const hero = document.getElementById('detail-hero');
    const list = document.getElementById('detail-track-list');
    if (!hero || !list) return;

    hero.className = 'detail-hero grad-1';
    hero.style.cssText = '';
    hero.innerHTML = `
      <div class="detail-hero-art" id="dp-pl-art">🎵</div>
      <div class="detail-hero-info">
        <div class="detail-hero-type">플레이리스트</div>
        <div class="detail-hero-name" id="dp-pl-name">불러오는 중...</div>
        <div class="detail-hero-meta" id="dp-pl-meta"></div>
        <div class="detail-hero-actions">
          <button class="play-btn-large" id="dp-pl-play" disabled title="재생">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button id="dp-pl-share" title="친구 공유 켜기"
                  onclick="DetailPage._toggleVisibility(${id})"
                  style="display:inline-flex;align-items:center;gap:6px;
                         background:none;border:1px solid rgba(255,255,255,.3);
                         color:rgba(255,255,255,.85);border-radius:50px;
                         padding:0 16px;height:40px;white-space:nowrap;
                         cursor:pointer;font-family:inherit;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
              <path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .05 3.11L8.91 10.7a3 3 0 1 0 0 2.6l6.14 3.59A3 3 0 1 0 16 15a3 3 0
                       0 0-.05.34l-6.14-3.59a3 3 0 0 0 0-1.5l6.14-3.59A3 3 0 0 0 18 8z"/>
            </svg>
            <span id="dp-pl-share-label" style="font-size:13px;font-weight:600">비공개</span>
          </button>
          <button class="action-btn" title="삭제" onclick="DetailPage._deletePlaylist(${id})">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      </div>`;
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary)">불러오는 중...</div>`;

    try {
      const [plRes, trRes] = await Promise.all([
        fetch(`/api/playlists/${id}`,        { credentials: 'include' }),
        fetch(`/api/playlists/${id}/tracks`, { credentials: 'include' }),
      ]);
      if (!plRes.ok) throw new Error('not found');
      const pl        = await plRes.json();
      const rawTracks = trRes.ok ? await trRes.json() : [];

      const tracks = rawTracks.map(t => ({
        _id:         t.id,
        trackDbId:   t.id,
        name:        t.spotifyTrackName  || t.lastfmTrackName,
        artist:      t.spotifyArtistName || t.lastfmArtistName,
        album:       t.spotifyAlbumName  || '',
        albumArt:    t.spotifyAlbumArtUrl || null,
        durationMs:  t.spotifyDurationMs || 0,
        duration:    t.spotifyDurationMs
          ? `${Math.floor(t.spotifyDurationMs / 60000)}:${String(Math.floor((t.spotifyDurationMs % 60000) / 1000)).padStart(2, '0')}`
          : '—',
        previewUrl:  t.spotifyPreviewUrl || null,
        spotifyId:   t.spotifyTrackId    || null,
      }));
      window._plDetailTracks = tracks;

      const nameEl = document.getElementById('dp-pl-name');
      if (nameEl) nameEl.textContent = pl.playlistName;
      const metaEl = document.getElementById('dp-pl-meta');
      if (metaEl) metaEl.textContent = `${tracks.length}곡`;
      // 플레이리스트마다 저장된(또는 해시로 정해지는) 그라디언트·이모지를 반영
      // — 지금까지는 무조건 초록(grad-1)이었던 부분 수정
      hero.className = 'detail-hero ' + _plGradient(pl);
      const artEl = document.getElementById('dp-pl-art');
      if (artEl) artEl.textContent = _plEmoji(pl);
      const playBtn = document.getElementById('dp-pl-play');
      if (playBtn && tracks.length) {
        playBtn.disabled = false;
        playBtn.onclick  = () => Player.playTrack(tracks[0], tracks, 0);
      }

      // 친구 공유 버튼 초기 상태 반영
      // 주의: Lombok이 boolean isPublic 필드의 게터를 isPublic()으로 만들면서 Jackson이
      // 직렬화하는 실제 JSON 키는 "isPublic"이 아니라 "public"이 된다.
      _setShareButton(document.getElementById('dp-pl-share'), !!pl.public);

      list.innerHTML = tracks.length ? tracks.map((t, i) => `
        <div class="track-item"
             onclick="Player.playTrack(window._plDetailTracks[${i}],window._plDetailTracks,${i})">
          <div class="track-num-wrap">
            <span class="track-num">${i + 1}</span>
            <svg class="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          ${t.albumArt
            ? `<div class="track-art" style="overflow:hidden"><img src="${t.albumArt}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🎵'"></div>`
            : `<div class="track-art grad-4">🎵</div>`}
          <div class="track-info">
            <div class="track-name">${t.name}</div>
            <div class="track-artist">${t.artist}</div>
          </div>
          <div class="track-album">${t.album}</div>
          <div class="track-actions">
            <button class="track-remove-btn" title="플레이리스트에서 제거"
                    onclick="event.stopPropagation();DetailPage._removeTrack(${t.trackDbId}, ${id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
            </button>
            <span class="track-duration">${t.duration}</span>
          </div>
        </div>`).join('') : `
        <div style="padding:48px;text-align:center;color:var(--text-secondary)">
          <div style="font-size:36px;margin-bottom:12px">🎵</div>
          <div style="font-size:14px">아직 곡이 없어요. 검색이나 홈에서 곡을 추가해보세요.</div>
        </div>`;
    } catch (e) {
      list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-secondary)">불러오기 실패</div>`;
    }
  }

  async function _removeTrack(trackDbId, playlistId) {
    try {
      await fetch(`/api/playlists/tracks/${trackDbId}`, { method: 'DELETE', credentials: 'include' });
    } catch (e) {}
    _populateRealPlaylist(playlistId);
  }

  /* ── 친구 공유(공개) 토글 버튼 상태 반영 ── */
  function _setShareButton(btn, isPublic) {
    if (!btn) return;
    const label = document.getElementById('dp-pl-share-label');
    btn.title = isPublic ? '친구 공유 끄기' : '친구 공유 켜기';
    btn.classList.toggle('active', isPublic);
    btn.style.color       = isPublic ? 'var(--accent)' : 'rgba(255,255,255,.85)';
    btn.style.borderColor = isPublic ? 'var(--accent)' : 'rgba(255,255,255,.3)';
    if (label) label.textContent = isPublic ? '공유중' : '비공개';
  }

  async function _toggleVisibility(id) {
    const btn = document.getElementById('dp-pl-share');
    const wantPublic = !(btn && btn.classList.contains('active'));
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/playlists/${id}/visibility`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: wantPublic }),
      });
      if (res.ok) {
        const updated = await res.json();
        _setShareButton(btn, !!updated.public);
      }
    } catch (e) {}
    if (btn) btn.disabled = false;
  }

  async function _deletePlaylist(id) {
    if (!confirm('이 플레이리스트를 삭제할까요?')) return;
    try {
      await fetch(`/api/playlists/${id}`, { method: 'DELETE', credentials: 'include' });
    } catch (e) {}
    history.back();
    if (typeof PlaylistPage    !== 'undefined') PlaylistPage.render();
    if (typeof LibraryFilter   !== 'undefined') LibraryFilter.refresh();
    if (typeof PlaylistPicker  !== 'undefined') PlaylistPicker.invalidateCache();
  }

  /* ── 하위 호환: mock(TRACKS) 기반 컬렉션 렌더 ── */
  function _populateGeneric(config) {
    const hero = document.getElementById('detail-hero');
    const list = document.getElementById('detail-track-list');
    if (!hero || !list) return;

    const tracks = (config.trackIds || [])
      .map(id => (typeof TRACKS !== 'undefined' ? TRACKS.find(t => t.id === id) : null))
      .filter(Boolean);

    hero.className = `detail-hero ${config.gradient || 'grad-4'}`;
    hero.style.cssText = '';
    hero.innerHTML = `
      <div class="detail-hero-art">${config.emoji || '🎵'}</div>
      <div class="detail-hero-info">
        <div class="detail-hero-type">컬렉션</div>
        <div class="detail-hero-name">${config.name || ''}</div>
        ${config.description ? `<div class="detail-hero-desc">${config.description}</div>` : ''}
        <div class="detail-hero-meta">${tracks.length}곡 · ${_totalDuration(tracks)}</div>
        <div class="detail-hero-actions">
          <button class="play-btn-large"
                  onclick="${tracks[0] ? `Player.playTrack(TRACKS.find(x=>x.id===${tracks[0].id}))` : ''}"
                  ${!tracks[0] ? 'disabled' : ''} title="재생">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      </div>`;

    list.innerHTML = tracks.length ? tracks.map((t, i) => `
      <div class="track-item" onclick="Player.playTrack(TRACKS.find(x=>x.id===${t.id}))">
        <div class="track-num-wrap">
          <span class="track-num">${i + 1}</span>
          <svg class="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="track-art ${t.gradient}">${t.emoji}</div>
        <div class="track-info">
          <div class="track-name">${t.name}</div>
          <div class="track-artist">${t.artist}</div>
        </div>
        <div class="track-album">${t.album}</div>
        <div class="track-actions">
          <span class="track-duration">${t.duration}</span>
        </div>
      </div>`).join('') : `
      <div style="padding:48px;text-align:center;color:var(--text-secondary)">
        <div style="font-size:36px;margin-bottom:12px">🎵</div>
        <div style="font-size:14px">아직 음악이 없어요</div>
      </div>`;
  }

  function _totalDuration(tracks) {
    const sec = tracks.reduce((s, t) => s + (t.durationSec || 0), 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h}시간 ${m}분` : `${m}분`;
  }

  return { populate, showPlaylist, showArtist, showAlbum, showCollection,
           _removeTrack, _deletePlaylist, _toggleVisibility };
})();


/* ══════════════════════════════════════
   CreatePlaylistModal — 새 플레이리스트 생성 (실제 백엔드 저장)
══════════════════════════════════════ */
const CreatePlaylistModal = (() => {

  const EMOJIS = ['🎵','🎸','🎤','💜','🔥','🌙','⭐','🎧','🚗','📚',
                  '💚','❤️','🎹','🎺','🎻','🌊','🏃','🌅','💎','👑'];
  const GRADIENTS = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];

  let _emoji = '🎵';

  function show() {
    const modal = document.getElementById('create-playlist-modal');
    if (!modal) return;
    _reset();
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('cpm-name')?.focus(), 100);
  }

  function hide() {
    document.getElementById('create-playlist-modal')?.classList.add('hidden');
  }

  async function create() {
    const name  = document.getElementById('cpm-name')?.value.trim();
    const errEl = document.getElementById('cpm-error');
    if (errEl) errEl.style.display = 'none';

    if (!name) {
      if (errEl) { errEl.textContent = '플레이리스트 이름을 입력해주세요.'; errEl.style.display = 'block'; }
      return;
    }

    try {
      const gradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
      const res = await fetch('/api/playlists', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 주의: PlaylistDTO의 boolean 필드 isPublic은 Lombok이 setPublic()으로 세터를 만들기 때문에
          // Jackson이 실제로 바인딩하는 JSON 키는 "isPublic"이 아니라 "public"이다.
          playlistName: name, public: false, source: 'user_created',
          emoji: _emoji, gradient,
        }),
      });
      if (!res.ok) throw new Error('create failed');

      hide();
      if (document.getElementById('page-playlist')?.classList.contains('active')) PlaylistPage.render();
      if (typeof LibraryFilter  !== 'undefined') LibraryFilter.refresh();
      if (typeof PlaylistPicker !== 'undefined') PlaylistPicker.invalidateCache();
    } catch (e) {
      if (errEl) { errEl.textContent = '플레이리스트를 만들지 못했어요. 로그인 상태를 확인해주세요.'; errEl.style.display = 'block'; }
    }
  }

  function selectEmoji(emoji, btn) {
    _emoji = emoji;
    document.querySelectorAll('.cpm-emoji-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  function _reset() {
    const nameEl = document.getElementById('cpm-name');
    const errEl  = document.getElementById('cpm-error');
    if (nameEl) nameEl.value = '';
    if (errEl)  { errEl.style.display = 'none'; errEl.textContent = ''; }
    _emoji = '🎵';
    document.querySelectorAll('.cpm-emoji-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  }

  return { show, hide, create, selectEmoji };
})();


/* ══════════════════════════════════════
   LibraryFilter — 사이드바 라이브러리 필터 + 실데이터 로드
══════════════════════════════════════ */
const LibraryFilter = (() => {

  function filter(type) {
    document.querySelectorAll('.lib-filter-pill').forEach(b => b.classList.remove('active'));
    document.querySelector(`.lib-filter-pill[data-filter="${type}"]`)?.classList.add('active');

    document.querySelectorAll('.library-item[data-kind]').forEach(el => {
      const kind = el.dataset.kind;
      el.style.display = (type === 'all' || kind === type) ? '' : 'none';
    });
    // 종류별 소제목도 필터에 맞춰 같이 숨김/표시
    document.querySelectorAll('.library-group-label[data-group]').forEach(el => {
      const kind = el.dataset.group;
      el.style.display = (type === 'all' || kind === type) ? '' : 'none';
    });
  }

  /** 사이드바 하단 라이브러리 목록을 실제 데이터로 렌더 */
  async function renderSidebarList(force) {
    const list = document.querySelector('.library-list');
    if (!list) return;
    list.innerHTML = `<div class="library-empty-hint">불러오는 중...</div>`;

    const [playlists, artists, albums] = await Promise.all([
      fetch('/api/playlists', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
      typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadArtists(force) : Promise.resolve([]),
      typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadAlbums(force)  : Promise.resolve([]),
    ]);

    window._sidebarAlbums = albums;

    // "플레이리스트 관리" 페이지처럼 종류별로 소제목을 붙여 구분되게 표시
    const groups = [
      { kind: 'playlist', label: '플레이리스트', html: playlists.map(pl => `
        <div class="library-item" data-kind="playlist" onclick="DetailPage.showPlaylist(${pl.id})">
          <div class="library-item-art ${_plGradient(pl)}">${_plEmoji(pl)}</div>
          <div class="library-item-info">
            <div class="library-item-name">${pl.playlistName}</div>
            <div class="library-item-meta">플레이리스트${pl.public ? ' · 공유중' : ''}</div>
          </div>
        </div>`).join('') },
      { kind: 'artist', label: '아티스트', html: artists.map(a => `
        <div class="library-item" data-kind="artist"
             onclick="DetailPage.showArtist('${String(a.artistName).replace(/'/g, "\\'")}')">
          <div class="library-item-art circle grad-4" style="overflow:hidden">
            ${a.artistImageUrl
              ? `<img src="${a.artistImageUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='🎤'">`
              : '🎤'}
          </div>
          <div class="library-item-info">
            <div class="library-item-name">${a.artistName}</div>
            <div class="library-item-meta">아티스트</div>
          </div>
        </div>`).join('') },
      { kind: 'album', label: '앨범', html: albums.map((a, i) => `
        <div class="library-item" data-kind="album" onclick="DetailPage.showAlbum(window._sidebarAlbums[${i}])">
          <div class="library-item-art" style="overflow:hidden">
            ${a.albumArtUrl
              ? `<img src="${a.albumArtUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='💿'">`
              : '💿'}
          </div>
          <div class="library-item-info">
            <div class="library-item-name">${a.albumName}</div>
            <div class="library-item-meta">앨범 · ${a.artistName || ''}</div>
          </div>
        </div>`).join('') },
    ];

    const nonEmptyGroups = groups.filter(g => g.html);
    const items = nonEmptyGroups.map(g => `
      <div class="library-group-label" data-group="${g.kind}"
           style="font-size:11px;font-weight:700;color:var(--text-secondary);
                  text-transform:uppercase;letter-spacing:.4px;padding:10px 10px 4px">
        ${g.label}
      </div>
      ${g.html}`);

    list.innerHTML = items.length ? items.join('') : `
      <div class="library-empty-hint">아직 저장한 항목이 없어요.<br>플레이리스트를 만들거나 곡을 추가해보세요.</div>`;
  }

  function refresh() { renderSidebarList(true); }

  return { filter, refresh, renderSidebarList };
})();


/* ══════════════════════════════════════
   PlaylistPage — 플레이리스트 관리 (아티스트·앨범 포함, 실데이터)
══════════════════════════════════════ */
const PlaylistPage = (() => {

  let _filter = 'all';
  const _plCounts = {};   // playlistId → 트랙 수 캐시

  const GRADS  = _PL_GRADS;
  const EMOJIS = _PL_EMOJIS;
  const _hashPick = _plHashPick;

  async function render(filter) {
    if (filter !== undefined) _filter = filter;

    document.querySelectorAll('.pl-filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.pl-filter-btn[data-filter="${_filter}"]`)?.classList.add('active');

    const grid = document.getElementById('playlist-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--text-secondary)">불러오는 중...</div>`;

    const showPl = _filter === 'all' || _filter === 'my' || _filter === 'saved';
    const showAr = _filter === 'all' || _filter === 'artist';
    const showAl = _filter === 'all' || _filter === 'album';

    const [allPlaylists, artists, albums] = await Promise.all([
      showPl ? _fetchPlaylists() : Promise.resolve([]),
      showAr && typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadArtists() : Promise.resolve([]),
      showAl && typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadAlbums()  : Promise.resolve([]),
    ]);

    window._libraryAlbums = albums;

    const playlists = _filter === 'my'    ? allPlaylists.filter(p => p.source === 'user_created')
                     : _filter === 'saved' ? allPlaylists.filter(p => p.source !== 'user_created')
                     : allPlaylists;

    let html = '';

    if (showPl) {
      html += `
        <div class="create-playlist-banner" onclick="CreatePlaylistModal.show()">
          <div class="create-icon">➕</div>
          <div class="create-title">새 플레이리스트 만들기</div>
          <div class="create-desc">좋아하는 곡들을 모아보세요</div>
        </div>`;
      html += playlists.length
        ? playlists.map(pl => _plCard(pl)).join('')
        : _emptyNote('아직 만든 플레이리스트가 없어요');
    }

    if (showAr) {
      if (_filter === 'all') html += _sectionLabel('아티스트');
      html += artists.length
        ? artists.map(a => _artistCard(a)).join('')
        : _emptyNote('저장한 아티스트가 없어요');
    }

    if (showAl) {
      if (_filter === 'all') html += _sectionLabel('앨범');
      html += albums.length
        ? albums.map((a, i) => _albumCard(a, i)).join('')
        : _emptyNote('저장한 앨범이 없어요');
    }

    grid.innerHTML = html || _emptyNote('항목이 없어요');
  }

  async function _fetchPlaylists() {
    let playlists = [];
    try {
      const res = await fetch('/api/playlists', { credentials: 'include' });
      playlists = res.ok ? await res.json() : [];
    } catch (e) { playlists = []; }

    await Promise.all(playlists.map(async pl => {
      if (_plCounts[pl.id] !== undefined) return;
      try {
        const r  = await fetch(`/api/playlists/${pl.id}/tracks`, { credentials: 'include' });
        const tr = r.ok ? await r.json() : [];
        _plCounts[pl.id] = tr.length;
      } catch (e) { _plCounts[pl.id] = 0; }
    }));
    return playlists;
  }

  /* ── 카드 렌더 ── */
  function _plCard(pl) {
    const grad  = pl.gradient || _hashPick('g' + pl.id, GRADS);
    const emoji = pl.emoji    || _hashPick('e' + pl.id, EMOJIS);
    const count = _plCounts[pl.id] ?? 0;
    const shared = !!pl.public;   // Lombok setPublic()/isPublic() 관례상 JSON 키는 "public"
    return `
      <div class="playlist-card" onclick="DetailPage.showPlaylist(${pl.id})">
        <div class="playlist-card-art ${grad}">
          <span style="font-size:52px">${emoji}</span>
          ${shared ? `<span title="친구에게 공유중" style="position:absolute;top:8px;left:8px;
                       background:rgba(30,215,96,.9);color:#000;font-size:10px;font-weight:700;
                       padding:2px 8px;border-radius:var(--radius-full)">공유중</span>` : ''}
          <div class="playlist-card-overlay">
            <button class="detail-play-btn" onclick="event.stopPropagation();DetailPage.showPlaylist(${pl.id})" title="열기">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        </div>
        <button class="pl-menu-btn icon-btn" title="삭제" onclick="event.stopPropagation();PlaylistPage._deleteFromCard(${pl.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
        <div class="playlist-card-body">
          <div class="playlist-card-name">${pl.playlistName}</div>
          <div class="playlist-card-meta">플레이리스트 · ${count}곡</div>
        </div>
      </div>`;
  }

  function _artistCard(a) {
    const nameEsc = String(a.artistName).replace(/'/g, "\\'");
    return `
      <div class="playlist-card" onclick="DetailPage.showArtist('${nameEsc}')" style="--card-radius:50%">
        <div class="playlist-card-art ${_hashPick('a' + a.artistName, GRADS)}" style="border-radius:50%;overflow:hidden">
          ${a.artistImageUrl
            ? `<img src="${a.artistImageUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
            : `<span style="font-size:52px">🎤</span>`}
          <div class="playlist-card-overlay" style="border-radius:50%">
            <button class="detail-play-btn" title="보기" onclick="event.stopPropagation();DetailPage.showArtist('${nameEsc}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        </div>
        <div class="playlist-card-body">
          <div class="playlist-card-name">${a.artistName}</div>
          <div class="playlist-card-meta">아티스트</div>
        </div>
      </div>`;
  }

  function _albumCard(a, i) {
    return `
      <div class="playlist-card" onclick="DetailPage.showAlbum(window._libraryAlbums[${i}])">
        <div class="playlist-card-art ${_hashPick('al' + a.albumExternalId, GRADS)}">
          ${a.albumArtUrl
            ? `<img src="${a.albumArtUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
            : `<span style="font-size:52px">💿</span>`}
          <div class="playlist-card-overlay">
            <button class="detail-play-btn" title="보기" onclick="event.stopPropagation();DetailPage.showAlbum(window._libraryAlbums[${i}])">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        </div>
        <div class="playlist-card-body">
          <div class="playlist-card-name">${a.albumName}</div>
          <div class="playlist-card-meta">${a.artistName || ''}${a.releaseYear ? ' · ' + a.releaseYear : ''}</div>
        </div>
      </div>`;
  }

  function _sectionLabel(label) {
    return `<div style="grid-column:1/-1;font-size:18px;font-weight:700;
                        margin:8px 0 4px;padding:4px 0;
                        border-bottom:1px solid rgba(255,255,255,0.08)">
              ${label}
            </div>`;
  }

  function _emptyNote(msg) {
    return `<div style="grid-column:1/-1;padding:56px;text-align:center;color:var(--text-secondary)">
              <div style="font-size:36px;margin-bottom:12px">🎵</div>
              <div style="font-size:14px">${msg}</div>
            </div>`;
  }

  async function _deleteFromCard(id) {
    if (!confirm('이 플레이리스트를 삭제할까요?')) return;
    try {
      await fetch(`/api/playlists/${id}`, { method: 'DELETE', credentials: 'include' });
    } catch (e) {}
    delete _plCounts[id];
    render();
    if (typeof LibraryFilter  !== 'undefined') LibraryFilter.refresh();
    if (typeof PlaylistPicker !== 'undefined') PlaylistPicker.invalidateCache();
  }

  return { render, _deleteFromCard };
})();
