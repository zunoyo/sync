import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GENRES } from '../api/genres';
import { itunesResultToTrack, searchItunesArtists, searchItunesTracks } from '../api/itunes';
import { searchSpotifyArtistsFallback, searchSpotifyTracksFallback } from '../api/spotifyCatalog';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';

const GENRE_SAMPLE = GENRES.slice(0, 3);

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const { playTrack } = usePlayer();

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
          {GENRES.map((g, i) => {
            const gradVar = `var(--grad-${((i % 8) + 1)})`;
            return (
              <Link
                key={g.name}
                to={`/genre/${encodeURIComponent(g.name)}`}
                className={`genre-chip ${g.bg ? '' : g.grad}`}
                style={g.bg ? { background: g.bg } : { background: gradVar }}
              >
                <span className="genre-chip-label" style={g.darkLabel ? { color: '#333' } : undefined}>{g.name}</span>
                <span className="genre-chip-emoji">{g.emoji}</span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  if (tracks === null && !error) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>🔍 검색 중...</div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>검색 중 오류가 발생했어요.</div>
    );
  }

  if (tracks && tracks.length === 0 && artists.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
        <div style={{ color: 'var(--text-secondary)' }}>"{query}"에 대한 결과가 없어요</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>다른 검색어를 입력해보세요</div>
      </div>
    );
  }

  const bestTrack = tracks?.[0] ?? null;
  const restTracks = tracks?.slice(1) ?? [];

  return (
    <div>
      <div className="search-head">
        <div className="search-headline">"{query}"</div>
        <div className="search-sub"><b>{tracks?.length ?? 0}곡</b>{artists.length > 0 ? ` · 아티스트 ${artists.length}명` : ''}</div>
      </div>

      {(bestTrack || artists.length > 0) && (
        <div className="search-bento">
          {bestTrack && (
            <div className="best-match">
              <div className="tag">베스트 매치</div>
              <div className="best-match-row">
                <div className="best-match-art">
                  {bestTrack.albumArt
                    ? <img src={bestTrack.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 40 }}>🎵</span>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="best-match-title">{bestTrack.name}</div>
                  <div className="best-match-artist">{bestTrack.artist}</div>
                  <div className="best-match-type">곡</div>
                </div>
                <button className="best-match-play" onClick={() => playTrack(bestTrack, tracks)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </button>
              </div>
            </div>
          )}
          {artists.length > 0 && (
            <div className="rail-card">
              <div className="rail-title">아티스트</div>
              {artists.map((a) => (
                <ArtistMini key={a.id || a.name} artist={a} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="search-lower">
        <div>
          {restTracks.length > 0 && (
            <>
              <div className="track-col-title">곡</div>
              <div className="track-list">
                {restTracks.map((t, i) => <TrackRow key={t._id} track={t} index={i + 1} queue={tracks} />)}
              </div>
            </>
          )}
        </div>
        <div>
          <div className="track-col-title">관련 장르</div>
          <div className="genre-cluster">
            {GENRE_SAMPLE.map((g, i) => (
              <Link
                key={g.name}
                to={`/genre/${encodeURIComponent(g.name)}`}
                className={`genre-tile${i === 0 ? ' big' : ''} ${g.bg ? '' : g.grad}`}
                style={g.bg ? { background: g.bg } : undefined}
              >
                <span className="genre-tile-label">{g.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtistMini({ artist }) {
  const [img, setImg] = useState(artist.image || null);

  useEffect(() => {
    if (artist.image || img) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/itunes-api/search?term=${encodeURIComponent(artist.name)}&media=music&entity=song&limit=1`, { cache: 'no-store' });
        const data = await res.json();
        const art = data.results?.[0]?.artworkUrl100?.replace('100x100bb', '200x200bb');
        if (art && !cancelled) setImg(art);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [artist]);

  const initials = artist.name.slice(0, 2).toUpperCase();

  return (
    <Link to={`/artist/${encodeURIComponent(artist.name)}`} className="artist-mini">
      <div className="artist-mini-av">
        {img
          ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials}
      </div>
      <div>
        <div className="artist-mini-name">{artist.name}</div>
        <div className="artist-mini-role">아티스트</div>
      </div>
    </Link>
  );
}
