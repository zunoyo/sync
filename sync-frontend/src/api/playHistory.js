import { api } from './client';

/** 트랙 재생 기록 저장 — 어디서 재생하든 PlayerContext가 공통으로 호출 */
export function recordPlayHistory({ spotifyTrackId, trackName, artistName, source, emotionVectorId }) {
  return api.post('/api/play-history', {
    spotifyTrackId: spotifyTrackId || '',
    trackName: trackName || '',
    artistName: artistName || '',
    source: source || 'playback',
    emotionVectorId: emotionVectorId || null,
  }).catch(() => {});
}

/** 마지막으로 재생한 곡 조회 — 로그인 시 플레이어 바에 복원할 때 사용 */
export async function getLastPlayed() {
  try {
    return await api.get('/api/play-history/last');
  } catch {
    return null;
  }
}
