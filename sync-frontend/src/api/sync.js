import { api } from './client';

export const EMOTION_LABELS = {
  happy: '😊 행복', sad: '😢 슬픔', calm: '😌 차분',
  energetic: '⚡ 활기', romantic: '💕 로맨틱',
  melancholy: '🌧 감성', angry: '🔥 강렬', dreamy: '🌙 몽환',
};

export const SYNC_MOODS = [
  '😊 기분 좋을 때', '😢 감성 충전', '💪 운동할 때', '🌙 밤에 혼자',
  '🚗 드라이브', '📚 집중할 때', '🎉 파티 분위기', '☕ 여유로운 아침',
];

export function fmtMs(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function parseTags(raw) {
  if (!raw) return [];
  const cleaned = String(raw).trim().replace(/^\[|]$/g, '').trim();
  if (!cleaned) return [];
  return cleaned.split(',').map((s) => s.trim().replace(/^"|"$/g, '').trim()).filter(Boolean);
}

export function vaLabel(v) {
  if (v == null) return '';
  if (v > 0.15) return '긍정적';
  if (v < -0.15) return '부정적';
  return '중립';
}
export function arLabel(v) {
  if (v == null) return '';
  if (v > 0.15) return '활발함';
  if (v < -0.15) return '차분함';
  return '보통';
}

/** 감정 분석 요청 — text/image(base64 data URL)/both */
export async function fullRecommend({ text, imageUrl }) {
  let inputType = 'text';
  if (text && imageUrl) inputType = 'both';
  else if (imageUrl) inputType = 'image';

  return api.post('/api/sync/full-recommend', {
    inputType,
    inputText: text || null,
    imageUrl: imageUrl || null,
  });
}

export function sendFeedback(historyId, val) {
  return api.patch(`/api/sync/feedback/${historyId}`, { feedback: val });
}

/** Sync 추천 트랙 응답 → 공용 트랙 객체 (PlayerContext에서 재생 가능하도록) */
export function syncTrackToApp(t, i) {
  const GRADS = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5', 'grad-6', 'grad-7', 'grad-8'];
  return {
    _id: `sync_${i}_${t.spotifyTrackId || t.name}`,
    name: t.name || '알 수 없음',
    artist: t.artist || '',
    album: t.album || '',
    albumArt: t.albumArt || null,
    previewUrl: t.previewUrl || null,
    durationMs: t.durationMs || null,
    duration: fmtMs(t.durationMs),
    spotifyId: t.spotifyTrackId || null,
    gradient: GRADS[i % GRADS.length],
    emoji: '🎵',
    source: 'sync_rec',
  };
}
