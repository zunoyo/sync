import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GENRES } from '../api/genres';
import { itunesResultToTrack, searchItunesArtists, searchItunesTracks } from '../api/itunes';
import { searchSpotifyArtistsFallback, searchSpotifyTracksFallback } from '../api/spotifyCatalog';
import TrackRow from '../components/TrackRow';

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();

  const [tracks, setTracks] = useState(null);
  const [artists, setArtists] = useState([]);
  const [error, setError] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query) {
      setTracks(null);
      setArtists([]);
      setError(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function runSearch(q) {
    setTracks(null);
    setError(false);
    try {
      const [trackResults, artistResults] = await Promise.all([
        searchItunesTracks(q, 20),
        searchItunesArtists(q, 6),
      ]);

      // iTunes에서 곡·아티스트 둘 다 하나도 못 찾았을 때만 Spotify로 보완 검색
      if (trackResults.length === 0 && artistResults.length === 0) {
        const [spotifyTracks, spotifyArtists] = await Promise.all([
          searchSpotifyTracksFallback(q, 20),
          searchSpotifyArtistsFallback(q, 6),
        ]);
        if (spotifyTracks.length > 0 || spotifyArtists.length > 0) {
          setTracks(spotifyTracks);
          setArtists(spotifyArtists);
          return;
        }
      }

      setTracks(trackResults.map(itunesResultToTrack));
      setArtists(artistResults);
    } catch {
      setError(true);
    }
  }

  if (!query) {
    return (
      <div id="search-browse">
        <h2 className="section-title" style={{ marginBottom: 24 }}>모두 둘러보기</h2>
        <div className="genre-grid">
          {GENRES.map((g) => (
            <Link key={g.name} to={`/genre/${encodeURIComponent(g.name)}`} className={`genre-chip ${g.bg ? '' : g.grad}`} style={g.bg ? { background: g.bg } : undefined}>
              <span className="genre-chip-label" style={g.darkLabel ? { color: '#333' } : undefined}>{g.name}</span>
              <span className="genre-chip-emoji">{g.emoji}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: '24px 0 8px', fontSize: 22, fontWeight: 700, color: '#fff' }}>검색 결과</div>

      {tracks === null && !error && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>🔍 검색 중...</div>
      )}

      {error && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>검색 중 오류가 발생했어요.</div>
      )}

      {tracks && !error && tracks.length === 0 && artists.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
          <div style={{ color: 'var(--text-secondary)' }}>"{query}"에 대한 결과가 없어요</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>다른 검색어를 입력해보세요</div>
        </div>
      )}

      {tracks && !error && (tracks.length > 0 || artists.length > 0) && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>"{query}"</span> · {tracks.length}곡
          </div>

          {artists.length > 0 && <ArtistRow artists={artists} />}

          {tracks.length > 0 && (
            <div className="track-list">
              {tracks.map((t, i) => <TrackRow key={t._id} track={t} index={i} queue={tracks} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ArtistRow({ artists }) {
  const [images, setImages] = useState({});

  useEffect(() => {
    let cancelled = false;
    artists.forEach(async (a) => {
      if (a.image) return; // 이미 이미지가 있으면(Spotify 폴백) iTunes 재조회 생략
      try {
        const res = await fetch(`/itunes-api/search?term=${encodeURIComponent(a.name)}&media=music&entity=song&limit=1`, { cache: 'no-store' });
        const data = await res.json();
        const art = data.results?.[0]?.artworkUrl100?.replace('100x100bb', '200x200bb');
        if (art && !cancelled) setImages((prev) => ({ ...prev, [a.name]: art }));
      } catch {
        // 이미지 보강 실패는 무시 — 기본 이모지로 표시됨
      }
    });
    return () => { cancelled = true; };
  }, [artists]);

  return (
    <>
      <div style={{ padding: '8px 0 4px', fontSize: 15, fontWeight: 700, color: '#fff' }}>아티스트</div>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12, marginBottom: 8 }}>
        {artists.map((a) => (
          <Link key={a.id || a.name} to={`/artist/${encodeURIComponent(a.name)}`} style={{ flexShrink: 0, width: 104, textAlign: 'center', textDecoration: 'none' }}>
            <div style={{
              width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
              margin: '0 auto 8px', overflow: 'hidden',
            }}>
              {(images[a.name] || a.image)
                ? <img src={images[a.name] || a.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🎤'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>아티스트</div>
          </Link>
        ))}
      </div>
    </>
  );
}
