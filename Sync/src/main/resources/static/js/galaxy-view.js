/**
 * GalaxyView — 홈 화면 "갤럭시 뷰"
 * 드래그로 팬, 스크롤(Ctrl)로 줌 가능한 무드 우주. 기본은 꺼져있고(그리드 뷰가 기본),
 * 사용자가 우측 하단 토글에서 켜면 document.body에 오버레이로 붙는다(React의 createPortal과 동일한 방식).
 *
 * 데이터: HUD_LABELS/CLUSTER_GLOWS/ORBIT_RINGS/MUSIC_NODES/RANK_CARDS/ARTIST_NODES_DATA 는
 * 전부 정적 목업 좌표/텍스트이고, 실제 데이터(인기 차트·인기 아티스트)가 로드되어 있으면
 * window._chartTracks / window._homeArtists(+_homeArtistImages) 를 우선 사용해 라벨을 덮어쓴다.
 */
const GalaxyView = (() => {

  const UNIVERSE_W = 5200, UNIVERSE_H = 3400;

  const HUD_LABELS = [
    { wx: 2510, wy: 1560, cls: 'lbl-home',  text: '지금 이 순간', sub: '당신의 무드에 맞춘 첫 화면' },
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
    { id: 'n1',  title: '밤편지',          artist: '아이유',               tag: '지금 이 순간', left: 2440, top: 1730, size: 108, cls: 'n-amber' },
    { id: 'n2',  title: 'Nostalgia',       artist: 'DEAN',                 tag: '지금 이 순간', left: 2600, top: 1600, size: 72,  cls: 'n-gold' },
    { id: 'n3',  title: "오늘만 I'm",      artist: '최유리',               tag: '지금 이 순간', left: 2260, top: 1650, size: 64,  cls: 'n-rust' },
    { id: 'n4',  title: 'Home Sweet Home', artist: '이영지',               tag: '지금 이 순간', left: 2560, top: 1860, size: 58,  cls: 'n-rose' },
    { id: 'n5',  title: 'Rainy Study',     artist: 'Various Artists',      tag: '지금 이 순간', left: 2320, top: 1870, size: 52,  cls: 'n-amber' },
    { id: 'n6',  title: '내 프로필',       artist: '저장한 곡 · 최근 재생', tag: '프로필',       left: 2470, top: 1310, size: 40,  cls: 'n-gold' },
    { id: 'n7',  title: '소나기',          artist: '헤이즈',               tag: '비 오는 날',   left: 1560, top: 1080, size: 84,  cls: 'n-plum' },
    { id: 'n8',  title: 'Rainy Study',     artist: 'Various Artists',      tag: '비 오는 날',   left: 1700, top: 1180, size: 60,  cls: 'n-plum' },
    { id: 'n9',  title: '밤편지',          artist: '아이유',               tag: '비 오는 날',   left: 1470, top: 1220, size: 54,  cls: 'n-rose' },
    { id: 'n10', title: '바다처럼',        artist: '아이유',               tag: '드라이브',     left: 3480, top: 1150, size: 90,  cls: 'n-rust' },
    { id: 'n11', title: 'Cruising',        artist: 'pH-1',                 tag: '드라이브',     left: 3350, top: 1260, size: 58,  cls: 'n-amber' },
    { id: 'n12', title: '창밖은 밤 11시',  artist: '산들',                 tag: '드라이브',     left: 3600, top: 1320, size: 50,  cls: 'n-gold' },
    { id: 'n13', title: 'Focus Flow',      artist: 'Various Artists',      tag: '집중할 때',    left: 1420, top: 2280, size: 86,  cls: 'n-teal' },
    { id: 'n14', title: 'Low-fi Room',     artist: 'Various Artists',      tag: '집중할 때',    left: 1560, top: 2400, size: 56,  cls: 'n-teal' },
    { id: 'n15', title: 'Nostalgia',       artist: 'DEAN',                 tag: '집중할 때',    left: 1300, top: 2420, size: 48,  cls: 'n-gold' },
    { id: 'n16', title: '첫눈',            artist: '아이유',               tag: '설렘 가득',    left: 3520, top: 2400, size: 94,  cls: 'n-rose' },
    { id: 'n17', title: 'Supernova',       artist: 'aespa',                tag: '설렘 가득',    left: 3660, top: 2520, size: 58,  cls: 'n-rust' },
    { id: 'n18', title: '봄날의 고백',     artist: '최유리',               tag: '설렘 가득',    left: 3380, top: 2520, size: 50,  cls: 'n-amber' },
  ];

  const RANK_CARDS = [
    { rank: 1, title: '밤편지',    artist: '아이유', grad: 'var(--grad-1)', left: 2320, top: 560 },
    { rank: 2, title: 'Supernova', artist: 'aespa',  grad: 'var(--grad-4)', left: 2380, top: 618 },
    { rank: 3, title: '첫눈',      artist: '아이유', grad: 'var(--grad-6)', left: 2440, top: 676 },
    { rank: 4, title: 'Nostalgia', artist: 'DEAN',   grad: 'var(--grad-1)', left: 2500, top: 734 },
    { rank: 5, title: '소나기',    artist: '헤이즈', grad: 'var(--grad-2)', left: 2560, top: 792 },
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

  let _built = false;
  let _open = false;
  let _pan = { tx: 0, ty: 0, s: 0.82 };
  let _moved = false;
  let _playerPollTimer = null;

  function _root() { return document.getElementById('galaxy-view-root'); }

  /* ── 실제 데이터 페어링 헬퍼 ── */
  function _chartTrack(i) {
    const chart = window._chartTracks;
    return chart && chart.length ? chart[i % chart.length] : null;
  }
  function _artistReal(i) {
    const list = window._homeArtists;
    const fallback = ARTIST_NODES_DATA[i].name;
    const name = (list && list[i] && list[i].name) || fallback;
    const img  = (window._homeArtistImages || {})[name] || null;
    return { name, img };
  }

  /* ── DOM 빌드 (최초 1회, 지연 생성) ── */
  function _build() {
    if (_built) return;
    _built = true;

    const root = document.createElement('div');
    root.id = 'galaxy-view-root';
    root.className = 'galaxy-view hidden';

    const nodeWraps = MUSIC_NODES.map((n, i) => `
      <div class="node-wrap" data-kind="node" data-idx="${i}" style="left:${n.left}px;top:${n.top}px">
        <div class="node ${n.cls}" style="width:${n.size}px;height:${n.size}px">
          <span class="node-icon">♪</span>
        </div>
        <div class="node-label" data-label style="display:none">
          <span class="node-label-title"></span>
          <span class="node-label-artist"></span>
        </div>
      </div>`).join('');

    const rankCards = RANK_CARDS.map((r, i) => `
      <div class="rank-card" data-kind="rank" data-idx="${i}" style="left:${r.left}px;top:${r.top}px">
        <span class="rank-num">${r.rank}</span>
        <span class="rank-thumb" data-thumb style="background:${r.grad}"></span>
        <span class="rank-text">
          <span class="rank-title" data-title>${r.title}</span>
          <span class="rank-artist" data-artist>${r.artist}</span>
        </span>
      </div>`).join('');

    const artistNodes = ARTIST_NODES_DATA.map((a, i) => `
      <div class="artist-node" data-kind="artist" data-idx="${i}"
           style="left:${a.left}px;top:${a.top}px;width:${a.size}px;height:${a.size}px;background:${a.grad};font-size:${a.size < 64 ? '11px' : '13px'}">
        <span data-name style="position:absolute;bottom:0;left:0;right:0;text-align:center;padding:2px 2px 3px;border-radius:0 0 50% 50%;font-size:inherit;font-weight:600">${a.name}</span>
      </div>`).join('');

    const clusterGlows = CLUSTER_GLOWS.map(g => `
      <div class="cluster-glow" style="left:${g.left}px;top:${g.top}px;width:${g.w}px;height:${g.h}px;background:radial-gradient(circle, ${g.color}, transparent 68%)"></div>`).join('');

    const orbitRings = ORBIT_RINGS.map(r => `
      <div class="orbit-ring" style="left:${r.left}px;top:${r.top}px;width:${r.w}px;height:${r.h}px"></div>`).join('');

    const hudLabels = HUD_LABELS.map(l => `
      <div class="hud-label ${l.cls}" data-wx="${l.wx}" data-wy="${l.wy}">
        ${l.text}${l.sub ? `<span class="sub">${l.sub}</span>` : ''}
      </div>`).join('');

    const mmDots = HUD_LABELS.map(l => `
      <div class="mm-dot${l.cls.includes('beacon') ? ' beacon' : ''}" style="left:${l.wx / UNIVERSE_W * 168}px;top:${l.wy / UNIVERSE_H * 110}px"></div>`).join('');

    const spokes = [
      { i: 0, action: 'home',    dot: 'var(--accent)',      label: '홈' },
      { i: 1, action: 'search',  dot: 'var(--text-muted)',  label: '검색' },
      { i: 2, action: 'sync',    dot: '#7fc9bb',            label: 'Sync' },
      { i: 3, action: 'library', dot: 'var(--accent-dark)', label: '보관함' },
      { i: 4, action: 'profile', dot: '#caa0d6',            label: '프로필' },
    ].map(s => `
      <div class="spoke" data-i="${s.i}" data-action="${s.action}">
        <span class="dot" style="background:${s.dot}"></span>${s.label}
      </div>`).join('');

    root.innerHTML = `
      <div class="g-viewport" id="gxViewport">
        <div class="g-stars-layer far" id="gxStarsFar"></div>
        <div class="g-stars-layer near" id="gxStarsNear"></div>
        <div class="planets-layer" id="gxPlanets"></div>
        <div class="g-universe" id="gxUniverse">
          ${clusterGlows}
          ${orbitRings}
          ${nodeWraps}
          ${rankCards}
          ${artistNodes}
          <div class="node n-teal" data-kind="beacon" style="left:4590px;top:1650px;width:120px;height:120px">
            <span class="node-icon" style="font-size:20px">✦</span>
          </div>
        </div>
      </div>

      <div id="gxHudLabels">${hudLabels}</div>

      <div class="g-hint">드래그해서 무드 우주를 탐험하세요 · 스크롤로 확대·축소</div>

      <button class="gx-exit-btn" id="gxExitBtn" title="그리드 뷰로 돌아가기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
        그리드 뷰
      </button>

      <div class="minimap" id="gxMinimap">
        ${mmDots}
        <div class="mm-frame" id="gxMmFrame"></div>
        <span class="mm-caption">MOOD MAP</span>
      </div>

      <div class="compass-wrap" id="gxCompassWrap">
        ${spokes}
        <button class="compass-btn" id="gxCompassBtn" aria-label="메뉴 열기">
          <span class="ring"></span><span class="core"></span>
        </button>
      </div>

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
    _initInteraction();
    _bindClicks();
  }

  /* ── 팬/줌/드래그 엔진 ── */
  function _initInteraction() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewport  = document.getElementById('gxViewport');
    const universe  = document.getElementById('gxUniverse');
    const starsFar  = document.getElementById('gxStarsFar');
    const starsNear = document.getElementById('gxStarsNear');
    const planets   = document.getElementById('gxPlanets');
    if (!viewport || !universe) return;

    _makeStars(starsFar, 150, 1.4, 3, .4, .8, 0, .1, 1.7, reduced);
    _makeStars(starsNear, 90, 2.4, 5.6, .65, 1, .2, .16, 2.3, reduced);
    _makePlanets(planets, 6);

    const pan = _pan;
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
    _centerOn = centerOn;

    centerOn(2510, 1750, 0.82, false);

    let dragging = false, lastX = 0, lastY = 0;
    viewport.addEventListener('pointerdown', e => {
      dragging = true; _moved = false; lastX = e.clientX; lastY = e.clientY;
      viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) _moved = true;
      pan.tx += dx; pan.ty += dy; lastX = e.clientX; lastY = e.clientY;
      applyTransform(false);
      hintHide();
    });
    ['pointerup','pointercancel','pointerleave'].forEach(ev =>
      viewport.addEventListener(ev, () => { dragging = false; viewport.classList.remove('dragging'); }));
    viewport.addEventListener('wheel', e => {
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
    }, { passive: false });

    let hinted = false;
    function hintHide() {
      if (hinted) return; hinted = true;
      document.querySelector('.galaxy-view .g-hint')?.classList.add('hidden');
    }
    setTimeout(hintHide, 5000);

    const minimapEl = document.getElementById('gxMinimap');
    minimapEl?.addEventListener('click', e => {
      const r = minimapEl.getBoundingClientRect();
      centerOn((e.clientX - r.left) / MMW * UNIVERSE_W, (e.clientY - r.top) / MMH * UNIVERSE_H, null, true);
    });

    // Beacon pulse
    let beaconT = 0;
    if (!reduced) {
      clearInterval(_beaconInt);
      _beaconInt = setInterval(() => {
        beaconT++;
        const beacon = document.querySelector('.galaxy-view [data-kind="beacon"]');
        if (beacon) beacon.style.boxShadow = `0 0 ${18 + Math.sin(beaconT / 10) * 10}px 4px rgba(127,201,187,.45), 0 8px 30px rgba(0,0,0,.5)`;
      }, 80);
    }

    window.addEventListener('resize', () => { if (_open) centerOn(2510, 1750, pan.s, false); });
  }
  let _centerOn = null;
  let _beaconInt = null;

  /* ── 클릭 위임 처리 ── */
  function _bindClicks() {
    const root = _root();

    root.addEventListener('click', e => {
      if (_moved) { _moved = false; return; }

      const nodeEl = e.target.closest('[data-kind="node"]');
      if (nodeEl) {
        e.stopPropagation();
        const i = Number(nodeEl.dataset.idx);
        const chart = window._chartTracks;
        if (chart && chart.length && typeof Player !== 'undefined') {
          const qIdx = i % chart.length;
          Player.playTrack(chart[qIdx], chart, qIdx);
        }
        return;
      }

      const rankEl = e.target.closest('[data-kind="rank"]');
      if (rankEl) {
        e.stopPropagation();
        const i = Number(rankEl.dataset.idx);
        const mock = RANK_CARDS[i];
        const chart = window._chartTracks;
        const qIdx  = chart && chart.length ? i % chart.length : -1;
        const track = qIdx >= 0 ? chart[qIdx] : null;
        const title = track?.name || mock.title;
        const artist = track?.artist || mock.artist;
        const bg = track?.albumArt ? `url(${track.albumArt})` : mock.grad;
        _showNodeDetail({ title, artist, tag: '인기 차트', bg, track: track || null, qIdx, x: e.clientX, y: Math.max(140, e.clientY - 20) });
        return;
      }

      const artistEl = e.target.closest('[data-kind="artist"]');
      if (artistEl) {
        e.stopPropagation();
        const i = Number(artistEl.dataset.idx);
        const { name } = _artistReal(i);
        hide();
        if (typeof HomePage !== 'undefined') HomePage._showArtistDetail(name);
        return;
      }

      const beaconEl = e.target.closest('[data-kind="beacon"]');
      if (beaconEl) {
        e.stopPropagation();
        hide();
        if (typeof Navigation !== 'undefined') Navigation.switchPage('sync');
        return;
      }
    });

    // 그리드 뷰로 돌아가기
    document.getElementById('gxExitBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      hide();
    });

    // 컴퍼스
    document.getElementById('gxCompassBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('gxCompassWrap')?.classList.toggle('open');
    });
    document.querySelectorAll('#gxCompassWrap .spoke').forEach(spoke => {
      spoke.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('gxCompassWrap')?.classList.remove('open');
        const action = spoke.dataset.action;
        if (action === 'home')    { _centerOn?.(2510, 1750, 1, true); }
        else if (action === 'search')  { _openSearch(); }
        else if (action === 'sync')    { hide(); Navigation.switchPage('sync'); }
        else if (action === 'library') { hide(); Navigation.switchPage('playlist'); }
        else if (action === 'profile') { hide(); Navigation.switchPage('profile'); }
      });
    });

    // 검색 오버레이
    const searchOverlay = document.getElementById('gxSearchOverlay');
    searchOverlay?.addEventListener('click', e => { if (e.target === searchOverlay) _closeSearch(); });
    document.getElementById('gxSearchCloseBtn')?.addEventListener('click', _closeSearch);

    // 미니 플레이어
    document.getElementById('gxPlayerBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      if (typeof Player !== 'undefined') { Player.togglePlay(); _refreshMiniPlayer(); }
    });

    // 노드 상세 팝업 닫기(바깥 클릭) + "재생하기"
    // ⚠ root가 아니라 document에 걸어야 함 — rank-card 클릭은 stopPropagation()으로 버블링을
    //   막아서 document까지는 안 올라오지만, root에 걸면 같은 클릭 이벤트에서 두 리스너가
    //   모두 실행돼(팝업을 띄우자마자 바로 닫아버림) 버그가 생긴다.
    document.addEventListener('click', () => { if (_open) _hideNodeDetail(); });
    document.getElementById('gxNodeDetail')?.addEventListener('click', e => e.stopPropagation());
    document.getElementById('gxNodeDetailGo')?.addEventListener('click', () => {
      const d = _lastNodeDetail;
      if (d?.track && typeof Player !== 'undefined') Player.playTrack(d.track, window._chartTracks || [], d.qIdx);
      _hideNodeDetail();
    });

    // Esc — 검색/컴퍼스/노드상세 닫기
    document.addEventListener('keydown', e => {
      if (!_open) return;
      if (e.key === 'Escape') { _closeSearch(); _hideNodeDetail(); document.getElementById('gxCompassWrap')?.classList.remove('open'); }
    });
  }

  let _lastNodeDetail = null;
  function _showNodeDetail(d) {
    _lastNodeDetail = d;
    const el = document.getElementById('gxNodeDetail');
    if (!el) return;
    el.style.left = d.x + 'px';
    el.style.top  = d.y + 'px';
    document.getElementById('gxNodeDetailArt').style.background = d.bg;
    document.getElementById('gxNodeDetailTag').textContent = d.tag;
    document.getElementById('gxNodeDetailTitle').textContent = d.title;
    document.getElementById('gxNodeDetailArtist').textContent = d.artist;
    document.getElementById('gxNodeDetailGo').textContent = d.track ? '재생하기' : '곡 정보 없음';
    el.classList.add('open');
  }
  function _hideNodeDetail() {
    document.getElementById('gxNodeDetail')?.classList.remove('open');
  }

  function _openSearch() {
    document.getElementById('gxSearchOverlay')?.classList.add('open');
    document.getElementById('gxSearchCloseBtn')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('gxSearchInput')?.focus(), 50);
  }
  function _closeSearch() {
    document.getElementById('gxSearchOverlay')?.classList.remove('open');
    document.getElementById('gxSearchCloseBtn')?.classList.add('hidden');
  }

  /* ── 실제 데이터로 라벨 갱신 (열 때마다 최신 데이터 반영) ── */
  function _renderNodes() {
    MUSIC_NODES.forEach((n, i) => {
      const wrap = document.querySelector(`.galaxy-view [data-kind="node"][data-idx="${i}"]`);
      if (!wrap) return;
      const track = _chartTrack(i);
      const label = wrap.querySelector('[data-label]');
      const img = wrap.querySelector('.node img');
      if (track) {
        label.style.display = '';
        label.querySelector('.node-label-title').textContent = track.name;
        label.querySelector('.node-label-artist').textContent = track.artist;
        if (track.albumArt && !img) {
          const nodeCircle = wrap.querySelector('.node');
          nodeCircle.innerHTML = `<img src="${track.albumArt}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;pointer-events:none" onerror="this.remove()">`;
        }
      } else {
        label.style.display = 'none';
      }
    });

    RANK_CARDS.forEach((r, i) => {
      const el = document.querySelector(`.galaxy-view [data-kind="rank"][data-idx="${i}"]`);
      if (!el) return;
      const track = _chartTrack(i);
      el.querySelector('[data-title]').textContent = track?.name || r.title;
      el.querySelector('[data-artist]').textContent = track?.artist || r.artist;
      const thumb = el.querySelector('[data-thumb]');
      if (track?.albumArt) { thumb.style.backgroundImage = `url(${track.albumArt})`; thumb.style.backgroundSize = 'cover'; }
    });

    ARTIST_NODES_DATA.forEach((a, i) => _refreshArtistNode(i));
  }

  function _refreshArtistNode(i) {
    const el = document.querySelector(`.galaxy-view [data-kind="artist"][data-idx="${i}"]`);
    if (!el) return;
    const { name, img } = _artistReal(i);
    el.querySelector('[data-name]').textContent = name;
    if (img) {
      el.style.background = 'none';
      el.style.backgroundImage = `url(${img})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.querySelector('[data-name]').style.background = 'rgba(0,0,0,0.55)';
    }
  }

  /* ── 미니 플레이어(gplayer) — 실제 재생 상태를 주기적으로 반영 ── */
  function _refreshMiniPlayer() {
    if (typeof Player === 'undefined') return;
    const st = Player.getState();
    const thumb = document.getElementById('gxPlayerThumb');
    const title = document.getElementById('gxPlayerTitle');
    const artist = document.getElementById('gxPlayerArtist');
    const btn = document.getElementById('gxPlayerBtn');
    if (!thumb) return;
    title.textContent = st.currentTrack?.name || '재생 중인 곡 없음';
    artist.textContent = st.currentTrack?.artist || 'Sync';
    if (st.currentTrack?.albumArt) {
      thumb.style.backgroundImage = `url(${st.currentTrack.albumArt})`;
      thumb.style.backgroundSize = 'cover';
    } else {
      thumb.style.backgroundImage = '';
    }
    thumb.classList.toggle('paused', !st.isPlaying);
    btn.textContent = st.isPlaying ? '❚❚' : '▶';
  }

  /* ── 공개 API ── */
  function show() {
    _build();
    _root().classList.remove('hidden');
    _open = true;
    document.getElementById('home-mode-grid-btn')?.classList.remove('active');
    document.getElementById('home-mode-galaxy-btn')?.classList.add('active');
    _renderNodes();
    _refreshMiniPlayer();
    clearInterval(_playerPollTimer);
    _playerPollTimer = setInterval(_refreshMiniPlayer, 1000);
  }
  function hide() {
    const r = _root();
    if (r) r.classList.add('hidden');
    _open = false;
    document.getElementById('home-mode-galaxy-btn')?.classList.remove('active');
    document.getElementById('home-mode-grid-btn')?.classList.add('active');
    clearInterval(_playerPollTimer);
  }
  function toggle() { _open ? hide() : show(); }
  function isOpen() { return _open; }

  return { show, hide, toggle, isOpen, _refreshArtistNode, _refreshMiniPlayer };
})();
