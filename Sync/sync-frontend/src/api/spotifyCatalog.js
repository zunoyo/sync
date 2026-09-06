import { api } from './client';
import { gradFor, emojiFor, fmtMs } from './itunes';

/** 백엔드가 이미 정규화해서 주는 트랙 객체에 프론트 전용 표시값(그라디언트/이모지/시간포맷)만 덧붙임 */
function normalizeSpotifyTrack(t, i) {
  return {
    _id: t._id || `sp_${t.spotifyId || i}`,
    name: t.name || '알 수 없는 곡',
    artist: t.artist || '',
    album: t.album || '',
    albumArt: t.albumArt || null,
    durationMs: t.durationMs || 0,
    duration: t.duration || fmtMs(t.durationMs),
    previewUrl: t.previewUrl || null,
    spotifyId: t.spotifyId || null,
    gradient: gradFor(i),
    emoji: emojiFor(i),
  };
}

/** 트랙 검색 폴백 — iTunes 검색 결과가 0건일 때만 호출 */
export async function searchSpotifyTracksFallback(q, limit = 20) {
  try {
    const data = await api.get(`/api/spotify/catalog/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    return (data?.tracks || []).map(normalizeSpotifyTrack);
  } catch {
    return [];
  }
}

/** 아티스트 검색 폴백 — iTunes 검색 결과가 0건일 때만 호출 */
export async function searchSpotifyArtistsFallback(q, limit = 6) {
  try {
    const data = await api.get(`/api/spotify/catalog/search-artists?q=${encodeURIComponent(q)}&limit=${limit}`);
    return (data?.artists || []).filter((a) => a.name).map((a) => ({ name: a.name, id: a.id, image: a.image }));
  } catch {
    return [];
  }
}

/** 아티스트 상세(앨범+트랙) 폴백 — iTunes에서 아무것도 못 찾았을 때만 호출 */
export async function fetchArtistDetailFromSpotify(artistName) {
  try {
    const data = await api.get(`/api/spotify/catalog/artist-detail?name=${encodeURIComponent(artistName)}`);
    if (!data) return null;
    const albums = (data.albums || []).map((a) => ({
      ...a,
      tracks: (a.tracks || []).map((t, i) => normalizeSpotifyTrack(t, i)),
    }));
    return {
      image: data.image || null,
      externalId: data.externalId || null,
      bio: null,
      albums,
      flatTracks: albums.flatMap((a) => a.tracks),
    };
  } catch {
    return null;
  }
}

/** 앨범 상세 폴백 — iTunes에서 못 찾았을 때만 호출 */
export async function fetchAlbumDetailFromSpotify(artistName, albumName) {
  try {
    const data = await api.get(
      `/api/spotify/catalog/album-detail?artistName=${encodeURIComponent(artistName)}&albumName=${encodeURIComponent(albumName)}`
    );
    if (!data || !data.tracks?.length) return null;
    return {
      albumName: data.albumName || albumName,
      artistName: data.artistName || artistName,
      albumArt: data.albumArt || null,
      releaseYear: data.releaseYear || null,
      tracks: data.tracks.map((t, i) => normalizeSpotifyTrack(t, i)),
    };
  } catch {
    return null;
  }
}
