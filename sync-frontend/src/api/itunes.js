const GRADIENTS = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5', 'grad-6', 'grad-7', 'grad-8'];
const EMOJIS = ['🎵', '🎸', '🎤', '💜', '🔥', '🌙', '⭐', '🎧', '🚗', '💎'];

export function gradFor(i) { return GRADIENTS[i % GRADIENTS.length]; }
export function emojiFor(i) { return EMOJIS[i % EMOJIS.length]; }

export function fmtMs(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 곡 하나를 iTunes Search API로 검색 (브라우저에서 직접 호출, 서버 불필요)
    네트워크가 느리거나 iTunes 접속이 안 될 때 무한 대기하지 않도록 4초 타임아웃 */
export async function fetchItunesTrack(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/itunes-api/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`, { signal: controller.signal, cache: 'no-store' });
    const data = await res.json();
    if (!data.results?.length) return null;
    const item = data.results[0];
    return {
      albumArt: item.artworkUrl100?.replace('100x100bb', '500x500bb') || null,
      durationMs: item.trackTimeMillis || null,
      previewUrl: item.previewUrl || null,
      albumName: item.collectionName || '',
      trackName: item.trackName || '',
      artistName: item.artistName || '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** iTunes 곡 검색 결과 원본 → 트랙 객체 (검색/장르 페이지 공용) */
export function itunesResultToTrack(r, i) {
  return {
    _id: 'it_' + r.trackId,
    name: r.trackName || '알 수 없는 곡',
    artist: r.artistName || '',
    album: r.collectionName || '',
    albumArt: r.artworkUrl100?.replace('100x100bb', '500x500bb') || null,
    durationMs: r.trackTimeMillis || 0,
    duration: fmtMs(r.trackTimeMillis),
    previewUrl: r.previewUrl || null,
    primaryGenreName: r.primaryGenreName || '',
    gradient: gradFor(i),
    emoji: emojiFor(i),
  };
}

/** 곡 검색 (여러 곡, 검색/장르 페이지 공용) */
export async function searchItunesTracks(term, limit = 20) {
  try {
    const res = await fetch(`/itunes-api/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}`, { cache: 'no-store' });
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/** 아티스트 검색 */
export async function searchItunesArtists(term, limit = 6) {
  try {
    const res = await fetch(`/itunes-api/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=${limit}`, { cache: 'no-store' });
    const data = await res.json();
    return (data.results || []).filter((r) => r.artistName).map((r) => ({ name: r.artistName, id: r.artistId }));
  } catch {
    return [];
  }
}

export function normalizeTrack(raw, idx) {
  return {
    _id: raw.spotifyId || raw.id || `t_${idx}_${raw.name}`,
    name: raw.name || '알 수 없는 곡',
    artist: raw.artist || '알 수 없는 아티스트',
    album: raw.album || raw.albumName || '',
    albumArt: raw.albumArt || null,
    spotifyId: raw.spotifyId || raw.id || null,
    previewUrl: raw.previewUrl || null,
    durationMs: raw.durationMs || null,
    duration: fmtMs(raw.durationMs),
    emoji: emojiFor(idx),
    gradient: gradFor(idx),
  };
}
