/**
 * GalaxyView — 홈 화면 "갤럭시 뷰" (태양계)
 *
 * 구성: 태양 = "지금 이 순간", 행성 = 무드 카테고리(비 오는 날·집중할 때·드라이브·설렘 가득),
 *       Sync AI = 마지막 궤도의 관문. 곡은 각 행성을 도는 위성, 인기 차트는 소행성대.
 *
 * 카메라: 1440×900 장면 좌표계를 뷰포트에 맞춰 보여주고, 카테고리를 고르면
 *   · 빨려 들어가는 애니메이션(zoom-in + 소용돌이 회전 + 워프 줄무늬 + 도착 플래시)
 *   · 전체 보기로 빠져나오는 애니메이션(zoom-out + 반대 회전 + 워프)
 * 을 requestAnimationFrame 으로 구동한다. (React 쪽 components/GalaxyView.jsx 와 동일한 엔진)
 *
 * 데이터: MUSIC_NODES / RANK_CARDS 는 정적 목업이고, window._chartTracks 가 로드돼 있으면
 *         같은 인덱스의 실제 곡(제목·아티스트·앨범아트·재생)으로 덮어쓴다. (기존 동작 유지)
 */
const GalaxyView = (() => {

  const SW = 1440, SH = 900;
  const MM_W = 208, MM_H = 130;           // 미니맵 SVG 크기 (viewBox 1440×900 → 208×130)

  const GRAD = {
    amber: '#f0d9a8,#8a4c13', gold: '#d9c08f,#6b4a1c', rust: '#ff8a63,#5c1f12',
    rose: '#f4a6a0,#5c2320', plum: '#caa0d6,#3c2048', teal: '#7fc9bb,#123a34', blue: '#bcd4ff,#2a3f8a',
  };

  const MUSIC_NODES = [
    { title: '밤편지',          artist: '아이유',          g: 'amber' },   // 0  지금 이 순간
    { title: 'Nostalgia',       artist: 'DEAN',            g: 'gold'  },   // 1
    { title: "오늘만 I'm",      artist: '최유리',          g: 'rust'  },   // 2
    { title: 'Home Sweet Home', artist: '이영지',          g: 'rose'  },   // 3
    { title: 'Rainy Study',     artist: 'Various Artists', g: 'amber' },   // 4
    { title: '내 프로필',       artist: '저장한 곡 · 최근 재생', g: 'gold' }, // 5 (미사용)
    { title: '소나기',          artist: '헤이즈',          g: 'plum'  },   // 6  비 오는 날
    { title: 'Rainy Study',     artist: 'Various Artists', g: 'plum'  },   // 7
    { title: '밤편지',          artist: '아이유',          g: 'rose'  },   // 8
    { title: '바다처럼',        artist: '아이유',          g: 'rust'  },   // 9  드라이브
    { title: 'Cruising',        artist: 'pH-1',            g: 'amber' },   // 10
    { title: '창밖은 밤 11시',  artist: '산들',            g: 'gold'  },   // 11
    { title: 'Focus Flow',      artist: 'Various Artists', g: 'teal'  },   // 12 집중할 때
    { title: 'Low-fi Room',     artist: 'Various Artists', g: 'teal'  },   // 13
    { title: 'Nostalgia',       artist: 'DEAN',            g: 'gold'  },   // 14
    { title: '첫눈',            artist: '아이유',          g: 'rose'  },   // 15 설렘 가득
    { title: 'Supernova',       artist: 'aespa',           g: 'rust'  },   // 16
    { title: '봄날의 고백',     artist: '최유리',          g: 'amber' },   // 17
  ];

  const RANK_CARDS = [
    { rank: 1, title: '밤편지',    artist: '아이유', grad: 'linear-gradient(135deg,#f0d9a8,#8a4c13)', left: 550, top: 258 },
    { rank: 2, title: 'Supernova', artist: 'aespa',  grad: 'linear-gradient(135deg,#ff8a63,#5c1f12)', left: 666, top: 258 },
    { rank: 3, title: '첫눈',      artist: '아이유', grad: 'linear-gradient(135deg,#f4a6a0,#5c2320)', left: 782, top: 258 },
  ];

  // 태양 주변 위성(= "지금 이 순간" 곡). 중심 좌표 기준.
  const SUN_SATS = [
    { idx: 1, x: 850, y: 471, s: 40 },
    { idx: 2, x: 590, y: 471, s: 34 },
    { idx: 3, x: 669, y: 353, s: 30 },
    { idx: 4, x: 835, y: 377, s: 36 },
  ];

  /** 카테고리(= 천체). x,y = 장면 좌표, fr = 포커스 때 화면에 담을 반지름(월드 단위) */
  const CATS = [
    { id: 'sun', name: '지금 이 순간', sub: '당신의 무드에 맞춘 첫 화면', color: '#ffd98a', x: 720, y: 430, fr: 150, panel: true,
      idxs: [0, 1, 2, 3, 4], hud: { dy: 106 } },
    { id: 'rain', name: '비 오는 날', sub: '빗소리와 어울리는 곡', color: '#caa0d6', x: 473, y: 246, size: 68, R: 62, panel: true,
      bg: 'radial-gradient(circle at 72% 38%,#e6c4ef,#6a3f7a 45%,#3c2048 85%)', shade: 'inset 10px -6px 16px rgba(0,0,0,.5)', glow: 'rgba(202,160,214,.5)',
      halo: { size: 320, color: 'rgba(202,160,214,.36)' }, spin: 'gx-spin', dur: 40, fr: 66,
      moons: [{ l: 80, t: -5, s: 26 }, { l: 106, t: 83, s: 20 }, { l: -10, t: 62, s: 22 }], idxs: [6, 7, 8], hud: { dy: -86 } },
    { id: 'focus', name: '집중할 때', sub: '몰입을 돕는 곡', color: '#7fc9bb', x: 359, y: 493, size: 76, R: 70, panel: true,
      bg: 'radial-gradient(circle at 72% 38%,#c4eee2,#2f7468 45%,#123a34 85%)', shade: 'inset 11px -7px 18px rgba(0,0,0,.5)', glow: 'rgba(127,201,187,.5)',
      halo: { size: 320, color: 'rgba(127,201,187,.34)' }, spin: 'gx-spin rev', dur: 55, fr: 74,
      moons: [{ l: 119, t: 23, s: 24 }, { l: -6, t: 36, s: 20 }, { l: 59, t: 129, s: 22 }], idxs: [12, 13, 14], hud: { dy: 96 } },
    { id: 'drive', name: '드라이브', sub: '창문을 열고 달릴 때', color: '#ff8a63', x: 1014, y: 211, size: 84, R: 76, panel: true,
      bg: 'radial-gradient(circle at 28% 38%,#ffc2a8,#b04a2a 45%,#5c1f12 85%)', shade: 'inset -11px -7px 18px rgba(0,0,0,.5)', glow: 'rgba(255,138,99,.6)',
      halo: { size: 320, color: 'rgba(255,138,99,.38)' }, spin: 'gx-spin', dur: 32, fr: 82,
      moons: [{ l: -9, t: 36, s: 28 }, { l: 103, t: 131, s: 22 }, { l: 92, t: -5, s: 20 }], idxs: [9, 10, 11], hud: { dy: 102 } },
    { id: 'excite', name: '설렘 가득', sub: '두근거리는 순간의 곡', color: '#f4a6a0', x: 720, y: 679, size: 90, R: 84, panel: true, ring: true,
      bg: 'radial-gradient(circle at 28% 38%,#ffdcd6,#b0605a 45%,#5c2320 85%)', shade: 'inset -12px -7px 20px rgba(0,0,0,.5)', glow: 'rgba(244,166,160,.5)',
      halo: { size: 340, color: 'rgba(244,166,160,.36)' }, spin: 'gx-spin', dur: 48, fr: 90,
      moons: [{ l: -8, t: 100, s: 26 }, { l: 137, t: 127, s: 22 }, { l: 96, t: -7, s: 20 }], idxs: [15, 16, 17], hud: { dy: 110 } },
    { id: 'sync', name: 'Sync AI', sub: '기분을 사진 한 장으로', color: '#9ec0ff', x: 1234, y: 521, size: 70, R: 62, portal: true, station: true,
      bg: 'radial-gradient(circle at 35% 30%,#d4e4ff,#2a3f8a)', shade: 'inset 0 0 0 rgba(0,0,0,0)', glow: 'rgba(130,170,255,.7)',
      halo: { size: 240, color: 'rgba(130,170,255,.42)' }, spin: 'gx-spin rev', dur: 36, fr: 70,
      moons: [{ l: 100, t: 20, s: 16, g: 'blue' }, { l: 4, t: 80, s: 14, g: 'blue' }], idxs: [], hud: { dy: 65, col: true } },
  ];
  /** 자주 듣는 아티스트 — 우하단 별무리 (중심 좌표) */
  const ARTIST_NODES = [
    { name: '최유리', grad: 'var(--grad-1)', x: 945, y: 772, size: 52 },
    { name: '아이유', grad: 'var(--grad-1)', x: 1030, y: 808, size: 64 },
    { name: 'aespa',  grad: 'var(--grad-4)', x: 1122, y: 826, size: 64 },
    { name: 'DEAN',   grad: 'var(--grad-3)', x: 1208, y: 800, size: 64 },
    { name: 'BIBI',   grad: 'var(--grad-2)', x: 1278, y: 756, size: 52 },
  ];
  const EMOTION_LABELS = {
    happy: '😊 행복', sad: '😢 슬픔', calm: '😌 차분', energetic: '⚡ 활기',
    romantic: '💕 로맨틱', melancholy: '🌧 감성', angry: '🔥 강렬', dreamy: '🌙 몽환',
  };
  const CAT = {};
  CATS.forEach(c => { CAT[c.id] = c; });

  const ORBITS_SVG = `
    <svg class="gx-orbits" width="1440" height="900" viewBox="0 0 1440 900" aria-hidden="true">
      <g fill="none" stroke-width="1.2">
        <ellipse cx="720" cy="430" rx="150" ry="82" stroke="rgba(255,226,170,.3)" stroke-dasharray="2 6"/>
        <ellipse cx="720" cy="430" rx="380" ry="205" stroke="rgba(127,201,187,.55)"/>
        <ellipse cx="720" cy="430" rx="420" ry="227" stroke="rgba(202,160,214,.55)"/>
        <ellipse cx="720" cy="430" rx="460" ry="249" stroke="rgba(244,166,160,.55)"/>
        <ellipse cx="720" cy="430" rx="500" ry="271" stroke="rgba(255,138,99,.55)"/>
        <ellipse cx="720" cy="430" rx="540" ry="293" stroke="rgba(130,170,255,.55)"/>
        <ellipse cx="720" cy="430" rx="310" ry="172" stroke="rgba(255,226,170,.42)" stroke-width="6" stroke-dasharray="1 6" stroke-linecap="round"/>
        <ellipse cx="720" cy="430" rx="310" ry="172" stroke="rgba(245,238,240,.4)" stroke-width="3" stroke-dasharray="1 13" stroke-linecap="round" stroke-dashoffset="5"/>
      </g>
      <g stroke="rgba(255,226,170,.28)" stroke-width="1.2" stroke-dasharray="3 6" fill="none">
        <line x1="720" y1="430" x2="359" y2="493"/><line x1="720" y1="430" x2="473" y2="246"/><line x1="720" y1="430" x2="1014" y2="211"/><line x1="720" y1="430" x2="1234" y2="521"/><line x1="720" y1="430" x2="720" y2="679"/>
      </g>
    </svg>`;

  const STAR_COLORS = ['#ffffff','#ffffff','#ffffff','#f5e3b8','#f5e3b8','#e8c9a0','#d9a6c2'];
  const PLANET_PALETTES = [
    ['#ffd9a8','#8a4c13'],['#ffb199','#5c1f12'],['#ffe9a0','#7a5410'],
    ['#f7c3bd','#5c2320'],['#dcb8e6','#3c2048'],['#a8e0d2','#123a34'],
    ['#d9639e','#3c0028'],['#ecd9ae','#a8813f'],
  ];

  function _makeStars(container, count, sizeMin, sizeMax, opMin, opMax, spikeChance, diamondChance, glowMul, reduced) {
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

  function _makePlanets(container, count) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'planet';
      const size = 40 + Math.random() * 80;
      const pal = PLANET_PALETTES[Math.floor(Math.random() * PLANET_PALETTES.length)];
      el.style.left = (Math.random() * 100) + '%';
      el.style.top = (Math.random() * 100) + '%';
      el.style.width = size + 'px'; el.style.height = size + 'px';
      el.style.background = 'radial-gradient(circle at 32% 28%, ' + pal[0] + ' 0%, ' + pal[1] + ' 78%)';
      el.style.opacity = 0.3 + Math.random() * 0.3;
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

  /* ── 상태 ─────────────────────────────────────────── */
  let _built = false;
  let _open = false;
  let _moved = false;
  let _playerPollTimer = null;
  let _resizeBound = false;
  let _hudEls = null, _lastMM = 0;
  const _mv = { anim: false, wheel: false, drag: false };
  let _wheelTimer = null;
  function _isMoving() { return _mv.anim || _mv.wheel || _mv.drag; }
  function _syncMoving() {
    const r = _root(); if (!r) return;
    if (_isMoving()) r.setAttribute('data-moving', '1');
    else { r.removeAttribute('data-moving'); _apply(cam); }   // 멈추면 정확히 한 번 더 그려 선명하게
  }
  let _focused = null;          // 포커스된 카테고리 id (없으면 null)
  let _busy = false;            // 카메라 애니메이션 진행 중
  let _raf = null;
  let _reduced = false;
  let vw = 1440, vh = 900, s0 = 1;
  const cam = { ax: 0, ay: 0, s: 1, r: 0, cx: SW / 2, cy: SH / 2 };

  let viewport, universe, starsFar, starsNear, planetsLayer, warp, warpStreaks, warpFlash, panel;

  function _root() { return document.getElementById('galaxy-view-root'); }
  function _$(id) { return document.getElementById(id); }

  /* ── 실제 데이터 페어링 ── */
  function _artistReal(i) {
    const list = window._homeArtists;
    const name = (list && list[i] && list[i].name) || ARTIST_NODES[i].name;
    const img = (window._homeArtistImages || {})[name] || null;
    return { name, img };
  }
  function _chartTrack(i) {
    const chart = window._chartTracks;
    return chart && chart.length ? chart[i % chart.length] : null;
  }
  function _artBg(track, g) {
    return track && track.albumArt ? `url("${track.albumArt}")` : `linear-gradient(135deg,${GRAD[g]})`;
  }

  /* ── DOM 빌드 (최초 1회) ── */
  function _planetHTML(c) {
    const R = c.R, ox = c.x - R, oy = c.y - R;
    const moons = c.moons.map((m, k) => {
      const idx = c.idxs[k];
      const g = m.g || MUSIC_NODES[idx].g;
      return `<div class="disc gx-moon" data-idx="${idx == null ? '' : idx}" style="left:${m.l}px;top:${m.t}px;width:${m.s}px;height:${m.s}px;background-image:linear-gradient(135deg,${GRAD[g]})"></div>`;
    }).join('');
    const inner = c.station
      ? `<div class="gx-pulse" style="left:${c.x - c.size / 2}px;top:${c.y - c.size / 2}px;width:${c.size}px;height:${c.size}px"></div>
         <div class="gx-planet gx-station" data-kind="body" data-cat="${c.id}" style="left:${c.x - c.size / 2}px;top:${c.y - c.size / 2}px;width:${c.size}px;height:${c.size}px;background:${c.bg};box-shadow:0 0 34px ${c.glow}">
           <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0a0a1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>
         </div>`
      : `<div class="gx-planet" data-kind="body" data-cat="${c.id}" style="left:${c.x - c.size / 2}px;top:${c.y - c.size / 2}px;width:${c.size}px;height:${c.size}px;background:${c.bg};box-shadow:${c.shade},0 0 34px ${c.glow}"></div>`;
    return `
      <div class="gx-body" data-cat="${c.id}">
        <div class="gx-halo" style="left:${c.x - c.halo.size / 2}px;top:${c.y - c.halo.size / 2}px;width:${c.halo.size}px;height:${c.halo.size}px;background:radial-gradient(circle,${c.halo.color},transparent 68%)"></div>
        ${c.ring ? `<div class="gx-ring" style="left:${c.x - 85}px;top:${c.y - 17}px;width:170px;height:34px"></div>` : ''}
        <div class="mring" style="left:${ox}px;top:${oy}px;width:${2 * R}px;height:${2 * R}px"></div>
        ${inner}
        <div class="${c.spin}" style="left:${ox}px;top:${oy}px;width:${2 * R}px;height:${2 * R}px;animation-duration:${c.dur}s">${moons}</div>
      </div>`;
  }

  function _sunHTML() {
    const sats = SUN_SATS.map(s => `
      <div class="disc gx-sat" data-kind="sat" data-idx="${s.idx}" style="left:${s.x - s.s / 2}px;top:${s.y - s.s / 2}px;width:${s.s}px;height:${s.s}px;background-image:linear-gradient(135deg,${GRAD[MUSIC_NODES[s.idx].g]});box-shadow:0 0 14px rgba(255,214,140,.45)"></div>`).join('');
    return `
      <div class="gx-body" data-cat="sun">
        <div class="gx-corona c2"></div>
        <div class="gx-corona c1"></div>
        <div class="gx-rays"></div>
        <div class="gx-sunpulse"></div>
        <div class="gx-sunball" data-kind="body" data-cat="sun"></div>
        ${sats}
      </div>`;
  }

  function _hudItems() {
    const items = [];
    CATS.forEach(c => {
      const count = c.idxs.length;
      items.push({ id: c.id, wx: c.x, wy: c.y + c.hud.dy, cls: (c.id === 'sun' ? 'sun ' : '') + (c.hud.col ? 'col' : ''),
        html: c.hud.col
          ? `<b>${c.name}</b><span class="sub">${c.sub}</span>`
          : `<b>${c.name}</b><i>${count}곡</i>` });
    });
    items.push({ id: 'belt', wx: 720, wy: 242, cls: '', html: '<b>인기 차트</b><i>소행성대 · TOP 3</i>' });
    items.push({ id: 'mood', wx: 720, wy: 583, cls: 'mood', html: '<span id="gxMood"></span>' });
    items.push({ id: 'artists', wx: 1112, wy: 726, cls: '', html: '<b>자주 듣는 아티스트</b><i>' + ARTIST_NODES.length + '명</i>' });
    items.push({ id: 'sunnow', wx: 720, wy: 558, cls: 'now', html: '<span class="now" id="gxSunNow"></span>' });
    return items;
  }

  function _build() {
    if (_built) return;
    _built = true;
    _reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const root = document.createElement('div');
    root.id = 'galaxy-view-root';
    root.className = 'galaxy-view hidden';

    const rankCards = RANK_CARDS.map((r, i) => `
      <div class="rank-card" data-kind="rank" data-idx="${i}" style="left:${r.left}px;top:${r.top}px">
        <span class="rank-num">${r.rank}</span>
        <span class="rank-thumb" data-thumb style="background-image:${r.grad}"></span>
        <span class="rank-text">
          <span class="rank-title" data-title>${r.title}</span>
          <span class="rank-artist" data-artist>${r.artist}</span>
        </span>
      </div>`).join('');

    const hud = _hudItems().map(h => `<div class="hud-label ${h.cls}" data-hud="${h.id}" data-wx="${h.wx}" data-wy="${h.wy}">${h.html}</div>`).join('');

    const chips = CATS.map(c => `<button class="gx-chip" data-cat="${c.id}">${c.name}</button>`).join('');
    const SPOKES = [
      { action: 'home',    dot: 'var(--accent)',      label: '홈' },
      { action: 'search',  dot: 'var(--text-muted)',  label: '검색' },
      { action: 'sync',    dot: '#7fc9bb',            label: 'Sync' },
      { action: 'library', dot: 'var(--accent-dark)', label: '보관함' },
      { action: 'profile', dot: '#caa0d6',            label: '프로필' },
    ];
    const spokes = SPOKES.map((sp, i) => `
      <button class="spoke" data-i="${i}" data-action="${sp.action}" aria-label="${sp.label}">
        <span class="dot" style="background:${sp.dot}"></span>${sp.label}
      </button>`).join('');
    const artistNodes = ARTIST_NODES.map((a, i) => `
      <div class="artist-node" data-kind="artist" data-idx="${i}" style="left:${a.x - a.size / 2}px;top:${a.y - a.size / 2}px;width:${a.size}px;height:${a.size}px;background:${a.grad};font-size:${a.size < 64 ? 11 : 13}px">
        <span class="an-name" data-name>${a.name}</span>
      </div>`).join('');

    const mmDots = CATS.map(c => `<circle cx="${c.x}" cy="${c.y}" r="${c.id === 'sun' ? 46 : 36}" fill="${c.color}"/>`).join('')
      + ARTIST_NODES.map(a => `<circle cx="${a.x}" cy="${a.y}" r="16" fill="#f5e3b8" opacity=".85"/>`).join('');

    root.innerHTML = `
      <div class="g-viewport" id="gxViewport">
        <div class="gx-nebula a"></div><div class="gx-nebula b"></div><div class="gx-nebula c"></div>
        <div class="gx-nebula d"></div><div class="gx-nebula e"></div>
        <div class="gx-milkyway"></div><div class="gx-milkyway dust"></div>
        <div class="gx-dgal" style="left:89.6%;top:86%;width:90px;height:26px;background:radial-gradient(ellipse,rgba(255,240,220,.9),rgba(190,170,255,.4) 35%,rgba(190,170,255,0) 70%);transform:rotate(-28deg)"></div>
        <div class="gx-dgal" style="left:2.8%;top:44%;width:80px;height:22px;background:radial-gradient(ellipse,rgba(255,240,220,.85),rgba(120,180,255,.4) 35%,rgba(120,180,255,0) 70%);transform:rotate(18deg)"></div>
        <div class="g-stars-layer far" id="gxStarsFar"></div>
        <div class="g-stars-layer near" id="gxStarsNear"></div>
        <div class="planets-layer" id="gxPlanets"></div>
        <div class="g-universe" id="gxUniverse">
          <div class="gx-arms"><div class="gx-arms-spin"><i></i></div></div>
          ${ORBITS_SVG}
      <div class="gx-odots" aria-hidden="true">
        <i class="gx-odot" style="background:#a8e0d2;offset-path:path('M340 430 a380 205 0 1 0 760 0 a380 205 0 1 0 -760 0');animation-duration:46s"></i>
        <i class="gx-odot" style="background:#bcd4ff;offset-path:path('M180 430 a540 293 0 1 0 1080 0 a540 293 0 1 0 -1080 0');animation-duration:70s"></i>
        <i class="gx-odot" style="background:#ffb199;offset-path:path('M220 430 a500 271 0 1 0 1000 0 a500 271 0 1 0 -1000 0');animation-duration:58s"></i>
      </div>
          ${_sunHTML()}
          <div class="gx-belt">${rankCards}</div>
          ${CATS.filter(c => c.id !== 'sun').map(_planetHTML).join('')}
          <div class="gx-body" data-cluster="artists">
            <div class="gx-artist-glow" style="left:895px;top:690px;width:440px;height:240px;background:radial-gradient(ellipse,rgba(255,201,138,.28),transparent 68%)"></div>
            ${artistNodes}
          </div>
        </div>
      </div>

      <div class="gx-warp" id="gxWarp"><div class="gx-warp-streaks" id="gxWarpStreaks"></div><div class="gx-warp-flash" id="gxWarpFlash"></div></div>

      <div id="gxHudLabels">${hud}</div>

      <div class="gx-topbar">
        <button class="gx-logo" id="gxLogoBtn" aria-label="그리드 뷰로 돌아가기">SYNC</button>
        <div class="gx-chips" id="gxChips">${chips}</div>
        <div class="gx-right">
          <button class="gx-iconbtn" id="gxSearchBtn" aria-label="검색">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          </button>
          <div class="gx-toggle">
            <button id="gxGridBtn">그리드</button>
            <button class="on" id="gxGalaxyBtn">갤럭시</button>
          </div>
        </div>
      </div>

      <div class="g-hint" id="gxHint">드래그로 이동 · 스크롤로 확대/축소 · 행성을 누르면 빨려 들어가요</div>

      <div class="minimap" id="gxMinimap">
        <span class="mm-caption">태양계 지도</span>
        <svg viewBox="0 0 1440 900" width="${MM_W}" height="${MM_H}" aria-hidden="true">
          <g fill="none" stroke="rgba(245,238,240,.3)" stroke-width="7">
            <ellipse cx="720" cy="430" rx="380" ry="205"/><ellipse cx="720" cy="430" rx="420" ry="227"/><ellipse cx="720" cy="430" rx="460" ry="249"/><ellipse cx="720" cy="430" rx="500" ry="271"/><ellipse cx="720" cy="430" rx="540" ry="293"/>
          </g>
          ${mmDots}
        </svg>
        <div class="mm-frame" id="gxMmFrame"></div>
      </div>

      <div class="compass-wrap" id="gxCompassWrap">
        ${spokes}
        <button class="compass-btn" id="gxCompassBtn" aria-label="항목별 보기 메뉴 열기"><span class="ring"></span><span class="core"></span></button>
      </div>

      <div class="gx-zoom">
        <button class="gx-iconbtn" id="gxZoomIn" aria-label="확대"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <div class="pct" id="gxZoomPct">100%</div>
        <button class="gx-iconbtn" id="gxZoomOut" aria-label="축소"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
        <button class="gx-iconbtn" id="gxZoomHome" aria-label="전체 보기로 돌아가기" style="color:var(--accent)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>
      </div>

      <aside class="gx-panel" id="gxPanel" aria-live="polite">
        <button class="gx-panel-back" id="gxPanelBack">← 전체 보기</button>
        <div class="gx-panel-head">
          <span class="orbdot" id="gxPanelDot"></span>
          <div><div class="name" id="gxPanelName"></div><div class="sub" id="gxPanelSub"></div></div>
        </div>
        <button class="gx-panel-play" id="gxPanelPlay">▶ 전체 재생</button>
        <div class="gx-panel-list" id="gxPanelList"></div>
      </aside>

      <div class="gplayer" id="gxPlayer">
        <div class="thumb paused" id="gxPlayerThumb"></div>
        <div class="meta">
          <span class="t" id="gxPlayerTitle">재생 중인 곡 없음</span>
          <span class="a" id="gxPlayerArtist">Sync</span>
        </div>
        <div class="ctrl">
          <button class="skip">⏮</button>
          <button class="play-btn" id="gxPlayerBtn">▶</button>
          <button class="skip">⏭</button>
        </div>
      </div>

      <div class="search-overlay" id="gxSearchOverlay">
        <div class="search-box">
          <input type="text" id="gxSearchInput" placeholder="곡, 아티스트, 무드로 검색...">
          <div class="search-hint">Esc 또는 바깥 영역을 눌러 닫기</div>
        </div>
      </div>
      <button class="search-close-btn hidden" id="gxSearchCloseBtn">✕ 닫기</button>

      <div class="node-detail" id="gxNodeDetail">
        <div class="art" id="gxNodeDetailArt"></div>
        <span class="tag" id="gxNodeDetailTag"></span>
        <div class="title" id="gxNodeDetailTitle"></div>
        <div class="artist" id="gxNodeDetailArtist"></div>
        <button class="go" id="gxNodeDetailGo">재생하기</button>
      </div>`;

    document.body.appendChild(root);

    viewport     = _$('gxViewport');
    universe     = _$('gxUniverse');
    starsFar     = _$('gxStarsFar');
    starsNear    = _$('gxStarsNear');
    planetsLayer = _$('gxPlanets');
    warp         = _$('gxWarp');
    warpStreaks  = _$('gxWarpStreaks');
    warpFlash    = _$('gxWarpFlash');
    panel        = _$('gxPanel');

    _makeStars(starsFar, 110, 1.4, 3, .4, .8, 0, .1, 1.7, _reduced);
    _makeStars(starsNear, 60, 2.4, 5.6, .65, 1, .2, .16, 2.3, _reduced);
    _makePlanets(planetsLayer, 3);

    _initInteraction();
    _bindClicks();
  }

  /* ═══ 카메라 ═══════════════════════════════════════════ */
  function _layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    s0 = Math.min(vw / SW, vh / SH);
  }
  function _overviewCam() { return { ax: vw / 2, ay: vh / 2, s: s0, r: 0, cx: SW / 2, cy: SH / 2 }; }
  function _focusCam(c) {
    const s = Math.max(s0 * 1.6, Math.min(s0 * 9, (vh * 0.56) / (2 * c.fr)));
    // 패널이 오른쪽에 뜨는 카테고리는 행성을 왼쪽으로 조금 치우쳐 담는다
    const ax = c.panel ? vw * 0.36 : vw / 2;
    return { ax, ay: vh * 0.5, s, r: 0, cx: c.x, cy: c.y };
  }
  function _toScreen(c, x, y) {
    const dx = (x - c.cx) * c.s, dy = (y - c.cy) * c.s;
    const cos = Math.cos(c.r), sin = Math.sin(c.r);
    return { x: c.ax + dx * cos - dy * sin, y: c.ay + dx * sin + dy * cos };
  }
  function _toWorld(c, px, py) {
    const dx = px - c.ax, dy = py - c.ay;
    const cos = Math.cos(-c.r), sin = Math.sin(-c.r);
    return { x: c.cx + (dx * cos - dy * sin) / c.s, y: c.cy + (dx * sin + dy * cos) / c.s };
  }

  const FAR = { tf: .08, sf: .15, rf: .5 }, NEAR = { tf: .22, sf: .35, rf: .8 }, PLN = { tf: .14, sf: .24, rf: .6 };
  function _applyLayer(el, c, p, ox, oy) {
    const z = c.s / s0;
    el.style.transform = `translate(${ox * p.tf}px,${oy * p.tf}px) rotate(${c.r * p.rf}rad) scale(${1 + (z - 1) * p.sf})`;
  }
  function _apply(c) {
    if (!universe) return;
    universe.style.transform = `translate(${c.ax}px,${c.ay}px) rotate(${c.r}rad) scale(${c.s}) translate(${-c.cx}px,${-c.cy}px)`;
    const mid = _toScreen(c, SW / 2, SH / 2);
    const ox = mid.x - vw / 2, oy = mid.y - vh / 2;
    _applyLayer(starsFar, c, FAR, ox, oy);
    _applyLayer(starsNear, c, NEAR, ox, oy);
    _applyLayer(planetsLayer, c, PLN, ox, oy);
    // HUD 라벨: 위치만 카메라를 따라가고 글자 크기는 고정
    if (!_hudEls) _hudEls = Array.from(document.querySelectorAll('#galaxy-view-root .hud-label')).map(l => ({ el: l, x: parseFloat(l.dataset.wx), y: parseFloat(l.dataset.wy) }));
    for (let i = 0; i < _hudEls.length; i++) {
      const h = _hudEls[i], p = _toScreen(c, h.x, h.y);
      h.el.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%)`;
    }
    // 미니맵 프레임·줌 % 는 이동 중엔 ~10fps 로만 갱신 (레이아웃 비용 절감)
    const nowT = performance.now();
    if (!_isMoving() || nowT - _lastMM > 100) { _lastMM = nowT; _updateMini(c); }
  }
  function _updateMini(c) {
    const fr = _$('gxMmFrame');
    if (fr) {
      const pts = [_toWorld(c, 0, 0), _toWorld(c, vw, 0), _toWorld(c, 0, vh), _toWorld(c, vw, vh)];
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(SW, Math.max(...xs));
      const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(SH, Math.max(...ys));
      const k = MM_W / SW;
      fr.style.left = (x0 * k) + 'px';
      fr.style.top = (12 + y0 * k) + 'px';
      fr.style.width = Math.max(4, (x1 - x0) * k) + 'px';
      fr.style.height = Math.max(4, (y1 - y0) * k) + 'px';
    }
    const pct = _$('gxZoomPct');
    if (pct) pct.textContent = Math.round(c.s / s0 * 100) + '%';
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeInOutQuart = t => (t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);   // 천천히 끌려가다 확 빨려듦

  function _warpAnchor(x, y, color) {
    warp.style.setProperty('--wx', x + 'px');
    warp.style.setProperty('--wy', y + 'px');
    warp.style.setProperty('--wc', color || '#ffe2a8');
  }
  function _warpFrame(kind, t, te) {
    if (kind !== 'in' && kind !== 'out') return;
    const k = Math.sin(Math.PI * t);
    const scale = kind === 'in' ? 1 + te * 1.8 : 1 + (1 - te) * 1.8;
    warpStreaks.style.opacity = String(0.9 * Math.pow(k, 0.9));
    warpStreaks.style.transform = `scale(${scale}) rotate(${te * 24}deg)`;
    const flash = kind === 'in' ? Math.pow(Math.max(0, (t - 0.72) / 0.28), 2) * 0.6
                                : Math.pow(Math.max(0, (0.28 - t) / 0.28), 2) * 0.45;
    warpFlash.style.opacity = String(flash);
  }
  function _warpEnd() {
    warpStreaks.style.opacity = '0';
    warpFlash.style.transition = 'opacity .7s ease';
    warpFlash.style.opacity = '0';
  }

  /** 카메라를 현재 상태에서 to 로 옮긴다. kind: 'in' | 'out' | 'fly' | 'pan' */
  function _animate(to, o) {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; _mv.anim = false; }
    const from = { ...cam };
    if (_reduced || !o.dur) { Object.assign(cam, to); cam.r = 0; _apply(cam); _warpEnd(); return Promise.resolve(); }
    return new Promise(resolve => {
      const t0 = performance.now();
      const swirl = o.swirl || 0;
      const useWarp = o.kind === 'in' || o.kind === 'out' || o.kind === 'fly';
      if (useWarp) { _warpAnchor(o.wx, o.wy, o.color); warpStreaks.style.transition = 'none'; warpFlash.style.transition = 'none'; }
      _mv.anim = true; _syncMoving();
      if (useWarp) _root().setAttribute('data-flying', '1');
      function frame(now) {
        const t = Math.min(1, (now - t0) / o.dur);
        const te = o.ease(t);
        cam.cx = lerp(from.cx, to.cx, te); cam.cy = lerp(from.cy, to.cy, te);
        cam.ax = lerp(from.ax, to.ax, te); cam.ay = lerp(from.ay, to.ay, te);
        cam.s = from.s * Math.pow(to.s / from.s, te);
        cam.r = swirl * Math.sin(Math.PI * t);
        _apply(cam);
        if (useWarp) _warpFrame(o.kind === 'fly' ? 'in' : o.kind, t, te);
        if (t < 1) { _raf = requestAnimationFrame(frame); }
        else { _raf = null; Object.assign(cam, to); cam.r = 0; _mv.anim = false; _root().removeAttribute('data-flying'); _apply(cam); _warpEnd(); _syncMoving(); resolve(); }
      }
      _raf = requestAnimationFrame(frame);
    });
  }

  /* ═══ 포커스 (빨려 들어가기 / 빠져나오기) ═══════════════ */
  function _markFocus(id) {
    const rootEl = _root();
    if (!id) rootEl.classList.remove('focus-mode');   // 흐림 처리는 도착 후에 켠다(전체 크기 레이어 투명도 전환 비용 때문)
    rootEl.querySelectorAll('.gx-body').forEach(b => b.classList.toggle('is-target', b.dataset.cat === id));
    rootEl.querySelectorAll('.gx-chip, .spoke').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
    viewport.classList.toggle('locked', !!id);
  }

  async function focus(id) {
    const c = CAT[id];
    if (!c || _busy || _focused === id || !_open) return;
    _busy = true;
    _$('gxCompassWrap').classList.remove('open');
    _hideNodeDetail();
    _hint(false);
    const fromFocused = !!_focused;
    _closePanel();
    _focused = id;
    _markFocus(id);
    const to = _focusCam(c);
    await _animate(to, {
      kind: fromFocused ? 'fly' : 'in',
      dur: fromFocused ? 1000 : 1300,
      ease: fromFocused ? easeInOutCubic : easeInOutQuart,
      swirl: fromFocused ? 0.28 : 0.5,
      wx: to.ax, wy: to.ay, color: c.color,
    });
    _busy = false;
    if (!_open) return;
    _root().classList.add('focus-mode');
    if (c.portal) {                       // Sync AI = 관문: 빨려 들어간 뒤 Sync 페이지로
      hide();
      if (typeof Navigation !== 'undefined') Navigation.switchPage('sync');
      return;
    }
    _openPanel(c);
  }

  async function unfocus() {
    if (!_focused || _busy) return;
    _busy = true;
    const from = { ...cam };
    _closePanel();
    _markFocus(null);
    const color = CAT[_focused].color;
    await _animate(_overviewCam(), {
      kind: 'out', dur: 1050, ease: easeInOutCubic, swirl: -0.4,
      wx: from.ax, wy: from.ay, color,
    });
    _focused = null;
    _busy = false;
    _hint(false);
  }

  function _hint(show) {
    const h = _$('gxHint');
    if (!h) return;
    h.classList.toggle('hidden', !show);
  }

  /* ── 카테고리 패널 ── */
  function _openPanel(c) {
    _$('gxPanelDot').style.background = c.id === 'sun' ? 'radial-gradient(circle at 42% 38%,#fffaf0,#f5c46a 60%,#d98a2e)' : c.bg;
    _$('gxPanelDot').style.setProperty('--pc', c.color);
    _$('gxPanelName').textContent = c.name;
    _$('gxPanelSub').textContent = c.idxs.length + '곡 · ' + c.sub;
    const list = _$('gxPanelList');
    list.innerHTML = c.idxs.map(i => {
      const n = MUSIC_NODES[i], tr = _chartTrack(i);
      return `<button class="gx-row" data-idx="${i}">
        <span class="art" style="background-image:${_artBg(tr, n.g)}"></span>
        <span class="txt"><div class="t">${_esc(tr ? tr.name : n.title)}</div><div class="a">${_esc(tr ? tr.artist : n.artist)}</div></span>
        <span class="go">▶</span>
      </button>`;
    }).join('');
    panel.classList.add('open');
  }
  function _closePanel() { panel && panel.classList.remove('open'); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

  function _playIdx(i) {
    const chart = window._chartTracks;
    if (chart && chart.length && typeof Player !== 'undefined') {
      const q = i % chart.length;
      Player.playTrack(chart[q], chart, q);
    }
  }

  /* ═══ 팬/줌/드래그 (전체 보기에서만) ═══════════════════ */
  function _initInteraction() {
    _layout();
    Object.assign(cam, _overviewCam());
    _apply(cam);

    let dragging = false, lastX = 0, lastY = 0;
    viewport.addEventListener('pointerdown', e => {
      if (_focused || _busy) return;
      dragging = true; _moved = false; lastX = e.clientX; lastY = e.clientY;
      viewport.classList.add('dragging');
      _mv.drag = true; _syncMoving();
    });
    viewport.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) _moved = true;
      cam.ax += dx; cam.ay += dy; lastX = e.clientX; lastY = e.clientY;
      _clampPan(); _apply(cam); _hint(false);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
      viewport.addEventListener(ev, () => { dragging = false; viewport.classList.remove('dragging'); if (_mv.drag) { _mv.drag = false; _syncMoving(); } }));
    viewport.addEventListener('wheel', e => {
      e.preventDefault();
      if (_focused || _busy) return;
      // 스크롤 = 확대/축소 (포인터 위치 기준). 트랙패드 핀치(ctrl)는 delta 가 작아 감도를 높인다.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { cam.ax -= e.deltaX; _clampPan(); _apply(cam); }
      else _wheelZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY);
      _hint(false);
    }, { passive: false });
    setTimeout(() => _hint(false), 6000);

    _$('gxZoomIn').addEventListener('click', e => { e.stopPropagation(); if (!_focused && !_busy) _wheelZoom(1.3, vw / 2, vh / 2); });
    _$('gxZoomOut').addEventListener('click', e => { e.stopPropagation(); if (!_focused && !_busy) _wheelZoom(1 / 1.3, vw / 2, vh / 2); });
    _$('gxZoomHome').addEventListener('click', e => {
      e.stopPropagation();
      if (_focused) unfocus();
      else if (!_busy) _animate(_overviewCam(), { kind: 'pan', dur: 600, ease: easeInOutCubic });
    });

    const mm = _$('gxMinimap');
    mm.addEventListener('click', e => {
      e.stopPropagation();
      if (_focused || _busy) return;
      const r = mm.getBoundingClientRect();
      const k = MM_W / SW;
      const wx = (e.clientX - r.left) / k, wy = (e.clientY - r.top - 12) / k;
      _animate({ ax: vw / 2, ay: vh / 2, s: cam.s, r: 0, cx: Math.max(0, Math.min(SW, wx)), cy: Math.max(0, Math.min(SH, wy)) },
               { kind: 'pan', dur: 500, ease: easeInOutCubic });
    });

    if (!_resizeBound) {
      _resizeBound = true;
      window.addEventListener('resize', () => {
        if (!_open || !_built) return;
        _layout();
        if (_busy) return;
        Object.assign(cam, _focused ? _focusCam(CAT[_focused]) : _overviewCam());
        _apply(cam);
      });
    }
  }

  // 부드러운 스크롤 줌: 목표 배율만 갱신하고, 매 프레임 목표로 조금씩 다가간다
  let _zTarget = null, _zRaf = null, _zx = 0, _zy = 0;
  const _zClamp = s => Math.max(s0 * 0.7, Math.min(s0 * 3, s));
  function _wheelZoom(f, px, py) {
    _zTarget = _zClamp((_zTarget || cam.s) * f); _zx = px; _zy = py;
    _mv.wheel = true; _syncMoving();
    clearTimeout(_wheelTimer);
    _wheelTimer = setTimeout(() => { _mv.wheel = false; _syncMoving(); }, 180);
    if (!_zRaf) _zRaf = requestAnimationFrame(_zStep);
  }
  function _zStep() {
    _zRaf = null;
    if (_focused || _busy || _zTarget == null) { _zTarget = null; return; }
    const ratio = _zTarget / cam.s;
    if (Math.abs(Math.log(ratio)) < 0.003) { _zoomAt(ratio, _zx, _zy); _zTarget = null; return; }
    _zoomAt(Math.pow(ratio, 0.22), _zx, _zy);
    _zRaf = requestAnimationFrame(_zStep);
  }
  function _zoomAt(f, px, py) {
    const w = _toWorld(cam, px, py);
    const ns = _zClamp(cam.s * f);
    cam.s = ns;
    cam.ax = px - (w.x - cam.cx) * ns;
    cam.ay = py - (w.y - cam.cy) * ns;
    _clampPan(); _apply(cam);
  }
  function _clampPan() {
    // 장면 중심이 화면 밖으로 너무 멀어지지 않게
    const mid = _toScreen(cam, SW / 2, SH / 2);
    const lx = vw * 0.6, ly = vh * 0.6;
    if (mid.x < vw / 2 - lx) cam.ax += (vw / 2 - lx) - mid.x;
    if (mid.x > vw / 2 + lx) cam.ax -= mid.x - (vw / 2 + lx);
    if (mid.y < vh / 2 - ly) cam.ay += (vh / 2 - ly) - mid.y;
    if (mid.y > vh / 2 + ly) cam.ay -= mid.y - (vh / 2 + ly);
  }

  /* ═══ 클릭 ════════════════════════════════════════════ */
  function _bindClicks() {
    const root = _root();

    root.addEventListener('click', e => {
      if (_moved) { _moved = false; return; }

      const bodyEl = e.target.closest('[data-kind="body"]');
      if (bodyEl) { e.stopPropagation(); focus(bodyEl.dataset.cat); return; }

      const satEl = e.target.closest('[data-kind="sat"]');
      if (satEl) { e.stopPropagation(); _playIdx(Number(satEl.dataset.idx)); return; }

      const artistEl = e.target.closest('[data-kind="artist"]');
      if (artistEl) {
        e.stopPropagation();
        const { name } = _artistReal(Number(artistEl.dataset.idx));
        hide();
        if (typeof HomePage !== 'undefined') HomePage._showArtistDetail(name);
        return;
      }

      const rankEl = e.target.closest('[data-kind="rank"]');
      if (rankEl) {
        e.stopPropagation();
        const i = Number(rankEl.dataset.idx);
        const mock = RANK_CARDS[i];
        const chart = window._chartTracks;
        const qIdx = chart && chart.length ? i % chart.length : -1;
        const track = qIdx >= 0 ? chart[qIdx] : null;
        _showNodeDetail({
          title: track?.name || mock.title, artist: track?.artist || mock.artist, tag: '인기 차트',
          bg: track?.albumArt ? `url("${track.albumArt}")` : mock.grad, track: track || null, qIdx,
          x: e.clientX, y: Math.max(140, e.clientY - 20),
        });
      }
    });

    // 상단 칩 / 컴퍼스 스포크 = 카테고리 포커스
    root.querySelectorAll('.gx-chip').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      focus(b.dataset.cat);
    }));
    // 컴퍼스 = 원래 메뉴(홈/검색/Sync/보관함/프로필)
    root.querySelectorAll('.spoke').forEach(sp => sp.addEventListener('click', e => {
      e.stopPropagation();
      _$('gxCompassWrap').classList.remove('open');
      const action = sp.dataset.action;
      if (action === 'home') {
        if (_focused) unfocus();
        else if (!_busy) _animate(_overviewCam(), { kind: 'pan', dur: 600, ease: easeInOutCubic });
      }
      else if (action === 'search')  { _openSearch(); }
      else if (action === 'sync')    { hide(); if (typeof Navigation !== 'undefined') Navigation.switchPage('sync'); }
      else if (action === 'library') { hide(); if (typeof Navigation !== 'undefined') Navigation.switchPage('playlist'); }
      else if (action === 'profile') { hide(); if (typeof Navigation !== 'undefined') Navigation.switchPage('profile'); }
    }));
    _$('gxCompassBtn').addEventListener('click', e => { e.stopPropagation(); _$('gxCompassWrap').classList.toggle('open'); });

    // 패널
    _$('gxPanelBack').addEventListener('click', e => { e.stopPropagation(); unfocus(); });
    _$('gxPanelList').addEventListener('click', e => {
      const row = e.target.closest('.gx-row');
      if (row) { e.stopPropagation(); _playIdx(Number(row.dataset.idx)); }
    });
    _$('gxPanelPlay').addEventListener('click', e => {
      e.stopPropagation();
      const c = CAT[_focused];
      if (c && c.idxs.length) _playIdx(c.idxs[0]);
    });

    // 상단 바
    const exit = e => { e.stopPropagation(); hide(); };
    _$('gxLogoBtn').addEventListener('click', exit);
    _$('gxGridBtn').addEventListener('click', exit);
    _$('gxSearchBtn').addEventListener('click', e => { e.stopPropagation(); _openSearch(); });

    // 검색 오버레이
    const searchOverlay = _$('gxSearchOverlay');
    searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) _closeSearch(); });
    _$('gxSearchCloseBtn').addEventListener('click', _closeSearch);

    // 미니 플레이어
    _$('gxPlayerBtn').addEventListener('click', e => {
      e.stopPropagation();
      if (typeof Player !== 'undefined') { Player.togglePlay(); _refreshMiniPlayer(); }
    });

    // 곡 상세 팝업: 바깥 클릭으로 닫기 (root가 아니라 document에 — 기존 주석 참고: rank 클릭이 stopPropagation 으로 막혀 있음)
    document.addEventListener('click', () => { if (_open) _hideNodeDetail(); });
    _$('gxNodeDetail').addEventListener('click', e => e.stopPropagation());
    _$('gxNodeDetailGo').addEventListener('click', () => {
      const d = _lastNodeDetail;
      if (d?.track && typeof Player !== 'undefined') Player.playTrack(d.track, window._chartTracks || [], d.qIdx);
      _hideNodeDetail();
    });

    // Esc: 검색 → 팝업 → 컴퍼스 → 포커스 해제 순
    document.addEventListener('keydown', e => {
      if (!_open || e.key !== 'Escape') return;
      if (_$('gxSearchOverlay').classList.contains('open')) { _closeSearch(); return; }
      if (_$('gxNodeDetail').classList.contains('open')) { _hideNodeDetail(); return; }
      if (_$('gxCompassWrap').classList.contains('open')) { _$('gxCompassWrap').classList.remove('open'); return; }
      if (_focused) unfocus();
    });
  }

  let _lastNodeDetail = null;
  function _showNodeDetail(d) {
    _lastNodeDetail = d;
    const el = _$('gxNodeDetail');
    if (!el) return;
    el.style.left = d.x + 'px';
    el.style.top = d.y + 'px';
    _$('gxNodeDetailArt').style.backgroundImage = d.bg;
    _$('gxNodeDetailTag').textContent = d.tag;
    _$('gxNodeDetailTitle').textContent = d.title;
    _$('gxNodeDetailArtist').textContent = d.artist;
    _$('gxNodeDetailGo').textContent = d.track ? '재생하기' : '곡 정보 없음';
    el.classList.add('open');
  }
  function _hideNodeDetail() { _$('gxNodeDetail')?.classList.remove('open'); }
  function _openSearch() {
    _$('gxSearchOverlay')?.classList.add('open');
    _$('gxSearchCloseBtn')?.classList.remove('hidden');
    setTimeout(() => _$('gxSearchInput')?.focus(), 50);
  }
  function _closeSearch() {
    _$('gxSearchOverlay')?.classList.remove('open');
    _$('gxSearchCloseBtn')?.classList.add('hidden');
  }

  /* ── 실제 데이터로 갱신 (열 때마다) ── */
  function _renderNodes() {
    document.querySelectorAll('#galaxy-view-root .gx-moon, #galaxy-view-root .gx-sat').forEach(el => {
      const idx = el.dataset.idx;
      if (idx === '' || idx == null) return;
      const tr = _chartTrack(Number(idx));
      if (tr && tr.albumArt) { el.style.backgroundImage = `url("${tr.albumArt}")`; el.classList.add('has-art'); }
    });
    ARTIST_NODES.forEach((a, i) => _refreshArtistNode(i));
    _loadMood();
    RANK_CARDS.forEach((r, i) => {
      const el = document.querySelector(`#galaxy-view-root [data-kind="rank"][data-idx="${i}"]`);
      if (!el) return;
      const track = _chartTrack(i);
      el.querySelector('[data-title]').textContent = track?.name || r.title;
      el.querySelector('[data-artist]').textContent = track?.artist || r.artist;
      const thumb = el.querySelector('[data-thumb]');
      if (track?.albumArt) thumb.style.backgroundImage = `url("${track.albumArt}")`;
    });
  }

  // 홈 화면의 아티스트 이미지 로딩(home.js)이 이 함수를 부른다
  function _refreshArtistNode(i) {
    const el = document.querySelector(`#galaxy-view-root [data-kind="artist"][data-idx="${i}"]`);
    if (!el) return;
    const { name, img } = _artistReal(i);
    el.querySelector('[data-name]').textContent = name;
    if (img) {
      el.classList.add('has-img');
      el.style.background = 'none';
      el.style.backgroundImage = `url(${img})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    }
  }

  /* ── 마지막 감정 분석 결과 (로그인 상태일 때만, 최신 1건) ── */
  function _loadMood() {
    const label = document.querySelector('#galaxy-view-root [data-hud="mood"]');
    const span = _$('gxMood');
    if (!label || !span) return;
    fetch('/api/sync/emotion-history', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        const last = Array.isArray(list) && list.length ? list[0] : null;   // 새 기록이 위로 정렬되어 옴
        if (!last || !last.primaryEmotion) { label.classList.remove('has'); return; }
        const em = EMOTION_LABELS[last.primaryEmotion] || last.primaryEmotion;
        const pct = last.confidence != null ? ' · ' + Math.round(last.confidence * 100) + '%' : '';
        span.textContent = '마지막 감정 분석 · ' + em + pct;
        label.classList.add('has');
      })
      .catch(() => label.classList.remove('has'));
  }

  /* ── 미니 플레이어 ── */
  function _refreshMiniPlayer() {
    if (typeof Player === 'undefined') return;
    const st = Player.getState();
    const thumb = _$('gxPlayerThumb'), title = _$('gxPlayerTitle'), artist = _$('gxPlayerArtist'), btn = _$('gxPlayerBtn');
    if (!thumb) return;
    title.textContent = st.currentTrack?.name || '재생 중인 곡 없음';
    artist.textContent = st.currentTrack?.artist || 'Sync';
    if (st.currentTrack?.albumArt) {
      thumb.style.backgroundImage = `url("${st.currentTrack.albumArt}")`;
      thumb.style.backgroundSize = 'cover';
    } else {
      thumb.style.backgroundImage = '';
    }
    thumb.classList.toggle('paused', !st.isPlaying);
    btn.textContent = st.isPlaying ? '❚❚' : '▶';
    const now = _$('gxSunNow');
    if (now) now.textContent = st.currentTrack && st.isPlaying ? '재생 중 · ' + st.currentTrack.name : '';
  }

  /* ── 공개 API ── */
  function show() {
    _build();
    _layout();
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    _busy = false; _focused = null; _hudEls = null; _zTarget = null;
    _mv.anim = _mv.wheel = _mv.drag = false;
    _markFocus(null);
    _closePanel();
    Object.assign(cam, _overviewCam());
    _root().classList.remove('hidden');
    _open = true;
    _apply(cam);
    _hint(true);
    document.getElementById('home-mode-grid-btn')?.classList.remove('active');
    document.getElementById('home-mode-galaxy-btn')?.classList.add('active');
    _renderNodes();
    _refreshMiniPlayer();
    clearInterval(_playerPollTimer);
    _playerPollTimer = setInterval(_refreshMiniPlayer, 1000);
  }
  function hide() {
    const r = _root();
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    _busy = false; _focused = null; _zTarget = null;
    _mv.anim = _mv.wheel = _mv.drag = false;
    if (r) {
      r.removeAttribute('data-moving'); r.removeAttribute('data-flying'); r.classList.remove('focus-mode');
      _markFocus(null);
      _closePanel();
      _warpEnd();
      r.classList.add('hidden');
    }
    _open = false;
    document.getElementById('home-mode-galaxy-btn')?.classList.remove('active');
    document.getElementById('home-mode-grid-btn')?.classList.add('active');
    clearInterval(_playerPollTimer);
  }
  function toggle() { _open ? hide() : show(); }
  function isOpen() { return _open; }

  return { show, hide, toggle, isOpen, focus, unfocus, _refreshArtistNode, _refreshMiniPlayer };
})();
