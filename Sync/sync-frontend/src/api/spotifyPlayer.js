/**
 * Spotify Web Playback SDK 연동 (전체 재생 — Premium 계정 연동 시에만 동작).
 * 원본 static/js/spotify-player.js를 콜백 기반으로 이식.
 * - init() 은 연동 상태를 먼저 확인하고, 연동 안 됐으면 조용히 종료
 * - 진행률/재생상태는 콜백으로 PlayerContext에 전달 (DOM을 직접 건드리지 않음)
 */

let player = null;
let deviceId = null;
let ready = false;
let connected = false;
let premiumError = false;
let pollTimer = null;
let initAttempted = false;

let progressListener = null; // (pct, posMs, durMs) => void
let stateListener = null;    // ({ paused }) => void
let premiumErrorListener = null; // () => void
let trackEndListener = null; // () => void — 트랙이 끝까지 재생되어 자연 종료됐을 때

// SDK엔 별도 'ended' 이벤트가 없어서, player_state_changed의 paused 전환으로 자연 종료를 추론한다:
// (재생 중 position이 실제로 진행된 적 있음) + (갑자기 paused=true, position=0) → 곡이 끝난 것으로 판단
let hasProgressed = false;

export function onProgress(cb) { progressListener = cb; }
export function onStateChange(cb) { stateListener = cb; }
export function onPremiumError(cb) { premiumErrorListener = cb; }
export function onTrackEnd(cb) { trackEndListener = cb; }

async function fetchToken() {
  try {
    const res = await fetch('/api/spotify/player-token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.connected && data.token ? data.token : null;
  } catch {
    return null;
  }
}

async function checkConnected() {
  try {
    const res = await fetch('/api/spotify/status', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.connected;
  } catch {
    return false;
  }
}

async function registerDevice(id, token) {
  try {
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [id], play: false }),
    });
  } catch {
    // 디바이스 등록 실패 — play() 호출 시 다시 시도됨
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!player || !ready) return;
    try {
      const s = await player.getCurrentState();
      if (!s) return;
      const pct = (s.position / s.duration) * 100;
      progressListener?.(pct, s.position, s.duration);
      if (s.paused) stopPolling();
    } catch {
      // 폴링 중 오류는 무시하고 다음 tick에서 재시도
    }
  }, 500);
}
function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function loadSdkScript() {
  return new Promise((resolve) => {
    if (window.Spotify) { resolve(); return; }
    const existing = document.querySelector('script[src*="sdk.scdn.co"]');
    window.onSpotifyWebPlaybackSDKReady = resolve;
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export async function init() {
  if (initAttempted) return;
  initAttempted = true;

  connected = await checkConnected();
  if (!connected) return;

  const token = await fetchToken();
  if (!token) { connected = false; return; }

  await loadSdkScript();

  player = new window.Spotify.Player({
    name: 'SYNC',
    volume: 0.65,
    getOAuthToken: async (cb) => {
      const t = await fetchToken();
      if (t) cb(t);
    },
  });

  player.addListener('ready', async ({ device_id }) => {
    deviceId = device_id;
    const t = await fetchToken();
    if (t) {
      await registerDevice(device_id, t);
      await new Promise((r) => setTimeout(r, 500));
    }
    ready = true;
  });

  player.addListener('not_ready', () => { ready = false; stopPolling(); });

  player.addListener('player_state_changed', (state) => {
    if (!state) return;
    if (!state.paused) {
      if (state.position > 1000) hasProgressed = true; // 실제로 재생이 진행 중임을 확인
      startPolling();
    } else {
      stopPolling();
      const pct = state.duration ? (state.position / state.duration) * 100 : 0;
      progressListener?.(pct, state.position, state.duration);

      if (hasProgressed && state.position === 0) {
        // 재생되다가 갑자기 처음(0ms)으로 돌아오며 정지 → 곡이 끝까지 재생되어 자연 종료된 것
        hasProgressed = false;
        trackEndListener?.();
      }
    }
    stateListener?.({ paused: state.paused });
  });

  player.addListener('initialization_error', () => { ready = false; });
  player.addListener('authentication_error', () => { ready = false; });
  player.addListener('account_error', () => {
    // Premium 필요
    ready = false;
    premiumError = true;
    connected = false;
    if (player) { player.disconnect(); player = null; }
    premiumErrorListener?.();
  });

  player.connect();
}

export async function play(trackId) {
  if (!ready || !deviceId) return false;
  const token = await fetchToken();
  if (!token) return false;

  hasProgressed = false; // 새 트랙 시작 — 이전 트랙의 종료감지 플래그 초기화

  try {
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    });
    if (res.ok || res.status === 204) { startPolling(); return true; }
  } catch {
    // 1차 재생 실패 — 아래 2차(활성 디바이스 자동 선택)로 재시도
  }

  await new Promise((r) => setTimeout(r, 1000));
  try {
    const token2 = await fetchToken();
    const res2 = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    });
    if (res2.ok || res2.status === 204) { startPolling(); return true; }
  } catch {
    // 2차도 실패 — 호출부가 iTunes 미리듣기로 폴백
  }
  return false;
}

export async function pause() { if (player) { await player.pause(); stopPolling(); } }
export async function resume() { if (player) { await player.resume(); startPolling(); } }
export async function seekMs(ms) { if (player) await player.seek(ms); }
export async function setVolume(pct) { if (player) await player.setVolume(pct / 100); }

export function isReady() { return ready; }
export function isConnected() { return connected; }
export function isPremiumError() { return premiumError; }
