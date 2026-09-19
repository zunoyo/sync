const cache = new Map();

function similarEnough(a, b) {
  const clean = (s) => s.replace(/[^a-z0-9가-힣]/g, '').trim();
  const ca = clean(a), cb = clean(b);
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

async function doSearch(q) {
  try {
    const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
    if (res.status === 404) return null;
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** 후보 목록에서 이름이 가장 잘 맞는 곡의 id 반환 */
function bestId(data, searchName) {
  const snL = searchName.toLowerCase();
  const list = data?.tracks || (data?.id && data?.name ? [{ id: data.id, name: data.name }] : []);
  if (!list.length) return data?.id || null;

  const exact = list.find((t) => (t.name || '').toLowerCase() === snL);
  if (exact?.id) return exact.id;

  const clean = (s) => s.replace(/[^a-z0-9가-힣]/g, '').toLowerCase();
  const similar = list.find((t) => {
    const cn = clean(t.name || '');
    return cn && clean(snL) && cn === clean(snL);
  });
  if (similar?.id) return similar.id;

  const partial = list.find((t) => {
    const tn = (t.name || '').toLowerCase();
    if (!tn) return false;
    return tn.includes(snL) || snL.includes(tn);
  });
  return partial?.id || null;
}

/** 곡명+아티스트 → 실제 Spotify 트랙 ID (4단계 폴백, 결과 캐싱) */
export async function searchSpotifyId(name, artist) {
  const cacheKey = `${name}__${artist || ''}`.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let data = await doSearch(`track:"${name}" artist:"${artist || ''}"`);
  let id = bestId(data, name);

  if (!id) {
    data = await doSearch(`${name} ${artist || ''}`.trim());
    id = bestId(data, name);
  }
  if (!id) {
    data = await doSearch(name);
    id = bestId(data, name);
  }
  if (!id) {
    const simpleName = name.replace(/\(.*?\)/g, '').replace(/[^\w\s가-힣]/g, '').trim();
    const simpleArtist = (artist || '').replace(/\(.*?\)/g, '').trim();
    if (simpleName && simpleName !== name) {
      data = await doSearch(`${simpleName} ${simpleArtist}`.trim());
      id = bestId(data, simpleName);
    }
  }

  if (id) cache.set(cacheKey, id);
  return id;
}

export { similarEnough };
