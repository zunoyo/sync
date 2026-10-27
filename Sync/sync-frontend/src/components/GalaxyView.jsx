import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { fetchEmotionHistory, EMOTION_LABELS } from '../api/sync';

/**
 * 갤럭시 뷰 (태양계) — 8081 의 static/js/galaxy-view.js 와 동일한 카메라 엔진.
 * 태양 = "지금 이 순간", 행성 = 무드 카테고리, Sync AI = 관문.
 * 카테고리를 고르면 빨려 들어가고(zoom-in + 소용돌이 + 워프), 다시 전체 보기로 빠져나온다.
 */
const SW = 1440, SH = 900;
const MM_W = 208, MM_H = 130;

const GRAD = {
  amber: '#f0d9a8,#8a4c13', gold: '#d9c08f,#6b4a1c', rust: '#ff8a63,#5c1f12',
  rose: '#f4a6a0,#5c2320', plum: '#caa0d6,#3c2048', teal: '#7fc9bb,#123a34', blue: '#bcd4ff,#2a3f8a',
};

const MUSIC_NODES = [
  { title: '밤편지', artist: '아이유', g: 'amber' },
  { title: 'Nostalgia', artist: 'DEAN', g: 'gold' },
  { title: "오늘만 I'm", artist: '최유리', g: 'rust' },
  { title: 'Home Sweet Home', artist: '이영지', g: 'rose' },
  { title: 'Rainy Study', artist: 'Various Artists', g: 'amber' },
  { title: '내 프로필', artist: '저장한 곡 · 최근 재생', g: 'gold' },
  { title: '소나기', artist: '헤이즈', g: 'plum' },
  { title: 'Rainy Study', artist: 'Various Artists', g: 'plum' },
  { title: '밤편지', artist: '아이유', g: 'rose' },
  { title: '바다처럼', artist: '아이유', g: 'rust' },
  { title: 'Cruising', artist: 'pH-1', g: 'amber' },
  { title: '창밖은 밤 11시', artist: '산들', g: 'gold' },
  { title: 'Focus Flow', artist: 'Various Artists', g: 'teal' },
  { title: 'Low-fi Room', artist: 'Various Artists', g: 'teal' },
  { title: 'Nostalgia', artist: 'DEAN', g: 'gold' },
  { title: '첫눈', artist: '아이유', g: 'rose' },
  { title: 'Supernova', artist: 'aespa', g: 'rust' },
  { title: '봄날의 고백', artist: '최유리', g: 'amber' },
];

const RANK_CARDS = [
  { rank: 1, title: '밤편지', artist: '아이유', grad: 'linear-gradient(135deg,#f0d9a8,#8a4c13)', left: 550, top: 258 },
  { rank: 2, title: 'Supernova', artist: 'aespa', grad: 'linear-gradient(135deg,#ff8a63,#5c1f12)', left: 666, top: 258 },
  { rank: 3, title: '첫눈', artist: '아이유', grad: 'linear-gradient(135deg,#f4a6a0,#5c2320)', left: 782, top: 258 },
];

const SUN_SATS = [
  { idx: 1, x: 850, y: 471, s: 40 },
  { idx: 2, x: 590, y: 471, s: 34 },
  { idx: 3, x: 669, y: 353, s: 30 },
  { idx: 4, x: 835, y: 377, s: 36 },
];

const CATS = [
  { id: 'sun', name: '지금 이 순간', sub: '당신의 무드에 맞춘 첫 화면', color: '#ffd98a', x: 720, y: 430, fr: 150, panel: true, idxs: [0, 1, 2, 3, 4], hud: { dy: 106 }, spoke: '지금' },
  { id: 'rain', name: '비 오는 날', sub: '빗소리와 어울리는 곡', color: '#caa0d6', x: 473, y: 246, size: 68, R: 62, panel: true,
    bg: 'radial-gradient(circle at 72% 38%,#e6c4ef,#6a3f7a 45%,#3c2048 85%)', shade: 'inset 10px -6px 16px rgba(0,0,0,.5)', glow: 'rgba(202,160,214,.5)',
    halo: { size: 320, color: 'rgba(202,160,214,.36)' }, spin: 'gx-spin', dur: 40, fr: 66,
    moons: [{ l: 80, t: -5, s: 26 }, { l: 106, t: 83, s: 20 }, { l: -10, t: 62, s: 22 }], idxs: [6, 7, 8], hud: { dy: -86 }, spoke: '비' },
  { id: 'focus', name: '집중할 때', sub: '몰입을 돕는 곡', color: '#7fc9bb', x: 359, y: 493, size: 76, R: 70, panel: true,
    bg: 'radial-gradient(circle at 72% 38%,#c4eee2,#2f7468 45%,#123a34 85%)', shade: 'inset 11px -7px 18px rgba(0,0,0,.5)', glow: 'rgba(127,201,187,.5)',
    halo: { size: 320, color: 'rgba(127,201,187,.34)' }, spin: 'gx-spin rev', dur: 55, fr: 74,
    moons: [{ l: 119, t: 23, s: 24 }, { l: -6, t: 36, s: 20 }, { l: 59, t: 129, s: 22 }], idxs: [12, 13, 14], hud: { dy: 96 }, spoke: '집중' },
  { id: 'drive', name: '드라이브', sub: '창문을 열고 달릴 때', color: '#ff8a63', x: 1014, y: 211, size: 84, R: 76, panel: true,
    bg: 'radial-gradient(circle at 28% 38%,#ffc2a8,#b04a2a 45%,#5c1f12 85%)', shade: 'inset -11px -7px 18px rgba(0,0,0,.5)', glow: 'rgba(255,138,99,.6)',
    halo: { size: 320, color: 'rgba(255,138,99,.38)' }, spin: 'gx-spin', dur: 32, fr: 82,
    moons: [{ l: -9, t: 36, s: 28 }, { l: 103, t: 131, s: 22 }, { l: 92, t: -5, s: 20 }], idxs: [9, 10, 11], hud: { dy: 102 }, spoke: '드라이브' },
  { id: 'excite', name: '설렘 가득', sub: '두근거리는 순간의 곡', color: '#f4a6a0', x: 720, y: 679, size: 90, R: 84, panel: true, ring: true,
    bg: 'radial-gradient(circle at 28% 38%,#ffdcd6,#b0605a 45%,#5c2320 85%)', shade: 'inset -12px -7px 20px rgba(0,0,0,.5)', glow: 'rgba(244,166,160,.5)',
    halo: { size: 340, color: 'rgba(244,166,160,.36)' }, spin: 'gx-spin', dur: 48, fr: 90,
    moons: [{ l: -8, t: 100, s: 26 }, { l: 137, t: 127, s: 22 }, { l: 96, t: -7, s: 20 }], idxs: [15, 16, 17], hud: { dy: 110 }, spoke: '설렘' },
  { id: 'sync', name: 'Sync AI', sub: '기분을 사진 한 장으로', color: '#9ec0ff', x: 1234, y: 521, size: 70, R: 62, portal: true, station: true,
    bg: 'radial-gradient(circle at 35% 30%,#d4e4ff,#2a3f8a)', shade: 'inset 0 0 0 rgba(0,0,0,0)', glow: 'rgba(130,170,255,.7)',
    halo: { size: 240, color: 'rgba(130,170,255,.42)' }, spin: 'gx-spin rev', dur: 36, fr: 70,
    moons: [{ l: 100, t: 20, s: 16, g: 'blue' }, { l: 4, t: 80, s: 14, g: 'blue' }], idxs: [], hud: { dy: 65, col: true }, spoke: 'Sync' },
];
const CAT = {};
CATS.forEach((c) => { CAT[c.id] = c; });
// 컴퍼스 = 원래 메뉴
const SPOKES = [
  { i: 0, action: 'home', dot: 'var(--accent)', label: '홈' },
  { i: 1, action: 'search', dot: 'var(--text-muted)', label: '검색' },
  { i: 2, action: 'sync', dot: '#7fc9bb', label: 'Sync' },
  { i: 3, action: 'library', dot: 'var(--accent-dark)', label: '보관함' },
  { i: 4, action: 'profile', dot: '#caa0d6', label: '프로필' },
];

/** 자주 듣는 아티스트 — 우하단 별무리 (중심 좌표) */
const ARTIST_NODES = [
  { name: '최유리', grad: 'var(--grad-1)', x: 945, y: 772, size: 52 },
  { name: '아이유', grad: 'var(--grad-1)', x: 1030, y: 808, size: 64 },
  { name: 'aespa', grad: 'var(--grad-4)', x: 1122, y: 826, size: 64 },
  { name: 'DEAN', grad: 'var(--grad-3)', x: 1208, y: 800, size: 64 },
  { name: 'BIBI', grad: 'var(--grad-2)', x: 1278, y: 756, size: 52 },
];

const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

const FAR = { tf: 0.08, sf: 0.15 }, NEAR = { tf: 0.22, sf: 0.35 }, PLN = { tf: 0.14, sf: 0.24 };

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


function esc(v) { return v == null ? '' : String(v); }

/** 홈 화면 "갤럭시 뷰" — 태양계. 카테고리 선택 시 빨려 들어가고 / 다시 빠져나온다. */
export default function GalaxyView({ onExit, chartTracks, artists, artistImages }) {
  const navigate = useNavigate();
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, playTrack } = usePlayer();

  const rootRef = useRef(null);
  const viewportRef = useRef(null);
  const universeRef = useRef(null);
  const farRef = useRef(null);
  const nearRef = useRef(null);
  const plnRef = useRef(null);
  const warpAnchorRef = useRef(null);
  const streaksRef = useRef(null);
  const flashRef = useRef(null);
  const mmFrameRef = useRef(null);
  const pctRef = useRef(null);

  const camRef = useRef({ ax: 0, ay: 0, s: 1, r: 0, cx: SW / 2, cy: SH / 2 });
  const dimRef = useRef({ vw: window.innerWidth, vh: window.innerHeight, s0: 1 });
  const rafRef = useRef(null);
  const busyRef = useRef(false);
  const focusedRef = useRef(null);
  const movedRef = useRef(false);
  const aliveRef = useRef(true);
  const hudCacheRef = useRef(null);
  const lastMMRef = useRef(0);
  const mvRef = useRef({ anim: false, wheel: false, drag: false });
  const wheelTimerRef = useRef(null);
  const zRef = useRef({ target: null, raf: null, x: 0, y: 0 });
  const api = useRef({});

  const [focused, setFocused] = useState(null);
  const [dimmed, setDimmed] = useState(false);   // 다른 천체 흐림 — 도착한 뒤에 켠다
  const [panel, setPanel] = useState({ id: 'rain', open: false });
  const [compassOpen, setCompassOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nodeDetail, setNodeDetail] = useState(null);
  const [hintHidden, setHintHidden] = useState(false);
  const [lastMood, setLastMood] = useState(null);   // 마지막 감정 분석 { primaryEmotion, confidence }

  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const starsFar = useMemo(() => makeStars(110, 1.4, 3, 0.4, 0.8, 0, 0.1, 1.7, reduced), [reduced]);
  const starsNear = useMemo(() => makeStars(60, 2.4, 5.6, 0.65, 1, 0.2, 0.16, 2.3, reduced), [reduced]);
  const planets = useMemo(() => makePlanets(3), []);

  function chartTrack(i) {
    return chartTracks && chartTracks.length ? chartTracks[i % chartTracks.length] : null;
  }
  function artistReal(i) {
    const name = (artists && artists[i] && artists[i].name) || ARTIST_NODES[i].name;
    const img = (artistImages || {})[name] || null;
    return { name, img };
  }
  function playIdx(i) {
    if (chartTracks && chartTracks.length) {
      const q = i % chartTracks.length;
      playTrack(chartTracks[q], chartTracks, q);
    }
  }

  /* ── 카메라 ── */
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    dimRef.current = { vw, vh, s0: Math.min(vw / SW, vh / SH) };
  }
  function overviewCam() {
    const { vw, vh, s0 } = dimRef.current;
    return { ax: vw / 2, ay: vh / 2, s: s0, r: 0, cx: SW / 2, cy: SH / 2 };
  }
  function focusCam(c) {
    const { vw, vh, s0 } = dimRef.current;
    const s = Math.max(s0 * 1.6, Math.min(s0 * 9, (vh * 0.56) / (2 * c.fr)));
    return { ax: c.panel ? vw * 0.36 : vw / 2, ay: vh * 0.5, s, r: 0, cx: c.x, cy: c.y };
  }
  function toScreen(c, x, y) {
    const dx = (x - c.cx) * c.s, dy = (y - c.cy) * c.s;
    const cos = Math.cos(c.r), sin = Math.sin(c.r);
    return { x: c.ax + dx * cos - dy * sin, y: c.ay + dx * sin + dy * cos };
  }
  function toWorld(c, px, py) {
    const dx = px - c.ax, dy = py - c.ay;
    const cos = Math.cos(-c.r), sin = Math.sin(-c.r);
    return { x: c.cx + (dx * cos - dy * sin) / c.s, y: c.cy + (dx * sin + dy * cos) / c.s };
  }
  function applyLayer(el, c, p, ox, oy, s0) {
    if (!el) return;
    const z = c.s / s0;
    el.style.transform = `translate(${ox * p.tf}px,${oy * p.tf}px) scale(${1 + (z - 1) * p.sf})`;
  }
  function apply(c) {
    const { vw, vh, s0 } = dimRef.current;
    if (universeRef.current) {
      universeRef.current.style.transform = `translate(${c.ax}px,${c.ay}px) rotate(${c.r}rad) scale(${c.s}) translate(${-c.cx}px,${-c.cy}px)`;
    }
    const mid = toScreen(c, SW / 2, SH / 2);
    const ox = mid.x - vw / 2, oy = mid.y - vh / 2;
    applyLayer(farRef.current, c, FAR, ox, oy, s0);
    applyLayer(nearRef.current, c, NEAR, ox, oy, s0);
    applyLayer(plnRef.current, c, PLN, ox, oy, s0);
    if (!hudCacheRef.current && rootRef.current) {
      hudCacheRef.current = Array.from(rootRef.current.querySelectorAll('.hud-label')).map((el) => ({ el, x: parseFloat(el.dataset.wx), y: parseFloat(el.dataset.wy) }));
    }
    (hudCacheRef.current || []).forEach((h) => {
      const p = toScreen(c, h.x, h.y);
      h.el.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%)`;
    });
    // 미니맵 프레임·줌 % 는 이동 중엔 ~10fps 로만 갱신
    const nowT = performance.now();
    if (!isMoving() || nowT - lastMMRef.current > 100) { lastMMRef.current = nowT; updateMini(c); }
  }
  function isMoving() { const m = mvRef.current; return m.anim || m.wheel || m.drag; }
  function syncMoving() {
    const r = rootRef.current; if (!r) return;
    if (isMoving()) r.setAttribute('data-moving', '1');
    else { r.removeAttribute('data-moving'); apply(camRef.current); }   // 멈추면 한 번 더 그려 선명하게
  }
  function updateMini(c) {
    const { vw, vh } = dimRef.current;
    const fr = mmFrameRef.current;
    if (fr) {
      const pts = [toWorld(c, 0, 0), toWorld(c, vw, 0), toWorld(c, 0, vh), toWorld(c, vw, vh)];
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(SW, Math.max(...xs));
      const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(SH, Math.max(...ys));
      const k = MM_W / SW;
      fr.style.left = `${x0 * k}px`; fr.style.top = `${12 + y0 * k}px`;
      fr.style.width = `${Math.max(4, (x1 - x0) * k)}px`; fr.style.height = `${Math.max(4, (y1 - y0) * k)}px`;
    }
    if (pctRef.current) pctRef.current.textContent = `${Math.round((c.s / dimRef.current.s0) * 100)}%`;
  }

  function warpFrame(kind, t, te) {
    const st = streaksRef.current, fl = flashRef.current;
    if (!st || !fl) return;
    const k = Math.sin(Math.PI * t);
    const scale = kind === 'in' ? 1 + te * 1.8 : 1 + (1 - te) * 1.8;
    st.style.opacity = String(0.9 * Math.pow(k, 0.9));
    st.style.transform = `scale(${scale}) rotate(${te * 24}deg)`;
    const flash = kind === 'in' ? Math.pow(Math.max(0, (t - 0.72) / 0.28), 2) * 0.6
      : Math.pow(Math.max(0, (0.28 - t) / 0.28), 2) * 0.45;
    fl.style.opacity = String(flash);
  }
  function warpEnd() {
    if (streaksRef.current) streaksRef.current.style.opacity = '0';
    if (flashRef.current) { flashRef.current.style.transition = 'opacity .7s ease'; flashRef.current.style.opacity = '0'; }
  }

  function animate(to, o) {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const cam = camRef.current;
    const from = { ...cam };
    if (reduced || !o.dur) { Object.assign(cam, to); cam.r = 0; apply(cam); warpEnd(); return Promise.resolve(); }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const swirl = o.swirl || 0;
      const useWarp = o.kind === 'in' || o.kind === 'out' || o.kind === 'fly';
      if (useWarp && warpAnchorRef.current) {
        const w = warpAnchorRef.current;
        w.style.setProperty('--wx', `${o.wx}px`); w.style.setProperty('--wy', `${o.wy}px`); w.style.setProperty('--wc', o.color || '#ffe2a8');
        if (streaksRef.current) streaksRef.current.style.transition = 'none';
        if (flashRef.current) flashRef.current.style.transition = 'none';
      }
      mvRef.current.anim = true; syncMoving();
      if (useWarp) rootRef.current?.setAttribute('data-flying', '1');
      function frame(now) {
        const t = Math.min(1, (now - t0) / o.dur);
        const te = o.ease(t);
        cam.cx = lerp(from.cx, to.cx, te); cam.cy = lerp(from.cy, to.cy, te);
        cam.ax = lerp(from.ax, to.ax, te); cam.ay = lerp(from.ay, to.ay, te);
        cam.s = from.s * Math.pow(to.s / from.s, te);
        cam.r = swirl * Math.sin(Math.PI * t);
        apply(cam);
        if (useWarp) warpFrame(o.kind === 'fly' ? 'in' : o.kind, t, te);
        if (t < 1) rafRef.current = requestAnimationFrame(frame);
        else { rafRef.current = null; Object.assign(cam, to); cam.r = 0; mvRef.current.anim = false; rootRef.current?.removeAttribute('data-flying'); apply(cam); warpEnd(); syncMoving(); resolve(); }
      }
      rafRef.current = requestAnimationFrame(frame);
    });
  }

  /* ── 빨려 들어가기 / 빠져나오기 ── */
  async function focus(id) {
    const c = CAT[id];
    if (!c || busyRef.current || focusedRef.current === id) return;
    busyRef.current = true;
    setCompassOpen(false); setNodeDetail(null); setHintHidden(true);
    const fromFocused = !!focusedRef.current;
    setPanel((p) => ({ ...p, open: false }));
    focusedRef.current = id; setFocused(id);
    const to = focusCam(c);
    await animate(to, {
      kind: fromFocused ? 'fly' : 'in', dur: fromFocused ? 1000 : 1300,
      ease: fromFocused ? easeInOutCubic : easeInOutQuart, swirl: fromFocused ? 0.28 : 0.5,
      wx: to.ax, wy: to.ay, color: c.color,
    });
    busyRef.current = false;
    if (!aliveRef.current) return;
    setDimmed(true);
    if (c.portal) { onExit(); navigate('/sync'); return; }   // Sync AI = 관문
    setPanel({ id, open: true });
  }
  async function unfocus() {
    if (!focusedRef.current || busyRef.current) return;
    busyRef.current = true;
    const from = { ...camRef.current };
    const color = CAT[focusedRef.current].color;
    setPanel((p) => ({ ...p, open: false }));
    setFocused(null); setDimmed(false);
    await animate(overviewCam(), { kind: 'out', dur: 1050, ease: easeInOutCubic, swirl: -0.4, wx: from.ax, wy: from.ay, color });
    focusedRef.current = null;
    busyRef.current = false;
  }

  function clampPan() {
    const cam = camRef.current, { vw, vh } = dimRef.current;
    const mid = toScreen(cam, SW / 2, SH / 2);
    const lx = vw * 0.6, ly = vh * 0.6;
    if (mid.x < vw / 2 - lx) cam.ax += (vw / 2 - lx) - mid.x;
    if (mid.x > vw / 2 + lx) cam.ax -= mid.x - (vw / 2 + lx);
    if (mid.y < vh / 2 - ly) cam.ay += (vh / 2 - ly) - mid.y;
    if (mid.y > vh / 2 + ly) cam.ay -= mid.y - (vh / 2 + ly);
  }
  const zClamp = (s) => Math.max(dimRef.current.s0 * 0.7, Math.min(dimRef.current.s0 * 3, s));
  // 부드러운 스크롤 줌: 목표 배율만 갱신하고 매 프레임 목표로 다가간다
  function wheelZoom(f, px, py) {
    const z = zRef.current, cam = camRef.current;
    z.target = zClamp((z.target || cam.s) * f); z.x = px; z.y = py;
    mvRef.current.wheel = true; syncMoving();
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => { mvRef.current.wheel = false; syncMoving(); }, 180);
    if (!z.raf) z.raf = requestAnimationFrame(zStep);
  }
  function zStep() {
    const z = zRef.current, cam = camRef.current;
    z.raf = null;
    if (focusedRef.current || busyRef.current || z.target == null || !aliveRef.current) { z.target = null; return; }
    const ratio = z.target / cam.s;
    if (Math.abs(Math.log(ratio)) < 0.003) { api.current.zoomAt(ratio, z.x, z.y); z.target = null; return; }
    api.current.zoomAt(Math.pow(ratio, 0.22), z.x, z.y);
    z.raf = requestAnimationFrame(zStep);
  }
  function zoomAt(f, px, py) {
    const cam = camRef.current;
    const w = toWorld(cam, px, py);
    const ns = zClamp(cam.s * f);
    cam.s = ns; cam.ax = px - (w.x - cam.cx) * ns; cam.ay = py - (w.y - cam.cy) * ns;
    clampPan(); apply(cam);
  }

  // 로그인 상태면 가장 최근 감정 분석 1건 (새 기록이 위로 정렬되어 옴). 실패/비로그인이면 칩을 숨긴다.
  useEffect(() => {
    let alive = true;
    fetchEmotionHistory()
      .then((list) => { if (alive) setLastMood(Array.isArray(list) && list.length && list[0].primaryEmotion ? list[0] : null); })
      .catch(() => { if (alive) setLastMood(null); });
    return () => { alive = false; };
  }, []);

  api.current = { focus, unfocus, zoomAt, wheelZoom, syncMoving, clampPan, apply, animate, overviewCam, focusCam, layout };

  useEffect(() => {
    aliveRef.current = true;
    const A = () => api.current;
    A().layout();
    Object.assign(camRef.current, A().overviewCam());
    A().apply(camRef.current);
    const viewport = viewportRef.current;
    const cam = camRef.current;

    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e) => {
      if (focusedRef.current || busyRef.current) return;
      dragging = true; movedRef.current = false; lastX = e.clientX; lastY = e.clientY;
      viewport.classList.add('dragging');
      mvRef.current.drag = true; A().syncMoving();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
      cam.ax += dx; cam.ay += dy; lastX = e.clientX; lastY = e.clientY;
      A().clampPan(); A().apply(cam); setHintHidden(true);
    };
    const onUp = () => {
      dragging = false; viewport.classList.remove('dragging');
      if (mvRef.current.drag) { mvRef.current.drag = false; A().syncMoving(); }
    };
    const onWheel = (e) => {
      e.preventDefault();
      if (focusedRef.current || busyRef.current) return;
      // 스크롤 = 확대/축소 (포인터 위치 기준). 트랙패드 핀치(ctrl)는 delta 가 작아 감도를 높인다.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { cam.ax -= e.deltaX; A().clampPan(); A().apply(cam); }
      else A().wheelZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY);
      setHintHidden(true);
    };
    const onResize = () => {
      A().layout();
      if (busyRef.current) return;
      Object.assign(cam, focusedRef.current ? A().focusCam(CAT[focusedRef.current]) : A().overviewCam());
      A().apply(cam);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (A().state.searchOpen) { setSearchOpen(false); return; }
      if (A().state.nodeDetail) { setNodeDetail(null); return; }
      if (A().state.compassOpen) { setCompassOpen(false); return; }
      if (focusedRef.current) A().unfocus();
    };
    const onDocClick = () => setNodeDetail(null);

    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => viewport.addEventListener(ev, onUp));
    viewport.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);
    const hintTimer = setTimeout(() => setHintHidden(true), 6000);

    return () => {
      aliveRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (zRef.current.raf) cancelAnimationFrame(zRef.current.raf);
      clearTimeout(wheelTimerRef.current);
      clearTimeout(hintTimer);
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => viewport.removeEventListener(ev, onUp));
      viewport.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDocClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  api.current.state = { searchOpen, nodeDetail, compassOpen };

  /* ── 클릭 핸들러 ── */
  function handleRootClick(e) {
    if (movedRef.current) { movedRef.current = false; return; }
    const bodyEl = e.target.closest('[data-kind="body"]');
    if (bodyEl) { e.stopPropagation(); focus(bodyEl.dataset.cat); return; }
    const satEl = e.target.closest('[data-kind="sat"]');
    if (satEl) { e.stopPropagation(); playIdx(Number(satEl.dataset.idx)); return; }
    const artistEl = e.target.closest('[data-kind="artist"]');
    if (artistEl) {
      e.stopPropagation();
      const { name } = artistReal(Number(artistEl.dataset.idx));
      onExit();
      navigate(`/artist/${encodeURIComponent(name)}`);
      return;
    }
    const rankEl = e.target.closest('[data-kind="rank"]');
    if (rankEl) {
      e.stopPropagation();
      const i = Number(rankEl.dataset.idx);
      const mock = RANK_CARDS[i];
      const qIdx = chartTracks && chartTracks.length ? i % chartTracks.length : -1;
      const track = qIdx >= 0 ? chartTracks[qIdx] : null;
      setNodeDetail({
        title: track?.name || mock.title, artist: track?.artist || mock.artist, tag: '인기 차트',
        bg: track?.albumArt ? `url("${track.albumArt}")` : mock.grad, track, qIdx,
        x: e.clientX, y: Math.max(140, e.clientY - 20),
      });
    }
  }
  function handleMinimapClick(e) {
    e.stopPropagation();
    if (focusedRef.current || busyRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const k = MM_W / SW;
    const wx = (e.clientX - r.left) / k, wy = (e.clientY - r.top - 12) / k;
    const { vw, vh } = dimRef.current;
    animate({ ax: vw / 2, ay: vh / 2, s: camRef.current.s, r: 0, cx: Math.max(0, Math.min(SW, wx)), cy: Math.max(0, Math.min(SH, wy)) },
      { kind: 'pan', dur: 500, ease: easeInOutCubic });
  }
  function handleZoomHome(e) {
    e.stopPropagation();
    if (focusedRef.current) unfocus();
    else if (!busyRef.current) animate(overviewCam(), { kind: 'pan', dur: 600, ease: easeInOutCubic });
  }
  function handleCompassAction(action) {
    setCompassOpen(false);
    if (action === 'home') {
      if (focusedRef.current) unfocus();
      else if (!busyRef.current) animate(overviewCam(), { kind: 'pan', dur: 600, ease: easeInOutCubic });
    }
    else if (action === 'search') setSearchOpen(true);
    else if (action === 'sync') { onExit(); navigate('/sync'); }
    else if (action === 'library') { onExit(); navigate('/playlists'); }
    else if (action === 'profile') { onExit(); navigate('/profile'); }
  }
  function handleNodeDetailGo() {
    if (nodeDetail?.track) playTrack(nodeDetail.track, chartTracks || [], nodeDetail.qIdx);
    setNodeDetail(null);
  }

  /* ── 렌더 ── */
  const panelCat = CAT[panel.id];
  const artOf = (idx, g) => {
    const t = chartTrack(idx);
    return t && t.albumArt ? { backgroundImage: `url("${t.albumArt}")` } : { backgroundImage: `linear-gradient(135deg,${GRAD[g]})` };
  };
  const hasArt = (idx) => { const t = chartTrack(idx); return t && t.albumArt ? ' has-art' : ''; };

  const hud = [
    ...CATS.map((c) => ({
      id: c.id, wx: c.x, wy: c.y + c.hud.dy, cls: `${c.id === 'sun' ? 'sun ' : ''}${c.hud.col ? 'col' : ''}`,
      node: c.hud.col
        ? <><b>{c.name}</b><span className="sub">{c.sub}</span></>
        : <><b>{c.name}</b><i>{c.idxs.length}곡</i></>,
    })),
    { id: 'belt', wx: 720, wy: 242, cls: '', node: <><b>인기 차트</b><i>소행성대 · TOP 3</i></> },
    {
      id: 'mood', wx: 720, wy: 583, cls: `mood${lastMood ? ' has' : ''}`,
      node: <span>{lastMood ? `마지막 감정 분석 · ${EMOTION_LABELS[lastMood.primaryEmotion] || lastMood.primaryEmotion}${lastMood.confidence != null ? ` · ${Math.round(lastMood.confidence * 100)}%` : ''}` : ''}</span>,
    },
    { id: 'artists', wx: 1112, wy: 726, cls: '', node: <><b>자주 듣는 아티스트</b><i>{ARTIST_NODES.length}명</i></> },
    { id: 'sunnow', wx: 720, wy: 558, cls: 'now', node: <span className="now">{currentTrack && isPlaying ? `재생 중 · ${currentTrack.name}` : ''}</span> },
  ];

  return (
    <div
      ref={rootRef}
      className={`galaxy-view${dimmed ? ' focus-mode' : ''}`}
      onClick={handleRootClick}
    >
      <div ref={viewportRef} className={`g-viewport${focused ? ' locked' : ''}`}>
        <div className="gx-nebula a" /><div className="gx-nebula b" /><div className="gx-nebula c" />
        <div className="gx-nebula d" /><div className="gx-nebula e" />
        <div className="gx-milkyway" /><div className="gx-milkyway dust" />
        <div className="gx-dgal" style={{ left: '89.6%', top: '86%', width: 90, height: 26, background: 'radial-gradient(ellipse,rgba(255,240,220,.9),rgba(190,170,255,.4) 35%,rgba(190,170,255,0) 70%)', transform: 'rotate(-28deg)' }} />
        <div className="gx-dgal" style={{ left: '2.8%', top: '44%', width: 80, height: 22, background: 'radial-gradient(ellipse,rgba(255,240,220,.85),rgba(120,180,255,.4) 35%,rgba(120,180,255,0) 70%)', transform: 'rotate(18deg)' }} />
        <div className="g-stars-layer far" ref={farRef}>
          {starsFar.map((s, i) => <div key={i} className={`star${s.shapeClass}`} style={s.style} />)}
        </div>
        <div className="g-stars-layer near" ref={nearRef}>
          {starsNear.map((s, i) => <div key={i} className={`star${s.shapeClass}`} style={s.style} />)}
        </div>
        <div className="planets-layer" ref={plnRef}>
          {planets.map((p, i) => <div key={i} className={`planet${p.hasRing ? ' has-ring' : ''}`} style={p.style} />)}
        </div>

        <div className="g-universe" ref={universeRef}>
          <div className="gx-arms"><div className="gx-arms-spin"><i /></div></div>
          <svg className="gx-orbits" width="1440" height="900" viewBox="0 0 1440 900" aria-hidden="true">
            <g fill="none" strokeWidth="1.2">
              <ellipse cx="720" cy="430" rx="150" ry="82" stroke="rgba(255,226,170,.3)" strokeDasharray="2 6" />
              <ellipse cx="720" cy="430" rx="380" ry="205" stroke="rgba(127,201,187,.55)" />
              <ellipse cx="720" cy="430" rx="420" ry="227" stroke="rgba(202,160,214,.55)" />
              <ellipse cx="720" cy="430" rx="460" ry="249" stroke="rgba(244,166,160,.55)" />
              <ellipse cx="720" cy="430" rx="500" ry="271" stroke="rgba(255,138,99,.55)" />
              <ellipse cx="720" cy="430" rx="540" ry="293" stroke="rgba(130,170,255,.55)" />
              <ellipse cx="720" cy="430" rx="310" ry="172" stroke="rgba(255,226,170,.42)" strokeWidth="6" strokeDasharray="1 6" strokeLinecap="round" />
              <ellipse cx="720" cy="430" rx="310" ry="172" stroke="rgba(245,238,240,.4)" strokeWidth="3" strokeDasharray="1 13" strokeLinecap="round" strokeDashoffset="5" />
            </g>
            <g stroke="rgba(255,226,170,.28)" strokeWidth="1.2" strokeDasharray="3 6" fill="none">
              <line x1="720" y1="430" x2="359" y2="493" /><line x1="720" y1="430" x2="473" y2="246" /><line x1="720" y1="430" x2="1014" y2="211" /><line x1="720" y1="430" x2="1234" y2="521" /><line x1="720" y1="430" x2="720" y2="679" />
            </g>
          </svg>
          <div className="gx-odots" aria-hidden="true">
            <i className="gx-odot" style={{ background: '#a8e0d2', offsetPath: "path('M340 430 a380 205 0 1 0 760 0 a380 205 0 1 0 -760 0')", animationDuration: '46s' }} />
            <i className="gx-odot" style={{ background: '#bcd4ff', offsetPath: "path('M180 430 a540 293 0 1 0 1080 0 a540 293 0 1 0 -1080 0')", animationDuration: '70s' }} />
            <i className="gx-odot" style={{ background: '#ffb199', offsetPath: "path('M220 430 a500 271 0 1 0 1000 0 a500 271 0 1 0 -1000 0')", animationDuration: '58s' }} />
          </div>

          <div className={`gx-body${focused === 'sun' ? ' is-target' : ''}`}>
            <div className="gx-corona c2" /><div className="gx-corona c1" />
            <div className="gx-rays" /><div className="gx-sunpulse" />
            <div className="gx-sunball" data-kind="body" data-cat="sun" />
            {SUN_SATS.map((s) => (
              <div key={s.idx} className={`disc gx-sat${hasArt(s.idx)}`} data-kind="sat" data-idx={s.idx}
                style={{ left: s.x - s.s / 2, top: s.y - s.s / 2, width: s.s, height: s.s, boxShadow: '0 0 14px rgba(255,214,140,.45)', ...artOf(s.idx, MUSIC_NODES[s.idx].g) }} />
            ))}
          </div>

          <div className="gx-belt">
            {RANK_CARDS.map((r, i) => {
              const t = chartTrack(i);
              return (
                <div key={r.rank} className="rank-card" data-kind="rank" data-idx={i} style={{ left: r.left, top: r.top }}>
                  <span className="rank-num">{r.rank}</span>
                  <span className="rank-thumb" style={{ backgroundImage: t?.albumArt ? `url("${t.albumArt}")` : r.grad }} />
                  <span className="rank-text">
                    <span className="rank-title">{t?.name || r.title}</span>
                    <span className="rank-artist">{t?.artist || r.artist}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {CATS.filter((c) => c.id !== 'sun').map((c) => {
            const ox = c.x - c.R, oy = c.y - c.R, px = c.x - c.size / 2, py = c.y - c.size / 2;
            return (
              <div key={c.id} className={`gx-body${focused === c.id ? ' is-target' : ''}`} data-cat={c.id}>
                <div className="gx-halo" style={{ left: c.x - c.halo.size / 2, top: c.y - c.halo.size / 2, width: c.halo.size, height: c.halo.size, background: `radial-gradient(circle,${c.halo.color},transparent 68%)` }} />
                {c.ring && <div className="gx-ring" style={{ left: c.x - 85, top: c.y - 17, width: 170, height: 34 }} />}
                <div className="mring" style={{ left: ox, top: oy, width: 2 * c.R, height: 2 * c.R }} />
                {c.station && <div className="gx-pulse" style={{ left: px, top: py, width: c.size, height: c.size }} />}
                <div className={`gx-planet${c.station ? ' gx-station' : ''}`} data-kind="body" data-cat={c.id}
                  style={{ left: px, top: py, width: c.size, height: c.size, background: c.bg, boxShadow: c.station ? `0 0 34px ${c.glow}` : `${c.shade},0 0 34px ${c.glow}` }}>
                  {c.station && (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0a0a1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
                  )}
                </div>
                <div className={c.spin} style={{ left: ox, top: oy, width: 2 * c.R, height: 2 * c.R, animationDuration: `${c.dur}s` }}>
                  {c.moons.map((m, k) => {
                    const idx = c.idxs[k];
                    const g = m.g || MUSIC_NODES[idx].g;
                    return <div key={k} className={`disc gx-moon${idx != null ? hasArt(idx) : ''}`} style={{ left: m.l, top: m.t, width: m.s, height: m.s, ...(idx != null ? artOf(idx, g) : { backgroundImage: `linear-gradient(135deg,${GRAD[g]})` }) }} />;
                  })}
                </div>
              </div>
            );
          })}
          <div className="gx-body">
            <div className="gx-artist-glow" style={{ left: 895, top: 690, width: 440, height: 240, background: 'radial-gradient(ellipse,rgba(255,201,138,.28),transparent 68%)' }} />
            {ARTIST_NODES.map((a, i) => {
              const { name, img } = artistReal(i);
              const style = { left: a.x - a.size / 2, top: a.y - a.size / 2, width: a.size, height: a.size, fontSize: a.size < 64 ? 11 : 13 };
              if (img) Object.assign(style, { background: 'none', backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' });
              else style.background = a.grad;
              return (
                <div key={a.name} className={`artist-node${img ? ' has-img' : ''}`} data-kind="artist" data-idx={i} style={style}>
                  <span className="an-name">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="gx-warp" ref={warpAnchorRef}>
        <div className="gx-warp-streaks" ref={streaksRef} />
        <div className="gx-warp-flash" ref={flashRef} />
      </div>

      <div id="gxHudLabels">
        {hud.map((h) => <div key={h.id} className={`hud-label ${h.cls}`} data-wx={h.wx} data-wy={h.wy}>{h.node}</div>)}
      </div>

      <div className="gx-topbar">
        <button className="gx-logo" onClick={(e) => { e.stopPropagation(); onExit(); }} aria-label="그리드 뷰로 돌아가기">SYNC</button>
        <div className="gx-chips">
          {CATS.map((c) => (
            <button key={c.id} className={`gx-chip${focused === c.id ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); focus(c.id); }}>{c.name}</button>
          ))}
        </div>
        <div className="gx-right">
          <button className="gx-iconbtn" aria-label="검색" onClick={(e) => { e.stopPropagation(); setSearchOpen(true); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </button>
          <div className="gx-toggle">
            <button onClick={(e) => { e.stopPropagation(); onExit(); }}>그리드</button>
            <button className="on">갤럭시</button>
          </div>
        </div>
      </div>

      <div className={`g-hint${hintHidden ? ' hidden' : ''}`}>드래그로 이동 · 스크롤로 확대/축소 · 행성을 누르면 빨려 들어가요</div>

      <div className="minimap" onClick={handleMinimapClick}>
        <span className="mm-caption">태양계 지도</span>
        <svg viewBox="0 0 1440 900" width={MM_W} height={MM_H} aria-hidden="true">
          <g fill="none" stroke="rgba(245,238,240,.3)" strokeWidth="7">
            <ellipse cx="720" cy="430" rx="380" ry="205" /><ellipse cx="720" cy="430" rx="420" ry="227" /><ellipse cx="720" cy="430" rx="460" ry="249" /><ellipse cx="720" cy="430" rx="500" ry="271" /><ellipse cx="720" cy="430" rx="540" ry="293" />
          </g>
          {CATS.map((c) => <circle key={c.id} cx={c.x} cy={c.y} r={c.id === 'sun' ? 46 : 36} fill={c.color} />)}
          {ARTIST_NODES.map((a) => <circle key={a.name} cx={a.x} cy={a.y} r={16} fill="#f5e3b8" opacity=".85" />)}
        </svg>
        <div className="mm-frame" ref={mmFrameRef} />
      </div>

      <div className={`compass-wrap${compassOpen ? ' open' : ''}`}>
        {SPOKES.map((s) => (
          <button key={s.i} className="spoke" data-i={s.i} aria-label={s.label}
            onClick={(e) => { e.stopPropagation(); handleCompassAction(s.action); }}>
            <span className="dot" style={{ background: s.dot }} />{s.label}
          </button>
        ))}
        <button className="compass-btn" aria-label="항목별 보기 메뉴 열기" onClick={(e) => { e.stopPropagation(); setCompassOpen((v) => !v); }}>
          <span className="ring" /><span className="core" />
        </button>
      </div>

      <div className="gx-zoom" onClick={(e) => e.stopPropagation()}>
        <button className="gx-iconbtn" aria-label="확대" onClick={() => { if (!focusedRef.current && !busyRef.current) wheelZoom(1.3, dimRef.current.vw / 2, dimRef.current.vh / 2); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <div className="pct" ref={pctRef}>100%</div>
        <button className="gx-iconbtn" aria-label="축소" onClick={() => { if (!focusedRef.current && !busyRef.current) wheelZoom(1 / 1.3, dimRef.current.vw / 2, dimRef.current.vh / 2); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button className="gx-iconbtn" aria-label="전체 보기로 돌아가기" style={{ color: 'var(--accent)' }} onClick={handleZoomHome}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
        </button>
      </div>

      <aside className={`gx-panel${panel.open ? ' open' : ''}`} aria-live="polite" onClick={(e) => e.stopPropagation()}>
        <button className="gx-panel-back" onClick={unfocus}>← 전체 보기</button>
        <div className="gx-panel-head">
          <span className="orbdot" style={{ background: panelCat.id === 'sun' ? 'radial-gradient(circle at 42% 38%,#fffaf0,#f5c46a 60%,#d98a2e)' : panelCat.bg }} />
          <div><div className="name">{panelCat.name}</div><div className="sub">{panelCat.idxs.length}곡 · {panelCat.sub}</div></div>
        </div>
        <button className="gx-panel-play" onClick={() => { if (panelCat.idxs.length) playIdx(panelCat.idxs[0]); }}>▶ 전체 재생</button>
        <div className="gx-panel-list">
          {panelCat.idxs.map((i) => {
            const n = MUSIC_NODES[i], t = chartTrack(i);
            return (
              <button key={i} className="gx-row" onClick={() => playIdx(i)}>
                <span className="art" style={artOf(i, n.g)} />
                <span className="txt"><div className="t">{esc(t ? t.name : n.title)}</div><div className="a">{esc(t ? t.artist : n.artist)}</div></span>
                <span className="go">▶</span>
              </button>
            );
          })}
        </div>
      </aside>

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
