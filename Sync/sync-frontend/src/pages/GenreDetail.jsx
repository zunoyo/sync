import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { GENRES, GENRE_FILTERS } from '../api/genres';
import { itunesResultToTrack, searchItunesTracks } from '../api/itunes';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';

export default function GenreDetail() {
  const { name } = useParams();
  const genreName = decodeURIComponent(name);
  const meta = GENRES.find((g) => g.name === genreName) || { emoji: '🎵', grad: 'grad-4' };
  const { playTrack } = usePlayer();

  const [tracks, setTracks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setTracks(null);
    (async () => {
      const q = meta.query || genreName;
      // 필터링으로 걸러질 곡을 감안해 후보를 넉넉히 가져온 뒤 20곡으로 추림
      let results = await searchItunesTracks(q, 50);

      const filterWords = GENRE_FILTERS[genreName];
      if (filterWords?.length) {
        const filtered = results.filter((r) => {
          const g = (r.primaryGenreName || '').toLowerCase();
          return filterWords.some((w) => g.includes(w));
        });
        if (filtered.length >= 5) results = filtered;
      }

      const list = results.slice(0, 20).map(itunesResultToTrack);
      if (!cancelled) setTracks(list);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreName]);

  const totalMin = tracks ? Math.floor(tracks.reduce((s, t) => s + t.durationMs, 0) / 60000) : 0;

  return (
    <>
      <div className={`detail-hero ${meta.grad}`}>
        <div className="detail-hero-art">{meta.emoji}</div>
        <div className="detail-hero-info">
          <div className="detail-hero-type">컬렉션</div>
          <div className="detail-hero-name">{genreName}</div>
          <div className="detail-hero-meta">
            {tracks === null ? '불러오는 중...' : `${tracks.length}곡 · ${totalMin}분`}
          </div>
          <div className="detail-hero-actions">
            <button
              className="play-btn-large"
              disabled={!tracks?.length}
              onClick={() => tracks?.length && playTrack(tracks[0], tracks)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {tracks === null && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>트랙 불러오는 중...</div>
      )}
      {tracks && tracks.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>트랙을 찾을 수 없어요</div>
      )}
      {tracks && tracks.length > 0 && (
        <div className="track-list">
          {tracks.map((t, i) => <TrackRow key={t._id} track={t} index={i} queue={tracks} />)}
        </div>
      )}
    </>
  );
}
