import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { fetchItunesTrack, normalizeTrack } from '../api/itunes';
import { plGradient, plEmoji } from '../api/playlists';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';

// 인기 아티스트 카드용 (원본 home.js loadArtists()와 동일한 배열)
const ARTIST_EMOJIS = ['🎤', '🎸', '💜', '🔥', '🌸', '⭐'];
const ARTIST_GRADS = ['grad-4', 'grad-3', 'grad-6', 'grad-1', 'grad-7', 'grad-5'];

const GENRES = [
  { genre: 'K-Pop', query: 'kpop 2024', emoji: '🎤', grad: 'grad-1' },
  { genre: '인디', query: 'korean indie 2024', emoji: '🎸', grad: 'grad-3' },
  { genre: '힙합', query: 'hip hop 2024', emoji: '🎧', grad: 'grad-4' },
  { genre: 'Lo-Fi', query: 'lofi chill', emoji: '🌙', grad: 'grad-2' },
  { genre: 'R&B', query: 'rnb soul 2024', emoji: '💜', grad: 'grad-6' },
  { genre: '팝', query: 'pop hits 2024', emoji: '⭐', grad: 'grad-5' },
];

export default function Home() {
  const { isLoggedIn } = useAuth();
  const { playTrack } = usePlayer();

  const [quickAccess, setQuickAccess] = useState(null); // null = 기본 정적 카드 표시
  const [newReleases, setNewReleases] = useState(null);
  const [artists, setArtists] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);

  // 빠른 액세스
  useEffect(() => {
    if (!isLoggedIn) { setQuickAccess(null); return; }
    api.get('/api/home/quick-access')
      .then((data) => setQuickAccess(Array.isArray(data) && data.length ? data.slice(0, 6) : null))
      .catch(() => setQuickAccess(null));
  }, [isLoggedIn]);

  // 오늘의 추천 (iTunes 직접 호출)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(GENRES.map((g) => fetchItunesTrack(g.query)));
      if (cancelled) return;
      setNewReleases(GENRES.map((g, i) => ({ g, it: results[i] })));
    })();
    return () => { cancelled = true; };
  }, []);

  // 인기 아티스트
  const [artistImages, setArtistImages] = useState({});
  useEffect(() => {
    let cancelled = false;
    api.get('/api/home/artists')
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setArtists(list);
        // iTunes로 아티스트 이미지 보강 (비동기)
        list.forEach(async (a) => {
          const it = await fetchItunesTrack(a.name);
          if (!cancelled && it?.albumArt) {
            setArtistImages((prev) => ({ ...prev, [a.name]: it.albumArt }));
          }
        });
      })
      .catch(() => { if (!cancelled) setArtists([]); });
    return () => { cancelled = true; };
  }, []);

  // 인기 차트 TOP 10
  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    api.get('/api/home/charts')
      .then(async (raw) => {
        if (!raw?.length) { if (!cancelled) { setChart([]); setChartLoading(false); } return; }
        const tracks = raw.map((t, i) => normalizeTrack(t, i));
        if (!cancelled) { setChart(tracks); setChartLoading(false); }

        // albumArt 없는 트랙 iTunes로 보강
        const needsArt = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt);
        if (needsArt.length) {
          const results = await Promise.all(needsArt.map(({ t }) => fetchItunesTrack(`${t.name} ${t.artist}`)));
          if (cancelled) return;
          const updated = [...tracks];
          needsArt.forEach(({ i }, ri) => {
            const it = results[ri];
            if (!it) return;
            updated[i] = {
              ...updated[i],
              albumArt: it.albumArt || updated[i].albumArt,
              previewUrl: updated[i].previewUrl || it.previewUrl,
              album: updated[i].album || it.albumName,
            };
          });
          setChart(updated);
        }
      })
      .catch(() => { if (!cancelled) { setChart([]); setChartLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const heroTrack = chart && chart.length ? chart[0] : null;

  return (
    <>
      <div className="tabs">
        <button className="tab-btn active">전체</button>
        <button className="tab-btn">음악</button>
        <button className="tab-btn">팟캐스트</button>
      </div>

      <div className="quick-grid">
        {(quickAccess ?? DEFAULT_QUICK).map((item, i) => (
          <QuickItem key={item.id ?? i} item={item} isReal={!!quickAccess} />
        ))}
      </div>

      <div className="hero-banner">
        <div className="hero-art">
          {heroTrack?.albumArt
            ? <img src={heroTrack.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
            : (heroTrack?.emoji || '🎵')}
        </div>
        <div className="hero-info">
          <div className="hero-type">추천 플레이리스트</div>
          <div className="hero-title">{heroTrack ? heroTrack.name : <>오늘의<br />신곡 레이더</>}</div>
          <div className="hero-meta">
            {heroTrack ? <><span>{heroTrack.artist}</span> · 글로벌 차트 #1</> : <><span>SoundWave</span> 팀 선정</>}
          </div>
          <div className="hero-actions">
            <button className="play-btn-large" onClick={() => heroTrack && playTrack(heroTrack, chart)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button className="action-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
            </button>
            <button className="action-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title">오늘의 추천</h2><button className="section-more">모두 보기</button></div>
        <div className="cards-grid" id="home-new-releases">
          {!newReleases && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>추천 불러오는 중...</div>}
          {newReleases && newReleases.map(({ g, it }, i) => {
            const track = normalizeTrack({
              name: it?.trackName || g.genre,
              artist: it?.artistName || '',
              albumArt: it?.albumArt || null,
              albumName: it?.albumName || '',
              previewUrl: it?.previewUrl || null,
              durationMs: it?.durationMs || null,
            }, i);
            const allTracks = newReleases.map(({ g: gg, it: itt }, ii) => normalizeTrack({
              name: itt?.trackName || gg.genre, artist: itt?.artistName || '', albumArt: itt?.albumArt || null,
              previewUrl: itt?.previewUrl || null, durationMs: itt?.durationMs || null,
            }, ii));
            return (
              <div className="card" key={g.genre} onClick={() => playTrack(track, allTracks)}>
                <div className="card-art">
                  {it?.albumArt
                    ? <img src={it.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
                    : <div className={`card-art-inner ${g.grad}`}>{g.emoji}</div>}
                  <button className="card-play" onClick={(e) => { e.stopPropagation(); playTrack(track, allTracks); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </button>
                </div>
                <div className="card-title">{g.genre} · {(it?.trackName || g.genre).slice(0, 18)}</div>
                <div className="card-subtitle">{it?.artistName || '음악'}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title">인기 아티스트</h2><button className="section-more">모두 보기</button></div>
        <div className="cards-grid artist-grid">
          {artists === null && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>}
          {artists && artists.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>표시할 아티스트가 없어요.</div>}
          {artists && artists.map((a, i) => (
            <Link className="card artist" key={a.name} to={`/artist/${encodeURIComponent(a.name)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card-art">
                {artistImages[a.name]
                  ? <img src={artistImages[a.name]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  : <div className={`card-art-inner ${ARTIST_GRADS[i % ARTIST_GRADS.length]}`}>{ARTIST_EMOJIS[i % ARTIST_EMOJIS.length]}</div>}
              </div>
              <div className="card-title">{a.name}</div>
              <div className="card-subtitle">아티스트</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title">🔥 인기 차트 TOP 10</h2><button className="section-more">전체 차트</button></div>
        <div className="track-list" id="track-list">
          {chartLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>차트 불러오는 중...</div>}
          {!chartLoading && chart && chart.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>차트를 불러올 수 없어요.</div>}
          {!chartLoading && chart && chart.map((t, i) => (
            <TrackRow key={t._id} track={t} index={i} queue={chart} />
          ))}
        </div>
      </div>
    </>
  );
}

const DEFAULT_QUICK = [
  { id: 'liked', playlistName: '좋아요 표시한 곡', emoji: '💚', gradient: null, custom: 'liked' },
  { id: 5, playlistName: 'K-Pop 히트곡', emoji: '🎤', gradient: 'grad-4' },
  { id: 4, playlistName: 'Lo-Fi Beats', emoji: '🌊', gradient: 'grad-2' },
  { id: 3, playlistName: '드라이브 플레이리스트', emoji: '🚗', gradient: 'grad-3' },
  { id: 2, playlistName: '인디 Mix', emoji: '🎸', gradient: 'grad-1' },
];

function QuickItem({ item, isReal }) {
  const grad = isReal ? plGradient(item) : (item.gradient || 'grad-1');
  const emoji = isReal ? plEmoji(item) : (item.emoji || '🎵');
  const content = (
    <>
      <div className={`quick-art ${grad}`} style={item.custom === 'liked' ? { background: 'linear-gradient(135deg,#450af5,#c4efd9)' } : undefined}>
        {emoji}
      </div>
      <span className="quick-name">{item.playlistName}</span>
      <button className="quick-play">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </button>
    </>
  );
  return isReal
    ? <Link to={`/playlists/${item.id}`} className="quick-item" style={{ textDecoration: 'none' }}>{content}</Link>
    : <div className="quick-item">{content}</div>;
}
