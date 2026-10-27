/**
 * SYNC — Home Page Module
 * - 인기 차트: /api/home/charts (Last.fm) + iTunes 앨범아트 브라우저 직접 보강
 * - 오늘의 추천: iTunes Search API 브라우저 직접 호출 (서버 불필요)
 */
const HomePage = (() => {

  const GRADIENTS  = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];
  const EMOJIS     = ['🎵','🎸','🎤','💜','🔥','🌙','⭐','🎧','🚗','💎'];
  const GENRE_EMOJI = { 'K-Pop':'🎤','인디':'🎸','힙합':'🎧','Lo-Fi':'🌙','R&B':'💜','팝':'⭐' };

  let _chartTracks = [];
  let _initialized = false;

  function _grad(i)  { return GRADIENTS[i % GRADIENTS.length]; }
  function _emoji(i) { return EMOJIS[i % EMOJIS.length]; }

  /* ── iTunes 아트워크를 원하는 해상도로 치환 (art-utils.js가 누락되어 여기에 직접 정의) ──
     "...100x100bb.jpg" 같은 iTunes artworkUrl 끝부분의 NxNbb 패턴을 정규식으로 찾아
     원하는 크기로 교체. 원본이 100x100이 아니어도(60x60 등) 항상 매칭됨. */
  function hiResArt(url, size) {
    if (!url) return null;
    return url.replace(/\d+x\d+bb(\.\w+)?$/, `${size}x${size}bb$1`);
  }
  function _fmtMs(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  function _normalizeTrack(raw, idx) {
    return {
      _id:        raw.spotifyId || raw.id || ('home_' + idx),
      name:       raw.name      || '알 수 없는 곡',
      artist:     raw.artist    || '알 수 없는 아티스트',
      album:      raw.album     || raw.albumName || '',
      albumArt:   raw.albumArt  || null,
      spotifyId:  raw.spotifyId || raw.id || null,
      previewUrl: raw.previewUrl || null,
      durationMs: raw.durationMs || null,
      duration:   _fmtMs(raw.durationMs),
      durationSec:raw.durationMs ? Math.floor(raw.durationMs / 1000) : 0,
      emoji:    _emoji(idx),
      gradient: _grad(idx),
    };
  }

  /* ── iTunes Search API 브라우저 직접 호출 ── */
  async function _fetchItunes(query) {
    try {
      const res  = await fetch(
        `/api/itunes-proxy/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!data.results?.length) return null;
      const item = data.results[0];
      return {
        albumArt:   hiResArt(item.artworkUrl100, 500) || null,
        durationMs: item.trackTimeMillis || null,
        previewUrl: item.previewUrl      || null,
        albumName:  item.collectionName  || '',
        trackName:  item.trackName       || '',
        artistName: item.artistName      || '',
      };
    } catch(e) { return null; }
  }

  /* ── 아티스트 사진 ──
     예전에는 "아티스트 이름으로 검색한 첫 곡의 앨범아트"를 썼는데 다른 가수의 곡이 걸리면 사진이 틀렸다
     (예: Lady Gaga). Spotify 아티스트 사진을 이름이 일치할 때만 쓰고, 없으면 iTunes 결과도
     아티스트명이 일치할 때만 쓴다. 못 찾으면 null(이모지 카드 유지). */
  const _photoCache = new Map();
  const _akey = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]/gu, '');
  function _fetchArtistPhoto(name, externalId) {
    if (!name) return Promise.resolve(null);
    const ck = name + '|' + (externalId || '');
    if (_photoCache.has(ck)) return _photoCache.get(ck);
    const p = (async () => {
      const want = _akey(name);
      if (!want) return null;
      // ① iTunes artistId 를 알면(국가별 차트) 그 아티스트의 앨범을 바로 조회 — 가장 정확하다
      if (externalId) {
        try {
          const r = await fetch(`/api/itunes-proxy/lookup?id=${encodeURIComponent(externalId)}&entity=album&limit=5`, { cache: 'no-store' });
          const alb = ((await r.json()).results || []).find(x => x.artworkUrl100);
          if (alb) return hiResArt(alb.artworkUrl100, 500);
        } catch (e) {}
      }
      let list = [];
      try {
        const r = await fetch(`/api/spotify/catalog/search-artists?q=${encodeURIComponent(name)}&limit=5`, { credentials: 'include' });
        list = (await r.json())?.artists || [];
      } catch (e) {}
      const exact = list.find(a => a.image && _akey(a.name) === want);
      if (exact) return exact.image;
      const loose = list.find(a => {
        const k = _akey(a.name);
        return a.image && Math.min(k.length, want.length) >= 3 && (k.includes(want) || want.includes(k));
      });
      if (loose) return loose.image;
      // iTunes 곡 검색은 제목이 겹치는 다른 가수의 곡이 먼저 나올 수 있어서(예: 튜이드),
      // 100건을 받아 그 중 (아티스트 상세 페이지와 같은 방식) 아티스트명이 일치하는 첫 곡의 앨범아트를 쓴다.
      try {
        const r = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(name)}&media=music&entity=song&limit=100`, { cache: 'no-store' });
        const hit = ((await r.json()).results || []).find(x => {
          const ik = _akey(x.artistName);
          return x.artworkUrl100 && ik && (ik === want || ik.startsWith(want));
        });
        if (hit) return hiResArt(hit.artworkUrl100, 500);
      } catch (e) {}
      return null;
    })();
    _photoCache.set(ck, p);
    return p;
  }

  /* ── 앨범아트 오류 콜백 (글로벌) ── */
  window._swCardImgErr = function(el, i) {
    const p = el.closest('.card-art') || el.parentElement;
    if (!p) return;
    p.innerHTML = `<div class="card-art-inner ${_grad(i)}">${_emoji(i)}</div>`;
  };
  window._swChartImgErr = function(el, i) {
    const p = el.parentElement;
    if (!p) return;
    p.className  = `${_grad(i)}`;
    p.style.cssText = 'width:42px;height:42px;border-radius:6px;flex-shrink:0;' +
      'display:flex;align-items:center;justify-content:center;font-size:18px';
    p.innerHTML  = _emoji(i);
  };

  function _chartArtHtml(track, i) {
    const st = 'width:42px;height:42px;border-radius:6px;flex-shrink:0;overflow:hidden;' +
               'display:flex;align-items:center;justify-content:center;font-size:18px';
    if (track.albumArt) {
      return `<div style="${st};background:#111">` +
             `<img src="${track.albumArt}" style="width:100%;height:100%;object-fit:cover"` +
             ` onerror="_swChartImgErr(this,${i})"></div>`;
    }
    return `<div class="${track.gradient}" style="${st}">${track.emoji}</div>`;
  }

  /* ── TrackList.renderAll 오버라이드 ── */
  function _hookTrackList() {
    if (typeof TrackList === 'undefined') return;
    const _orig = TrackList.renderAll.bind(TrackList);
    TrackList.renderAll = function() {
      if (_chartTracks.length > 0) _renderChartDOM(_chartTracks);
      else _orig();
    };
  }

  /* ── 빠른 액세스 ── */
  /* 플레이리스트 카드/사이드바와 동일한 이모지·그라디언트 규칙
     (library.js 의 _plHashPick 과 완전히 동일한 알고리즘 — 다른 파일이라 값만 복제) */
  const _QA_GRADS  = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];
  const _QA_EMOJIS = ['🎵','🎸','🎤','💜','🔥','🌙','⭐','🎧','🚗','💎','🌊','👑'];
  function _qaHashPick(seed, arr) {
    let h = 0;
    for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) & 0x7FFFFFFF;
    return arr[h % arr.length];
  }

  async function loadQuickAccess() {
    const grid = document.querySelector('#page-home .quick-grid');
    if (!grid) return;
    try {
      const data = await fetch('/api/home/quick-access').then(r=>r.json());
      if (!data?.length) return;
      grid.innerHTML = data.slice(0,6).map((pl,i)=>{
        const grad  = pl.gradient || _qaHashPick('g' + pl.id, _QA_GRADS);
        const emoji = pl.source === 'ai_recommended' ? '🤖' : (pl.emoji || _qaHashPick('e' + pl.id, _QA_EMOJIS));
        return `
        <div class="quick-item" onclick="DetailPage.showPlaylist(${pl.id})">
          <div class="quick-art ${grad}">${emoji}</div>
          <span class="quick-name">${pl.playlistName}</span>
          <button class="quick-play" onclick="event.stopPropagation();DetailPage.showPlaylist(${pl.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>`;
      }).join('');
    } catch(e) { console.warn('[HomePage] 빠른 액세스:', e); }
  }

  /* ── 인기 차트 DOM 렌더 ── */
  function _renderChartDOM(tracks) {
    const c = document.getElementById('track-list');
    if (!c) return;
    window._homeChartTracks = tracks;
    c.innerHTML = tracks.map((t,i) => `
      <div class="chart-row" onclick="HomePage._playChart(${i})">
        <span class="chart-rank">${i+1}</span>
        <div class="chart-thumb">
          ${t.albumArt ? `<img src="${t.albumArt}" onerror="this.parentElement.innerHTML=''">` : ''}
        </div>
        <div class="chart-info">
          <div class="chart-title">${t.name}</div>
          <div class="chart-artist">${t.artist}</div>
        </div>
        <div class="chart-actions">
          <button class="chart-add-btn" title="플레이리스트에 추가"
                  onclick="event.stopPropagation();PlaylistPicker.open(window._homeChartTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          <button class="chart-like-btn" title="좋아요"
                  onclick="event.stopPropagation();PlaylistPicker.toggleLike(window._homeChartTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3
                       7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3
                       19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        <button class="chart-play" onclick="event.stopPropagation();HomePage._playChart(${i})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>`).join('');
  }

  /* ── 인기 차트 로드 ── */
  async function loadCharts() {
    const c = document.getElementById('track-list');
    if (!c) return;
    if (_chartTracks.length > 0) { _renderChartDOM(_chartTracks); return; }

    c.innerHTML = '<div style="padding:20px;text-align:center;' +
      'color:var(--text-secondary);font-size:13px">차트 불러오는 중...</div>';
    try {
      const raw = await fetch('/api/home/charts').then(r=>r.json());
      if (!raw?.length) {
        c.innerHTML = '<div style="padding:20px;text-align:center;' +
          'color:var(--text-secondary)">차트를 불러올 수 없어요.</div>';
        return;
      }

      // 서버 데이터 먼저 표시
      _chartTracks = raw.map((t,i) => _normalizeTrack(t,i));
      window._chartTracks = _chartTracks; // 갤럭시 뷰(js/galaxy-view.js)에서 재사용
      _renderChartDOM(_chartTracks);
      _hookTrackList();

      // albumArt 없는 트랙 iTunes 로 병렬 보강
      const needsArt = _chartTracks.map((t,i) => ({t,i})).filter(({t}) => !t.albumArt);
      if (needsArt.length > 0) {
        const results = await Promise.all(
          needsArt.map(({t}) => _fetchItunes(`${t.name} ${t.artist}`))
        );
        let updated = false;
        needsArt.forEach(({t}, ri) => {
          const it = results[ri];
          if (!it) return;
          if (it.albumArt)                       { t.albumArt   = it.albumArt;  updated = true; }
          if (!t.durationMs && it.durationMs)    {
            t.durationMs  = it.durationMs;
            t.durationSec = Math.floor(it.durationMs / 1000);
            t.duration    = _fmtMs(it.durationMs);
          }
          if (!t.previewUrl && it.previewUrl)    { t.previewUrl = it.previewUrl; }
          if (!t.album      && it.albumName)     { t.album      = it.albumName;  }
        });
        if (updated) _renderChartDOM(_chartTracks);
      }
    } catch(e) {
      console.warn('[HomePage] 차트:', e);
      c.innerHTML = '<div style="padding:20px;text-align:center;' +
        'color:var(--text-secondary)">차트를 불러올 수 없어요.</div>';
    }
  }

  /* ── Spotify ID 백그라운드 프리패치 ─────────────────────────
     차트 로드 완료 3초 후, 200ms 간격으로 순차 검색.
     캐시에 저장 → 사용자 클릭 시 API 호출 없이 즉시 재생
  ─────────────────────────────────────────────────────────── */
  async function _prefetchSpotifyIds() {
    if (typeof Player === 'undefined' || !Player.searchSpotifyId) return;
    if (!_chartTracks.length) return;

    console.log('[HomePage] Spotify ID 프리패치 시작...');
    let failCount = 0;

    for (const track of _chartTracks) {
      if (track.spotifyId) continue;

      // 연속 실패 3회 → Rate Limit 상태, 프리패치 중단
      if (failCount >= 3) {
        console.warn('[HomePage] 프리패치 중단 (Rate Limit). 나중에 자동 재시도.');
        // 5분 후 재시도
        setTimeout(_prefetchSpotifyIds, 5 * 60 * 1000);
        return;
      }

      try {
        const sid = await Player.searchSpotifyId(track.name, track.artist);
        if (sid) {
          track.spotifyId = sid;
          failCount = 0;  // 성공 시 카운터 리셋
          console.log('[HomePage] 프리패치:', track.name, '→', sid);
        } else {
          failCount++;
        }
        await new Promise(r => setTimeout(r, 1000));  // 1초 간격 (Rate Limit 방지)
      } catch(e) {
        failCount++;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    console.log('[HomePage] Spotify ID 프리패치 완료');
  }

  /* ── 오늘의 추천 (iTunes 브라우저 직접 호출) ── */
  async function loadNewReleases() {
    const grid = document.getElementById('home-new-releases');
    if (!grid) return;

    grid.innerHTML = '<div style="padding:20px;text-align:center;' +
      'color:var(--text-secondary);font-size:13px">추천 불러오는 중...</div>';

    const GENRES = [
      { genre:'K-Pop',  query:'kpop 2024',        emoji:'🎤', grad:'grad-1' },
      { genre:'인디',   query:'korean indie 2024', emoji:'🎸', grad:'grad-3' },
      { genre:'힙합',   query:'hip hop 2024',      emoji:'🎧', grad:'grad-4' },
      { genre:'Lo-Fi',  query:'lofi chill',        emoji:'🌙', grad:'grad-2' },
      { genre:'R&B',    query:'rnb soul 2024',     emoji:'💜', grad:'grad-6' },
      { genre:'팝',     query:'pop hits 2024',     emoji:'⭐', grad:'grad-5' },
    ];

    const results = await Promise.all(GENRES.map(g => _fetchItunes(g.query)));

    window._homeNewReleaseTracks = [];

    grid.innerHTML = GENRES.map((g, i) => {
      const it    = results[i];
      const track = _normalizeTrack({
        name:       it?.trackName  || g.genre,
        artist:     it?.artistName || '',
        albumArt:   it?.albumArt   || null,
        albumName:  it?.albumName  || '',
        previewUrl: it?.previewUrl || null,
        durationMs: it?.durationMs || null,
        spotifyId:  null,
      }, i);
      window._homeNewReleaseTracks.push(track);

      return `
        <div class="card"
             onclick="Player.playTrack(window._homeNewReleaseTracks[${i}], window._homeNewReleaseTracks)">
          <div class="card-art">
            ${it?.albumArt
              ? `<img src="${it.albumArt}"
                      style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-md)"
                      onerror="_swCardImgErr(this,${i})">`
              : `<div class="card-art-inner ${g.grad}">${g.emoji}</div>`}
            <button class="card-play"
                    onclick="event.stopPropagation();Player.playTrack(window._homeNewReleaseTracks[${i}], window._homeNewReleaseTracks)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>
          <div class="card-title">${g.genre} · ${(it?.trackName||g.genre).slice(0,18)}</div>
          <div class="card-subtitle">${it?.artistName||'음악'}</div>
        </div>`;
    }).join('');
  }

  /* ── 히어로 배너 (loadCharts 완료 후 _chartTracks[0] 사용) ── */
  function updateHero() {
    if (!_chartTracks.length) return;
    const top  = _chartTracks[0];
    const hero = document.querySelector('#page-home .hero-banner');
    if (!hero) return;

    const artEl = hero.querySelector('.hero-art');
    if (artEl) {
      if (top.albumArt) {
        artEl.innerHTML = `<img src="${top.albumArt}"
          style="width:100%;height:100%;object-fit:cover;border-radius:12px"
          onerror="this.parentElement.innerHTML='🎵'">`;
        artEl.style.fontSize = '0';
      } else {
        artEl.innerHTML = top.emoji || '🎵';
      }
    }
    // 앨범아트 색을 배너 배경에 살짝 섞는다 (색을 못 읽으면 기본 색 유지)
    if (typeof RightPanel !== 'undefined' && RightPanel.albumColor && top.albumArt) {
      RightPanel.albumColor(top.albumArt).then(c => {
        const st = hero.style;
        if (!c) { ['--hero-c1','--hero-c2','--hero-glow'].forEach(k => st.removeProperty(k)); return; }
        const s = Math.round(Math.min(c.s, 0.6) * 100);
        st.setProperty('--hero-c1', `hsl(${c.h} ${s}% 20%)`);
        st.setProperty('--hero-c2', `hsl(${c.h} ${Math.round(s * 0.7)}% 10%)`);
        st.setProperty('--hero-glow', `hsla(${c.h}, ${Math.min(100, s + 20)}%, 62%, 0.2)`);
      });
    }
    const titleEl = hero.querySelector('.hero-title');
    if (titleEl) titleEl.textContent = top.name;
    const metaEl  = hero.querySelector('.hero-meta');
    if (metaEl)  metaEl.innerHTML = `<span>${top.artist}</span> · 글로벌 차트 #1`;
    const playBtn = hero.querySelector('.play-btn-large');
    if (playBtn) playBtn.onclick = () => Player.playTrack(top, _chartTracks, 0);
  }

  /* ── 공개 API ── */
  function _playChart(idx) {
    if (!_chartTracks[idx]) return;
    Player.playTrack(_chartTracks[idx], _chartTracks, idx);
    setTimeout(() => _renderChartDOM(_chartTracks), 50);
  }

  /* ══ 인기 아티스트 로드 ════════════════════════════════ */
  async function loadArtists() {
    const grid = document.querySelector('#page-home .cards-shelf.artist-grid');
    if (!grid) return;

    try {
      const artists = await fetch('/api/home/artists').then(r => r.json());
      if (!artists?.length) return;
      window._homeArtists = artists;
      window._homeArtistImages = window._homeArtistImages || {};

      const EMOJIS = ['🎤','🎸','💜','🔥','🌸','⭐'];
      const GRADS  = ['grad-4','grad-3','grad-6','grad-1','grad-7','grad-5'];

      grid.innerHTML = artists.map((a, i) => `
        <div class="card artist"
             onclick="HomePage._showArtistDetail('${a.name.replace(/'/g,"\\'")}')">
          <div class="card-art">
            <div class="card-art-inner ${GRADS[i]}" id="artist-art-${i}">
              ${EMOJIS[i]}
            </div>
            <button class="card-play"
                    onclick="event.stopPropagation();
                             HomePage._showArtistDetail('${a.name.replace(/'/g,"\\'")}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>
          <div class="card-title">${a.name}</div>
          <div class="card-subtitle">아티스트</div>
        </div>`).join('');

      // iTunes로 아티스트 이미지 보강 (비동기)
      artists.forEach(async (a, i) => {
        const photo = await _fetchArtistPhoto(a.name);
        if (!photo) return;
        window._homeArtistImages[a.name] = photo;
        const el = document.getElementById('artist-art-' + i);
        if (el) {
          el.innerHTML = `<img src="${photo}"
            style="width:100%;height:100%;object-fit:cover;border-radius:50%"
            onerror="this.parentElement.innerHTML='${EMOJIS[i]}'">`;
        }
        if (typeof GalaxyView !== 'undefined' && GalaxyView.isOpen()) GalaxyView._refreshArtistNode(i);
      });
    } catch(e) { console.warn('[HomePage] 아티스트:', e); }
  }

  /* ══ 아티스트 상세 — 중앙 페이지 + 히어로 배너 + 앨범별 그룹 ══ */

  function _artistColor(name) {
    const palette = ['#7B2FBE','#1E4DA0','#2D7A3A','#A03020',
                     '#1A6A7A','#8B4513','#5A2D8A','#1A5A3A'];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7FFFFFFF;
    return palette[h % palette.length];
  }

  /* ── iTunes 검색 — 실패(레이트리밋 등) 시 잠깐 대기 후 한 번 더 시도 ── */
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

  /* ── Spotify 아티스트 상세 폴백 — iTunes에서 아무 곡도 못 찾았을 때만 호출 ── */
  async function _fetchSpotifyArtistDetail(artistName) {
    try {
      const res  = await fetch(`/api/spotify/catalog/artist-detail?name=${encodeURIComponent(artistName)}`, { credentials: 'include' });
      const data = await res.json();
      if (!data?.albums?.length) return null;

      let gi = 0;
      const albums = data.albums.map(alb => ({
        id: alb.id, name: alb.name, art: alb.art, year: alb.year, artistName: alb.artistName,
        tracks: (alb.tracks || []).map(t => {
          const track = {
            _id: t._id, name: t.name, artist: t.artist, album: t.album,
            albumId: alb.id, albumArt: t.albumArt, albumArtSm: t.albumArt, albumCoverLg: t.albumArt,
            durationMs: t.durationMs || 0, duration: t.duration || '—',
            durationSec: Math.floor((t.durationMs || 0) / 1000),
            previewUrl: t.previewUrl || null, spotifyId: t.spotifyId || null,
            trackNumber: t.trackNumber || 1, releaseYear: t.releaseYear || alb.year,
            gradient: _grad(gi), emoji: _emoji(gi),
          };
          gi++;
          return track;
        }),
      }));
      return { image: data.image, externalId: data.externalId, albums, flatTracks: albums.flatMap(a => a.tracks) };
    } catch (e) { return null; }
  }

  /* 아티스트 이름 유사도 검증(Levenshtein 80% 이상) — 백엔드 MatchUtils와 동일한 기준.
     iTunes 검색은 제목/앨범 등 어디든 검색어가 들어가면 결과에 포함시키므로,
     실제로 그 아티스트의 곡이 맞는지 여기서 한 번 더 걸러야 함. */
  function _normalizeArtist(name) {
    const s = String(name || '').toLowerCase().trim();
    return s.startsWith('the ') ? s.slice(4) : s;
  }
  function _levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
      }
    }
    return dp[m][n];
  }
  function _artistMatches(a, b) {
    const na = _normalizeArtist(a), nb = _normalizeArtist(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // 이름이 짧을수록 Levenshtein 비율이 부정확해짐 — 더 짧은 쪽이 4자 미만이면 정확히 일치할 때만 인정
    if (Math.min(na.length, nb.length) < 4) return false;
    const maxLen = Math.max(na.length, nb.length);
    return (maxLen - _levenshtein(na, nb)) / maxLen >= 0.80;
  }

  async function _showArtistDetail(artistName, knownExternalId) {
    // 모달 대신 #page-detail 페이지로 이동
    if (typeof Navigation !== 'undefined') Navigation.switchPage('detail');

    const hero   = document.getElementById('detail-hero');
    const tracks = document.getElementById('detail-track-list');
    if (!hero || !tracks) return;

    const color = _artistColor(artistName);

    // 히어로 로딩 상태
    hero.className = 'ad-hero';
    hero.style.cssText = '';
    hero.innerHTML = `
      <div class="ad-hero-bg" id="artist-hero-bg-photo"></div>
      <div class="ad-hero-inner">
        <div id="artist-img-box" class="ad-art" style="background:${color}">🎤</div>
        <div class="ad-hero-main">
          <div class="ad-eyebrow">ARTIST</div>
          <h1 class="ad-name">${artistName}</h1>
          <div id="artist-bio-txt" class="ad-sub">불러오는 중...</div>
          <div class="ad-actions">
            <button id="artist-save-btn" class="ad-follow">＋ 팔로우</button>
            <button id="artist-play-all" class="ad-play" title="아티스트 전체 재생">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
        </div>
        <div class="ad-stats" id="artist-stats" style="display:none"></div>
      </div>`;

    tracks.innerHTML =
      '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.4)">곡 불러오는 중...</div>';

    /* ── 데이터 병렬 로드 ── */
    const [itunesLookupData, lastfmData] = await Promise.all([
      // 저장된 아티스트를 다시 열 때는 저장 당시 확보해둔 artistId로 직접 lookup —
      // 이름 재검색(퍼지 매칭)보다 정확하고, 한글 표기명이 iTunes 검색어와 잘 안 맞는
      // 아티스트(K-pop 그룹 등)에서도 흔들리지 않는다.
      knownExternalId
        ? _fetchItunesJson(`/api/itunes-proxy/lookup?id=${encodeURIComponent(knownExternalId)}&entity=song&limit=200`)
        : Promise.resolve(null),
      fetch(`http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=613ca46d815b6b0b2acf0145aa03b2dd&format=json&lang=ko`)
        .then(r => r.json()).catch(() => null),
      typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadArtists() : Promise.resolve([]),
      typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadAlbums()  : Promise.resolve([]),
    ]);

    let canonicalArtistId = null;
    let itunesResults = (itunesLookupData?.results || []).filter(r => r.wrapperType === 'track' || r.trackName);
    if (itunesResults.length > 0) {
      // lookup 성공 — 바로 그 아티스트의 곡들이므로 이름 매칭 불필요
      canonicalArtistId = knownExternalId;
    } else {
      // knownExternalId가 없었거나, lookup이 실패/빈 결과였으면(ID가 오래돼 무효해진 경우 등)
      // 기존 이름 검색 경로로 폴백
      const rawItunesResults = (await _fetchItunesJson(`/api/itunes-proxy/search?term=${encodeURIComponent(artistName)}&media=music&entity=song&limit=100`)).results || [];
      // iTunes는 제목/앨범 등에 검색어가 들어가면 무조건 결과에 포함시키고, 이름이 우연히
      // 비슷해 보이는 다른 아티스트도 있을 수 있어서 — 이름 문자열 유사도보다 훨씬 확실한
      // artistId 기준으로 필터링함. 이름이 정확히 일치하는 결과의 artistId를 '진짜' 기준으로 잡고,
      // 정확히 일치하는 게 없으면 그나마 가장 비슷한 이름의 artistId를 기준으로 씀.
      const exactNameMatch = rawItunesResults.find(r => _normalizeArtist(r.artistName) === _normalizeArtist(artistName));
      canonicalArtistId = exactNameMatch?.artistId
        ?? rawItunesResults.find(r => _artistMatches(artistName, r.artistName))?.artistId
        ?? null;
      itunesResults = canonicalArtistId
        ? rawItunesResults.filter(r => r.artistId === canonicalArtistId)
        : rawItunesResults.filter(r => _artistMatches(artistName, r.artistName));
    }

    // iTunes에서 실제로 일치하는 곡을 하나도 못 찾았을 때만 Spotify 카탈로그로 보완
    const spotifyFallback = itunesResults.length === 0
      ? await _fetchSpotifyArtistDetail(artistName)
      : null;

    /* ── 아티스트 이미지 ── */
    const imgBox = document.getElementById('artist-img-box');
    const firstArt    = spotifyFallback ? spotifyFallback.image : itunesResults.find(r => r.artworkUrl100)?.artworkUrl100;
    const firstArtBig = spotifyFallback ? spotifyFallback.image : (firstArt ? hiResArt(firstArt, 400) : null);
    const artistExtId = spotifyFallback ? spotifyFallback.externalId : (canonicalArtistId || itunesResults.find(r => r.artistId)?.artistId || null);
    if (firstArtBig && imgBox) {
      imgBox.innerHTML = `<img src="${firstArtBig}"
        style="width:100%;height:100%;object-fit:cover"
        onerror="this.parentElement.innerHTML='🎤'">`;
      // 백드롭은 브라우저가 실제로 디코딩을 끝낸 뒤 opacity 트랜지션으로 페이드인—
      // background-image를 바로 갈아끼우면 로드되는 순간 뚝 끊기듯 나타나서 느리게 느껴짐
      const bgPhotoEl = document.getElementById('artist-hero-bg-photo');
      if (bgPhotoEl) {
        const preload = new Image();
        preload.onload = () => {
          bgPhotoEl.style.backgroundImage = `url(${firstArtBig})`;
          bgPhotoEl.classList.add('is-visible');
        };
        preload.src = firstArtBig;
      }
    }

    /* ── 저장(하트) 버튼 — 상태 반영 + 클릭 시 토글 ── */
    const saveBtn = document.getElementById('artist-save-btn');
    if (saveBtn && typeof SavedLibrary !== 'undefined') {
      const _setSaveBtn = saved => {
        saveBtn.textContent = saved ? '✓ 팔로잉' : '＋ 팔로우';
        saveBtn.classList.toggle('saved', saved);
      };
      _setSaveBtn(SavedLibrary.isArtistSaved(artistName));
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        const saved = await SavedLibrary.toggleArtist(artistName, firstArtBig, artistExtId);
        _setSaveBtn(saved);
        saveBtn.disabled = false;
        if (typeof LibraryFilter !== 'undefined') LibraryFilter.refresh();
      };
    }

    /* ── 바이오 ── */
    if (lastfmData?.artist?.bio?.summary) {
      const bio = lastfmData.artist.bio.summary
        .replace(/<a[^>]*>.*?<\/a>/gi,'').replace(/<[^>]+>/g,'')
        .replace(/Read more on Last\.fm\.?/gi,'').trim().slice(0,120);
      const bioEl = document.getElementById('artist-bio-txt');
      if (bioEl && bio) { bioEl.textContent = bio + (bio.length>=120 ? '...' : ''); bioEl.dataset.hasBio = '1'; }
    }

    /* ── 트랙 가공 + 앨범 그룹화 (Spotify 폴백이 있으면 그걸 그대로 사용) ── */
    let albums, flatTracks;

    if (spotifyFallback) {
      albums = spotifyFallback.albums;
      flatTracks = spotifyFallback.flatTracks;
    } else {
      const allTracks = itunesResults
        .filter(r => r.trackName)
        .map((r, i) => ({
          _id:        'it_' + r.trackId,
          name:       r.trackName,
          artist:     r.artistName,
          album:      r.collectionName || '싱글',
          albumId:    r.collectionId   || r.artistId,
          albumArt:   hiResArt(r.artworkUrl100, 500) || null,
          albumArtSm: hiResArt(r.artworkUrl100, 80)  || null,
          albumCoverLg: hiResArt(r.artworkUrl100, 300) || null,
          durationMs: r.trackTimeMillis || 0,
          duration:   r.trackTimeMillis
            ? `${Math.floor(r.trackTimeMillis/60000)}:${String(Math.floor((r.trackTimeMillis%60000)/1000)).padStart(2,'0')}`
            : '—',
          durationSec: Math.floor((r.trackTimeMillis||0)/1000),
          previewUrl:  r.previewUrl || null,
          trackNumber: r.trackNumber || (i+1),
          releaseYear: r.releaseDate ? new Date(r.releaseDate).getFullYear() : 0,
          gradient:    _grad(i),
          emoji:       _emoji(i),
        }));

      /* 앨범별 그룹화 → 최신순 정렬 */
      const albumMap = {};
      for (const t of allTracks) {
        if (!albumMap[t.albumId]) {
          albumMap[t.albumId] = {
            id: t.albumId, name: t.album, art: t.albumCoverLg,
            year: t.releaseYear, artistName: t.artist, tracks: [],
          };
        }
        albumMap[t.albumId].tracks.push(t);
      }
      albums = Object.values(albumMap).sort((a,b) => (b.year - a.year));
      albums.forEach(a => a.tracks.sort((x,y) => x.trackNumber - y.trackNumber));
      flatTracks = albums.flatMap(a => a.tracks);
    }

    window._artistAlbums = albums;
    window._artistAllTracks = flatTracks;

    /* 메타 업데이트 */
    const totalMin = Math.floor(flatTracks.reduce((s,t) => s + t.durationMs, 0) / 60000);
    const bioFallbackEl = document.getElementById('artist-bio-txt');
    if (bioFallbackEl && !bioFallbackEl.dataset.hasBio) bioFallbackEl.textContent = `${flatTracks.length}곡 · ${totalMin}분`;
    const statsEl = document.getElementById('artist-stats');
    if (statsEl) {
      statsEl.innerHTML = `<div><b>${albums.length}</b><span>앨범</span></div><div><b>${flatTracks.length}</b><span>곡</span></div><div><b>${totalMin}</b><span>분</span></div>`;
      statsEl.style.display = '';
    }

    const playBtn = document.getElementById('artist-play-all');
    if (playBtn) playBtn.onclick = () =>
      flatTracks.length && Player.playTrack(flatTracks[0], flatTracks, 0);

    if (!flatTracks.length) {
      tracks.innerHTML =
        '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.4)">곡 정보를 찾을 수 없어요</div>';
      return;
    }

    window._artistAlbums = albums;
    window._artistSelAlbumId = albums.length ? albums[0].id : null;
    tracks.className = '';
    _renderAlbumSections(tracks);
  }

  /* 넘치는 글자만 마키 대상으로 표시 (.is-marq + 이동 거리/시간 CSS 변수) — 크기·폰트 변화에도 다시 측정 */
  let _mqRO = null;
  function _initMarquee(root) {
    if (_mqRO) _mqRO.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    const measure = wrap => {
      const inner = wrap.firstElementChild;
      if (!inner) return;
      const over = Math.ceil(inner.scrollWidth - wrap.clientWidth);
      if (over > 2) {
        wrap.classList.add('is-marq');
        wrap.style.setProperty('--mq-dist', `-${over}px`);
        wrap.style.setProperty('--mq-time', `${Math.max(6, over / 25 + 3)}s`);
      } else {
        wrap.classList.remove('is-marq');
      }
    };
    _mqRO = new ResizeObserver(entries => entries.forEach(e => measure(e.target.classList.contains('ad-marq') ? e.target : e.target.parentElement)));
    root.querySelectorAll('.ad-marq').forEach(w => { measure(w); _mqRO.observe(w); if (w.firstElementChild) _mqRO.observe(w.firstElementChild); });
  }

  /* ── 아티스트 상세: 좌(앨범 목록) / 우(선택한 앨범 + 트랙) 분할 뷰 ── */
  function _renderAlbumSections(tracksEl) {
    const albums     = window._artistAlbums || [];
    const flatTracks = window._artistAllTracks || [];
    if (!albums.length) return;
    const sel = albums.find(a => String(a.id) === String(window._artistSelAlbumId)) || albums[0];
    const selSaved = typeof SavedLibrary !== 'undefined' && SavedLibrary.isAlbumSaved(sel.id);
    const selMin = Math.floor(sel.tracks.reduce((s, t) => s + (t.durationMs || 0), 0) / 60000);
    const artName = (sel.artistName || '').replace(/</g, '&lt;');
    const _attr = v => String(v == null ? '' : v).replace(/"/g, '&quot;');

    const albumList = albums.map(album => `
      <div class="ad-album${String(album.id) === String(sel.id) ? ' active' : ''}"
           onclick="HomePage._selectArtistAlbum('${album.id}')">
        <div class="ad-album-art">
          ${album.art ? `<img src="${album.art}" onerror="this.style.display='none'">` : '💿'}
        </div>
        <div class="ad-album-info">
          <div class="ad-album-name ad-marq hover" title="${_attr(album.name)}"><span class="ad-marq-in">${album.name}</span></div>
          <div class="ad-album-meta">${[album.year || '', `${album.tracks.length}곡`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>`).join('');

    const trackRows = sel.tracks.map((t, i) => {
      const idx = flatTracks.indexOf(t);
      return `
        <div class="ad-track" onclick="Player.playTrack(window._artistAllTracks[${idx}],window._artistAllTracks,${idx})">
          <span class="num">${i + 1}</span>
          <div class="name ad-marq hover" title="${_attr(t.name)}"><span class="ad-marq-in">${t.name}</span></div>
          <button class="add" title="플레이리스트에 추가"
                  onclick="event.stopPropagation();PlaylistPicker.open(window._artistAllTracks[${idx}], this)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
          <span class="dur">${t.duration}</span>
        </div>`;
    }).join('');

    tracksEl.innerHTML = `
      <div class="ad-body">
        <div class="ad-albums">
          <div class="ad-albums-title">ALBUMS · ${albums.length}</div>
          ${albumList}
        </div>
        <div class="ad-detail">
          <div class="ad-album-head">
            <div class="ad-cover">
              ${sel.art ? `<img src="${sel.art}" onerror="this.style.display='none'">` : '💿'}
            </div>
            <div style="min-width:0">
              <div class="ad-album-label">ALBUM</div>
              <div class="ad-album-title ad-marq" title="${_attr(sel.name)}"><span class="ad-marq-in">${sel.name}</span></div>
              <div class="ad-album-sub">${[artName, sel.year || '', `${sel.tracks.length}곡`, selMin ? `${selMin}분` : ''].filter(Boolean).join(' · ')}</div>
              <div class="ad-album-actions">
                <button class="ad-btn primary" onclick="HomePage._playArtistAlbum()">▶ 전체 재생</button>
                <button class="ad-btn${selSaved ? ' saved' : ''}"
                        onclick="HomePage._toggleAlbumSave(window._artistAlbums.find(a=>String(a.id)==window._artistSelAlbumId), this)">
                  ${selSaved ? '✓ 보관함에 저장됨' : '+ 보관함'}
                </button>
              </div>
            </div>
          </div>
          <div class="ad-tracks">${trackRows}</div>
        </div>
      </div>`;
    _initMarquee(tracksEl);
  }

  /* 좌측 앨범 목록에서 앨범 선택 → 우측만 다시 그림 */
  function _selectArtistAlbum(albumId) {
    window._artistSelAlbumId = albumId;
    const tracksEl = document.getElementById('detail-track-list');
    if (!tracksEl) return;
    // 전체를 다시 그리면 왼쪽 목록 스크롤이 맨 위로 돌아가므로 위치를 저장했다가 복원
    const listEl = tracksEl.querySelector('.ad-albums');
    const prevScroll = listEl ? listEl.scrollTop : 0;
    _renderAlbumSections(tracksEl);
    const newList = tracksEl.querySelector('.ad-albums');
    if (newList) newList.scrollTop = prevScroll;
  }

  /* 선택한 앨범 전체 재생 (큐는 아티스트 전체 곡 기준 — 곡 클릭과 동일) */
  function _playArtistAlbum() {
    const albums = window._artistAlbums || [];
    const flat = window._artistAllTracks || [];
    const sel = albums.find(a => String(a.id) === String(window._artistSelAlbumId));
    if (!sel || !sel.tracks.length) return;
    Player.playTrack(sel.tracks[0], flat, flat.indexOf(sel.tracks[0]));
  }

  /* ── 앨범 저장 토글 후 저장 버튼 상태만 갱신 (전체 다시 그리지 않음) ── */
  function _refreshAlbumSections() {
    const tracksEl = document.getElementById('detail-track-list');
    if (tracksEl && tracksEl.querySelector('.ad-body')) _renderAlbumSections(tracksEl);
  }

  /* ── 앨범 헤더 클릭 시 그 앨범의 트랙 목록만 접었다/폈다 (다른 앨범엔 영향 없음) ── */
  function _toggleAlbumTracks(albumId) {
    const el = document.getElementById('album-tracks-' + albumId);
    const chevron = document.getElementById('album-chevron-' + albumId);
    if (!el) return;
    const opening = !el.classList.contains('is-open');
    el.classList.toggle('is-open', opening);
    if (chevron) chevron.classList.toggle('is-open', opening);
  }

  /* ── 앨범 저장 토글 (아티스트 상세 페이지의 앨범 헤더 버튼) ── */
  async function _toggleAlbumSave(album, btnEl) {
    if (typeof SavedLibrary === 'undefined' || !album) return;
    if (btnEl) btnEl.disabled = true;
    const saved = await SavedLibrary.toggleAlbum({
      externalId: album.id, name: album.name, artistName: album.artistName,
      artUrl: album.art, year: album.year,
    });
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.classList.toggle('saved', saved);
      btnEl.textContent = saved ? '✓ 보관함에 저장됨' : '+ 보관함';
    }
    if (typeof LibraryFilter !== 'undefined') LibraryFilter.refresh();
  }


  /* ══════════════════════════════════════════════════════════
     나라별 TOP 차트 + 지금 인기있는 아티스트
     — 국가 탭 하나를 두 섹션이 공유(선택한 나라의 차트 + 그 나라의 인기 아티스트)
  ══════════════════════════════════════════════════════════ */
  let _selectedCountry   = 'south korea';
  let _countryChartTracks = [];

  function _renderCountryChartDOM(tracks) {
    const c = document.getElementById('country-chart-list');
    if (!c) return;
    window._countryChartTracks = tracks;
    if (!tracks.length) {
      c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">이 나라의 차트를 불러올 수 없어요.</div>';
      return;
    }
    c.innerHTML = tracks.map((t, i) => `
      <div class="chart-row" onclick="HomePage._playCountryChart(${i})">
        <span class="chart-rank">${i + 1}</span>
        <div class="chart-thumb">
          ${t.albumArt ? `<img src="${t.albumArt}" onerror="this.parentElement.innerHTML=''">` : ''}
        </div>
        <div class="chart-info">
          <div class="chart-title">${t.name}</div>
          <div class="chart-artist">${t.artist}</div>
        </div>
        <div class="chart-actions">
          <button class="chart-add-btn" title="플레이리스트에 추가"
                  onclick="event.stopPropagation();PlaylistPicker.open(window._countryChartTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
          <button class="chart-like-btn" title="좋아요"
                  onclick="event.stopPropagation();PlaylistPicker.toggleLike(window._countryChartTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3
                       7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3
                       19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        <button class="chart-play" onclick="event.stopPropagation();HomePage._playCountryChart(${i})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>`).join('');
  }

  function _playCountryChart(i) {
    const t = _countryChartTracks[i];
    if (t && typeof Player !== 'undefined') Player.playTrack(t, _countryChartTracks, i);
  }

  async function loadCountryTabs() {
    const wrap = document.getElementById('country-tabs');
    if (!wrap) return;
    try {
      const countries = await fetch('/api/home/countries').then(r => r.json());
      if (!countries?.length) return;
      wrap.innerHTML = countries.map((c, i) => `
        <button class="filter-pill${i === 0 ? ' active' : ''}"
                onclick="HomePage._selectCountry('${c.code}', this)">${c.label}</button>`).join('');
      _selectedCountry = countries[0].code;
      await Promise.all([loadCountryChart(), loadTrendingArtists()]);
    } catch (e) { console.warn('[HomePage] 국가 목록:', e); }
  }

  async function _selectCountry(code, btnEl) {
    if (code === _selectedCountry) return;
    _selectedCountry = code;
    document.querySelectorAll('#country-tabs .filter-pill').forEach(b => b.classList.remove('active'));
    btnEl?.classList.add('active');
    await Promise.all([loadCountryChart(), loadTrendingArtists()]);
  }

  async function loadCountryChart() {
    const c = document.getElementById('country-chart-list');
    if (!c) return;
    c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">불러오는 중...</div>';
    try {
      const raw = await fetch('/api/home/charts/country?country=' + encodeURIComponent(_selectedCountry)).then(r => r.json());
      const tracks = (raw || []).map((t, i) => _normalizeTrack(t, i));
      _countryChartTracks = tracks;
      window._countryChartTracks = tracks;
      _renderCountryChartDOM(tracks);

      const needsArt = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt);
      if (needsArt.length) {
        const results = await Promise.all(needsArt.map(({ t }) => _fetchItunes(`${t.name} ${t.artist}`)));
        let updated = false;
        needsArt.forEach(({ t }, ri) => {
          const it = results[ri];
          if (!it) return;
          if (it.albumArt) { t.albumArt = it.albumArt; updated = true; }
          if (!t.previewUrl && it.previewUrl) t.previewUrl = it.previewUrl;
        });
        if (updated) _renderCountryChartDOM(tracks);
      }
    } catch (e) {
      console.warn('[HomePage] 국가별 차트:', e);
      c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">차트를 불러올 수 없어요.</div>';
    }
  }

  async function loadTrendingArtists() {
    const grid = document.getElementById('trending-artists-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">불러오는 중...</div>';
    try {
      const artists = await fetch('/api/home/artists/trending?country=' + encodeURIComponent(_selectedCountry)).then(r => r.json());
      if (!artists?.length) {
        grid.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px">표시할 아티스트가 없어요.</div>';
        return;
      }
      const EMOJIS = ['🎤','🎸','💜','🔥','🌸','⭐'];
      const GRADS  = ['grad-4','grad-3','grad-6','grad-1','grad-7','grad-5'];
      grid.innerHTML = artists.map((a, i) => {
        const nameEsc = a.name.replace(/'/g, "\\'");
        const extIdArg = a.externalId ? `'${String(a.externalId).replace(/'/g, "\\'")}'` : 'null';
        return `
        <div class="card artist" onclick="HomePage._showArtistDetail('${nameEsc}', ${extIdArg})">
          <div class="card-art">
            <div class="card-art-inner ${GRADS[i % GRADS.length]}" id="trend-artist-art-${i}">${EMOJIS[i % EMOJIS.length]}</div>
            <button class="card-play" onclick="event.stopPropagation();HomePage._showArtistDetail('${nameEsc}', ${extIdArg})">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>
          <div class="card-title">${a.name}</div>
          <div class="card-subtitle">아티스트</div>
        </div>`;
      }).join('');

      artists.forEach(async (a, i) => {
        const photo = await _fetchArtistPhoto(a.name, a.externalId);
        if (!photo) return;
        const el = document.getElementById('trend-artist-art-' + i);
        if (el) el.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.innerHTML='${EMOJIS[i % EMOJIS.length]}'">`;
      });
    } catch (e) {
      console.warn('[HomePage] 인기 아티스트(국가별):', e);
      grid.innerHTML = '<div style="padding:20px;color:var(--text-secondary);font-size:13px">불러올 수 없어요.</div>';
    }
  }

  /* ══════════════════════════════════════════════════════════
     장르별 추천 — 장르 칩 선택 시 해당 장르 트랙 목록 표시
  ══════════════════════════════════════════════════════════ */
  let _selectedGenre = 'k-pop';
  let _genreTracks   = [];

  function _renderGenreTrackDOM(tracks) {
    const c = document.getElementById('genre-track-list');
    if (!c) return;
    window._genreTracks = tracks;
    if (!tracks.length) {
      c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">추천할 곡을 찾지 못했어요.</div>';
      return;
    }
    c.innerHTML = tracks.map((t, i) => `
      <div class="chart-row" onclick="HomePage._playGenreTrack(${i})">
        <span class="chart-rank">${i + 1}</span>
        <div class="chart-thumb">
          ${t.albumArt ? `<img src="${t.albumArt}" onerror="this.parentElement.innerHTML=''">` : ''}
        </div>
        <div class="chart-info">
          <div class="chart-title">${t.name}</div>
          <div class="chart-artist">${t.artist}</div>
        </div>
        <div class="chart-actions">
          <button class="chart-add-btn" title="플레이리스트에 추가"
                  onclick="event.stopPropagation();PlaylistPicker.open(window._genreTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
          <button class="chart-like-btn" title="좋아요"
                  onclick="event.stopPropagation();PlaylistPicker.toggleLike(window._genreTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3
                       7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3
                       19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        <button class="chart-play" onclick="event.stopPropagation();HomePage._playGenreTrack(${i})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>`).join('');
  }

  function _playGenreTrack(i) {
    const t = _genreTracks[i];
    if (t && typeof Player !== 'undefined') Player.playTrack(t, _genreTracks, i);
  }

  async function loadGenreChips() {
    const wrap = document.getElementById('genre-chips');
    if (!wrap) return;
    try {
      const genres = await fetch('/api/home/genres').then(r => r.json());
      if (!genres?.length) return;
      wrap.innerHTML = genres.map((g, i) => `
        <button class="filter-pill${i === 0 ? ' active' : ''}"
                onclick="HomePage._selectGenre('${g.tag}', this)">${g.emoji} ${g.label}</button>`).join('');
      _selectedGenre = genres[0].tag;
      await loadGenreTracks();
    } catch (e) { console.warn('[HomePage] 장르 목록:', e); }
  }

  async function _selectGenre(tag, btnEl) {
    if (tag === _selectedGenre) return;
    _selectedGenre = tag;
    document.querySelectorAll('#genre-chips .filter-pill').forEach(b => b.classList.remove('active'));
    btnEl?.classList.add('active');
    await loadGenreTracks();
  }

  async function loadGenreTracks() {
    const c = document.getElementById('genre-track-list');
    if (!c) return;
    c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">불러오는 중...</div>';
    try {
      const raw = await fetch('/api/home/genre-tracks?genre=' + encodeURIComponent(_selectedGenre)).then(r => r.json());
      const tracks = (raw || []).map((t, i) => _normalizeTrack(t, i));
      _genreTracks = tracks;
      window._genreTracks = tracks;
      _renderGenreTrackDOM(tracks);

      const needsArt = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt);
      if (needsArt.length) {
        const results = await Promise.all(needsArt.map(({ t }) => _fetchItunes(`${t.name} ${t.artist}`)));
        let updated = false;
        needsArt.forEach(({ t }, ri) => {
          const it = results[ri];
          if (!it) return;
          if (it.albumArt) { t.albumArt = it.albumArt; updated = true; }
          if (!t.previewUrl && it.previewUrl) t.previewUrl = it.previewUrl;
        });
        if (updated) _renderGenreTrackDOM(tracks);
      }
    } catch (e) {
      console.warn('[HomePage] 장르별 추천:', e);
      c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">추천을 불러올 수 없어요.</div>';
    }
  }

  async function init() {
    _hookTrackList();
    await Promise.all([
      loadQuickAccess(), loadCharts(), loadNewReleases(), loadArtists(),
      loadCountryTabs(), loadGenreChips(),
    ]);
    updateHero();
    _initialized = true;
    // 차트 로드 3초 후 백그라운드 Spotify ID 프리패치
    setTimeout(_prefetchSpotifyIds, 60000);  // 1분 후 시작 (Rate Limit 쿨다운)
  }

  function refresh() {
    if (!_initialized) { init(); return; }
    loadQuickAccess();
    _renderChartDOM(_chartTracks);
  }

  return {
    init, refresh, _playChart, _showArtistDetail, _toggleAlbumSave, _toggleAlbumTracks, _selectArtistAlbum, _playArtistAlbum, _recentTracks: [],
    _playCountryChart, _selectCountry, _playGenreTrack, _selectGenre,
  };
})();
