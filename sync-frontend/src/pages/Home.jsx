import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { fetchItunesTrack, normalizeTrack } from '../api/itunes';
import { plGradient, plEmoji } from '../api/playlists';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';
import PlaylistCoverMosaic from '../components/PlaylistCoverMosaic';

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

const UNIVERSE_W = 5200;
const UNIVERSE_H = 3400;

const HUD_LABELS = [
  { wx: 2510, wy: 1560, cls: 'lbl-home', text: '지금 이 순간', sub: '당신의 무드에 맞춘 첫 화면' },
  { wx: 1600, wy: 990,  cls: 'lbl-small', text: '비 오는 날' },
  { wx: 3560, wy: 1060, cls: 'lbl-small', text: '드라이브' },
  { wx: 1560, wy: 2200, cls: 'lbl-small', text: '집중할 때' },
  { wx: 3630, wy: 2200, cls: 'lbl-small', text: '설렘 가득' },
  { wx: 2520, wy: 540,  cls: 'lbl-small', text: '인기 차트' },
  { wx: 2520, wy: 2680, cls: 'lbl-small', text: '자주 듣는 아티스트' },
  { wx: 4650, wy: 1600, cls: 'lbl-small lbl-beacon', text: 'Sync AI', sub: '기분을 사진 한 장으로' },
];

const CLUSTER_GLOWS = [
  { left: 2130, top: 1430, w: 760, h: 760, color: 'rgba(255,201,138,.5)' },
  { left: 1400, top: 940,  w: 560, h: 560, color: 'rgba(202,160,214,.42)' },
  { left: 3260, top: 1000, w: 600, h: 600, color: 'rgba(255,138,99,.4)' },
  { left: 1260, top: 2140, w: 600, h: 600, color: 'rgba(127,201,187,.4)' },
  { left: 3320, top: 2260, w: 620, h: 620, color: 'rgba(244,166,160,.42)' },
  { left: 2260, top: 520,  w: 520, h: 420, color: 'rgba(255,216,115,.32)' },
  { left: 2200, top: 2700, w: 640, h: 520, color: 'rgba(255,177,90,.3)' },
  { left: 4420, top: 1480, w: 520, h: 520, color: 'rgba(127,201,187,.55)' },
];

const ORBIT_RINGS = [
  { left: 2280, top: 1580, w: 440, h: 440 },
  { left: 2260, top: 2760, w: 400, h: 280 },
];

const MUSIC_NODES = [
  { id: 'n1',  title: '밤편지',         artist: '아이유',              tag: '지금 이 순간', left: 2440, top: 1730, size: 108, cls: 'n-amber' },
  { id: 'n2',  title: 'Nostalgia',      artist: 'DEAN',                tag: '지금 이 순간', left: 2600, top: 1600, size: 72,  cls: 'n-gold' },
  { id: 'n3',  title: "오늘만 I'm",     artist: '최유리',              tag: '지금 이 순간', left: 2260, top: 1650, size: 64,  cls: 'n-rust' },
  { id: 'n4',  title: 'Home Sweet Home',artist: '이영지',              tag: '지금 이 순간', left: 2560, top: 1860, size: 58,  cls: 'n-rose' },
  { id: 'n5',  title: 'Rainy Study',    artist: 'Various Artists',     tag: '지금 이 순간', left: 2320, top: 1870, size: 52,  cls: 'n-amber' },
  { id: 'n6',  title: '내 프로필',      artist: '저장한 곡 · 최근 재생',tag: '프로필',      left: 2470, top: 1310, size: 40,  cls: 'n-gold' },
  { id: 'n7',  title: '소나기',         artist: '헤이즈',              tag: '비 오는 날',   left: 1560, top: 1080, size: 84,  cls: 'n-plum' },
  { id: 'n8',  title: 'Rainy Study',    artist: 'Various Artists',     tag: '비 오는 날',   left: 1700, top: 1180, size: 60,  cls: 'n-plum' },
  { id: 'n9',  title: '밤편지',         artist: '아이유',              tag: '비 오는 날',   left: 1470, top: 1220, size: 54,  cls: 'n-rose' },
  { id: 'n10', title: '바다처럼',       artist: '아이유',              tag: '드라이브',     left: 3480, top: 1150, size: 90,  cls: 'n-rust' },
  { id: 'n11', title: 'Cruising',       artist: 'pH-1',                tag: '드라이브',     left: 3350, top: 1260, size: 58,  cls: 'n-amber' },
  { id: 'n12', title: '창밖은 밤 11시', artist: '산들',                tag: '드라이브',     left: 3600, top: 1320, size: 50,  cls: 'n-gold' },
  { id: 'n13', title: 'Focus Flow',     artist: 'Various Artists',     tag: '집중할 때',    left: 1420, top: 2280, size: 86,  cls: 'n-teal' },
  { id: 'n14', title: 'Low-fi Room',    artist: 'Various Artists',     tag: '집중할 때',    left: 1560, top: 2400, size: 56,  cls: 'n-teal' },
  { id: 'n15', title: 'Nostalgia',      artist: 'DEAN',                tag: '집중할 때',    left: 1300, top: 2420, size: 48,  cls: 'n-gold' },
  { id: 'n16', title: '첫눈',           artist: '아이유',              tag: '설렘 가득',    left: 3520, top: 2400, size: 94,  cls: 'n-rose' },
  { id: 'n17', title: 'Supernova',      artist: 'aespa',               tag: '설렘 가득',    left: 3660, top: 2520, size: 58,  cls: 'n-rust' },
  { id: 'n18', title: '봄날의 고백',    artist: '최유리',              tag: '설렘 가득',    left: 3380, top: 2520, size: 50,  cls: 'n-amber' },
];

const RANK_CARDS = [
  { rank: 1, title: '밤편지',   artist: '아이유', grad: 'var(--grad-1)', left: 2320, top: 560 },
  { rank: 2, title: 'Supernova',artist: 'aespa',  grad: 'var(--grad-4)', left: 2380, top: 618 },
  { rank: 3, title: '첫눈',     artist: '아이유', grad: 'var(--grad-6)', left: 2440, top: 676 },
  { rank: 4, title: 'Nostalgia',artist: 'DEAN',   grad: 'var(--grad-1)', left: 2500, top: 734 },
  { rank: 5, title: '소나기',   artist: '헤이즈', grad: 'var(--grad-2)', left: 2560, top: 792 },
];

const ARTIST_NODES_DATA = [
  { name: '아이유', grad: 'var(--grad-1)', left: 2420, top: 2820, size: 64 },
  { name: 'aespa',  grad: 'var(--grad-4)', left: 2540, top: 2900, size: 64 },
  { name: 'DEAN',   grad: 'var(--grad-3)', left: 2320, top: 2920, size: 64 },
  { name: 'BIBI',   grad: 'var(--grad-2)', left: 2600, top: 2790, size: 52 },
  { name: '최유리', grad: 'var(--grad-1)', left: 2260, top: 2820, size: 52 },
];

const STAR_COLORS = ['#ffffff','#ffffff','#ffffff','#f5e3b8','#f5e3b8','#e8c9a0','#d9a6c2'];
const PLANET_PALETTES = [
  ['#ffd9a8','#8a4c13'],['#ffb199','#5c1f12'],['#ffe9a0','#7a5410'],
  ['#f7c3bd','#5c2320'],['#dcb8e6','#3c2048'],['#a8e0d2','#123a34'],
  ['#d9639e','#3c0028'],['#ecd9ae','#a8813f'],
];

function makeStars(container, count, sizeMin, sizeMax, opMin, opMax, spikeChance, diamondChance, glowMul, reduced) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const op = opMin + Math.random() * (opMax - opMin);
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const big = size > sizeMin + (sizeMax - sizeMin) * 0.55;
    const shapeRoll = Math.random();
    let shapeClass = '', spiked = false;
    if (big && spikeChance > 0 && shapeRoll < spikeChance) { shapeClass = ' star-spike'; spiked = true; }
    else if (big && diamondChance > 0 && shapeRoll < spikeChance + diamondChance) { shapeClass = ' star-diamond'; }
    el.className = 'star' + shapeClass;
    el.style.left = (Math.random() * 100) + '%';
    el.style.top = (Math.random() * 100) + '%';
    el.style.opacity = op;
    el.style.color = color;
    if (shapeClass === ' star-diamond') {
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.background = color;
      el.style.boxShadow = '0 0 ' + (size * 1.6) + 'px ' + color;
    } else {
      const glowSize = size * glowMul;
      el.style.width = glowSize + 'px'; el.style.height = glowSize + 'px';
      el.style.background = 'radial-gradient(circle, #ffffff 0%, ' + color + ' 20%, rgba(0,0,0,0) 52%)';
      if (spiked) { el.style.boxShadow = '0 0 ' + (size * 1.1) + 'px ' + color; }
      if (!spiked) {
        const sx = 0.82 + Math.random() * 0.36, sy = 0.82 + Math.random() * 0.36;
        el.style.transform = 'scale(' + sx.toFixed(2) + ',' + sy.toFixed(2) + ')';
      }
    }
    if (spiked) el.style.setProperty('--spike-len', (size * 8) + 'px');
    if (!reduced) {
      el.style.animationDuration = (2.4 + Math.random() * 3.2) + 's';
      el.style.animationDelay = (-Math.random() * 5) + 's';
    }
    frag.appendChild(el);
  }
  container.appendChild(frag);
}

function makePlanets(container, count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'planet';
    const size = 46 + Math.random() * 112;
    const pal = PLANET_PALETTES[Math.floor(Math.random() * PLANET_PALETTES.length)];
    el.style.left = (Math.random() * 100) + '%';
    el.style.top = (Math.random() * 100) + '%';
    el.style.width = size + 'px'; el.style.height = size + 'px';
    el.style.background = 'radial-gradient(circle at 32% 28%, ' + pal[0] + ' 0%, ' + pal[1] + ' 78%)';
    el.style.opacity = 0.45 + Math.random() * 0.35;
    if (Math.random() < 0.35) {
      el.classList.add('has-ring');
      el.style.setProperty('--ring-w', (size * 1.9) + 'px');
      el.style.setProperty('--ring-h', (size * 0.6) + 'px');
      el.style.setProperty('--ring-rot', (-25 + Math.random() * 20) + 'deg');
    }
    frag.appendChild(el);
  }
  container.appendChild(frag);
}

export default function Home() {
  const { isLoggedIn } = useAuth();
  const { playTrack, togglePlay, currentTrack, isPlaying } = usePlayer();
  const navigate = useNavigate();

  const [quickAccess, setQuickAccess] = useState(null); // null = 기본 정적 카드 표시
  const [newReleases, setNewReleases] = useState(null);
  const [artists, setArtists] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [topCharts, setTopCharts] = useState(null);
  const [topChartsCountry, setTopChartsCountry] = useState('KR');
  const [artistRec, setArtistRec] = useState(null);
  const [genreChart, setGenreChart] = useState(null);
  const [genreSelected, setGenreSelected] = useState('kpop');

  // Galaxy mode state
  const [galaxyMode, setGalaxyMode] = useState(() => {
    try { return localStorage.getItem('sync-home-mode') === 'galaxy'; } catch { return false; }
  });
  const [compassOpen, setCompassOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nodeDetail, setNodeDetail] = useState(null); // { title, artist, tag, bg, x, y }

  // Galaxy refs (DOM manipulation only, not re-renders)
  const gViewportRef = useRef(null);
  const gUniverseRef = useRef(null);
  const gStarsFarRef = useRef(null);
  const gStarsNearRef = useRef(null);
  const gPlanetsRef = useRef(null);
  const gBeaconRef = useRef(null);
  const gPanRef = useRef({ tx: 0, ty: 0, s: 0.82 });
  const gMovedRef = useRef(false);
  const gInitRef = useRef(false); // guard against double-init in StrictMode

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

  // 나라별 TOP 차트
  useEffect(() => {
    let cancelled = false;
    setTopCharts(null);
    api.get(`/api/home/top-charts?country=${topChartsCountry}`)
      .then(async (raw) => {
        if (cancelled || !raw?.length) { if (!cancelled) setTopCharts([]); return; }
        const tracks = raw.map((t, i) => normalizeTrack(t, i));
        if (!cancelled) setTopCharts(tracks);
        const needsArt = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt);
        if (needsArt.length) {
          const results = await Promise.all(needsArt.map(({ t }) => fetchItunesTrack(`${t.name} ${t.artist}`)));
          if (cancelled) return;
          const updated = [...tracks];
          needsArt.forEach(({ i }, ri) => {
            const it = results[ri];
            if (it) updated[i] = { ...updated[i], albumArt: it.albumArt || updated[i].albumArt, previewUrl: updated[i].previewUrl || it.previewUrl };
          });
          if (!cancelled) setTopCharts(updated);
        }
      })
      .catch(() => { if (!cancelled) setTopCharts([]); });
    return () => { cancelled = true; };
  }, [topChartsCountry]);

  // 아티스트 추천 (chart 로드 후 첫 아티스트 기반)
  useEffect(() => {
    if (!chart?.length) return;
    const seed = chart[0]?.artist;
    if (!seed) return;
    let cancelled = false;
    api.get(`/api/home/artist-recommend?seedArtist=${encodeURIComponent(seed)}`)
      .then(async (raw) => {
        if (cancelled || !raw?.length) { if (!cancelled) setArtistRec([]); return; }
        const tracks = raw.map((t, i) => normalizeTrack(t, i));
        if (!cancelled) setArtistRec(tracks);
        const needsArt = tracks.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt);
        if (needsArt.length) {
          const results = await Promise.all(needsArt.map(({ t }) => fetchItunesTrack(`${t.name} ${t.artist}`)));
          if (cancelled) return;
          const updated = [...tracks];
          needsArt.forEach(({ i }, ri) => {
            const it = results[ri];
            if (it) updated[i] = { ...updated[i], albumArt: it.albumArt || updated[i].albumArt, previewUrl: updated[i].previewUrl || it.previewUrl };
          });
          if (!cancelled) setArtistRec(updated);
        }
      })
      .catch(() => { if (!cancelled) setArtistRec([]); });
    return () => { cancelled = true; };
  }, [chart]);

  // 장르별 추천
  useEffect(() => {
    let cancelled = false;
    setGenreChart(null);
    api.get(`/api/home/genre-chart?genre=${encodeURIComponent(genreSelected)}&country=kr`)
      .then((raw) => {
        if (cancelled) return;
        const tracks = (raw || []).map((t, i) => normalizeTrack(t, i));
        setGenreChart(tracks);
      })
      .catch(() => { if (!cancelled) setGenreChart([]); });
    return () => { cancelled = true; };
  }, [genreSelected]);

  // Persist mode and recenter on switch
  useEffect(() => {
    try { localStorage.setItem('sync-home-mode', galaxyMode ? 'galaxy' : 'bento'); } catch {}
    if (galaxyMode) {
      requestAnimationFrame(() => {
        if (window.__gxCenterOn) window.__gxCenterOn(2510, 1750, 0.82, false);
      });
    }
  }, [galaxyMode]);

  // Document click closes node detail
  useEffect(() => {
    const close = () => setNodeDetail(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setSearchOpen(false); setNodeDetail(null); setCompassOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Galaxy initialization (runs once when galaxy mode mounts)
  useEffect(() => {
    if (!galaxyMode) return;
    if (gInitRef.current) return;
    gInitRef.current = true;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewport = gViewportRef.current;
    const universe = gUniverseRef.current;
    const starsFar = gStarsFarRef.current;
    const starsNear = gStarsNearRef.current;
    const planets = gPlanetsRef.current;
    if (!viewport || !universe) return;

    // Generate stars and planets
    makeStars(starsFar, 150, 1.4, 3, .4, .8, 0, .1, 1.7, reduced);
    makeStars(starsNear, 90, 2.4, 5.6, .65, 1, .2, .16, 2.3, reduced);
    makePlanets(planets, 6);

    const pan = gPanRef.current;
    const FAR_TF = 0.08, FAR_SF = 0.15, NEAR_TF = 0.22, NEAR_SF = 0.35, PLANET_TF = 0.14, PLANET_SF = 0.24;
    const MMW = 168, MMH = 110;

    function updateHUD() {
      document.querySelectorAll('.galaxy-view .hud-label').forEach(l => {
        const wx = parseFloat(l.dataset.wx), wy = parseFloat(l.dataset.wy);
        l.style.left = (pan.tx + wx * pan.s) + 'px';
        l.style.top  = (pan.ty + wy * pan.s) + 'px';
      });
      const mmFrame = document.getElementById('gxMmFrame');
      if (mmFrame) {
        const vw = window.innerWidth / pan.s, vh = window.innerHeight / pan.s;
        const vx = -pan.tx / pan.s, vy = -pan.ty / pan.s;
        mmFrame.style.left   = Math.max(0, vx / UNIVERSE_W * MMW) + 'px';
        mmFrame.style.top    = Math.max(0, vy / UNIVERSE_H * MMH) + 'px';
        mmFrame.style.width  = Math.min(MMW, vw / UNIVERSE_W * MMW) + 'px';
        mmFrame.style.height = Math.min(MMH, vh / UNIVERSE_H * MMH) + 'px';
      }
    }

    function applyTransform(animated) {
      const trans = animated && !reduced ? 'transform .6s cubic-bezier(.2,.8,.2,1)' : 'none';
      universe.style.transition = trans;
      universe.style.transform = `translate(${pan.tx}px,${pan.ty}px) scale(${pan.s})`;
      starsFar.style.transition = trans;
      starsFar.style.transform = `translate(${pan.tx*FAR_TF}px,${pan.ty*FAR_TF}px) scale(${1+(pan.s-1)*FAR_SF})`;
      starsNear.style.transition = trans;
      starsNear.style.transform = `translate(${pan.tx*NEAR_TF}px,${pan.ty*NEAR_TF}px) scale(${1+(pan.s-1)*NEAR_SF})`;
      planets.style.transition = trans;
      planets.style.transform = `translate(${pan.tx*PLANET_TF}px,${pan.ty*PLANET_TF}px) scale(${1+(pan.s-1)*PLANET_SF})`;
      updateHUD();
    }

    function centerOn(wx, wy, scale, animated) {
      if (scale != null) pan.s = scale;
      pan.tx = window.innerWidth / 2 - wx * pan.s;
      pan.ty = window.innerHeight / 2 - wy * pan.s;
      applyTransform(animated);
    }
    window.__gxCenterOn = centerOn;

    centerOn(2510, 1750, 0.82, false);

    // Drag
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    const onPD = (e) => {
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
      viewport.classList.add('dragging');
    };
    const onPM = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      pan.tx += dx; pan.ty += dy; lastX = e.clientX; lastY = e.clientY;
      applyTransform(false);
      hintHide();
    };
    const onPU = () => { dragging = false; viewport.classList.remove('dragging'); gMovedRef.current = moved; };
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const prevS = pan.s;
        const next = Math.max(.55, Math.min(1.7, pan.s - e.deltaY * 0.0012));
        const wx = (e.clientX - pan.tx) / prevS, wy = (e.clientY - pan.ty) / prevS;
        pan.s = next; pan.tx = e.clientX - wx * pan.s; pan.ty = e.clientY - wy * pan.s;
      } else {
        pan.tx -= e.deltaX; pan.ty -= e.deltaY;
      }
      applyTransform(false); hintHide();
    };
    viewport.addEventListener('pointerdown', onPD);
    viewport.addEventListener('pointermove', onPM);
    ['pointerup','pointercancel','pointerleave'].forEach(ev => viewport.addEventListener(ev, onPU));
    viewport.addEventListener('wheel', onWheel, { passive: false });

    // Hint
    let hinted = false;
    function hintHide() {
      if (hinted) return; hinted = true;
      document.querySelector('.galaxy-view .g-hint')?.classList.add('hidden');
    }
    const hintTimer = setTimeout(hintHide, 5000);

    // Minimap
    const minimapEl = document.getElementById('gxMinimap');
    const onMMClick = (e) => {
      const r = minimapEl.getBoundingClientRect();
      centerOn((e.clientX - r.left) / MMW * UNIVERSE_W, (e.clientY - r.top) / MMH * UNIVERSE_H, null, true);
    };
    minimapEl?.addEventListener('click', onMMClick);

    // Beacon pulse
    let beaconT = 0;
    let beaconInt;
    if (!reduced) {
      beaconInt = setInterval(() => {
        beaconT++;
        if (gBeaconRef.current) {
          gBeaconRef.current.style.boxShadow = `0 0 ${18 + Math.sin(beaconT / 10) * 10}px 4px rgba(127,201,187,.45), 0 8px 30px rgba(0,0,0,.5)`;
        }
      }, 80);
    }

    const onResize = () => centerOn(2510, 1750, pan.s, false);
    window.addEventListener('resize', onResize);

    return () => {
      viewport.removeEventListener('pointerdown', onPD);
      viewport.removeEventListener('pointermove', onPM);
      ['pointerup','pointercancel','pointerleave'].forEach(ev => viewport.removeEventListener(ev, onPU));
      viewport.removeEventListener('wheel', onWheel);
      minimapEl?.removeEventListener('click', onMMClick);
      window.removeEventListener('resize', onResize);
      clearTimeout(hintTimer);
      clearInterval(beaconInt);
      delete window.__gxCenterOn;
      gInitRef.current = false;
    };
  }, [galaxyMode]);

  const handleSpoke = (action) => {
    setCompassOpen(false);
    if (action === 'home')    { window.__gxCenterOn?.(2510, 1750, 1, true); }
    else if (action === 'search')  { setSearchOpen(true); }
    else if (action === 'sync')    { navigate('/sync'); }
    else if (action === 'library') { navigate('/playlists'); }
    else if (action === 'profile') { navigate('/profile'); }
  };

  const handleNodeClick = (e, title, artist, tag, track = null) => {
    e.stopPropagation();
    if (gMovedRef.current) { gMovedRef.current = false; return; }
    setNodeDetail({
      title, artist, tag, track,
      bg: window.getComputedStyle(e.currentTarget).backgroundImage,
      x: e.clientX,
      y: Math.max(140, e.clientY - 20),
    });
  };

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
            {heroTrack ? <><span>{heroTrack.artist}</span> · 글로벌 차트 #1</> : <><span>Sync</span> 팀 선정</>}
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
            <div className="chart-row" key={t._id || i} onClick={() => playTrack(t, chart)}>
              <span className="chart-rank">{i + 1}</span>
              <div className="chart-thumb">
                {t.albumArt && <img src={t.albumArt} alt="" />}
              </div>
              <div className="chart-info">
                <div className="chart-title">{t.name}</div>
                <div className="chart-artist">{t.artist}</div>
              </div>
              <button className="chart-play" onClick={e => { e.stopPropagation(); playTrack(t, chart); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── 나라별 TOP 차트 ── */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">🌍 나라별 TOP 차트</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {['KR','US','JP','GB','FR'].map(c => (
              <button key={c}
                onClick={() => setTopChartsCountry(c)}
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11,
                  fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer',
                  background: topChartsCountry === c ? 'var(--accent)' : 'var(--bg-mid)',
                  color: topChartsCountry === c ? '#2b0f1f' : 'var(--text-secondary)',
                }}>{c}</button>
            ))}
          </div>
        </div>
        <div className="chart-list">
          {topCharts === null && <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>}
          {topCharts && topCharts.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>데이터 없음</div>}
          {topCharts && topCharts.slice(0, 20).map((t, i) => (
            <div className="chart-row" key={i} onClick={() => playTrack(t, topCharts)}>
              <span className="chart-rank">{i + 1}</span>
              <div className="chart-thumb">
                {t.albumArt && <img src={t.albumArt} alt="" />}
              </div>
              <div className="chart-info">
                <div className="chart-title">{t.name}</div>
                <div className="chart-artist">{t.artist}</div>
              </div>
              <button className="chart-play" onClick={e => { e.stopPropagation(); playTrack(t, topCharts); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── 아티스트 추천 ── */}
      {artistRec && artistRec.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">✨ 지금 인기있는 아티스트</h2>
          </div>
          <div className="cards-shelf">
            {artistRec.slice(0, 12).map((t, i) => (
              <div className="card" key={t._id} onClick={() => playTrack(t, artistRec)}>
                <div className="card-art">
                  {t.albumArt
                    ? <img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div className={`card-art-inner grad-${(i % 8) + 1}`}>🎤</div>}
                  <button className="card-play" onClick={e => { e.stopPropagation(); playTrack(t, artistRec); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
                <div className="card-title">{t.name}</div>
                <div className="card-subtitle">{t.artist}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 장르별 추천 ── */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">🎼 장르별 추천</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'kpop', label: 'K-POP' },
              { key: 'hip hop', label: 'HIP HOP' },
              { key: 'rnb soul', label: 'R&B' },
              { key: 'jazz', label: '재즈' },
              { key: 'indie rock', label: '인디' },
              { key: 'pop ballad', label: '발라드' },
              { key: 'lofi chill', label: 'Lo-Fi' },
            ].map(g => (
              <button key={g.key}
                onClick={() => setGenreSelected(g.key)}
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11,
                  fontWeight: 700, border: '1px solid var(--border)', cursor: 'pointer',
                  background: genreSelected === g.key ? 'var(--accent)' : 'var(--bg-mid)',
                  color: genreSelected === g.key ? '#2b0f1f' : 'var(--text-secondary)',
                }}>{g.label}</button>
            ))}
          </div>
        </div>
        <div className="cards-shelf">
          {genreChart === null && <div style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>}
          {genreChart && genreChart.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>데이터 없음</div>}
          {genreChart && genreChart.slice(0, 20).map((t, i) => (
            <div className="card" key={t._id} onClick={() => playTrack(t, genreChart)}>
              <div className="card-art">
                {t.albumArt
                  ? <img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div className={`card-art-inner grad-${(i % 8) + 1}`}>🎵</div>}
                <button className="card-play" onClick={e => { e.stopPropagation(); playTrack(t, genreChart); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
              </div>
              <div className="card-title">{t.name}</div>
              <div className="card-subtitle">{t.artist}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mode toggle — always fixed, renders over layout */}
      <div className="home-mode-toggle" style={{ position: 'fixed', bottom: 104, right: 22, zIndex: 450 }}>
        <button
          className={!galaxyMode ? 'active' : ''}
          onClick={() => setGalaxyMode(false)}
        >
          ⊞ 그리드 뷰
        </button>
        <button
          className={galaxyMode ? 'active' : ''}
          onClick={() => setGalaxyMode(true)}
        >
          🌌 갤럭시 뷰
        </button>
      </div>

      {/* Galaxy view — portal renders into document.body to escape layout */}
      {galaxyMode && createPortal(
        <div className="galaxy-view">
          <div className="g-viewport" ref={gViewportRef}>
            <div className="g-stars-layer far" ref={gStarsFarRef} />
            <div className="g-stars-layer near" ref={gStarsNearRef} />
            <div className="planets-layer" ref={gPlanetsRef} />
            <div className="g-universe" ref={gUniverseRef}>
              {CLUSTER_GLOWS.map((g, i) => (
                <div key={i} className="cluster-glow"
                  style={{ left: g.left, top: g.top, width: g.w, height: g.h,
                    background: `radial-gradient(circle, ${g.color}, transparent 68%)` }} />
              ))}
              {ORBIT_RINGS.map((r, i) => (
                <div key={i} className="orbit-ring"
                  style={{ left: r.left, top: r.top, width: r.w, height: r.h }} />
              ))}
              {MUSIC_NODES.map((n, i) => {
                const track = chart?.length ? chart[i % chart.length] : null;
                return (
                  <div key={n.id} className="node-wrap"
                    style={{ left: n.left, top: n.top }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (gMovedRef.current) { gMovedRef.current = false; return; }
                      if (track) playTrack(track, chart);
                    }}>
                    <div className={`node ${n.cls}`}
                      style={{ width: n.size, height: n.size }}>
                      {track?.albumArt
                        ? <img src={track.albumArt} alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover',
                              borderRadius: '50%', display: 'block', pointerEvents: 'none' }} />
                        : <span className="node-icon">♪</span>
                      }
                    </div>
                    {track && (
                      <div className="node-label">
                        <span className="node-label-title">{track.name}</span>
                        <span className="node-label-artist">{track.artist}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {RANK_CARDS.map((r, i) => {
                const realTrack = chart?.[i];
                const title = realTrack?.name || r.title;
                const artist = realTrack?.artist || r.artist;
                const albumArt = realTrack?.albumArt;
                return (
                  <div key={r.rank} className="rank-card"
                    style={{ left: r.left, top: r.top }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (gMovedRef.current) { gMovedRef.current = false; return; }
                      setNodeDetail({ title, artist, tag: '인기 차트',
                        bg: albumArt ? `url(${albumArt})` : r.grad,
                        x: e.clientX, y: Math.max(140, e.clientY - 20),
                        track: realTrack || null });
                    }}>
                    <span className="rank-num">{r.rank}</span>
                    <span className="rank-thumb" style={albumArt
                      ? { backgroundImage: `url(${albumArt})`, backgroundSize: 'cover' }
                      : { background: r.grad }} />
                    <span className="rank-text">
                      <span className="rank-title">{title}</span>
                      <span className="rank-artist">{artist}</span>
                    </span>
                  </div>
                );
              })}
              {ARTIST_NODES_DATA.map((a, i) => {
                const realName = artists?.[i]?.name || a.name;
                const imgUrl = artistImages?.[realName];
                return (
                  <div key={i} className="artist-node"
                    style={{
                      left: a.left, top: a.top, width: a.size, height: a.size,
                      background: imgUrl ? undefined : a.grad,
                      backgroundImage: imgUrl ? `url(${imgUrl})` : undefined,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      fontSize: a.size < 64 ? '11px' : '13px',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (gMovedRef.current) { gMovedRef.current = false; return; }
                      navigate('/artist/' + encodeURIComponent(realName));
                    }}>
                    <span style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      textAlign: 'center', padding: '2px 2px 3px',
                      background: imgUrl ? 'rgba(0,0,0,0.55)' : 'none',
                      borderRadius: '0 0 50% 50%',
                      fontSize: 'inherit', fontWeight: 600,
                    }}>{realName}</span>
                  </div>
                );
              })}
              <div ref={gBeaconRef} className="node n-teal"
                style={{ left: 4590, top: 1650, width: 120, height: 120 }}
                onClick={(e) => { e.stopPropagation(); if (gMovedRef.current) { gMovedRef.current = false; return; } navigate('/sync'); }}>
                <span className="node-icon" style={{ fontSize: 20 }}>✦</span>
              </div>
            </div>
          </div>

          {/* HUD labels */}
          <div id="gxHudLabels">
            {HUD_LABELS.map((l, i) => (
              <div key={i} className={`hud-label ${l.cls}`} data-wx={l.wx} data-wy={l.wy}>
                {l.text}
                {l.sub && <span className="sub">{l.sub}</span>}
              </div>
            ))}
          </div>

          <div className="g-hint">드래그해서 무드 우주를 탐험하세요 · 스크롤로 확대·축소</div>

          <div className="minimap" id="gxMinimap">
            {HUD_LABELS.map((l, i) => (
              <div key={i}
                className={`mm-dot${l.cls?.includes('beacon') ? ' beacon' : ''}`}
                style={{ left: l.wx / UNIVERSE_W * 168 + 'px', top: l.wy / UNIVERSE_H * 110 + 'px' }} />
            ))}
            <div className="mm-frame" id="gxMmFrame" />
            <span className="mm-caption">MOOD MAP</span>
          </div>

          <div className={`compass-wrap${compassOpen ? ' open' : ''}`}>
            {[
              { i: 0, action: 'home',    dot: 'var(--accent)',      label: '홈' },
              { i: 1, action: 'search',  dot: 'var(--text-muted)',  label: '검색' },
              { i: 2, action: 'sync',    dot: '#7fc9bb',            label: 'Sync' },
              { i: 3, action: 'library', dot: 'var(--accent-dark)', label: '보관함' },
              { i: 4, action: 'profile', dot: '#caa0d6',            label: '프로필' },
            ].map(s => (
              <div key={s.i} className="spoke" data-i={s.i} onClick={() => handleSpoke(s.action)}>
                <span className="dot" style={{ background: s.dot }} />
                {s.label}
              </div>
            ))}
            <button className="compass-btn" onClick={() => setCompassOpen(o => !o)} aria-label="메뉴 열기">
              <span className="ring" />
              <span className="core" />
            </button>
          </div>

          <div className="gplayer">
            <div className={`thumb${!isPlaying ? ' paused' : ''}`}
              style={currentTrack?.albumArt ? { backgroundImage: `url(${currentTrack.albumArt})`, backgroundSize: 'cover' } : {}} />
            <div className="meta">
              <span className="t">{currentTrack?.name ?? '재생 중인 곡 없음'}</span>
              <span className="a">{currentTrack?.artist ?? 'Sync'}</span>
            </div>
            <div className="ctrl">
              <button className="skip">⏮</button>
              <button className="play-btn" onClick={togglePlay}>
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <button className="skip">⏭</button>
            </div>
          </div>

          <div className={`search-overlay${searchOpen ? ' open' : ''}`}
            onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
            <div className="search-box">
              <input type="text" placeholder="곡, 아티스트, 무드로 검색..."
                autoFocus={searchOpen} />
              <div className="search-hint">Esc 또는 바깥 영역을 눌러 닫기</div>
            </div>
          </div>
          {searchOpen && (
            <button className="search-close-btn" onClick={() => setSearchOpen(false)}>✕ 닫기</button>
          )}

          {nodeDetail && (
            <div className="node-detail open"
              style={{ left: nodeDetail.x, top: nodeDetail.y }}
              onClick={(e) => e.stopPropagation()}>
              <div className="art" style={{ background: nodeDetail.bg }} />
              <span className="tag">{nodeDetail.tag}</span>
              <div className="title">{nodeDetail.title}</div>
              <div className="artist">{nodeDetail.artist}</div>
              <button className="go" onClick={() => {
                if (nodeDetail?.track) {
                  playTrack(nodeDetail.track, chart || []);
                  setNodeDetail(null);
                }
              }}>{nodeDetail?.track ? '재생하기' : '곡 정보 없음'}</button>
            </div>
          )}
        </div>,
        document.body
      )}
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
