import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GENRES } from '../api/genres';
import { hiResArt, itunesResultToTrack, searchItunesArtists, searchItunesTracks } from '../api/itunes';
import { searchSpotifyArtistsFallback, searchSpotifyTracksFallback } from '../api/spotifyCatalog';
import { usePlayer } from '../context/PlayerContext';
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

  if (tracks === null && !error) {
    return (
      <div>
        <div style={{ padding: '24px 0 8px', fontSize: 22, fontWeight: 700, color: '#fff' }}>검색 결과</div>
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>🔍 검색 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>검색 중 오류가 발생했어요.</div>
    );
  }

  if (tracks.length === 0 && artists.length === 0) {
    return (
      <div>
        <div style={{ padding: '24px 0 8px', fontSize: 22, fontWeight: 700, color: '#fff' }}>검색 결과</div>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
          <div style={{ color: 'var(--text-secondary)' }}>"{query}"에 대한 결과가 없어요</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>다른 검색어를 입력해보세요</div>
        </div>
      </div>
    );
  }

  const bestMatch = tracks[0] || null;
  const restTracks = tracks.slice(1);

  return (
    <div>
      <div className="search-head">
        <div className="search-headline">"{query}"</div>
        <div className="search-sub"><b>{tracks.length}곡</b>{artists.length ? ` · 아티스트 ${artists.length}명` : ''}</div>
      </div>

      {(bestMatch || artists.length > 0) && (
        <div className="search-bento">
          {bestMatch && <BestMatch track={bestMatch} queue={tracks} />}
          {artists.length > 0 && <ArtistRail artists={artists} />}
        </div>
      )}

      <div className="search-lower">
        {restTracks.length > 0 && (
          <>
            <div className="track-col-title">곡</div>
            <div className="track-list has-art">
              {restTracks.map((t, i) => <TrackRow key={t._id} track={t} index={i + 1} queue={tracks} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BestMatch({ track, queue }) {
  const { playTrack } = usePlayer();
  return (
    <div className="best-match">
      <div className="tag">베스트 매치</div>
      <div className="best-match-row">
        <div className="best-match-art">
          {track.albumArt
            ? <img src={track.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
            : <span style={{ fontSize: 40 }}>{track.emoji || '🎵'}</span>}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="best-match-title">{track.name}</div>
          <div className="best-match-artist">{track.artist}</div>
          <div className="best-match-type">곡</div>
        </div>
        <button className="best-match-play" onClick={() => playTrack(track, queue)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
      </div>
    </div>
  );
}

function ArtistRail({ artists }) {
  const [images, setImages] = useState({});

  useEffect(() => {
    let cancelled = false;
    artists.forEach(async (a) => {
      if (a.image) return; // 이미 이미지가 있으면(Spotify 폴백) iTunes 재조회 생략
      try {
        const res = await fetch(`/api/itunes-proxy/search?term=${encodeURIComponent(a.name)}&media=music&entity=song&limit=1`, { cache: 'no-store' });
        const data = await res.json();
        const art = hiResArt(data.results?.[0]?.artworkUrl100, 200);
        if (art && !cancelled) setImages((prev) => ({ ...prev, [a.name]: art }));
      } catch {
        // 이미지 보강 실패는 무시 — 기본 이니셜로 표시됨
      }
    });
    return () => { cancelled = true; };
  }, [artists]);

  return (
    <div className="rail-card">
      <div className="rail-title">아티스트</div>
      {artists.map((a) => {
        const img = images[a.name] || a.image;
        const initials = String(a.name).slice(0, 2).toUpperCase();
        return (
          <Link key={a.id || a.name} to={`/artist/${encodeURIComponent(a.name)}`} className="artist-mini">
            <div className="artist-mini-av">
              {img
                ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                : initials}
            </div>
            <div>
              <div className="artist-mini-name">{a.name}</div>
              <div className="artist-mini-role">아티스트</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
