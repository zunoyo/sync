import { fetchArtistDetailFromSpotify, fetchAlbumDetailFromSpotify } from './spotifyCatalog';

/* 아티스트 이름 유사도 검증(Levenshtein 80% 이상) — 백엔드 MatchUtils와 동일한 기준.
   iTunes 검색은 제목/앨범 등 어디든 검색어가 들어가면 결과에 포함시키므로,
   실제로 그 아티스트의 곡이 맞는지 여기서 한 번 더 걸러야 함. */
function normalizeArtist(name) {
  const s = String(name || '').toLowerCase().trim();
  return s.startsWith('the ') ? s.slice(4) : s;
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
function artistMatches(a, b) {
  const na = normalizeArtist(a), nb = normalizeArtist(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 이름이 짧을수록 Levenshtein 비율이 부정확해짐(예: 3~4글자에서 1글자만 달라도 threshold를 넘어버림) —
  // 더 짧은 쪽이 4자 미만이면 유사도 대신 정확히 일치할 때만 인정
  if (Math.min(na.length, nb.length) < 4) return false;
  const maxLen = Math.max(na.length, nb.length);
  return (maxLen - levenshtein(na, nb)) / maxLen >= 0.80;
}

const PALETTE = ['#7B2FBE', '#1E4DA0', '#2D7A3A', '#A03020', '#1A6A7A', '#8B4513', '#5A2D8A', '#1A5A3A'];
const GRADS = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5', 'grad-6', 'grad-7', 'grad-8'];
const EMOJIS = ['🎵', '🎸', '🎤', '💜', '🔥', '🌙', '⭐', '🎧', '🚗', '💎'];

export function artistColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length];
}

const LASTFM_API_KEY = '613ca46d815b6b0b2acf0145aa03b2dd';

/** iTunes 검색 — 실패(레이트리밋 등) 시 잠깐 대기 후 한 번 더 시도, 그래도 안 되면 빈 결과 */
async function fetchItunesJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
      // 응답은 왔지만 실패(예: 429/403 레이트리밋) — 짧게 대기 후 한 번 더 시도
    } catch {
      // 네트워크 자체 실패 — 마찬가지로 재시도
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
  }
  return { results: [] };
}

/** 아티스트 상세 데이터: iTunes 곡 전체 + Last.fm 바이오, 앨범별로 그룹화해 반환 */
export async function fetchArtistDetail(artistName) {
  const [itunesData, lastfmData] = await Promise.all([
    fetchItunesJson(`/itunes-api/search?term=${encodeURIComponent(artistName)}&media=music&entity=song&limit=100`),
    fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_API_KEY}&format=json&lang=ko`)
      .then((r) => r.json()).catch(() => null),
  ]);

  // iTunes는 제목/앨범 등에 검색어가 들어가면 무조건 결과에 포함시키고, 이름이 우연히
  // 비슷해 보이는 다른 아티스트도 있을 수 있어서 — 이름 문자열 유사도보다 훨씬 확실한
  // artistId 기준으로 필터링함. 이름이 정확히 일치하는 결과의 artistId를 '진짜' 기준으로 잡고,
  // 정확히 일치하는 게 없으면 그나마 가장 비슷한 이름의 artistId를 기준으로 씀.
  const rawResults = itunesData.results || [];
  const exactNameMatch = rawResults.find((r) => normalizeArtist(r.artistName) === normalizeArtist(artistName));
  const canonicalArtistId = exactNameMatch?.artistId
    ?? rawResults.find((r) => artistMatches(artistName, r.artistName))?.artistId
    ?? null;

  const results = canonicalArtistId
    ? rawResults.filter((r) => r.artistId === canonicalArtistId)
    : rawResults.filter((r) => artistMatches(artistName, r.artistName));

  // iTunes에서 실제로 일치하는 곡을 하나도 못 찾았을 때만 Spotify 카탈로그로 보완 (한글 표기명 불일치, 레이트리밋 등 대비)
  if (results.length === 0) {
    const spotifyFallback = await fetchArtistDetailFromSpotify(artistName);
    if (spotifyFallback && spotifyFallback.flatTracks.length > 0) {
      let bio = null;
      if (lastfmData?.artist?.bio?.summary) {
        const cleaned = lastfmData.artist.bio.summary
          .replace(/<a[^>]*>.*?<\/a>/gi, '').replace(/<[^>]+>/g, '')
          .replace(/Read more on Last\.fm\.?/gi, '').trim().slice(0, 120);
        if (cleaned) bio = cleaned + (cleaned.length >= 120 ? '...' : '');
      }
      return { ...spotifyFallback, bio };
    }
  }

  const firstArt = results.find((r) => r.artworkUrl100)?.artworkUrl100;
  const image = firstArt ? firstArt.replace('100x100bb', '400x400bb') : null;
  const externalId = canonicalArtistId || results.find((r) => r.artistId)?.artistId || null;

  let bio = null;
  if (lastfmData?.artist?.bio?.summary) {
    const cleaned = lastfmData.artist.bio.summary
      .replace(/<a[^>]*>.*?<\/a>/gi, '').replace(/<[^>]+>/g, '')
      .replace(/Read more on Last\.fm\.?/gi, '').trim().slice(0, 120);
    if (cleaned) bio = cleaned + (cleaned.length >= 120 ? '...' : '');
  }

  const allTracks = results.filter((r) => r.trackName).map((r, i) => ({
    _id: 'it_' + r.trackId,
    name: r.trackName,
    artist: r.artistName,
    album: r.collectionName || '싱글',
    albumId: r.collectionId || r.artistId,
    albumArt: r.artworkUrl100?.replace('100x100bb', '500x500bb') || null,
    albumArtSm: r.artworkUrl100?.replace('100x100bb', '80x80bb') || null,
    albumCoverLg: r.artworkUrl100?.replace('100x100bb', '300x300bb') || null,
    durationMs: r.trackTimeMillis || 0,
    duration: r.trackTimeMillis
      ? `${Math.floor(r.trackTimeMillis / 60000)}:${String(Math.floor((r.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}`
      : '—',
    previewUrl: r.previewUrl || null,
    trackNumber: r.trackNumber || (i + 1),
    releaseYear: r.releaseDate ? new Date(r.releaseDate).getFullYear() : 0,
    gradient: GRADS[i % GRADS.length],
    emoji: EMOJIS[i % EMOJIS.length],
  }));

  const albumMap = {};
  for (const t of allTracks) {
    if (!albumMap[t.albumId]) {
      albumMap[t.albumId] = { id: t.albumId, name: t.album, art: t.albumCoverLg, year: t.releaseYear, artistName: t.artist, tracks: [] };
    }
    albumMap[t.albumId].tracks.push(t);
  }
  const albums = Object.values(albumMap).sort((a, b) => b.year - a.year);
  albums.forEach((a) => a.tracks.sort((x, y) => x.trackNumber - y.trackNumber));

  return { image, externalId, bio, albums, flatTracks: albums.flatMap((a) => a.tracks) };
}

/** 앨범 상세: iTunes lookup으로 앨범 메타 + 트랙 목록 가져오기.
    hintArtistName/hintAlbumName은 iTunes가 실패했을 때만 Spotify 폴백 검색에 사용됨. */
export async function fetchAlbumDetail(externalId, hintArtistName, hintAlbumName) {
  const data = await fetchItunesJson(`/itunes-api/lookup?id=${encodeURIComponent(externalId)}&entity=song`);
  const results = data.results || [];
  const collection = results.find((r) => r.wrapperType === 'collection');

  // iTunes에서 아무것도 못 찾았고, 폴백에 쓸 이름 정보가 있을 때만 Spotify로 보완
  if (results.length === 0 && hintArtistName && hintAlbumName) {
    const spotifyFallback = await fetchAlbumDetailFromSpotify(hintArtistName, hintAlbumName);
    if (spotifyFallback) return spotifyFallback;
  }

  const tracks = results
    .filter((r) => r.wrapperType === 'track')
    .map((r, i) => ({
      _id: 'it_' + r.trackId,
      name: r.trackName,
      artist: r.artistName,
      album: r.collectionName || collection?.collectionName || '',
      albumArt: (r.artworkUrl100 || collection?.artworkUrl100)?.replace('100x100bb', '500x500bb') || null,
      durationMs: r.trackTimeMillis || 0,
      duration: r.trackTimeMillis
        ? `${Math.floor(r.trackTimeMillis / 60000)}:${String(Math.floor((r.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}`
        : '—',
      previewUrl: r.previewUrl || null,
      trackNumber: r.trackNumber || (i + 1),
    }))
    .sort((a, b) => a.trackNumber - b.trackNumber);

  return {
    albumName: collection?.collectionName || tracks[0]?.album || '',
    artistName: collection?.artistName || tracks[0]?.artist || '',
    albumArt: collection?.artworkUrl100?.replace('100x100bb', '600x600bb') || tracks[0]?.albumArt || null,
    releaseYear: collection?.releaseDate ? new Date(collection.releaseDate).getFullYear() : null,
    tracks,
  };
}
