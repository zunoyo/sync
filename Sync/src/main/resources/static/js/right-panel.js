/**
 * SYNC — Right Panel Module (v3.1)
 * - 가사 fetch (lrclib.net → lyrics.ovh 폴백)
 * - 타임스탬프 가사: posMs 없어도 durationMs × progress% 로 추정
 * - 가사 로드 완료 즉시 현재 재생 위치로 점프
 * - 전체뷰 DOM 없으면 먼저 renderLyrics 후 하이라이트
 */
const RightPanel = (() => {

  let isOpen    = false;
  let activeTab = 'nowplaying';
  let _lyricsScrollEnabled = false;
  let _lyricsLines   = [];
  let _timedLines    = [];
  let _lyricsLoaded  = false;
  let _lastLyricIdx  = -1;

  /* ── Open / Close ── */
  function open() {
    const p = document.getElementById('right-panel');
    if (!p) return;
    p.classList.add('open');
    isOpen = true;
    document.getElementById('panel-toggle-btn')?.classList.add('active');
  }
  function close() {
    const p = document.getElementById('right-panel');
    if (!p) return;
    p.classList.remove('open');
    isOpen = false;
    document.getElementById('panel-toggle-btn')?.classList.remove('active');
  }
  function toggle() { isOpen ? close() : open(); }

  function toggleLyricsScroll() {
    _lyricsScrollEnabled = !_lyricsScrollEnabled;
    const btn = document.getElementById('lyrics-toggle-btn');
    if (btn) btn.classList.toggle('active', _lyricsScrollEnabled);

    const c = document.getElementById('rp-lyrics-container');
    if (_lyricsScrollEnabled) {
      open();
      switchTab('nowplaying');
      if (c) c.style.cssText = 'height:300px;overflow-y:auto;padding:4px 0';
      if (_lyricsLoaded) _renderLyrics();

      const playerPct = (typeof Player !== 'undefined') ? Player.getState().progress : 0;
      _lastLyricIdx = -1;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncLyrics(playerPct);
          const container = document.getElementById('rp-lyrics-container');
          const lines = container ? container.querySelectorAll('.lyrics-line') : [];
          const total  = Math.max(_lyricsLines.length, 1);
          const curIdx = Math.min(Math.floor(total * playerPct / 100), total - 1);
          if (lines[curIdx] && container) {
            const cRect = container.getBoundingClientRect();
            const lRect = lines[curIdx].getBoundingClientRect();
            const top   = container.scrollTop
                        + (lRect.top - cRect.top)
                        - (container.clientHeight / 2)
                        + (lines[curIdx].clientHeight / 2);
            container.scrollTop = Math.max(0, top);
          }
        });
      });

    } else {
      if (c) c.style.cssText = 'height:90px;overflow:hidden';
      const savedIdx = _lastLyricIdx;
      _lastLyricIdx  = -1;
      if (_lyricsLoaded && savedIdx >= 0) _renderMiniLyrics(savedIdx);
    }
  }

  /* ── 앨범아트 HTML ── */
  function _setArt(el, track) {
    if (!el) return;
    if (track?.albumArt) {
      el.className = el.id === 'rp-album-art' ? 'rp-album-art' : el.className;
      el.innerHTML = `<img src="${track.albumArt}"
        style="width:100%;height:100%;object-fit:cover;border-radius:inherit"
        onerror="this.parentElement.className+=' ${track.gradient||'grad-4'}';
                 this.parentElement.innerHTML='${track.emoji||'🎵'}'">`;
    } else {
      el.className = `${el.id==='rp-album-art'?'rp-album-art':''} ${track?.gradient||'grad-4'}`.trim();
      el.innerHTML = track?.emoji || '🎵';
    }
  }

  /* ══ 트랙 변경 시 호출 ═══════════════════════════════════ */
  function updateTrack(track) {
    _setArt(document.getElementById('rp-album-art'), track);
    const nm = document.getElementById('rp-track-name');
    const ar = document.getElementById('rp-track-artist');
    const et = document.getElementById('rp-end-time');
    if (nm) nm.textContent = track.name   || '';
    if (ar) ar.textContent = track.artist || '';
    if (et) et.textContent = track.duration || '—';
    renderQueue(track);
    renderWaveform();
    renderRelated(track);
    _fetchLyrics(track);
    if (!isOpen) open();
  }

  /* ══ 가사 fetch ══════════════════════════════════════════ */
  function _parseLrc(lrcText) {
    const result = [];
    for (const line of lrcText.split('\n')) {
      const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (!m) continue;
      const ms   = (parseInt(m[1]) * 60 + parseInt(m[2])) * 1000
                 + parseInt(m[3].length === 2 ? m[3] : m[3].slice(0,3));
      const text = m[4].trim();
      if (text) result.push({ ms, text });
    }
    return result;
  }

  async function _fetchLyrics(track) {
    _lyricsLines  = [];
    _timedLines   = [];
    _lyricsLoaded = false;
    _lastLyricIdx = -1;

    const c = document.getElementById('rp-lyrics-container');
    if (!c) return;
    c.innerHTML = '<div style="padding:20px;text-align:center;' +
      'color:var(--text-secondary);font-size:13px;opacity:.6">가사 불러오는 중...</div>';

    if (!track?.name) return;

    /* ① lrclib.net — 타임스탬프 포함, 한국어 지원 */
    try {
      const q   = new URLSearchParams({
        artist_name: track.artist || '',
        track_name:  track.name,
      });
      const res  = await fetch(`https://lrclib.net/api/get?${q}`);
      if (res.ok) {
        const data = await res.json();
        const synced = data?.syncedLyrics;
        const plain  = data?.plainLyrics;

        if (synced) {
          _timedLines  = _parseLrc(synced);
          _lyricsLines = _timedLines.map(t => t.text);
          _lyricsLoaded = true;
          _syncToCurrentPosition();  // 로드 완료 즉시 현재 위치로 점프
          return;
        }
        if (plain) {
          _lyricsLines  = plain.split('\n').map(l => l.trim()).filter(l => l).slice(0, 60);
          _lyricsLoaded = true;
          _syncToCurrentPosition();
          return;
        }
      }
    } catch(e) {}

    /* ② lyrics.ovh — 폴백 */
    try {
      const artist = encodeURIComponent(track.artist || '');
      const title  = encodeURIComponent(track.name);
      const res    = await fetch(`https://api.lyrics.ovh/v1/${artist}/${title}`);
      const data   = await res.json();

      if (data.lyrics) {
        const raw         = data.lyrics;
        const hasKorean   = /[\uAC00-\uD7A3]/.test(raw);
        const titleKorean = /[\uAC00-\uD7A3]/.test(track.name + (track.artist||''));

        if (titleKorean && !hasKorean) {
          c.innerHTML = '<div style="padding:24px;text-align:center;' +
            'color:var(--text-secondary);font-size:13px">' +
            '한국어 가사를 찾을 수 없어요 🎵</div>';
          return;
        }
        _lyricsLines  = raw.split('\n').map(l => l.trim()).filter(l => l).slice(0, 60);
        _lyricsLoaded = true;
        _syncToCurrentPosition();
      } else {
        c.innerHTML = '<div style="padding:24px;text-align:center;' +
          'color:var(--text-secondary);font-size:13px">가사를 찾을 수 없어요 🎵</div>';
      }
    } catch(e) {
      c.innerHTML = '<div style="padding:24px;text-align:center;' +
        'color:var(--text-secondary);font-size:13px">가사를 불러올 수 없어요</div>';
    }
  }

  /* ── 가사 로드 완료 후 현재 재생 위치로 즉시 점프 ── */
  function _syncToCurrentPosition() {
    if (!_lyricsLoaded || !_lyricsLines.length) return;

    let posMs;
    if (typeof Player !== 'undefined') {
      const ps  = Player.getState();
      const pct = ps.progress || 0;

      if (ps.useSpotify && ps.currentTrack?.durationMs) {
        posMs = ps.currentTrack.durationMs * pct / 100;
      } else if (ps.useRealAudio && ps.currentTrack?.durationSec) {
        posMs = ps.currentTrack.durationSec * 1000 * pct / 100;
      }

      // 타임스탬프 가사: posMs 기반 점프
      if (_timedLines.length > 0 && posMs !== undefined) {
        let tIdx = 0;
        for (let i = 0; i < _timedLines.length; i++) {
          if (_timedLines[i].ms <= posMs) tIdx = i;
          else break;
        }
        _lastLyricIdx = tIdx;
        if (_lyricsScrollEnabled) { _renderLyrics(); _highlightLine(tIdx); }
        else _renderMiniLyrics(tIdx);
        return;
      }

      // 일반 가사: 진행률 기반 점프
      if (posMs !== undefined) {
        syncLyrics(pct, posMs);
        return;
      }
    }

    // 재생 정보 없으면 0번째 줄 표시
    _renderMiniLyrics(0);
  }

  /* ── 전체뷰 렌더링 ── */
  function _renderLyrics() {
    const c = document.getElementById('rp-lyrics-container');
    if (!c || !_lyricsLines.length) return;
    c.innerHTML = _lyricsLines.map((line, i) => {
      const seekFn = (_timedLines.length > 0 && _timedLines[i])
        ? `Player.seekMs(${_timedLines[i].ms})`
        : `Player.seek(${(i / _lyricsLines.length * 100).toFixed(1)})`;
      return `<div class="lyrics-line" data-idx="${i}"
            style="padding:8px 4px;font-size:14px;line-height:1.6;
                   cursor:pointer;transition:all .25s;color:rgba(255,255,255,0.35);
                   text-align:center;border-radius:6px;"
            onmouseenter="this.style.background='rgba(255,255,255,.05)'"
            onmouseleave="this.style.background='transparent'"
            onclick="${seekFn}">
        ${line}
      </div>`;
    }).join('');
  }

  /* ── 미니뷰 렌더링 (이전/현재/다음 3줄) ── */
  function _renderMiniLyrics(idx) {
    const c = document.getElementById('rp-lyrics-container');
    if (!c) return;
    c.style.cssText = 'height:90px;overflow:hidden;display:flex;flex-direction:column;' +
                      'justify-content:center;align-items:center;gap:2px';
    const prev    = idx > 0                       ? _lyricsLines[idx - 1] : null;
    const current = _lyricsLines[idx]             || '';
    const next    = idx < _lyricsLines.length - 1 ? _lyricsLines[idx + 1] : null;
    const rows    = [];
    if (prev)  rows.push({ text: prev,    active: false });
    rows.push(         { text: current, active: true  });
    if (next)  rows.push({ text: next,    active: false });
    c.innerHTML = rows.map(r => `
      <div class="lyrics-line ${r.active ? 'active' : ''}"
           style="padding:2px 8px;text-align:center;width:100%;
                  font-size:${r.active ? '15' : '13'}px;
                  font-weight:${r.active ? '700' : '400'};
                  color:${r.active ? 'var(--text-base)' : 'var(--text-muted)'};
                  opacity:${r.active ? '1' : '0.45'};
                  transition:all .3s;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${r.text}
      </div>`).join('');
  }

  /* ── 가사 라인 하이라이트 + 자동 스크롤 ── */
  function _highlightLine(idx) {
    const c     = document.getElementById('rp-lyrics-container');
    const lines = document.querySelectorAll('#rp-lyrics-container .lyrics-line');
    if (!c || !lines.length) return;

    lines.forEach((l, i) => {
      if (i === idx) {
        l.style.color      = '#ffffff';
        l.style.fontWeight = '700';
        l.style.fontSize   = '15px';
        l.style.opacity    = '1';
        l.style.transform  = 'scale(1.03)';
        l.style.background = 'rgba(255,255,255,.04)';
        const cRect = c.getBoundingClientRect();
        const lRect = l.getBoundingClientRect();
        const top   = c.scrollTop
                    + (lRect.top - cRect.top)
                    - (c.clientHeight / 2)
                    + (l.clientHeight / 2);
        c.scrollTo({ top: Math.max(0, top), behavior: idx <= 1 ? 'instant' : 'smooth' });
      } else {
        l.style.color      = 'rgba(255,255,255,0.35)';
        l.style.fontWeight = '400';
        l.style.fontSize   = '14px';
        l.style.opacity    = '0.8';
        l.style.transform  = 'scale(1)';
        l.style.background = 'transparent';
      }
    });
  }

  /* ══ syncLyrics ══════════════════════════════════════════ */
  function syncLyrics(progressPct, posMs) {
    if (!_lyricsLoaded || !_lyricsLines.length) return;

    /* ── 타임스탬프 모드 ───────────────────────────────────
       posMs 없어도 durationMs × progress% 로 추정
    ─────────────────────────────────────────────────────── */
    if (_timedLines.length > 0) {
      let effectiveMs = posMs;
      if (effectiveMs === undefined && typeof Player !== 'undefined') {
        const ps  = Player.getState();
        const dur = ps.currentTrack?.durationMs;
        if (dur) effectiveMs = dur * progressPct / 100;
      }

      if (effectiveMs !== undefined) {
        let tIdx = 0;
        for (let i = 0; i < _timedLines.length; i++) {
          if (_timedLines[i].ms <= effectiveMs) tIdx = i;
          else break;
        }
        if (tIdx === _lastLyricIdx) return;
        _lastLyricIdx = tIdx;
        if (!_lyricsScrollEnabled) { _renderMiniLyrics(tIdx); return; }
        // 전체뷰: DOM 없으면 먼저 렌더
        const lines = document.querySelectorAll('#rp-lyrics-container .lyrics-line');
        if (!lines.length) _renderLyrics();
        _highlightLine(tIdx);
        return;
      }
    }

    /* ── iTunes 미리듣기 속도 보정 ── */
    let effectivePct = progressPct;
    if (typeof Player !== 'undefined') {
      const ps    = Player.getState();
      const track = ps.currentTrack;
      if (ps.useRealAudio && !ps.useSpotify && track && track.durationSec) {
        const PREVIEW_SEC = 30;
        if (track.durationSec > PREVIEW_SEC + 5) {
          effectivePct = progressPct * PREVIEW_SEC / track.durationSec;
        }
      }
    }

    /* ── 전주 보정 ── */
    const INTRO_PCT = 8;
    let   lyrPct    = effectivePct;
    if (effectivePct <= INTRO_PCT) {
      lyrPct = 0;
    } else {
      lyrPct = (effectivePct - INTRO_PCT) / (100 - INTRO_PCT) * 100;
    }

    const total = _lyricsLines.length;
    const idx   = Math.min(Math.floor(total * lyrPct / 100), total - 1);

    if (!_lyricsScrollEnabled) {
      if (idx === _lastLyricIdx) return;
      _lastLyricIdx = idx;
      _renderMiniLyrics(idx);
      return;
    }

    // 전체뷰: DOM 없으면 먼저 렌더
    const existingLines = document.querySelectorAll('#rp-lyrics-container .lyrics-line');
    if (!existingLines.length) _renderLyrics();
    _lastLyricIdx = idx;
    _highlightLine(idx);
  }

  /* ══ 파형 ═══════════════════════════════════════════════ */
  function renderWaveform() {
    const c = document.getElementById('rp-waveform');
    if (!c) return;
    c.innerHTML = Array.from({ length: 48 }, (_, i) =>
      `<div class="wave-bar" style="height:${20 + Math.random()*80}%"
            data-index="${i}"></div>`
    ).join('');
  }

  /* ══ 큐 렌더링 ══════════════════════════════════════════ */
  function renderQueue(currentTrack) {
    const c = document.getElementById('rp-queue-list');
    if (!c) return;

    const ps = Player.getState();
    let items = []; // { t, idx } — idx는 ps.queue 안에서 이 곡의 실제 위치(재생 시 넘겨줌)

    if (ps.queue?.length > 0) {
      items = ps.isShuffle
        // 셔플 중이면 실제로 다음에 뽑힐 순서(셔플 가방 역순)로 보여준다
        // — 예전엔 셔플 여부와 상관없이 항상 원래 큐 순서(queueIndex 다음부터)를 보여줘서
        //   실제로 다음에 재생될 곡과 목록이 어긋나 보이는 문제가 있었음
        ? ps.shuffleBag.slice().reverse().map(idx => ({ t: ps.queue[idx], idx })).filter(p => p.t)
        : ps.queue.map((t, idx) => ({ t, idx })).filter(p => p.idx > ps.queueIndex);
      items = items.slice(0, 5);
    } else if (typeof TRACKS !== 'undefined') {
      items = TRACKS.filter(t => t.id !== currentTrack?.id).slice(0, 4).map(t => ({ t, idx: null }));
    }

    if (!items.length) {
      c.innerHTML = '<div style="padding:16px;text-align:center;' +
        'color:var(--text-secondary);font-size:12px">다음 곡이 없어요</div>';
      return;
    }

    c.innerHTML = items.map(({ t, idx }) => {
      const grad  = t.gradient || 'grad-4';
      const emoji = t.emoji || '🎵';
      // ⚠ 예전엔 onerror="this.outerHTML='<div ...>'" 식으로 HTML을 문자열째 재구성했는데,
      //   그 안에 이스케이프해 넣은 큰따옴표(\")가 실제 HTML 파서 입장에서는 그냥 백슬래시+
      //   큰따옴표로 보여서 onerror 속성이 중간에 끊기고 나머지가 화면에 그대로(글자로) 새는
      //   버그가 있었다. data-* 속성 + 헬퍼 함수 호출 방식으로 바꿔서 중첩 따옴표 자체를 없앰.
      const artHtml = t.albumArt
        ? `<img src="${t.albumArt}" class="queue-art" style="object-fit:cover;border-radius:4px"
               data-grad="${grad}" data-emoji="${emoji}" onerror="RightPanel._queueArtFallback(this)">`
        : `<div class="queue-art ${grad}">${emoji}</div>`;
      const trackJson = JSON.stringify(t)
        .replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/</g,'\\u003c');
      // idx가 있으면(실제 큐 소속) 클릭 시 큐/인덱스도 같이 넘겨서 이후 이전/다음 곡 탐색이 정확히 이어지게 함
      const onclickAttr = idx != null
        ? `Player.playTrack(${trackJson}, Player.getState().queue, ${idx})`
        : `Player.playTrack(${trackJson})`;
      return `
        <div class="queue-item" onclick="${onclickAttr}">
          ${artHtml}
          <div class="queue-info">
            <div class="queue-name">${t.name}</div>
            <div class="queue-artist">${t.artist}</div>
          </div>
          <div class="queue-duration">${t.duration||'—'}</div>
        </div>`;
    }).join('');
  }

  /* ══ 탭 전환 ════════════════════════════════════════════ */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.rp-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.rp-tab-content').forEach(c => {
      c.style.display = c.dataset.tab === tab ? 'block' : 'none';
    });
  }

  /* ── 하단바 "다음 곡 목록" 버튼 — 닫혀있으면 열면서 큐 탭,
     이미 큐 탭이 열려있으면 Now Playing 탭으로 복귀(패널은 닫지 않음) ── */
  function toggleQueueView() {
    if (!isOpen) {
      open();
      switchTab('queue');
    } else if (activeTab === 'queue') {
      switchTab('nowplaying');
    } else {
      switchTab('queue');
    }
  }

  /* ══ 관련 아티스트 ══════════════════════════════════════ */
  const LASTFM_KEY = '613ca46d815b6b0b2acf0145aa03b2dd';

  function renderRelated(track) {
    const c = document.getElementById('rp-related-list');
    if (!c) return;

    const artistName = track?.artist;
    if (!artistName) { _renderRelatedFallback(c); return; }

    c.innerHTML = '<div style="padding:12px 4px;font-size:12px;color:var(--text-secondary)">불러오는 중...</div>';

    fetch(`http://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_KEY}&format=json&limit=3`)
      .then(r => r.json())
      .then(async data => {
        const similar = data?.similarartists?.artist || [];
        if (!similar.length) { _renderRelatedFallback(c); return; }

        // 아티스트 이미지는 iTunes에서 보강 (Last.fm 자체 이미지는 최근 대부분 비어있음)
        const withArt = await Promise.all(similar.map(async a => {
          try {
            const res  = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(a.name)}&entity=musicArtist&attribute=artistTerm&limit=1`);
            const itd  = await res.json();
            const song = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(a.name)}&media=music&entity=song&limit=1`).then(r => r.json());
            const art  = song?.results?.[0]?.artworkUrl100?.replace('100x100bb', '200x200bb') || null;
            return { name: a.name, art };
          } catch (e) { return { name: a.name, art: null }; }
        }));

        c.innerHTML = withArt.map(a => {
          const nameEsc  = a.name.replace(/'/g, "\\'");
          const initials = a.name.slice(0, 2).toUpperCase();
          const saved    = typeof SavedLibrary !== 'undefined' && SavedLibrary.isArtistSaved(a.name);
          return `
            <div class="related-artist">
              <div class="related-avatar" style="overflow:hidden">
                ${a.art
                  ? `<img src="${a.art}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${initials}'">`
                  : initials}
              </div>
              <div class="related-info" style="cursor:pointer" onclick="HomePage._showArtistDetail('${nameEsc}')">
                <div class="related-name">${a.name}</div>
                <div class="related-meta">아티스트</div>
              </div>
              <button class="related-follow${saved ? ' following' : ''}"
                      onclick="RightPanel._toggleRelatedFollow('${nameEsc}','${(a.art||'').replace(/'/g,"\\'")}', this)">
                ${saved ? '팔로잉' : '팔로우'}
              </button>
            </div>`;
        }).join('');
      })
      .catch(() => _renderRelatedFallback(c));
  }

  function _renderRelatedFallback(c) {
    if (typeof ARTISTS === 'undefined') { c.innerHTML = ''; return; }
    c.innerHTML = ARTISTS.slice(0, 3).map(a => {
      const nameEsc = a.name.replace(/'/g, "\\'");
      const saved   = typeof SavedLibrary !== 'undefined' && SavedLibrary.isArtistSaved(a.name);
      return `
      <div class="related-artist">
        <div class="related-avatar ${a.gradient}">${a.emoji}</div>
        <div class="related-info">
          <div class="related-name">${a.name}</div>
          <div class="related-meta">${a.genre}</div>
        </div>
        <button class="related-follow${saved ? ' following' : ''}"
                onclick="RightPanel._toggleRelatedFollow('${nameEsc}','', this)">
          ${saved ? '팔로잉' : '팔로우'}
        </button>
      </div>`;
    }).join('');
  }

  /* ── 관련 아티스트 팔로우 버튼 클릭 ── */
  async function _toggleRelatedFollow(name, imgUrl, btnEl) {
    if (typeof SavedLibrary === 'undefined') return;
    btnEl.disabled = true;
    const saved = await SavedLibrary.toggleArtist(name, imgUrl || null, null);
    btnEl.disabled = false;
    btnEl.textContent = saved ? '팔로잉' : '팔로우';
    btnEl.classList.toggle('following', saved);
    if (typeof LibraryFilter !== 'undefined') LibraryFilter.refresh();
  }

  function init() {
    renderWaveform();
    renderRelated(Player.getState().currentTrack);
    const track = Player.getState().currentTrack;
    if (track) updateTrack(track);
  }

  /* ── 큐 목록 썸네일 로드 실패 시 이모지 플레이스홀더로 교체 ── */
  function _queueArtFallback(imgEl) {
    const div = document.createElement('div');
    div.className = 'queue-art ' + (imgEl.dataset.grad || 'grad-4');
    div.textContent = imgEl.dataset.emoji || '🎵';
    imgEl.replaceWith(div);
  }

  return {
    open, close, toggle, toggleLyricsScroll, toggleQueueView,
    updateTrack, switchTab, renderRelated,
    syncLyrics, init, _queueArtFallback, _toggleRelatedFollow,
  };
})();
