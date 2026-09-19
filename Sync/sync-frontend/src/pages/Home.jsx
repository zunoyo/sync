import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { fetchItunesTrack, normalizeTrack } from '../api/itunes';
import { plGradient, plEmoji, toggleLike as toggleLikeApi } from '../api/playlists';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useToast } from '../context/ToastContext';
import { useGalaxyView } from '../context/GalaxyViewContext';
import GalaxyView from '../components/GalaxyView';

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

/** 서버 원본(name/artist) 목록 → 정규화 트랙 + iTunes 앨범아트/미리듣기 보강 (차트/장르 추천 공용)
 *  isCancelled()가 true를 반환하면(선택이 바뀌어 이 요청이 이미 낡은 상태) 마지막 setTracks를 건너뛴다 —
 *  그렇지 않으면 느리게 끝난 이전 국가/장르의 보강 결과가 방금 선택한 새 국가/장르 화면을 덮어쓸 수 있다. */
async function loadAndEnrichTracks(raw, setTracks, setLoading, isCancelled) {
  const tracks = (raw || []).map((t, i) => normalizeTrack(t, i));
  if (isCancelled()) return;
  setTracks(tracks);
  setLoading(false);

  const needsArt = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt);
  if (needsArt.length === 0) return;
  const results = await Promise.all(needsArt.map(({ t }) => fetchItunesTrack(`${t.name} ${t.artist}`)));
  if (isCancelled()) return;
  const updated = [...tracks];
  needsArt.forEach(({ i }, ri) => {
    const it = results[ri];
    if (!it) return;
    updated[i] = { ...updated[i], albumArt: it.albumArt || updated[i].albumArt, previewUrl: updated[i].previewUrl || it.previewUrl };
  });
  setTracks(updated);
}

export default function Home() {
  const { isLoggedIn } = useAuth();
  const { playTrack } = usePlayer();

  const [quickAccess, setQuickAccess] = useState(null); // null = 기본 정적 카드 표시
  const [newReleases, setNewReleases] = useState(null);
  const [artists, setArtists] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const { galaxyOpen, setGalaxyOpen } = useGalaxyView();

  // 홈 화면을 벗어나면(라우트 이동으로 언마운트되면) 갤럭시 뷰 상태도 초기화 —
  // 상태가 Topbar와 공유되도록 라우트보다 위에 있어서, 안 그러면 다른 페이지 갔다가
  // 다시 홈에 왔을 때 갤럭시 뷰가 열려있던 상태로 남아있게 된다.
  useEffect(() => () => setGalaxyOpen(false), [setGalaxyOpen]);

  // 나라별 TOP 차트 + 지금 인기있는 아티스트 (국가 탭 하나를 공유)
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countryChart, setCountryChart] = useState(null);
  const [countryChartLoading, setCountryChartLoading] = useState(true);
  const [trendingArtists, setTrendingArtists] = useState(null);
  const [trendingArtistImages, setTrendingArtistImages] = useState({});

  // 장르별 추천
  const [genreTags, setGenreTags] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreTracks, setGenreTracks] = useState(null);
  const [genreTracksLoading, setGenreTracksLoading] = useState(true);

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

  // 나라별 TOP 차트 — 국가 목록 로드 후 첫 번째 국가를 기본 선택
  useEffect(() => {
    let cancelled = false;
    api.get('/api/home/countries')
      .then((list) => {
        if (cancelled || !Array.isArray(list) || !list.length) return;
        setCountries(list);
        setSelectedCountry(list[0].code);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 선택한 국가가 바뀔 때마다 그 나라의 차트 + 인기 아티스트를 함께 갱신
  useEffect(() => {
    if (!selectedCountry) return;
    let cancelled = false;

    setCountryChartLoading(true);
    api.get(`/api/home/charts/country?country=${encodeURIComponent(selectedCountry)}`)
      .then((raw) => loadAndEnrichTracks(raw, setCountryChart, setCountryChartLoading, () => cancelled))
      .catch(() => { if (!cancelled) { setCountryChart([]); setCountryChartLoading(false); } });

    setTrendingArtists(null);
    setTrendingArtistImages({});
    api.get(`/api/home/artists/trending?country=${encodeURIComponent(selectedCountry)}`)
      .then((list) => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setTrendingArtists(arr);
        arr.forEach(async (a) => {
          const it = await fetchItunesTrack(a.name);
          if (!cancelled && it?.albumArt) {
            setTrendingArtistImages((prev) => ({ ...prev, [a.name]: it.albumArt }));
          }
        });
      })
      .catch(() => { if (!cancelled) setTrendingArtists([]); });

    return () => { cancelled = true; };
  }, [selectedCountry]);

  // 장르별 추천 — 장르 목록 로드 후 첫 번째 장르를 기본 선택
  useEffect(() => {
    let cancelled = false;
    api.get('/api/home/genres')
      .then((list) => {
        if (cancelled || !Array.isArray(list) || !list.length) return;
        setGenreTags(list);
        setSelectedGenre(list[0].tag);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 선택한 장르가 바뀔 때마다 추천 트랙 갱신
  useEffect(() => {
    if (!selectedGenre) return;
    let cancelled = false;
    setGenreTracksLoading(true);
    api.get(`/api/home/genre-tracks?genre=${encodeURIComponent(selectedGenre)}`)
      .then((raw) => loadAndEnrichTracks(raw, setGenreTracks, setGenreTracksLoading, () => cancelled))
      .catch(() => { if (!cancelled) { setGenreTracks([]); setGenreTracksLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedGenre]);

  const heroTrack = chart && chart.length ? chart[0] : null;

  return (
    <>
      {galaxyOpen && (
        <GalaxyView
          onExit={() => setGalaxyOpen(false)}
          chartTracks={chart}
          artists={artists}
          artistImages={artistImages}
        />
      )}

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
            {heroTrack ? <><span>{heroTrack.artist}</span> · 글로벌 차트 #1</> : <><span>SYNC</span> 팀 선정</>}
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
        <div className="cards-shelf" id="home-new-releases">
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
        <div className="cards-shelf artist-grid">
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
        <div className="chart-list" id="track-list">
          {chartLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>차트 불러오는 중...</div>}
          {!chartLoading && chart && chart.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>차트를 불러올 수 없어요.</div>}
          {!chartLoading && chart && chart.map((t, i) => (
            <ChartRow key={t._id} track={t} index={i} queue={chart} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title">🌍 나라별 TOP 차트</h2></div>
        <div className="home-tab-row">
          {countries.map((c) => (
            <button
              key={c.code}
              className={`filter-pill ${selectedCountry === c.code ? 'active' : ''}`}
              onClick={() => setSelectedCountry(c.code)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="chart-list">
          {countryChartLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>}
          {!countryChartLoading && countryChart && countryChart.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>이 나라의 차트를 불러올 수 없어요.</div>}
          {!countryChartLoading && countryChart && countryChart.map((t, i) => (
            <ChartRow key={t._id} track={t} index={i} queue={countryChart} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title">✨ 지금 인기있는 아티스트</h2></div>
        <div className="cards-shelf artist-grid">
          {trendingArtists === null && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>}
          {trendingArtists && trendingArtists.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>표시할 아티스트가 없어요.</div>}
          {trendingArtists && trendingArtists.map((a, i) => (
            <Link className="card artist" key={a.name} to={`/artist/${encodeURIComponent(a.name)}`} state={{ externalId: a.externalId }} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card-art">
                {trendingArtistImages[a.name]
                  ? <img src={trendingArtistImages[a.name]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  : <div className={`card-art-inner ${ARTIST_GRADS[i % ARTIST_GRADS.length]}`}>{ARTIST_EMOJIS[i % ARTIST_EMOJIS.length]}</div>}
              </div>
              <div className="card-title">{a.name}</div>
              <div className="card-subtitle">아티스트</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title">🎼 장르별 추천</h2></div>
        <div className="home-tab-row">
          {genreTags.map((g) => (
            <button
              key={g.tag}
              className={`filter-pill ${selectedGenre === g.tag ? 'active' : ''}`}
              onClick={() => setSelectedGenre(g.tag)}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>
        <div className="chart-list">
          {genreTracksLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>}
          {!genreTracksLoading && genreTracks && genreTracks.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>추천할 곡을 찾지 못했어요.</div>}
          {!genreTracksLoading && genreTracks && genreTracks.map((t, i) => (
            <ChartRow key={t._id} track={t} index={i} queue={genreTracks} />
          ))}
        </div>
      </div>
    </>
  );
}

/** 홈 인기 차트 한 줄 — 순위, 재생, 플레이리스트 추가, 좋아요 */
function ChartRow({ track, index, queue }) {
  const { playTrack } = usePlayer();
  const { openPicker, invalidateCache } = usePlaylistPicker();
  const { isLoggedIn } = useAuth();
  const showToast = useToast();
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleAdd(e) {
    e.stopPropagation();
    openPicker(track, e.currentTarget);
  }

  async function handleLike(e) {
    e.stopPropagation();
    if (!isLoggedIn) { showToast('로그인이 필요해요'); return; }
    setBusy(true);
    try {
      const result = await toggleLikeApi(track);
      setLiked(result.liked);
      showToast(result.liked ? `'${result.playlistName}'에 저장했어요` : `'${result.playlistName}'에서 제거했어요`);
      invalidateCache();
    } catch {
      showToast('처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chart-row" onClick={() => playTrack(track, queue)}>
      <span className="chart-rank">{index + 1}</span>
      <div className="chart-thumb">
        {track.albumArt && (
          <img src={track.albumArt} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
        )}
      </div>
      <div className="chart-info">
        <div className="chart-title">{track.name}</div>
        <div className="chart-artist">{track.artist}</div>
      </div>
      <div className="chart-actions">
        <button className="chart-add-btn" title="플레이리스트에 추가" onClick={handleAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        </button>
        <button className="chart-like-btn" title="좋아요" disabled={busy} onClick={handleLike} style={liked ? { color: 'var(--accent)' } : undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
        </button>
      </div>
      <button className="chart-play" onClick={(e) => { e.stopPropagation(); playTrack(track, queue); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </button>
    </div>
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
