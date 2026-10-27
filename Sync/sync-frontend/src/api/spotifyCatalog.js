import { api } from './client';
import { gradFor, emojiFor, fmtMs, hiResArt } from './itunes';

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

/** 장르별 곡 폴백 — iTunes가 막혀 결과가 없을 때 장르 화면에서 호출 */
export async function fetchSpotifyGenreTracks(name, q, limit = 20) {
  try {
    const data = await api.get(`/api/spotify/catalog/genre?name=${encodeURIComponent(name)}&q=${encodeURIComponent(q || name)}&limit=${limit}`);
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

/* ── 아티스트 사진 ────────────────────────────────────────
   예전에는 "아티스트 이름으로 검색한 첫 곡의 앨범아트"를 썼는데, 다른 가수의 곡이 걸리면
   (예: Lady Gaga → 엉뚱한 커버 곡) 사진이 틀렸다. Spotify 아티스트 사진을 이름이 일치할 때만 쓰고,
   없으면 iTunes 결과도 아티스트명이 일치할 때만 쓴다. 못 찾으면 null(이모지 카드로 표시). */
const _photoCache = new Map();
const _akey = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]/gu, '');

export function fetchArtistPhoto(name, externalId) {
  if (!name) return Promise.resolve(null);
  const ck = `${name}|${externalId || ''}`;
  if (_photoCache.has(ck)) return _photoCache.get(ck);
  const p = (async () => {
    const want = _akey(name);
    if (!want) return null;
    // ① iTunes artistId 를 알면(국가별 차트) 그 아티스트의 앨범을 바로 조회 — 가장 정확하다
    if (externalId) {
      try {
        const r = await fetch(`/api/itunes-proxy/lookup?id=${encodeURIComponent(externalId)}&entity=album&limit=5`, { cache: 'no-store' });
        const alb = ((await r.json()).results || []).find((x) => x.artworkUrl100);
        if (alb) return hiResArt(alb.artworkUrl100, 500);
      } catch { /* 다음 단계 */ }
    }
    const list = await searchSpotifyArtistsFallback(name, 5);
    const exact = list.find((a) => a.image && _akey(a.name) === want);
    if (exact) return exact.image;
    const loose = list.find((a) => {
      const k = _akey(a.name);
      return a.image && Math.min(k.length, want.length) >= 3 && (k.includes(want) || want.includes(k));
    });
    if (loose) return loose.image;
    // iTunes 곡 검색은 제목이 겹치는 다른 가수의 곡이 먼저 나올 수 있어서(예: 튜이드),
    // 100건을 받아 그 중 (아티스트 상세 페이지와 같은 방식) 아티스트명이 일치하는 첫 곡의 앨범아트를 쓴다.
    try {
      const res = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(name)}&media=music&entity=song&limit=100`, { cache: 'no-store' });
      const data = await res.json();
      const hit = (data.results || []).find((r) => {
        const ik = _akey(r.artistName);
        return r.artworkUrl100 && ik && (ik === want || ik.startsWith(want));
      });
      if (hit) return hiResArt(hit.artworkUrl100, 500);
    } catch { /* 무시 */ }
    return null;
  })();
  _photoCache.set(ck, p);
  return p;
}
