const cache = new Map();

async function doSearch(q) {
  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
    if (res.status === 404) return null;
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/* ── Spotify 후보 검증 ──────────────────────────────────────────
   예전에는 "곡 제목이 같으면" 아티스트를 안 보고 첫 후보를 골라서,
   제목이 흔한 곡(예: Just Like a Dream)은 다른 가수의 곡이 재생됐다.
   이제 제목 + (아티스트 또는 곡 길이)가 맞는 후보만 인정하고,
   끝내 검증된 후보가 없으면 null → 호출 쪽에서 30초 미리듣기로 넘어간다. */
const _stripNoise = (s) => String(s || '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s-\s.*$/, ' ').replace(/\b(?:feat|ft)\.?\s.*$/, ' ');
const _compact = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const _titleKey = (s) => _compact(_stripNoise(s));

function _artistKeys(s) {
  const lower = String(s || '').toLowerCase();
  const out = new Set();
  const add = (x) => { const k = _compact(String(x).trim().replace(/^the\s+/, '')); if (k) out.add(k); };
  add(lower);
  for (const m of lower.matchAll(/\(([^)]*)\)/g)) add(m[1]);
  const noParen = lower.replace(/\([^)]*\)/g, ' ');
  add(noParen);
  noParen.split(/\s*(?:&|,|\/|\+|\bfeat\.?\s|\bft\.?\s|\bwith\s|\band\s|\bx\s)\s*/).forEach(add);
  return out;
}
function _artistMatches(a, b) {
  if (!a || !b) return false;
  const A = _artistKeys(a), B = _artistKeys(b);
  for (const x of A) for (const y of B) {
    if (x === y) return true;
    if (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))) return true;
  }
  return false;
}

/** 후보 중 검증된 곡의 id. strict=true 는 Spotify 가 이미 track+artist 로 걸러준 검색 결과일 때 */
function _pickVerified(list, name, artist, durationMs, strict) {
  const nk = _titleKey(name);
  if (!nk || !Array.isArray(list)) return null;
  let best = null, bestScore = 0;
  for (const c of list) {
    if (!c || !c.id) continue;
    const ck = _titleKey(c.name);
    const exact = ck === nk;
    const partial = !exact && ck && nk && (ck.includes(nk) || nk.includes(ck));
    if (!exact && !partial) continue;
    const names = (c.artists && c.artists.length ? c.artists : [c.artist]).filter(Boolean);
    const artistOk = !!artist && names.some((n) => _artistMatches(artist, n));
    const durDiff = durationMs && c.durationMs ? Math.abs(c.durationMs - durationMs) : null;
    const durOk = durDiff != null && durDiff <= 4000;
    let score = (artistOk ? 4 : 0) + (durOk ? 2 : 0) + (exact ? 1 : 0);
    if (partial && !artistOk) continue;                       // 부분 일치는 아티스트까지 맞아야 인정
    if (!artistOk && !durOk) {
      if (!(strict && exact)) continue;                       // 검증 수단이 없으면 strict 검색의 정확 일치만 인정
      if (durDiff != null && durDiff > 15000) continue;       // 길이가 많이 다르면 다른 버전/다른 곡
      score = 1;
    }
    if (durDiff != null && durDiff > 15000) score -= 1;       // 같은 가수여도 길이가 크게 다르면 감점(라이브/리믹스)
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best ? best.id : null;
}

function listOf(data) {
  return data?.tracks || (data?.id && data?.name ? [{ id: data.id, name: data.name, artist: data.artist }] : []);
}

/** 곡명+아티스트(+길이) → 실제 Spotify 트랙 ID (4단계 폴백, 결과 캐싱).
 *  제목·아티스트/길이가 검증된 후보만 돌려주고, 못 찾으면 null (엉뚱한 곡을 틀지 않는다). */
export async function searchSpotifyId(name, artist, durationMs) {
  const cacheKey = `${name}__${artist || ''}`.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let data = await doSearch(`track:"${name}" artist:"${artist || ''}"`);
  let id = _pickVerified(listOf(data), name, artist, durationMs, true);

  if (!id) {
    data = await doSearch(`${name} ${artist || ''}`.trim());
    id = _pickVerified(listOf(data), name, artist, durationMs, false);
  }
  if (!id) {
    data = await doSearch(name);
    id = _pickVerified(listOf(data), name, artist, durationMs, false);
  }
  if (!id) {
    const simpleName = name.replace(/\(.*?\)/g, '').replace(/[^\w\s가-힣]/g, '').trim();
    const simpleArtist = (artist || '').replace(/\(.*?\)/g, '').trim();
    if (simpleName && simpleName !== name) {
      data = await doSearch(`${simpleName} ${simpleArtist}`.trim());
      id = _pickVerified(listOf(data), simpleName, artist, durationMs, false);
    }
  }

  if (id) cache.set(cacheKey, id);
  return id;
}

export function similarEnough(a, b) {
  const clean = (s) => s.replace(/[^a-z0-9가-힣]/g, '').trim();
  const ca = clean(a), cb = clean(b);
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}
