/**
 * SOUNDWAVE — Home Page Module
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
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!data.results?.length) return null;
      const item = data.results[0];
      return {
        albumArt:   item.artworkUrl100?.replace('100x100bb', '500x500bb') || null,
        durationMs: item.trackTimeMillis || null,
        previewUrl: item.previewUrl      || null,
        albumName:  item.collectionName  || '',
        trackName:  item.trackName       || '',
        artistName: item.artistName      || '',
      };
    } catch(e) { return null; }
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
    const curId = Player.getState().currentTrack?._id;
    c.innerHTML = tracks.map((t,i) => `
      <div class="track-item ${curId===t._id?'active':''}"
           onclick="HomePage._playChart(${i})">
        <div class="track-num-wrap">
          ${curId===t._id
            ? '<div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>'
            : `<span class="track-num">${i+1}</span>`}
          <svg class="track-play-icon" width="16" height="16"
               viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
        ${_chartArtHtml(t,i)}
        <div class="track-info">
          <div class="track-name">${t.name}</div>
          <div class="track-artist">${t.artist}</div>
        </div>
        <div class="track-album">${t.album}</div>
        <div class="track-actions">
          <button class="track-add-btn" title="플레이리스트에 추가"
                  onclick="event.stopPropagation();PlaylistPicker.open(window._homeChartTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          <button class="track-like-btn"
                  onclick="event.stopPropagation();PlaylistPicker.toggleLike(window._homeChartTracks[${i}], this)"
                  title="좋아요">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3
                       7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3
                       19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <span class="track-duration">${t.duration}</span>
        </div>
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
    const grid = document.querySelector('#page-home .cards-grid.artist-grid');
    if (!grid) return;

    try {
      const artists = await fetch('/api/home/artists').then(r => r.json());
      if (!artists?.length) return;

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
        const it = await _fetchItunes(a.name);
        if (!it?.albumArt) return;
        const el = document.getElementById('artist-art-' + i);
        if (el) {
          el.innerHTML = `<img src="${it.albumArt}"
            style="width:100%;height:100%;object-fit:cover;border-radius:50%"
            onerror="this.parentElement.innerHTML='${EMOJIS[i]}'">`;
        }
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

  async function _showArtistDetail(artistName) {
    // 모달 대신 #page-detail 페이지로 이동
    if (typeof Navigation !== 'undefined') Navigation.switchPage('detail');

    const hero   = document.getElementById('detail-hero');
    const tracks = document.getElementById('detail-track-list');
    if (!hero || !tracks) return;

    const color = _artistColor(artistName);

    // 히어로 로딩 상태
    hero.className = '';
    hero.style.cssText =
      `background:linear-gradient(180deg,${color} 0%,#1a1a1a 100%);` +
      `padding:40px 32px 32px;position:relative;border-radius:16px 16px 0 0;` +
      `margin:-24px -24px 0`;
    hero.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:24px">
        <div id="artist-img-box"
             style="width:140px;height:140px;border-radius:50%;flex-shrink:0;
                    background:${color};display:flex;align-items:center;
                    justify-content:center;font-size:56px;
                    box-shadow:0 8px 32px rgba(0,0,0,.5);overflow:hidden">🎤</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;
                      color:rgba(255,255,255,.7);margin-bottom:6px;text-transform:uppercase">아티스트</div>
          <div style="font-size:clamp(28px,4vw,60px);font-weight:900;color:#fff;
                      line-height:1;margin-bottom:10px">${artistName}</div>
          <div id="artist-bio-txt"
               style="font-size:13px;color:rgba(255,255,255,.6);max-width:440px;
                      -webkit-line-clamp:2;-webkit-box-orient:vertical;
                      display:-webkit-box;overflow:hidden;margin-bottom:4px"></div>
          <div id="artist-meta-txt"
               style="font-size:12px;color:rgba(255,255,255,.45)">불러오는 중...</div>
        </div>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:24px">
        <button id="artist-play-all"
                style="width:52px;height:52px;border-radius:50%;background:#1ed760;
                       border:none;display:flex;align-items:center;justify-content:center;
                       cursor:pointer;box-shadow:0 4px 12px rgba(30,215,96,.4)"
                onmouseenter="this.style.transform='scale(1.06)'"
                onmouseleave="this.style.transform='scale(1)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button id="artist-save-btn"
                style="width:36px;height:36px;border-radius:50%;background:none;
                       border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.7);
                       font-size:16px;cursor:pointer;display:flex;align-items:center;
                       justify-content:center;transition:color .15s,border-color .15s"
                title="아티스트 저장">♡</button>
      </div>`;

    tracks.innerHTML =
      '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.4)">곡 불러오는 중...</div>';

    /* ── 데이터 병렬 로드 ── */
    const [itunesData, lastfmData] = await Promise.all([
      _fetchItunesJson(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&media=music&entity=song&limit=100`),
      fetch(`http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=613ca46d815b6b0b2acf0145aa03b2dd&format=json&lang=ko`)
        .then(r => r.json()).catch(() => null),
      typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadArtists() : Promise.resolve([]),
      typeof SavedLibrary !== 'undefined' ? SavedLibrary.loadAlbums()  : Promise.resolve([]),
    ]);

    // iTunes는 제목/앨범 등에 검색어가 들어가면 무조건 결과에 포함시키므로,
    // 실제로 이 아티스트의 곡이 맞는지 이름 유사도로 한 번 걸러냄
    // iTunes는 제목/앨범 등에 검색어가 들어가면 무조건 결과에 포함시키고, 이름이 우연히
    // 비슷해 보이는 다른 아티스트도 있을 수 있어서 — 이름 문자열 유사도보다 훨씬 확실한
    // artistId 기준으로 필터링함. 이름이 정확히 일치하는 결과의 artistId를 '진짜' 기준으로 잡고,
    // 정확히 일치하는 게 없으면 그나마 가장 비슷한 이름의 artistId를 기준으로 씀.
    const rawItunesResults = itunesData.results || [];
    const exactNameMatch = rawItunesResults.find(r => _normalizeArtist(r.artistName) === _normalizeArtist(artistName));
    const canonicalArtistId = exactNameMatch?.artistId
      ?? rawItunesResults.find(r => _artistMatches(artistName, r.artistName))?.artistId
      ?? null;
    const itunesResults = canonicalArtistId
      ? rawItunesResults.filter(r => r.artistId === canonicalArtistId)
      : rawItunesResults.filter(r => _artistMatches(artistName, r.artistName));

    // iTunes에서 실제로 일치하는 곡을 하나도 못 찾았을 때만 Spotify 카탈로그로 보완
    const spotifyFallback = itunesResults.length === 0
      ? await _fetchSpotifyArtistDetail(artistName)
      : null;

    /* ── 아티스트 이미지 ── */
    const imgBox = document.getElementById('artist-img-box');
    const firstArt    = spotifyFallback ? spotifyFallback.image : itunesResults.find(r => r.artworkUrl100)?.artworkUrl100;
    const firstArtBig = spotifyFallback ? spotifyFallback.image : (firstArt ? firstArt.replace('100x100bb','400x400bb') : null);
    const artistExtId = spotifyFallback ? spotifyFallback.externalId : (canonicalArtistId || itunesResults.find(r => r.artistId)?.artistId || null);
    if (firstArtBig && imgBox) {
      imgBox.innerHTML = `<img src="${firstArtBig}"
        style="width:100%;height:100%;object-fit:cover"
        onerror="this.parentElement.innerHTML='🎤'">`;
    }

    /* ── 저장(하트) 버튼 — 상태 반영 + 클릭 시 토글 ── */
    const saveBtn = document.getElementById('artist-save-btn');
    if (saveBtn && typeof SavedLibrary !== 'undefined') {
      const _setSaveBtn = saved => {
        saveBtn.textContent = saved ? '♥' : '♡';
        saveBtn.style.color = saved ? '#1ed760' : 'rgba(255,255,255,.7)';
        saveBtn.style.borderColor = saved ? '#1ed760' : 'rgba(255,255,255,.3)';
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
      if (bioEl && bio) bioEl.textContent = bio + (bio.length>=120 ? '...' : '');
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
          albumArt:   r.artworkUrl100?.replace('100x100bb','500x500bb') || null,
          albumArtSm: r.artworkUrl100?.replace('100x100bb','80x80bb')   || null,
          albumCoverLg: r.artworkUrl100?.replace('100x100bb','300x300bb') || null,
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
    const metaEl   = document.getElementById('artist-meta-txt');
    if (metaEl) metaEl.textContent = `${flatTracks.length}곡 · ${totalMin}분`;

    const playBtn = document.getElementById('artist-play-all');
    if (playBtn) playBtn.onclick = () =>
      flatTracks.length && Player.playTrack(flatTracks[0], flatTracks, 0);

    if (!flatTracks.length) {
      tracks.innerHTML =
        '<div style="padding:40px;text-align:center;color:rgba(255,255,255,.4)">곡 정보를 찾을 수 없어요</div>';
      return;
    }

    /* ── 앨범별 렌더 ── */
    tracks.innerHTML = albums.map(album => {
      const trackRows = album.tracks.map(t => {
        const idx = flatTracks.indexOf(t);
        return `
          <div onclick="Player.playTrack(window._artistAllTracks[${idx}],window._artistAllTracks,${idx})"
               style="display:flex;align-items:center;gap:12px;padding:8px 16px;
                      border-radius:6px;cursor:pointer;transition:background .15s"
               onmouseenter="this.style.background='rgba(255,255,255,.06)'"
               onmouseleave="this.style.background='transparent'">
            <!-- 번호/재생 -->
            <span style="width:24px;text-align:center;font-size:13px;
                         color:rgba(255,255,255,.4);flex-shrink:0">${t.trackNumber !== 99 ? t.trackNumber : idx+1}</span>
            <!-- 앨범아트 (작은) -->
            ${t.albumArtSm
              ? `<img src="${t.albumArtSm}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0"
                      onerror="this.style.display='none'">`
              : `<div style="width:36px;height:36px;border-radius:4px;flex-shrink:0;
                             background:rgba(255,255,255,.06);display:flex;align-items:center;
                             justify-content:center;font-size:16px">${t.emoji}</div>`}
            <!-- 제목 -->
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:500;color:#fff;
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</div>
            </div>
            <!-- 플레이리스트에 추가 -->
            <button onclick="event.stopPropagation();PlaylistPicker.open(window._artistAllTracks[${idx}], this)"
                    title="플레이리스트에 추가"
                    style="background:none;border:none;color:rgba(255,255,255,.55);cursor:pointer;
                           display:flex;align-items:center;flex-shrink:0"
                    onmouseenter="this.style.color='#fff'"
                    onmouseleave="this.style.color='rgba(255,255,255,.55)'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <!-- 시간 -->
            <span style="font-size:13px;color:rgba(255,255,255,.45);flex-shrink:0">${t.duration}</span>
            <!-- 재생 -->
            <button onclick="event.stopPropagation();Player.playTrack(window._artistAllTracks[${idx}],window._artistAllTracks,${idx})"
                    style="background:none;border:none;color:#1ed760;cursor:pointer;
                           opacity:.6;font-size:15px;width:28px;text-align:center;flex-shrink:0"
                    onmouseenter="this.style.opacity='1'"
                    onmouseleave="this.style.opacity='.6'">▶</button>
          </div>`;
      }).join('');

      const albumSaved = (typeof SavedLibrary !== 'undefined') && SavedLibrary.isAlbumSaved(album.id);

      return `
        <!-- 앨범 섹션 -->
        <div style="margin-bottom:32px">
          <!-- 앨범 헤더 -->
          <div style="display:flex;align-items:center;gap:16px;padding:12px 16px 8px;
                      border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:4px">
            ${album.art
              ? `<img src="${album.art}" style="width:56px;height:56px;border-radius:6px;
                                                object-fit:cover;flex-shrink:0"
                      onerror="this.style.display='none'">`
              : `<div style="width:56px;height:56px;border-radius:6px;flex-shrink:0;
                             background:rgba(255,255,255,.06);display:flex;
                             align-items:center;justify-content:center;font-size:24px">💿</div>`}
            <div style="flex:1;min-width:0">
              <div style="font-size:15px;font-weight:700;color:#fff">${album.name}</div>
              <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:3px">
                ${album.year || ''} · ${album.tracks.length}곡
              </div>
            </div>
            <button class="album-save-btn ${albumSaved ? 'saved' : ''}"
                    onclick="HomePage._toggleAlbumSave(window._artistAlbums[${albums.indexOf(album)}], this)"
                    style="flex-shrink:0;background:none;border:1px solid ${albumSaved ? '#1ed760' : 'rgba(255,255,255,.3)'};
                           color:${albumSaved ? '#1ed760' : 'rgba(255,255,255,.7)'};border-radius:50px;
                           padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
              ${albumSaved ? '✓ 저장됨' : '+ 저장'}
            </button>
          </div>
          <!-- 트랙 목록 -->
          ${trackRows}
        </div>`;
    }).join('');
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
      btnEl.textContent = saved ? '✓ 저장됨' : '+ 저장';
      btnEl.style.borderColor = saved ? '#1ed760' : 'rgba(255,255,255,.3)';
      btnEl.style.color = saved ? '#1ed760' : 'rgba(255,255,255,.7)';
    }
    if (typeof LibraryFilter !== 'undefined') LibraryFilter.refresh();
  }


  async function init() {
    _hookTrackList();
    await Promise.all([loadQuickAccess(), loadCharts(), loadNewReleases(), loadArtists()]);
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

  return { init, refresh, _playChart, _showArtistDetail, _toggleAlbumSave, _recentTracks: [] };
})();
