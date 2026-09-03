/**
 * SOUNDWAVE — Spotify Web Playback SDK Module (v3.1)
 * - init() 시작 시 연동 상태 먼저 확인 → 미연동이면 조용히 종료
 * - _fetchToken() 실패 시 콘솔 오류 없이 처리
 * - Premium 오류 시 토스트 표시 후 SDK 정리
 */
const SpotifyPlayer = (() => {

  let _player       = null;
  let _deviceId     = null;
  let _ready        = false;
  let _connected    = false;
  let _premiumError = false;
  let _token        = null;
  let _pollTimer    = null;
  let _initAttempted = false; // 중복 init 방지

  /* ── 토큰 취득 ────────────────────────────────────────────
     미연동/Free/미로그인 시 조용히 null 반환 (콘솔 오류 없음)
  ─────────────────────────────────────────────────────── */
  async function _fetchToken() {
    try {
      const res  = await fetch('/api/spotify/player-token', { credentials: 'include' });
      if (!res.ok) return null;                       // 404/401 조용히 처리
      const data = await res.json();
      if (data.connected && data.token) {
        _token = data.token;
        return data.token;
      }
      // 미연동/만료: reason 있어도 콘솔 출력 안 함 (정상 상태)
    } catch(e) { /* 네트워크 오류 — 조용히 */ }
    return null;
  }

  /* ── 연동 상태 사전 확인 ───────────────────────────────────
     init() 전 호출 — 미연동이면 false 반환하여 SDK 로드 차단
  ─────────────────────────────────────────────────────── */
  async function _checkConnected() {
    try {
      const res  = await fetch('/api/spotify/status', { credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data.connected);
    } catch(e) { return false; }
  }

  /* ── ready 시 즉시 디바이스 활성화 ──────────────────────
     이 호출이 없으면 PUT /v1/me/player/play 가 404 반환
  ─────────────────────────────────────────────────────── */
  async function _registerDevice(deviceId, token) {
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        method:  'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      });
      console.log('[Spotify SDK] 디바이스 등록:', res.status);
    } catch(e) {
      console.warn('[Spotify SDK] 디바이스 등록 실패:', e.message);
    }
  }

  /* ── 진행률 폴링 ── */
  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(async () => {
      if (!_player || !_ready) return;
      try {
        const s = await _player.getCurrentState();
        if (!s) return;
        const pct = s.position / s.duration * 100;
        if (typeof Player !== 'undefined')
          Player._syncSpotifyProgress(pct, s.position, s.duration);
        if (s.paused) _stopPolling();
      } catch(e) {}
    }, 500);
  }

  function _stopPolling() {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  /* ── SDK 초기화 ────────────────────────────────────────────
     ① Spotify 연동 상태 먼저 확인
     ② 미연동이면 SDK 로드 없이 조용히 종료
     ③ Premium 오류 시 토스트 표시 후 정리
  ─────────────────────────────────────────────────────── */
  async function init() {
    if (_initAttempted) return; // 중복 init 방지
    _initAttempted = true;

    // ① 연동 상태 먼저 확인 — 미연동이면 SDK 아예 로드 안 함
    const connected = await _checkConnected();
    if (!connected) {
      _connected = false;
      // 미연동은 정상 상태 — 콘솔 출력 없음
      return;
    }

    // ② 토큰 취득
    const token = await _fetchToken();
    if (!token) {
      _connected = false;
      return;
    }
    _connected = true;

    function _setupPlayer() {
      window.onSpotifyWebPlaybackSDKReady = async () => {
        _player = new Spotify.Player({
          name:   'SoundWave',
          volume: 0.65,
          getOAuthToken: async cb => {
            const t = await _fetchToken();
            if (t) cb(t);
          },
        });

        _player.addListener('ready', async ({ device_id }) => {
          _deviceId = device_id;
          console.log('[Spotify SDK] 준비 완료:', device_id);

          // 즉시 디바이스 활성화 (play 전 필수)
          const t = await _fetchToken();
          if (t) {
            await _registerDevice(device_id, t);
            await new Promise(r => setTimeout(r, 500));
          }
          _ready = true;
          console.log('[Spotify SDK] 디바이스 활성화 완료 — 전체 재생 가능');
        });

        _player.addListener('not_ready', () => {
          _ready = false;
          _stopPolling();
        });

        _player.addListener('player_state_changed', state => {
          if (!state) return;
          if (!state.paused) {
            _startPolling();
          } else {
            _stopPolling();
            const pct = state.position / state.duration * 100;
            if (typeof Player !== 'undefined')
              Player._syncSpotifyProgress(pct, state.position, state.duration);
          }
        });

        _player.addListener('initialization_error', ({ message }) => {
          console.error('[Spotify SDK] 초기화 오류:', message);
          _ready = false;
        });
        _player.addListener('authentication_error', ({ message }) => {
          // 인증 만료 — 조용히 처리 (토큰 재발급으로 자동 복구)
          _ready = false;
        });
        _player.addListener('account_error', ({ message }) => {
          // Premium 필요 — 토스트만 표시, 콘솔 warn 생략
          _ready        = false;
          _premiumError = true;
          _connected    = false;
          if (_player) { _player.disconnect(); _player = null; }
          _showPremiumNotice();
        });

        _player.connect();
      };

      if (window.Spotify) window.onSpotifyWebPlaybackSDKReady();
    }

    if (window.Spotify) {
      _setupPlayer();
    } else {
      const existing = document.querySelector('script[src*="sdk.scdn.co"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src   = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        _setupPlayer();
        document.head.appendChild(script);
      } else {
        _setupPlayer();
      }
    }
  }

  /* ── 재생 ── */
  async function play(trackId) {
    if (!_ready || !_deviceId) {
      console.warn('[Spotify SDK] 재생 불가 — ready:', _ready, 'deviceId:', _deviceId);
      return false;
    }
    const token = await _fetchToken();
    if (!token) return false;

    // 1차: device_id 지정
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${_deviceId}`,
        {
          method:  'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
        }
      );
      if (res.ok || res.status === 204) {
        console.log('[Spotify SDK] 재생 성공 (device_id):', trackId);
        _startPolling();
        return true;
      }
      console.warn('[Spotify SDK] device_id 재생 실패:', res.status);
    } catch(e) { console.warn('[Spotify SDK] 재생 오류:', e.message); }

    // 2차: device_id 없이 (활성 디바이스 자동 선택)
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res2 = await fetch(
        'https://api.spotify.com/v1/me/player/play',
        {
          method:  'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
        }
      );
      if (res2.ok || res2.status === 204) {
        console.log('[Spotify SDK] 재생 성공 (no device_id):', trackId);
        _startPolling();
        return true;
      }
      const err = await res2.text().catch(() => '');
      console.warn('[Spotify SDK] 재생 최종 실패:', res2.status, err);
    } catch(e) { console.warn('[Spotify SDK] 2차 재생 오류:', e.message); }

    return false;
  }

  async function pause()         { if (_player) { await _player.pause(); _stopPolling(); } }
  async function resume()        { if (_player) { await _player.resume(); _startPolling(); } }
  async function seekMs(ms)      { if (_player) await _player.seek(ms); }
  async function setVolume(vol)  { if (_player) await _player.setVolume(vol / 100); }
  function       isReady()       { return _ready; }
  function       isConnected()   { return _connected; }
  function       isPremiumError(){ return _premiumError; }

  /* ── Premium 토스트 ── */
  function _showPremiumNotice() {
    if (document.getElementById('sw-premium-notice')) return;
    const d = document.createElement('div');
    d.id = 'sw-premium-notice';
    d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
      'background:rgba(30,215,96,.15);border:1px solid rgba(30,215,96,.4);' +
      'border-radius:12px;padding:14px 20px;font-size:13px;font-weight:600;' +
      'color:var(--text-base);z-index:9999;display:flex;align-items:center;' +
      'gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.4)';
    d.innerHTML = '🎵 <span>Spotify Premium이 필요해요. ' +
      '<a href="https://www.spotify.com/premium/" target="_blank" ' +
      'style="color:var(--accent);text-decoration:none">업그레이드</a> ' +
      '| 지금은 30초 미리듣기로 재생됩니다.</span>' +
      '<button onclick="this.parentElement.remove()" ' +
      'style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px">✕</button>';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 8000);
  }

  /* ── Spotify 연동 안내 토스트 ── */
  function showConnectNotice() {
    if (document.getElementById('sw-connect-notice')) return;
    const d = document.createElement('div');
    d.id = 'sw-connect-notice';
    d.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
      'background:rgba(30,215,96,.15);border:1px solid rgba(30,215,96,.4);' +
      'border-radius:12px;padding:14px 20px;font-size:13px;font-weight:600;' +
      'color:var(--text-base);z-index:9999;display:flex;align-items:center;' +
      'gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.4)';
    d.innerHTML = '🎵 <span>전체 재생하려면 Spotify 연동이 필요해요.</span>' +
      '<button onclick="SpotifyPlayer.connectSpotify()" ' +
      'style="background:var(--accent);border:none;color:#000;padding:5px 12px;' +
      'border-radius:20px;font-size:12px;font-weight:700;cursor:pointer">연동하기</button>' +
      '<button onclick="this.parentElement.remove()" ' +
      'style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px">✕</button>';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 8000);
  }

  async function connectSpotify() {
    try {
      const res  = await fetch('/api/spotify/auth');
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
    } catch(e) {}
  }

  return {
    init, play, pause, resume, seekMs, setVolume,
    isReady, isConnected, isPremiumError,
    connectSpotify, showConnectNotice,
  };
})();