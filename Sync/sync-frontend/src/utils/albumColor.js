// 앨범아트에서 대표 색(색상 h, 채도 s)을 뽑는다. 채도 높은 픽셀에 가중치를 둔다.
// 이미지 서버가 CORS 를 허용하지 않아 픽셀을 못 읽으면 null.
const cache = new Map();

export function albumColor(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    if (cache.has(url)) return resolve(cache.get(url));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let out = null;
      try {
        const N = 24;
        const cv = document.createElement('canvas');
        cv.width = cv.height = N;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, N, N);
        const d = g.getImageData(0, 0, N, N).data;
        let r = 0, gr = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = (mx - mn) / (mx || 1), lum = (R + G + B) / 765;
          const wt = 0.15 + sat * sat * 2 + (lum > 0.08 && lum < 0.92 ? 0.2 : 0);
          r += R * wt; gr += G * wt; b += B * wt; w += wt;
        }
        r /= w; gr /= w; b /= w;
        const mx = Math.max(r, gr, b) / 255, mn = Math.min(r, gr, b) / 255;
        const l = (mx + mn) / 2, dl = mx - mn;
        let h = 0, sat = 0;
        if (dl > 0.001) {
          sat = dl / (1 - Math.abs(2 * l - 1));
          if (mx === r / 255) h = ((gr - b) / 255 / dl) % 6;
          else if (mx === gr / 255) h = (b - r) / 255 / dl + 2;
          else h = (r - gr) / 255 / dl + 4;
          h = (h * 60 + 360) % 360;
        }
        out = { h: Math.round(h), s: Math.min(0.72, sat * 1.1) };
      } catch { out = null; }
      cache.set(url, out);
      resolve(out);
    };
    img.onerror = () => { cache.set(url, null); resolve(null); };
    img.src = url;
  });
}

export function tintStyles(col) {
  if (!col) return null;
  const s = Math.round(col.s * 100);
  return {
    '--lyr-bg': `linear-gradient(160deg, hsl(${col.h} ${s}% 30%), hsl(${col.h} ${s}% 17%))`,
    '--lyr-bg-big': `linear-gradient(160deg, hsl(${col.h} ${s}% 27%), hsl(${col.h} ${Math.max(10, s - 10)}% 12%))`,
  };
}

/** 홈 추천 플레이리스트 배너용 — 원래 와인색 배경에 앨범아트 색을 살짝만 섞는다 */
export function heroTint(col) {
  if (!col) return null;
  const s = Math.round(Math.min(col.s, 0.6) * 100);
  return {
    '--hero-c1': `hsl(${col.h} ${s}% 20%)`,
    '--hero-c2': `hsl(${col.h} ${Math.round(s * 0.7)}% 10%)`,
    '--hero-glow': `hsla(${col.h}, ${Math.min(100, s + 20)}%, 62%, 0.2)`,
  };
}
