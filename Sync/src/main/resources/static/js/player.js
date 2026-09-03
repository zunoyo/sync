/**
 * SOUNDWAVE — Player Module (v3.1)
 * - Spotify SDK 실시간 ms 기반 시간/진행률 동기화
 * - 하단 바 + 우측 패널 동시 업데이트
 * - iTunes 폴백
 */
const Player = (() => {

  let state = {
    isPlaying:    false,
    currentTrack: null,
    progress:     0,
    volume:       65,
    isShuffle:    false,
    isRepeat:     false,
    isLiked:      false,
    intervalId:   null,
    useRealAudio: false,
    useSpotify:   false,
    queue:        [],
    queueIndex:   -1,
  };

  const _audio = new Audio();
  const $      = id => document.getElementById(id);

  function _fmtSec(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* ── Spotify 트랙 ID 실시간 검색 (사용자 OAuth 토큰) ──
     spotifyId 없는 트랙 재생 시 SDK 전체 재생을 위해 사용
  ── */
  const _sidCache = new Map();

  /* 트랙명 유사도 체크: 특수문자·괄호 제거 후 비교 */
  function _similarEnough(a, b) {
    const clean = s => s.replace(/[^a-z0-9가-힣]/g, '').trim();
    const ca = clean(a), cb = clean(b);
    return ca === cb || ca.includes(cb) || cb.includes(ca);
  }

  async function _searchSpotifyId(name, artist) {
    const cacheKey = `${name}__${artist||''}`.toLowerCase();
    if (_sidCache.has(cacheKey)) return _sidCache.get(cacheKey);

    const _doSearch = async (q) => {
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`,
                                { credentials: 'include' });
        if (res.status === 404) return null;   // Spotify 미연동 시 조용히 처리
        return res.ok ? await res.json() : null;
      } catch(e) { return null; }
    };

    /* 후보 목록에서 이름이 가장 잘 맞는 곡 반환 */
    const _bestId = (data, sn) => {
      const snL = sn.toLowerCase();
      // data.tracks 없으면 단일 결과 폴백
      // ※ data.name 없으면(구버전 서버) 빈문자열 → 빈 리스트로 처리
      const list = data?.tracks
          || (data?.id && data?.name
              ? [{ id: data.id, name: data.name }]
              : []);

      if (!list.length) return data?.id || null; // 이름 검증 불가 → 그냥 반환

      // 1순위: 정확 일치
      const exact = list.find(t => (t.name||'').toLowerCase() === snL);
      if (exact?.id) return exact.id;

      // 2순위: 특수문자 제거 후 일치
      const clean = s => s.replace(/[^a-z0-9가-힣]/g,'').toLowerCase();
      const similar = list.find(t => {
        const cn = clean(t.name||'');
        return cn && clean(snL) && cn === clean(snL);
      });
      if (similar?.id) return similar.id;

      // 3순위: 포함 관계 (빈 이름 제외 — 빈문자열은 모든 문자열에 포함되므로)
      const partial = list.find(t => {
        const tn = (t.name||'').toLowerCase();
        if (!tn) return false;  // ← 핵심 수정: 빈 이름 무시
        return tn.includes(snL) || snL.includes(tn);
      });
      return partial?.id || null;
    };

    try {
      // 1차: track:"이름" artist:"아티스트" 정밀 검색
      let data = await _doSearch(`track:"${name}" artist:"${artist||''}"`);
      let id   = _bestId(data, name);

      // 2차: "이름 아티스트" 일반 검색
      if (!id) {
        data = await _doSearch(`${name} ${artist||''}`.trim());
        id   = _bestId(data, name);
      }

      // 3차: 이름만으로 검색 (아티스트 제외)
      if (!id) {
        data = await _doSearch(name);
        id   = _bestId(data, name);
      }

      // 4차: 괄호·특수문자 제거 단순화 (예: "UP (KARINA Solo)" → "UP KARINA")
      if (!id) {
        const simpleName   = name.replace(/\(.*?\)/g, '').replace(/[^\w\s가-힣]/g, '').trim();
        const simpleArtist = (artist || '').replace(/\(.*?\)/g, '').trim();
        if (simpleName && simpleName !== name) {
          data = await _doSearch(`${simpleName} ${simpleArtist}`.trim());
          id   = _bestId(data, simpleName);
          // 단순화 이름으로 매칭된 경우 원래 이름도 캐시
          if (id) console.log(`[Player] 단순화 매칭: "${name}" → "${simpleName}" → ${id}`);
        }
      }

      if (id) {
        console.log(`[Player] Spotify 매칭 성공: "${name}" → ${id}`);
        _sidCache.set(cacheKey, id);
      } else {
        console.warn(`[Player] Spotify에서 "${name}" 정확 매칭 실패 → iTunes 폴백`);
      }
      return id;
    } catch(e) { return null; }
  }
  /* ── iTunes 30초 미리듣기 ── */
  async function _getItunesPreview(name, artist) {
    try {
      const term = encodeURIComponent(`${artist} ${name}`);
      const res  = await fetch(
        `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`
      );
      const data = await res.json();
      return data.results?.[0]?.previewUrl || null;
    } catch(e) { return null; }
  }

  /* ── 재생 기록 ── */
  function _recordPlayHistory(t) {
    if (!t?.name) return;
    fetch('/api/play-history', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spotifyTrackId:  t.spotifyId  || t._id || null,
        trackName:       t.name,
        artistName:      t.artist     || '',
        source:          'ai_recommended',
        emotionVectorId: null,
      }),
    }).catch(() => {});
  }

  /* ── UI 업데이트 ── */
  function updatePlayBtn() {
    [$('play-btn'), $('rp-play-btn')].forEach(b => {
      if (b) b.classList.toggle('paused', !state.isPlaying);
    });
  }

  /* ── 진행률 + 시간 업데이트 (하단 바 + 우측 패널 동시) ── */
  function updateProgress() {
    if (!state.currentTrack) return;
    const totalSec = state.currentTrack.durationSec || 1;
    const curSec   = Math.floor(totalSec * state.progress / 100);

    [$('progress-fill'), $('rp-progress-fill')].forEach(f => {
      if (f) f.style.width = state.progress + '%';
    });
    [$('current-time'), $('rp-current-time')].forEach(el => {
      if (el) el.textContent = _fmtSec(curSec);
    });
    // 전체 시간 표시 (하단 바 end-time + 우측 패널 rp-end-time)
    const endSec = _fmtSec(totalSec);
    [$('end-time'), $('rp-end-time')].forEach(el => {
      if (el) el.textContent = endSec;
    });

    document.querySelectorAll('.wave-bar').forEach((b, i, arr) => {
      b.classList.toggle('played', i < Math.floor(arr.length * state.progress / 100));
    });

    // 가사 동기화
    if (typeof RightPanel !== 'undefined') RightPanel.syncLyrics(state.progress);
  }

  /* ── 트랙 정보 업데이트 ── */
  function updateTrackInfo() {
    const t = state.currentTrack;
    if (!t) return;

    const art = $('player-art');
    if (art) {
      if (t.albumArt) {
        art.className = 'player-art';
        art.innerHTML = `<img src="${t.albumArt}"
          style="width:100%;height:100%;object-fit:cover;border-radius:6px"
          onerror="this.parentElement.className='player-art ${t.gradient||'grad-4'}';
                   this.parentElement.innerHTML='${t.emoji||'🎵'}'">`;
      } else {
        art.className = `player-art ${t.gradient || 'grad-4'}`;
        art.innerHTML  = t.emoji || '🎵';
      }
    }
    const nm = $('player-name');   if (nm) nm.textContent = t.name   || '';
    const ar = $('player-artist'); if (ar) ar.textContent = t.artist || '';

    if (typeof RightPanel !== 'undefined') RightPanel.updateTrack(t);
  }

  function _startFakeTick() {
    clearInterval(state.intervalId);
    state.intervalId = setInterval(() => {
      if (!state.isPlaying || state.useRealAudio || state.useSpotify) return;
      state.progress = Math.min(100, state.progress + 0.05);
      updateProgress();
    }, 500);
  }

  /* ── HTML5 Audio 이벤트 ── */
  _audio.addEventListener('timeupdate', () => {
    if (!state.useRealAudio || !_audio.duration) return;
    state.progress = (_audio.currentTime / _audio.duration) * 100;
    // 실제 시간으로 직접 표시
    [$('current-time'), $('rp-current-time')].forEach(el => {
      if (el) el.textContent = _fmtSec(Math.floor(_audio.currentTime));
    });
    [$('end-time'), $('rp-end-time')].forEach(el => {
      if (el) el.textContent = _fmtSec(Math.floor(_audio.duration));
    });
    [$('progress-fill'), $('rp-progress-fill')].forEach(f => {
      if (f) f.style.width = state.progress + '%';
    });
    document.querySelectorAll('.wave-bar').forEach((b, i, arr) => {
      b.classList.toggle('played', i < Math.floor(arr.length * state.progress / 100));
    });
    if (typeof RightPanel !== 'undefined') RightPanel.syncLyrics(state.progress, _audio.currentTime * 1000);
  });

  _audio.addEventListener('ended', () => {
    state.isPlaying = state.useRealAudio = false;
    updatePlayBtn();
    _playNext();
  });
  _audio.addEventListener('error', () => {
    state.useRealAudio = false;
    _startFakeTick();
  });

  function _playNext() {
    if (state.queue.length > 0 && state.queueIndex < state.queue.length - 1) {
      playTrack(state.queue[state.queueIndex + 1], state.queue, state.queueIndex + 1);
    }
  }

  /* ══ Spotify SDK → Player 동기화 (spotify-player.js 에서 호출) ══
     posMs: 현재 위치(ms), durMs: 전체 길이(ms)
  ════════════════════════════════════════════════════════════ */
  function _syncSpotifyProgress(pct, posMs, durMs) {
    if (!state.useSpotify) return;
    state.progress = pct;

    // 실제 ms 값으로 시간 표시
    if (posMs !== undefined) {
      const curSec = _fmtSec(Math.floor(posMs / 1000));
      [$('current-time'), $('rp-current-time')].forEach(el => {
        if (el) el.textContent = curSec;
      });
    }
    if (durMs !== undefined) {
      const endSec = _fmtSec(Math.floor(durMs / 1000));
      [$('end-time'), $('rp-end-time')].forEach(el => {
        if (el) el.textContent = endSec;
      });
      // 트랙 durationSec 업데이트
      if (state.currentTrack) {
        state.currentTrack.durationSec = Math.floor(durMs / 1000);
        state.currentTrack.durationMs  = durMs;
      }
    }

    [$('progress-fill'), $('rp-progress-fill')].forEach(f => {
      if (f) f.style.width = pct + '%';
    });
    document.querySelectorAll('.wave-bar').forEach((b, i, arr) => {
      b.classList.toggle('played', i < Math.floor(arr.length * pct / 100));
    });
    if (typeof RightPanel !== 'undefined') RightPanel.syncLyrics(pct, posMs);
  }

  /* ══ playTrack ══════════════════════════════════════════ */
  /* SDK 초기화 완료 대기 후 재생 (최대 5초) */
  async function _waitForSpotifyAndPlay(track, queue, qIdx, retries) {
    if (retries <= 0) return;
    if (typeof SpotifyPlayer !== 'undefined' && SpotifyPlayer.isReady()) {
      playTrack(track, queue, qIdx);
    } else if (typeof SpotifyPlayer !== 'undefined' && SpotifyPlayer.isConnected && SpotifyPlayer.isConnected()) {
      setTimeout(() => _waitForSpotifyAndPlay(track, queue, qIdx, retries - 1), 1000);
    }
  }

  async function playTrack(track, queue, qIdx) {
    if (!track) return;

    _audio.pause();
    _audio.currentTime = 0;
    clearInterval(state.intervalId);

    state.currentTrack = track;
    state.progress     = 0;
    state.isPlaying    = true;
    state.useRealAudio = false;
    state.useSpotify   = false;

    if (queue) { state.queue = queue; state.queueIndex = qIdx ?? 0; }

    updateTrackInfo();
    updatePlayBtn();
    updateProgress();
    _recordPlayHistory(track);

    /* ① Spotify Web Playback SDK
       - spotifyId 이미 있으면 바로 재생
       - 없으면 _searchSpotifyId 로 실시간 검색 후 재생
    ──────────────────────────────────────────────────── */
    if (typeof SpotifyPlayer !== 'undefined' && SpotifyPlayer.isReady()) {
      let sid = track.spotifyId;
      if (!sid && track.name) {
        sid = await _searchSpotifyId(track.name, track.artist || '');
        if (sid) track.spotifyId = sid;  // 이후 재클릭 시 캐시
      }
      if (sid) {
        const ok = await SpotifyPlayer.play(sid);
        if (ok) { state.useSpotify = true; return; }
      }
    }

    /* ② HTML5 previewUrl */
    if (track.previewUrl) {
      _audio.src = track.previewUrl;
      _audio.volume = state.volume / 100;
      _audio.play().then(() => { state.useRealAudio = true; })
        .catch(() => { state.useRealAudio = false; _startFakeTick(); });
      return;
    }

    /* ③ iTunes 폴백 */
    if (track.name && track.artist) {
      const url = await _getItunesPreview(track.name, track.artist);
      if (url) {
        _audio.src = url;
        _audio.volume = state.volume / 100;
        _audio.play().then(() => { state.useRealAudio = true; })
          .catch(() => { state.useRealAudio = false; _startFakeTick(); });
        return;
      }
    }

    /* ④ iTunes/fallback으로 재생 중 */
    _startFakeTick();

    if (track.spotifyId && typeof SpotifyPlayer !== 'undefined') {
      const connected  = SpotifyPlayer.isConnected  && SpotifyPlayer.isConnected();
      const premiumErr = SpotifyPlayer.isPremiumError && SpotifyPlayer.isPremiumError();
      if (!connected) {
        // 진짜 미연동일 때만 연동 안내
        SpotifyPlayer.showConnectNotice();
      }
      // 연동됐지만 SDK 미준비: SDK 초기화 완료 후 자동 재시도
      if (connected && !premiumErr && !SpotifyPlayer.isReady()) {
        _waitForSpotifyAndPlay(track, queue, qIdx, 5);
      }
    }
  }

  /* ══ 공개 제어 ══════════════════════════════════════════ */
  function togglePlay() {
    state.isPlaying = !state.isPlaying;
    if (state.useSpotify && typeof SpotifyPlayer !== 'undefined') {
      state.isPlaying ? SpotifyPlayer.resume() : SpotifyPlayer.pause();
    } else if (state.useRealAudio) {
      state.isPlaying ? _audio.play().catch(()=>{}) : _audio.pause();
    }
    updatePlayBtn();
  }

  function seek(pct) {
    state.progress = Math.max(0, Math.min(100, pct));
    if (state.useSpotify && typeof SpotifyPlayer !== 'undefined') {
      SpotifyPlayer.seekMs((state.currentTrack?.durationMs || 0) * pct / 100);
    } else if (state.useRealAudio && _audio.duration) {
      _audio.currentTime = _audio.duration * pct / 100;
    }
    updateProgress();
  }

  /* ── ms 단위 seek (lrclib 타임스탬프 가사 클릭) ── */
  function seekMs(ms) {
    if (!state.currentTrack) return;
    const dur = state.currentTrack.durationMs || 0;
    seek(dur > 0 ? (ms / dur) * 100 : 0);
  }


  function setVolume(pct) {
    state.volume = Math.max(0, Math.min(100, pct));
    _audio.volume = state.volume / 100;
    if (typeof SpotifyPlayer !== 'undefined') SpotifyPlayer.setVolume(pct);
    const vf = $('volume-fill');
    if (vf) vf.style.width = state.volume + '%';
  }

  function toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    $('shuffle-btn')?.classList.toggle('active', state.isShuffle);
  }
  function toggleRepeat() {
    state.isRepeat = !state.isRepeat;
    $('repeat-btn')?.classList.toggle('active', state.isRepeat);
  }
  function toggleLike() {
    state.isLiked = !state.isLiked;
    const b = $('player-like-btn');
    if (b) b.style.color = state.isLiked ? 'var(--accent)' : 'var(--text-secondary)';
  }
  function getState() { return state; }

  function init() {
    if (typeof TRACKS !== 'undefined' && TRACKS.length > 0) {
      state.currentTrack = TRACKS[0];
    }
    _startFakeTick();
    updateTrackInfo();
    updatePlayBtn();
    updateProgress();

    [$('progress-bar'), $('rp-progress-bar')].forEach(pb => {
      if (!pb) return;
      pb.addEventListener('click', e => {
        seek(((e.clientX - pb.getBoundingClientRect().left) / pb.offsetWidth) * 100);
      });
    });
    const vb = $('volume-bar');
    if (vb) vb.addEventListener('click', e => {
      setVolume(((e.clientX - vb.getBoundingClientRect().left) / vb.offsetWidth) * 100);
    });
    const vf = $('volume-fill');
    if (vf) vf.style.width = state.volume + '%';

    if (typeof SpotifyPlayer !== 'undefined') SpotifyPlayer.init();
  }

  return {
    init, togglePlay, playTrack,
    seek, seekMs, setVolume, toggleShuffle, toggleRepeat, toggleLike,
    getState, _syncSpotifyProgress,
  };
})();
