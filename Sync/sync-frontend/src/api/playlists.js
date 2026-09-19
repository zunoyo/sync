import { api } from './client';

const GRADS = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5', 'grad-6', 'grad-7', 'grad-8'];
const EMOJIS = ['🎵', '🎸', '🎤', '💜', '🔥', '🌙', '⭐', '🎧', '🚗', '💎', '🌊', '👑'];

function hashPick(seed, arr) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return arr[h % arr.length];
}
export function plGradient(pl) { return pl.gradient || hashPick('g' + pl.id, GRADS); }
export function plEmoji(pl) { return pl.emoji || hashPick('e' + pl.id, EMOJIS); }

/**
 * 다양한 트랙 객체(iTunes 검색 결과, 차트 등) → PlaylistTrackDTO 매핑.
 * DB(playlist_track)는 spotify_track_id/name/artist_name 이 NOT NULL이라
 * 진짜 Spotify ID가 없는 트랙은 안정적인 대체 ID를 채워서 보낸다.
 */
export function trackToDTO(track) {
  const name = track.name || track.trackName || '제목 없음';
  const artist = track.artist || track.artistName || '아티스트 미상';
  const rawId = track.spotifyId || track._id || `${name}|${artist}`;
  const fallbackId = 'ext_' + String(rawId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 90);

  return {
    spotifyTrackId: track.spotifyId || fallbackId,
    spotifyTrackName: name,
    spotifyArtistName: artist,
    spotifyAlbumName: track.album || null,
    spotifyAlbumArtUrl: track.albumArt || null,
    spotifyPreviewUrl: track.previewUrl || null,
    spotifyDurationMs: track.durationMs || null,
    lastfmTrackName: name,
    lastfmArtistName: artist,
  };
}

/** 서버 트랙 응답(PlaylistTrackEntity) → 앱 공용 트랙 객체 */
export function serverTrackToApp(t, i) {
  const durationMs = t.spotifyDurationMs || 0;
  return {
    _id: t.id,
    trackDbId: t.id,
    name: t.spotifyTrackName || t.lastfmTrackName,
    artist: t.spotifyArtistName || t.lastfmArtistName,
    album: t.spotifyAlbumName || '',
    albumArt: t.spotifyAlbumArtUrl || null,
    durationMs,
    duration: durationMs
      ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}`
      : '—',
    previewUrl: t.spotifyPreviewUrl || null,
    spotifyId: t.spotifyTrackId || null,
    gradient: GRADS[i % GRADS.length],
    emoji: EMOJIS[i % EMOJIS.length],
  };
}

export function fetchPlaylists() { return api.get('/api/playlists'); }
export function fetchPlaylist(id) { return api.get(`/api/playlists/${id}`); }
export function fetchPlaylistTracks(id) { return api.get(`/api/playlists/${id}/tracks`); }

export function createPlaylist({ playlistName, emoji, gradient }) {
  // PlaylistDTO의 boolean isPublic 필드는 Lombok이 setPublic()으로 세터를 만들어서
  // Jackson이 실제로 바인딩하는 JSON 키는 "isPublic"이 아니라 "public"이다.
  return api.post('/api/playlists', { playlistName, public: false, source: 'user_created', emoji, gradient });
}

export function deletePlaylist(id) { return api.delete(`/api/playlists/${id}`); }

export function addTrackToPlaylist(playlistId, track) {
  return api.post(`/api/playlists/${playlistId}/tracks`, trackToDTO(track));
}

export function removeTrack(trackDbId) { return api.delete(`/api/playlists/tracks/${trackDbId}`); }

export function updateVisibility(id, isPublic) {
  return api.patch(`/api/playlists/${id}/visibility`, { public: isPublic });
}

export function toggleLike(track) { return api.post('/api/playlists/liked/toggle', trackToDTO(track)); }

export const RANDOM_GRADIENT = () => GRADS[Math.floor(Math.random() * GRADS.length)];
export { GRADS as PLAYLIST_GRADS, EMOJIS as PLAYLIST_EMOJIS };
