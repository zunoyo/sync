import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';

const UNIVERSE_W = 5200, UNIVERSE_H = 3400;
const MMW = 168, MMH = 110;

const HUD_LABELS = [
  { wx: 2510, wy: 1560, cls: 'lbl-home', text: '지금 이 순간', sub: '당신의 무드에 맞춘 첫 화면' },
  { wx: 1600, wy: 990, cls: 'lbl-small', text: '비 오는 날' },
  { wx: 3560, wy: 1060, cls: 'lbl-small', text: '드라이브' },
  { wx: 1560, wy: 2200, cls: 'lbl-small', text: '집중할 때' },
  { wx: 3630, wy: 2200, cls: 'lbl-small', text: '설렘 가득' },
  { wx: 2520, wy: 540, cls: 'lbl-small', text: '인기 차트' },
  { wx: 2520, wy: 2680, cls: 'lbl-small', text: '자주 듣는 아티스트' },
  { wx: 4650, wy: 1600, cls: 'lbl-small lbl-beacon', text: 'Sync AI', sub: '기분을 사진 한 장으로' },
];

const CLUSTER_GLOWS = [
  { left: 2130, top: 1430, w: 760, h: 760, color: 'rgba(255,201,138,.5)' },
  { left: 1400, top: 940, w: 560, h: 560, color: 'rgba(202,160,214,.42)' },
  { left: 3260, top: 1000, w: 600, h: 600, color: 'rgba(255,138,99,.4)' },
  { left: 1260, top: 2140, w: 600, h: 600, color: 'rgba(127,201,187,.4)' },
  { left: 3320, top: 2260, w: 620, h: 620, color: 'rgba(244,166,160,.42)' },
  { left: 2260, top: 520, w: 520, h: 420, color: 'rgba(255,216,115,.32)' },
  { left: 2200, top: 2700, w: 640, h: 520, color: 'rgba(255,177,90,.3)' },
  { left: 4420, top: 1480, w: 520, h: 520, color: 'rgba(127,201,187,.55)' },
];

const ORBIT_RINGS = [
  { left: 2280, top: 1580, w: 440, h: 440 },
  { left: 2260, top: 2760, w: 400, h: 280 },
];

const MUSIC_NODES = [
  { id: 'n1', title: '밤편지', artist: '아이유', tag: '지금 이 순간', left: 2440, top: 1730, size: 108, cls: 'n-amber' },
  { id: 'n2', title: 'Nostalgia', artist: 'DEAN', tag: '지금 이 순간', left: 2600, top: 1600, size: 72, cls: 'n-gold' },
  { id: 'n3', title: "오늘만 I'm", artist: '최유리', tag: '지금 이 순간', left: 2260, top: 1650, size: 64, cls: 'n-rust' },
  { id: 'n4', title: 'Home Sweet Home', artist: '이영지', tag: '지금 이 순간', left: 2560, top: 1860, size: 58, cls: 'n-rose' },
  { id: 'n5', title: 'Rainy Study', artist: 'Various Artists', tag: '지금 이 순간', left: 2320, top: 1870, size: 52, cls: 'n-amber' },
  { id: 'n6', title: '내 프로필', artist: '저장한 곡 · 최근 재생', tag: '프로필', left: 2470, top: 1310, size: 40, cls: 'n-gold' },
  { id: 'n7', title: '소나기', artist: '헤이즈', tag: '비 오는 날', left: 1560, top: 1080, size: 84, cls: 'n-plum' },
  { id: 'n8', title: 'Rainy Study', artist: 'Various Artists', tag: '비 오는 날', left: 1700, top: 1180, size: 60, cls: 'n-plum' },
  { id: 'n9', title: '밤편지', artist: '아이유', tag: '비 오는 날', left: 1470, top: 1220, size: 54, cls: 'n-rose' },
  { id: 'n10', title: '바다처럼', artist: '아이유', tag: '드라이브', left: 3480, top: 1150, size: 90, cls: 'n-rust' },
  { id: 'n11', title: 'Cruising', artist: 'pH-1', tag: '드라이브', left: 3350, top: 1260, size: 58, cls: 'n-amber' },
  { id: 'n12', title: '창밖은 밤 11시', artist: '산들', tag: '드라이브', left: 3600, top: 1320, size: 50, cls: 'n-gold' },
  { id: 'n13', title: 'Focus Flow', artist: 'Various Artists', tag: '집중할 때', left: 1420, top: 2280, size: 86, cls: 'n-teal' },
  { id: 'n14', title: 'Low-fi Room', artist: 'Various Artists', tag: '집중할 때', left: 1560, top: 2400, size: 56, cls: 'n-teal' },
  { id: 'n15', title: 'Nostalgia', artist: 'DEAN', tag: '집중할 때', left: 1300, top: 2420, size: 48, cls: 'n-gold' },
  { id: 'n16', title: '첫눈', artist: '아이유', tag: '설렘 가득', left: 3520, top: 2400, size: 94, cls: 'n-rose' },
  { id: 'n17', title: 'Supernova', artist: 'aespa', tag: '설렘 가득', left: 3660, top: 2520, size: 58, cls: 'n-rust' },
  { id: 'n18', title: '봄날의 고백', artist: '최유리', tag: '설렘 가득', left: 3380, top: 2520, size: 50, cls: 'n-amber' },
];

const RANK_CARDS_DATA = [
  { rank: 1, title: '밤편지', artist: '아이유', grad: 'var(--grad-1)', left: 2320, top: 560 },
  { rank: 2, title: 'Supernova', artist: 'aespa', grad: 'var(--grad-4)', left: 2380, top: 618 },
  { rank: 3, title: '첫눈', artist: '아이유', grad: 'var(--grad-6)', left: 2440, top: 676 },
  { rank: 4, title: 'Nostalgia', artist: 'DEAN', grad: 'var(--grad-1)', left: 2500, top: 734 },
  { rank: 5, title: '소나기', artist: '헤이즈', grad: 'var(--grad-2)', left: 2560, top: 792 },
];

const ARTIST_NODES_DATA = [
  { name: '아이유', grad: 'var(--grad-1)', left: 2420, top: 2820, size: 64 },
  { name: 'aespa', grad: 'var(--grad-4)', left: 2540, top: 2900, size: 64 },
  { name: 'DEAN', grad: 'var(--grad-3)', left: 2320, top: 2920, size: 64 },
  { name: 'BIBI', grad: 'var(--grad-2)', left: 2600, top: 2790, size: 52 },
  { name: '최유리', grad: 'var(--grad-1)', left: 2260, top: 2820, size: 52 },
];

const SPOKES = [
  { i: 0, action: 'home', dot: 'var(--accent)', label: '홈' },
  { i: 1, action: 'search', dot: 'var(--text-muted)', label: '검색' },
  { i: 2, action: 'sync', dot: '#7fc9bb', label: 'Sync' },
  { i: 3, action: 'library', dot: 'var(--accent-dark)', label: '보관함' },
  { i: 4, action: 'profile', dot: '#caa0d6', label: '프로필' },
];

const STAR_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#f5e3b8', '#f5e3b8', '#e8c9a0', '#d9a6c2'];
const PLANET_PALETTES = [
  ['#ffd9a8', '#8a4c13'], ['#ffb199', '#5c1f12'], ['#ffe9a0', '#7a5410'],
  ['#f7c3bd', '#5c2320'], ['#dcb8e6', '#3c2048'], ['#a8e0d2', '#123a34'],
  ['#d9639e', '#3c0028'], ['#ecd9ae', '#a8813f'],
];

function makeStars(count, sizeMin, sizeMax, opMin, opMax, spikeChance, diamondChance, glowMul, reduced) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const size = sizeMin + Math.random() * (sizeMax - sizeMin);
    const op = opMin + Math.random() * (opMax - opMin);
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const big = size > sizeMin + (sizeMax - sizeMin) * 0.55;
    const shapeRoll = Math.random();
    let shapeClass = '', spiked = false;
    if (big && spikeChance > 0 && shapeRoll < spikeChance) { shapeClass = ' star-spike'; spiked = true; }
    else if (big && diamondChance > 0 && shapeRoll < spikeChance + diamondChance) { shapeClass = ' star-diamond'; }

    const style = {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      opacity: op,
      color,
    };
    if (shapeClass === ' star-diamond') {
      style.width = size; style.height = size;
      style.background = color;
      style.boxShadow = `0 0 ${size * 1.6}px ${color}`;
    } else {
      const glowSize = size * glowMul;
      style.width = glowSize; style.height = glowSize;
      style.background = `radial-gradient(circle, #ffffff 0%, ${color} 20%, rgba(0,0,0,0) 52%)`;
      if (spiked) style.boxShadow = `0 0 ${size * 1.1}px ${color}`;
      if (!spiked) {
        const sx = 0.82 + Math.random() * 0.36, sy = 0.82 + Math.random() * 0.36;
        style.transform = `scale(${sx.toFixed(2)},${sy.toFixed(2)})`;
      }
    }
    if (spiked) style['--spike-len'] = `${size * 8}px`;
    if (!reduced) {
      style.animationDuration = `${2.4 + Math.random() * 3.2}s`;
      style.animationDelay = `${-Math.random() * 5}s`;
    }
    out.push({ shapeClass, style });
  }
  return out;
}

function makePlanets(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const size = 46 + Math.random() * 112;
    const pal = PLANET_PALETTES[Math.floor(Math.random() * PLANET_PALETTES.length)];
    const style = {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      width: size, height: size,
      background: `radial-gradient(circle at 32% 28%, ${pal[0]} 0%, ${pal[1]} 78%)`,
      opacity: 0.45 + Math.random() * 0.35,
    };
    const hasRing = Math.random() < 0.35;
    if (hasRing) {
      style['--ring-w'] = `${size * 1.9}px`;
      style['--ring-h'] = `${size * 0.6}px`;
      style['--ring-rot'] = `${-25 + Math.random() * 20}deg`;
    }
    out.push({ style, hasRing });
  }
  return out;
}

/** 홈 화면 "갤럭시 뷰" — 드래그로 팬, Ctrl+스크롤로 줌 가능한 무드 우주 */
export default function GalaxyView({ onExit, chartTracks, artists, artistImages }) {
  const navigate = useNavigate();
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, playTrack } = usePlayer();

  const viewportRef = useRef(null);
  const universeRef = useRef(null);
  const starsFarRef = useRef(null);
  const starsNearRef = useRef(null);
  const planetsRef = useRef(null);
  const mmFrameRef = useRef(null);
  const hudRefs = useRef([]);
  const panRef = useRef({ tx: 0, ty: 0, s: 0.82 });
  const movedRef = useRef(false);

  const [compassOpen, setCompassOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [hintHidden, setHintHidden] = useState(false);

  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const starsFar = useMemo(() => makeStars(150, 1.4, 3, .4, .8, 0, .1, 1.7, reduced), [reduced]);
  const starsNear = useMemo(() => makeStars(90, 2.4, 5.6, .65, 1, .2, .16, 2.3, reduced), [reduced]);
  const planets = useMemo(() => makePlanets(6), []);

  function chartTrack(i) {
    return chartTracks && chartTracks.length ? chartTracks[i % chartTracks.length] : null;
  }
  function artistReal(i) {
    const fallback = ARTIST_NODES_DATA[i].name;
    const name = (artists && artists[i] && artists[i].name) || fallback;
    const img = (artistImages || {})[name] || null;
    return { name, img };
  }

  function updateHUD() {
    const pan = panRef.current;
    hudRefs.current.forEach((el, i) => {
      if (!el) return;
      const l = HUD_LABELS[i];
      el.style.left = `${pan.tx + l.wx * pan.s}px`;
      el.style.top = `${pan.ty + l.wy * pan.s}px`;
    });
    if (mmFrameRef.current) {
      const vw = window.innerWidth / pan.s, vh = window.innerHeight / pan.s;
      const vx = -pan.tx / pan.s, vy = -pan.ty / pan.s;
      mmFrameRef.current.style.left = `${Math.max(0, (vx / UNIVERSE_W) * MMW)}px`;
      mmFrameRef.current.style.top = `${Math.max(0, (vy / UNIVERSE_H) * MMH)}px`;
      mmFrameRef.current.style.width = `${Math.min(MMW, (vw / UNIVERSE_W) * MMW)}px`;
      mmFrameRef.current.style.height = `${Math.min(MMH, (vh / UNIVERSE_H) * MMH)}px`;
    }
  }

  function applyTransform(animated) {
    const pan = panRef.current;
    const trans = animated && !reduced ? 'transform .6s cubic-bezier(.2,.8,.2,1)' : 'none';
    const set = (ref, tf, sf) => {
      if (!ref.current) return;
      ref.current.style.transition = trans;
      ref.current.style.transform = `translate(${pan.tx * tf}px,${pan.ty * tf}px) scale(${1 + (pan.s - 1) * sf})`;
    };
    if (universeRef.current) {
      universeRef.current.style.transition = trans;
      universeRef.current.style.transform = `translate(${pan.tx}px,${pan.ty}px) scale(${pan.s})`;
    }
    set(starsFarRef, 0.08, 0.15);
    set(starsNearRef, 0.22, 0.35);
    set(planetsRef, 0.14, 0.24);
    updateHUD();
  }

  function centerOn(wx, wy, scale, animated) {
    const pan = panRef.current;
    if (scale != null) pan.s = scale;
    pan.tx = window.innerWidth / 2 - wx * pan.s;
    pan.ty = window.innerHeight / 2 - wy * pan.s;
    applyTransform(animated);
  }

  useEffect(() => {
    centerOn(2510, 1750, 0.82, false);
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    let dragging = false, lastX = 0, lastY = 0;
    function onDown(e) { dragging = true; movedRef.current = false; lastX = e.clientX; lastY = e.clientY; viewport.classList.add('dragging'); }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
      panRef.current.tx += dx; panRef.current.ty += dy;
      lastX = e.clientX; lastY = e.clientY;
      applyTransform(false);
      setHintHidden(true);
    }
    function onUp() { dragging = false; viewport.classList.remove('dragging'); }
    function onWheel(e) {
      e.preventDefault();
      const pan = panRef.current;
      if (e.ctrlKey) {
        const prevS = pan.s;
        const next = Math.max(0.55, Math.min(1.7, pan.s - e.deltaY * 0.0012));
        const wx = (e.clientX - pan.tx) / prevS, wy = (e.clientY - pan.ty) / prevS;
        pan.s = next; pan.tx = e.clientX - wx * pan.s; pan.ty = e.clientY - wy * pan.s;
      } else {
        pan.tx -= e.deltaX; pan.ty -= e.deltaY;
      }
      applyTransform(false);
      setHintHidden(true);
    }

    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => viewport.addEventListener(ev, onUp));
    viewport.addEventListener('wheel', onWheel, { passive: false });

    const hintTimer = setTimeout(() => setHintHidden(true), 5000);

    let beaconInt = null;
    if (!reduced) {
      let beaconT = 0;
      beaconInt = setInterval(() => {
        beaconT++;
        const beacon = viewport.parentElement?.querySelector('[data-kind="beacon"]');
        if (beacon) beacon.style.boxShadow = `0 0 ${18 + Math.sin(beaconT / 10) * 10}px 4px rgba(127,201,187,.45), 0 8px 30px rgba(0,0,0,.5)`;
      }, 80);
    }

    function onResize() { centerOn(2510, 1750, panRef.current.s, false); }
    window.addEventListener('resize', onResize);

    function onKeyDown(e) {
      if (e.key === 'Escape') { setSearchOpen(false); setNodeDetail(null); setCompassOpen(false); }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => viewport.removeEventListener(ev, onUp));
      viewport.removeEventListener('wheel', onWheel);
      clearTimeout(hintTimer);
      if (beaconInt) clearInterval(beaconInt);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRootClick() {
    if (movedRef.current) { movedRef.current = false; return; }
    setNodeDetail(null);
  }

  function guardedClick(fn) {
    return (e) => {
      e.stopPropagation();
      if (movedRef.current) return;
      fn(e);
    };
  }

  const handleNodeClick = (i) => guardedClick(() => {
    const track = chartTrack(i);
    if (track && chartTracks?.length) playTrack(track, chartTracks, i % chartTracks.length);
  });

  const handleRankClick = (i) => guardedClick((e) => {
    const mock = RANK_CARDS_DATA[i];
    const track = chartTrack(i);
    const qIdx = chartTracks?.length ? i % chartTracks.length : -1;
    setNodeDetail({
      title: track?.name || mock.title,
      artist: track?.artist || mock.artist,
      tag: '인기 차트',
      bg: track?.albumArt ? `url(${track.albumArt})` : mock.grad,
      track: track || null,
      qIdx,
      x: e.clientX,
      y: Math.max(140, e.clientY - 20),
    });
  });

  const handleArtistClick = (i) => guardedClick(() => {
    const { name } = artistReal(i);
    onExit();
    navigate(`/artist/${encodeURIComponent(name)}`);
  });

  const handleBeaconClick = guardedClick(() => { onExit(); navigate('/sync'); });

  function handleCompassAction(action) {
    setCompassOpen(false);
    if (action === 'home') centerOn(2510, 1750, 1, true);
    else if (action === 'search') setSearchOpen(true);
    else if (action === 'sync') { onExit(); navigate('/sync'); }
    else if (action === 'library') { onExit(); navigate('/playlists'); }
    else if (action === 'profile') { onExit(); navigate('/profile'); }
  }

  function handleMinimapClick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    centerOn(((e.clientX - r.left) / MMW) * UNIVERSE_W, ((e.clientY - r.top) / MMH) * UNIVERSE_H, null, true);
  }

  function handleNodeDetailGo() {
    if (nodeDetail?.track) playTrack(nodeDetail.track, chartTracks || [], nodeDetail.qIdx);
    setNodeDetail(null);
  }

  return (
    <div className="galaxy-view" onClick={handleRootClick}>
      <div className="g-viewport" ref={viewportRef}>
        <div className="g-stars-layer far" ref={starsFarRef}>
          {starsFar.map((s, i) => <div key={i} className={`star${s.shapeClass}`} style={s.style} />)}
        </div>
        <div className="g-stars-layer near" ref={starsNearRef}>
          {starsNear.map((s, i) => <div key={i} className={`star${s.shapeClass}`} style={s.style} />)}
        </div>
        <div className="planets-layer" ref={planetsRef}>
          {planets.map((p, i) => <div key={i} className={`planet${p.hasRing ? ' has-ring' : ''}`} style={p.style} />)}
        </div>
        <div className="g-universe" ref={universeRef}>
          {CLUSTER_GLOWS.map((g, i) => (
            <div key={i} className="cluster-glow" style={{ left: g.left, top: g.top, width: g.w, height: g.h, background: `radial-gradient(circle, ${g.color}, transparent 68%)` }} />
          ))}
          {ORBIT_RINGS.map((r, i) => (
            <div key={i} className="orbit-ring" style={{ left: r.left, top: r.top, width: r.w, height: r.h }} />
          ))}
          {MUSIC_NODES.map((n, i) => {
            const track = chartTrack(i);
            return (
              <div key={n.id} className="node-wrap" data-kind="node" style={{ left: n.left, top: n.top }} onClick={handleNodeClick(i)}>
                <div className={`node ${n.cls}`} style={{ width: n.size, height: n.size }}>
                  {track?.albumArt
                    ? <img src={track.albumArt} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block', pointerEvents: 'none' }} onError={(e) => { e.target.style.display = 'none'; }} alt="" />
                    : <span className="node-icon">♪</span>}
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
          {RANK_CARDS_DATA.map((r, i) => {
            const track = chartTrack(i);
            return (
              <div key={i} className="rank-card" data-kind="rank" style={{ left: r.left, top: r.top }} onClick={handleRankClick(i)}>
                <span className="rank-num">{r.rank}</span>
                <span className="rank-thumb" style={track?.albumArt ? { backgroundImage: `url(${track.albumArt})`, backgroundSize: 'cover' } : { background: r.grad }} />
                <span className="rank-text">
                  <span className="rank-title">{track?.name || r.title}</span>
                  <span className="rank-artist">{track?.artist || r.artist}</span>
                </span>
              </div>
            );
          })}
          {ARTIST_NODES_DATA.map((a, i) => {
            const { name, img } = artistReal(i);
            const baseStyle = { left: a.left, top: a.top, width: a.size, height: a.size, fontSize: a.size < 64 ? 11 : 13 };
            const style = img
              ? { ...baseStyle, backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { ...baseStyle, background: a.grad };
            return (
              <div key={i} className="artist-node" data-kind="artist" style={style} onClick={handleArtistClick(i)}>
                <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', padding: '2px 2px 3px', borderRadius: '0 0 50% 50%', fontSize: 'inherit', fontWeight: 600, background: img ? 'rgba(0,0,0,0.55)' : undefined }}>{name}</span>
              </div>
            );
          })}
          <div className="node n-teal" data-kind="beacon" style={{ left: 4590, top: 1650, width: 120, height: 120 }} onClick={handleBeaconClick}>
            <span className="node-icon" style={{ fontSize: 20 }}>✦</span>
          </div>
        </div>
      </div>

      <div id="gxHudLabels">
        {HUD_LABELS.map((l, i) => (
          <div key={i} ref={(el) => (hudRefs.current[i] = el)} className={`hud-label ${l.cls}`}>
            {l.text}{l.sub && <span className="sub">{l.sub}</span>}
          </div>
        ))}
      </div>

      <div className={`g-hint${hintHidden ? ' hidden' : ''}`}>드래그해서 무드 우주를 탐험하세요 · 스크롤로 확대·축소</div>

      <button className="gx-exit-btn" onClick={(e) => { e.stopPropagation(); onExit(); }} title="그리드 뷰로 돌아가기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" /></svg>
        그리드 뷰
      </button>

      <div className="minimap" onClick={(e) => { e.stopPropagation(); handleMinimapClick(e); }}>
        {HUD_LABELS.map((l, i) => (
          <div key={i} className={`mm-dot${l.cls.includes('beacon') ? ' beacon' : ''}`} style={{ left: (l.wx / UNIVERSE_W) * MMW, top: (l.wy / UNIVERSE_H) * MMH }} />
        ))}
        <div className="mm-frame" ref={mmFrameRef} />
        <span className="mm-caption">MOOD MAP</span>
      </div>

      <div className={`compass-wrap${compassOpen ? ' open' : ''}`}>
        {SPOKES.map((s) => (
          <div key={s.i} className="spoke" data-i={s.i} onClick={(e) => { e.stopPropagation(); handleCompassAction(s.action); }}>
            <span className="dot" style={{ background: s.dot }} />{s.label}
          </div>
        ))}
        <button className="compass-btn" aria-label="메뉴 열기" onClick={(e) => { e.stopPropagation(); setCompassOpen((v) => !v); }}>
          <span className="ring" /><span className="core" />
        </button>
      </div>

      <div className="gplayer" onClick={(e) => e.stopPropagation()}>
        <div className={`thumb${isPlaying ? '' : ' paused'}`} style={currentTrack?.albumArt ? { backgroundImage: `url(${currentTrack.albumArt})`, backgroundSize: 'cover' } : undefined} />
        <div className="meta">
          <span className="t">{currentTrack?.name || '재생 중인 곡 없음'}</span>
          <span className="a">{currentTrack?.artist || 'Sync'}</span>
        </div>
        <div className="ctrl">
          <button className="skip" onClick={prevTrack}>⏮</button>
          <button className="play-btn" onClick={togglePlay}>{isPlaying ? '❚❚' : '▶'}</button>
          <button className="skip" onClick={nextTrack}>⏭</button>
        </div>
      </div>

      <div className={`search-overlay${searchOpen ? ' open' : ''}`} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setSearchOpen(false); }}>
        <div className="search-box">
          <input type="text" placeholder="곡, 아티스트, 무드로 검색..." autoFocus={searchOpen} />
          <div className="search-hint">Esc 또는 바깥 영역을 눌러 닫기</div>
        </div>
      </div>
      {searchOpen && (
        <button className="search-close-btn" onClick={(e) => { e.stopPropagation(); setSearchOpen(false); }}>✕ 닫기</button>
      )}

      {nodeDetail && (
        <div className="node-detail open" style={{ left: nodeDetail.x, top: nodeDetail.y }} onClick={(e) => e.stopPropagation()}>
          <div className="art" style={{ background: nodeDetail.bg, backgroundSize: 'cover' }} />
          <span className="tag">{nodeDetail.tag}</span>
          <div className="title">{nodeDetail.title}</div>
          <div className="artist">{nodeDetail.artist}</div>
          <button className="go" onClick={handleNodeDetailGo}>{nodeDetail.track ? '재생하기' : '곡 정보 없음'}</button>
        </div>
      )}
    </div>
  );
}
