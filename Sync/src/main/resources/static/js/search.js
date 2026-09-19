/**
 * SYNC — 검색 페이지 v4
 * - 장르 그리드 HTML 저장 → 입력 지우면 완벽 복원
 * - DOM 조작 없음, 신뢰성 최대화
 */
const SearchPage = (() => {

  let _debounce   = null;
  let _browseHTML = null;   // 원래 장르 그리드 저장

  const GENRE_QUERIES = {
    'K-Pop':'kpop', '힙합':'hip hop', '인디':'indie alternative rock',
    'R&B':'rnb soul',    '팝':'pop hits',        'Lo-Fi':'lofi chill beats',
    '클래식':'classical music', '재즈':'jazz',
    '발라드':'ballad korean', '전자음악':'electronic dance music',
    '어쿠스틱':'acoustic guitar', '트로트':'trot korean',
  };

  /* iTunes 응답의 primaryGenreName과 대조해 실제로 그 장르가 맞는 곡만 걸러낼 때 쓰는
     기준 문자열(소문자, 부분일치). iTunes 장르 분류가 확실한 장르만 넣음 —
     Lo-Fi/발라드/어쿠스틱/트로트는 iTunes에 전용 장르 태그가 깔끔하게 없어서
     검색어만으로 최대한 거르고 장르 필터는 따로 적용하지 않음(잘못 걸러 결과가
     0개가 되는 걸 방지). */
  const GENRE_FILTERS = {
    'K-Pop':   ['k-pop'],
    '힙합':     ['hip-hop', 'rap'],
    '인디':     ['alternative', 'indie'],
    'R&B':     ['r&b', 'soul'],
    '팝':       ['pop'],
    '클래식':   ['classical'],
    '재즈':     ['jazz'],
    '전자음악': ['electronic', 'dance'],
  };

  const GRADS  = ['grad-1','grad-2','grad-3','grad-4','grad-5','grad-6','grad-7','grad-8'];
  const EMOJIS = ['🎵','🎸','🎤','💜','🔥','🌙','⭐','🎧','🚗','💎'];

  function _fmtMs(ms) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }

  function _toTrack(r, i) {
    return {
      _id:'it_'+r.trackId, name:r.trackName||'알 수 없는 곡',
      artist:r.artistName||'', album:r.collectionName||'',
      albumArt:r.artworkUrl100?.replace('100x100bb','500x500bb')||null,
      durationMs:r.trackTimeMillis||0, duration:_fmtMs(r.trackTimeMillis),
      durationSec:Math.floor((r.trackTimeMillis||0)/1000),
      previewUrl:r.previewUrl||null,
      gradient:GRADS[i%GRADS.length], emoji:EMOJIS[i%EMOJIS.length],
    };
  }

  /* ── 앨범아트 ── */
  function _art(t) {
    const base = 'width:42px;height:42px;border-radius:6px;flex-shrink:0;overflow:hidden';
    return t.albumArt
      ? `<div style="${base}"><img src="${t.albumArt}"
              style="width:100%;height:100%;object-fit:cover"
              onerror="this.style.display='none'"></div>`
      : `<div class="${t.gradient}" style="${base};display:flex;align-items:center;justify-content:center">${t.emoji}</div>`;
  }

  /* ── 트랙 행 ── */
  function _row(t, i) {
    return `
      <div class="track-item"
           onclick="window._srchTracks&&Player.playTrack(window._srchTracks[${i}],window._srchTracks,${i})">
        <div class="track-num-wrap">
          <span class="track-num">${i+1}</span>
          <svg class="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        ${_art(t)}
        <div class="track-info">
          <div class="track-name">${t.name}</div>
          <div class="track-artist">${t.artist}</div>
        </div>
        <div class="track-album">${t.album}</div>
        <div class="track-actions">
          <button class="track-add-btn" title="플레이리스트에 추가"
                  onclick="event.stopPropagation();PlaylistPicker.open(window._srchTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          <button class="track-like-btn"
                  onclick="event.stopPropagation();PlaylistPicker.toggleLike(window._srchTracks[${i}], this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
                       2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
                       C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
                       c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <span class="track-duration">${t.duration}</span>
        </div>
      </div>`;
  }

  /* ── 베스트 매치용 큰 앨범아트 ── */
  function _bigArt(t) {
    return t.albumArt
      ? `<img src="${t.albumArt}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
      : `<span style="font-size:40px">${t.emoji||'🎵'}</span>`;
  }

  /* ── 아티스트 검색 결과 ── */
  async function _searchArtists(query) {
    try {
      const res  = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=6`, { cache: 'no-store' });
      const data = await res.json();
      return (data.results || [])
        .filter(r => r.artistName)
        .map(r => ({ name: r.artistName, id: r.artistId }));
    } catch (e) { return []; }
  }

  function _artistMini(a, i) {
    const nameEsc  = String(a.name).replace(/'/g, "\\'");
    const initials = String(a.name).slice(0, 2).toUpperCase();
    return `
      <div class="artist-mini" style="cursor:pointer" onclick="HomePage._showArtistDetail('${nameEsc}')">
        <div class="artist-mini-av" id="srch-artist-art-${i}">${
          a.image
            ? `<img src="${a.image}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${initials}'">`
            : initials
        }</div>
        <div>
          <div class="artist-mini-name">${a.name}</div>
          <div class="artist-mini-role">아티스트</div>
        </div>
      </div>`;
  }

  function _enrichArtistImages(artists) {
    artists.forEach(async (a, i) => {
      if (a.image) return; // 이미 이미지가 있으면(Spotify 폴백) 덮어쓰지 않음
      try {
        const res  = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(a.name)}&media=music&entity=song&limit=1`, { cache: 'no-store' });
        const data = await res.json();
        const art  = data.results?.[0]?.artworkUrl100?.replace('100x100bb','200x200bb');
        if (!art) return;
        const el = document.getElementById(`srch-artist-art-${i}`);
        if (el) el.innerHTML = `<img src="${art}" style="width:100%;height:100%;object-fit:cover"
                                      onerror="this.parentElement.textContent='${String(a.name).slice(0,2).toUpperCase()}'">`;
      } catch (e) {}
    });
  }

  /* ══ 장르 그리드 복원 ═══════════════════════════════ */
  function _showBrowse() {
    const page = document.getElementById('page-search');
    if (!page) return;
    if (_browseHTML) {
      page.innerHTML = _browseHTML;   // 저장된 HTML 완벽 복원
    }
  }

  /* ── Spotify 카탈로그 폴백 — iTunes에서 곡·아티스트 둘 다 0건일 때만 호출 ── */
  async function _spotifyCatalogSearch(query) {
    try {
      const [trackRes, artistRes] = await Promise.all([
        fetch(`/api/spotify/catalog/search?q=${encodeURIComponent(query)}&limit=20`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/spotify/catalog/search-artists?q=${encodeURIComponent(query)}&limit=6`, { credentials: 'include' }).then(r => r.json()),
      ]);
      const tracks = (trackRes.tracks || []).map((t, i) => ({
        _id: t._id || `sp_${i}`,
        name: t.name || '알 수 없는 곡',
        artist: t.artist || '',
        album: t.album || '',
        albumArt: t.albumArt || null,
        durationMs: t.durationMs || 0,
        duration: t.duration || _fmtMs(t.durationMs),
        durationSec: Math.floor((t.durationMs || 0) / 1000),
        previewUrl: t.previewUrl || null,
        spotifyId: t.spotifyId || null,
        gradient: GRADS[i % GRADS.length], emoji: EMOJIS[i % EMOJIS.length],
      }));
      const artists = (artistRes.artists || []).filter(a => a.name).map(a => ({ name: a.name, id: a.id, image: a.image || null }));
      return { tracks, artists };
    } catch (e) { return { tracks: [], artists: [] }; }
  }

  /* ══ 실시간 검색 ════════════════════════════════════ */
  async function _doSearch(query) {
    const page = document.getElementById('page-search');
    if (!page) return;

    // 로딩 표시 (장르 그리드 대체)
    page.innerHTML = `
      <div style="padding:24px 0 8px;font-size:22px;font-weight:700;color:#fff">
        검색 결과</div>
      <div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">
        🔍 검색 중...</div>`;

    try {
      const url  = `/api/itunes-proxy/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`;
      const [trackRes, artistsResult] = await Promise.all([
        fetch(url, { cache: 'no-store' }).then(r => r.json()),
        _searchArtists(query),
      ]);
      let tracks  = (trackRes.results || []).map(_toTrack);
      let artists = artistsResult;

      // iTunes에서 곡·아티스트 둘 다 하나도 못 찾았을 때만 Spotify로 보완
      if (!tracks.length && !artists.length) {
        const fallback = await _spotifyCatalogSearch(query);
        tracks  = fallback.tracks;
        artists = fallback.artists;
      }
      window._srchTracks = tracks;

      if (!tracks.length && !artists.length) {
        page.innerHTML = `
          <div style="padding:24px 0 8px;font-size:22px;font-weight:700;color:#fff">검색 결과</div>
          <div style="padding:48px;text-align:center">
            <div style="font-size:40px;margin-bottom:12px">🎵</div>
            <div style="color:var(--text-secondary)">"${query}"에 대한 결과가 없어요</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:8px">
              다른 검색어를 입력해보세요</div>
          </div>`;
        return;
      }

      page.innerHTML = `
        <div class="search-head">
          <div class="search-headline">"${query}"</div>
          <div class="search-sub"><b>${tracks.length}곡</b>${artists.length ? ` · 아티스트 ${artists.length}명` : ''}</div>
        </div>
        ${(tracks[0] || artists.length) ? `
          <div class="search-bento">
            ${tracks[0] ? `
              <div class="best-match">
                <div class="tag">베스트 매치</div>
                <div class="best-match-row">
                  <div class="best-match-art">${_bigArt(tracks[0])}</div>
                  <div style="min-width:0">
                    <div class="best-match-title">${tracks[0].name}</div>
                    <div class="best-match-artist">${tracks[0].artist}</div>
                    <div class="best-match-type">곡</div>
                  </div>
                  <button class="best-match-play" onclick="window._srchTracks&&Player.playTrack(window._srchTracks[0],window._srchTracks,0)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              </div>` : ''}
            ${artists.length ? `
              <div class="rail-card">
                <div class="rail-title">아티스트</div>
                ${artists.map((a,i) => _artistMini(a,i)).join('')}
              </div>` : ''}
          </div>` : ''}
        <div class="search-lower">
          ${tracks.length > 1 ? `
            <div class="track-col-title">곡</div>
            <div class="track-list has-art">${tracks.slice(1).map((t,i) => _row(t, i+1)).join('')}</div>` : ''}
        </div>`;

      if (artists.some(a => !a.image)) _enrichArtistImages(artists);

    } catch(e) {
      page.innerHTML = `
        <div style="padding:48px;text-align:center;color:var(--text-secondary)">
          검색 중 오류가 발생했어요.<br>
          <small style="opacity:.6">${e.message}</small>
        </div>`;
    }
  }

  /* ══ 장르 컬렉션 (page-detail) ════════════════════ */
  async function showGenre(genreName, emoji, gradient) {
    if (typeof Navigation !== 'undefined') Navigation.switchPage('detail');

    const hero = document.getElementById('detail-hero');
    const list = document.getElementById('detail-track-list');
    if (!hero || !list) return;

    hero.className = `detail-hero h-genre`;
    hero.innerHTML = `
      <div class="detail-hero-bg" id="genre-hero-bg"></div>
      <div class="artist-hero-bg-photo" id="genre-hero-bg-photo"></div>
      <div class="detail-hero-content">
        <div class="detail-hero-art" id="genre-hero-art">${emoji}</div>
        <div class="detail-hero-info">
          <div class="detail-hero-type">컬렉션</div>
          <h1 class="detail-hero-name">${genreName}</h1>
          <div class="detail-hero-meta" id="genre-meta">불러오는 중...</div>
          <div class="detail-action-row">
            <button class="play-btn-large" id="genre-play-btn" disabled>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            <button class="action-btn"
                    onclick="this.style.color=this.style.color?'':'var(--accent)'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
                         2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
                         C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
                         c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;

    list.className = 'track-list has-art';

    list.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-secondary)">
        트랙 불러오는 중...</div>`;

    try {
      const q    = GENRE_QUERIES[genreName] || genreName;
      // 필터링으로 걸러질 곡을 감안해 후보를 넉넉히 가져온 뒤 20곡으로 추림
      const res  = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=50`, { cache: 'no-store' });
      const data = await res.json();
      let results = data.results || [];

      // 실제 iTunes 장르(primaryGenreName)와 대조해서 진짜 그 장르인 곡만 남김
      const filterWords = GENRE_FILTERS[genreName];
      if (filterWords && filterWords.length) {
        const filtered = results.filter(r => {
          const g = (r.primaryGenreName || '').toLowerCase();
          return filterWords.some(w => g.includes(w));
        });
        // 필터링 후 결과가 너무 적으면(5곡 미만) 필터 없는 원본으로 되돌아감
        if (filtered.length >= 5) results = filtered;
      }

      const tracks = results.slice(0, 20).map(_toTrack);
      window._genreTracks = tracks;

      const metaEl   = document.getElementById('genre-meta');
      const totalMin = Math.floor(tracks.reduce((s,t) => s+t.durationMs,0)/60000);
      if (metaEl) metaEl.textContent = `${tracks.length}곡 · ${totalMin}분`;

      // 첫 곡의 앨범아트로 히어로 배경(흐림 처리)과 아트박스를 채워 분위기를 살림
      // — 배경 이미지 없이 어두운 그라데이션만 있으면 밋밋해 보이므로
      // 프리로드 후 opacity 트랜지션으로 페이드인(아티스트 상세 백드롭과 동일한 방식) —
      // background-image를 바로 갈아끼우면 큰 이미지가 늦게 뜰 때 안 보이는 것처럼 느껴짐
      const firstArt = tracks.find(t => t.albumArt)?.albumArt;
      if (firstArt) {
        const bgPhotoEl = document.getElementById('genre-hero-bg-photo');
        if (bgPhotoEl) {
          const preload = new Image();
          preload.onload = () => {
            bgPhotoEl.style.backgroundImage = `url(${firstArt})`;
            bgPhotoEl.classList.add('is-visible');
          };
          preload.src = firstArt;
        }
        const artEl = document.getElementById('genre-hero-art');
        if (artEl) artEl.innerHTML = `<img src="${firstArt}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${emoji}'">`;
      }

      const playBtn = document.getElementById('genre-play-btn');
      if (playBtn && tracks.length) {
        playBtn.disabled = false;
        playBtn.onclick  = () => Player.playTrack(tracks[0], tracks, 0);
      }

      list.innerHTML = tracks.length
        ? `<div class="track-list">
             ${tracks.map((t,i) => `
               <div class="track-item"
                    onclick="Player.playTrack(window._genreTracks[${i}],window._genreTracks,${i})">
                 <div class="track-num-wrap">
                   <span class="track-num">${i+1}</span>
                   <svg class="track-play-icon" width="16" height="16"
                        viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                 </div>
                 ${_art(t)}
                 <div class="track-info">
                   <div class="track-name">${t.name}</div>
                   <div class="track-artist">${t.artist}</div>
                 </div>
                 <div class="track-album">${t.album}</div>
                 <div class="track-actions">
                   <button class="track-add-btn" title="플레이리스트에 추가"
                           onclick="event.stopPropagation();PlaylistPicker.open(window._genreTracks[${i}], this)">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                       <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                     </svg>
                   </button>
                   <button class="track-like-btn"
                           onclick="event.stopPropagation();PlaylistPicker.toggleLike(window._genreTracks[${i}], this)">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                       <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5
                                2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09
                                C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5
                                c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                     </svg>
                   </button>
                   <span class="track-duration">${t.duration}</span>
                 </div>
               </div>`).join('')}
           </div>`
        : `<div style="padding:24px;text-align:center;color:var(--text-secondary)">
             트랙을 찾을 수 없어요</div>`;

    } catch(e) {
      list.innerHTML = `
        <div style="padding:24px;text-align:center;color:var(--text-secondary)">
          불러오기 실패</div>`;
    }
  }

  /* ══ 초기화 ══════════════════════════════════════════ */
  function _attachInput() {
    const input = document.getElementById('search-input');
    if (!input || input.dataset.sw4) return false;

    // 장르 그리드 HTML 저장 (첫 실행 시)
    const page = document.getElementById('page-search');
    if (page && !_browseHTML) {
      _browseHTML = page.innerHTML;
    }

    input.dataset.sw4 = '1';

    input.addEventListener('input', e => {
      const q = e.target.value.trim();
      if (!q) {
        clearTimeout(_debounce);
        _showBrowse();
        return;
      }
      clearTimeout(_debounce);
      _debounce = setTimeout(() => _doSearch(q), 400);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        input.value = '';
        _showBrowse();
        input.blur();
      }
    });

    console.log('[SearchPage] ✅ 검색 기능 초기화 완료');
    return true;
  }

  function init() {
    if (!_attachInput()) {
      let tries = 0;
      const t = setInterval(() => {
        if (_attachInput() || ++tries >= 20) clearInterval(t);
      }, 150);
    }
  }

  /* 자동 실행 */
  (function() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();

  return { init, showGenre };
})();
