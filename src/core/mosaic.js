/**
 * Римская мозаика: бесшовный тайл из неровных камешков (ячейки Вороного).
 * Цвет камешка выбирается по большинству пикселей рисунка под ним, между камешками остаётся раствор.
 * Три рисунка: geo (вертушки и лепестки), round (кружок-розетка), curl (завиток).
 * Классы пикселя: 0 фон, 1 контур, 2 серо-оливковый, 3 охра, 4 терракота.
 */
import { report } from './guard.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const KINDS = Object.freeze({
  geo: {
    N: 448, cols: 96, S: 112,
    make: u => {
      const A = u * Math.SQRT1_2, Wd = 0.30 * u;
      const rho = (A * A / Wd + Wd) / 2, delta = (A * A / Wd - Wd) / 2;
      const qh = 0.25 * u, oh = 0.17 * u, dr = 0.03 * u;
      return (x, y) => {
        const a = Math.round(x / u), b = Math.round(y / u);
        if ((a + b) & 1) {
          const qx = x - a * u, qy = y - b * u;
          if (Math.abs(qx) <= qh && Math.abs(qy) <= qh) {
            const o = 0.13 * u;
            return (Math.hypot(qx, qy) <= dr * 1.5 || Math.hypot(Math.abs(qx) - o, Math.abs(qy) - o) <= dr * 1.5) ? 1 : 0;
          }
        }
        const ca = Math.floor(x / u), cb = Math.floor(y / u);
        const qx = x - (ca + 0.5) * u, qy = y - (cb + 0.5) * u;
        const dx = Math.SQRT1_2, dy = ((ca + cb) & 1) === 0 ? Math.SQRT1_2 : -Math.SQRT1_2;
        const s = qx * dx + qy * dy, r = -qx * dy + qy * dx;
        if (Math.hypot(r - delta, s) < rho && Math.hypot(r + delta, s) < rho) {
          if (Math.hypot(r - delta, s) > rho - 2.4 || Math.hypot(r + delta, s) > rho - 2.4) return 1;
          if (Math.abs(qx) <= oh && Math.abs(qy) <= oh) {
            const o = 0.085 * u;
            return Math.hypot(Math.abs(qx) - o, Math.abs(qy) - o) <= 0.026 * u ? 1 : 3;
          }
          return 0;
        }
        let best = 1e9, parity = 0;
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const ia = a + da, ib = b + db;
          if ((ia + ib) & 1) continue;
          const d = Math.hypot(x - ia * u, y - ib * u);
          if (d < best) { best = d; parity = (ia - ib) / 2; }
        }
        return (((parity % 2) + 2) % 2) ? 4 : 1;
      };
    },
  },
  round: {
    N: 720, cols: 96, S: 144,
    make: S => (x, y) => {
      const H = S / 2;
      let dx = ((x % S) + S) % S; if (dx > H) dx -= S;
      let dy = ((y % S) + S) % S; if (dy > H) dy -= S;
      const r = Math.hypot(dx, dy);
      if (r > 66) { const m = (H - Math.abs(dx)) + (H - Math.abs(dy)); return m < 7 ? 4 : m < 17 ? 2 : m < 24 ? 1 : 0; }
      if (r > 58) return 1;
      if (r > 51) return 0;
      if (r > 45) return 2;
      if (Math.abs(dx) <= 2.2 || Math.abs(dy) <= 2.2) return 1;
      if (r < 8) return 3;
      const pd = Math.hypot(dx - Math.sign(dx) * 22, dy - Math.sign(dy) * 22);
      if (pd <= 16) return (dx > 0) === (dy > 0) ? 4 : 3;
      return pd <= 18.5 ? 1 : 0;
    },
  },
  curl: {
    N: 576, cols: 77, S: 144,
    make: S => (x, y) => {
      const i = Math.floor(x / S), j = Math.floor(y / S), flip = (i + j) & 1;
      let dx = x - (i + 0.5) * S; const dy = y - (j + 0.5) * S; if (flip) dx = -dx;
      const r = Math.hypot(dx, dy);
      if (r > 70) { const m = (S / 2 - Math.abs(dx)) + (S / 2 - Math.abs(dy)); return m < 14 ? 4 : 0; }
      if (r > 63) return 1;
      const P = 24, th = Math.atan2(dy, dx), t = (((r - P * th / (2 * Math.PI)) % P) + P) % P;
      if (Math.min(t, P - t) < 4.4) return 1;
      return t < P / 2 ? (flip ? 4 : 3) : 0;
    },
  },
});

/** Какой набор цветов палитры нужен рисунку. */
export const colorsFor = (kindId, mosaic) => (kindId === 'geo' ? mosaic.geo : mosaic.roman);

const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function draw(kind, colors) {
  const { N, cols, S } = kind;
  const cell = N / cols, classify = kind.make(S), rnd = rng(23);
  const pal = [colors.G, colors.L, colors.Y, colors.O, colors.R].map(rgbOf);
  const grout = rgbOf(colors.grout);
  const sx = new Float32Array(cols * cols), sy = new Float32Array(cols * cols);
  for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) {
    sx[j * cols + i] = (i + 0.5 + (rnd() - 0.5) * 0.8) * cell;
    sy[j * cols + i] = (j + 0.5 + (rnd() - 0.5) * 0.8) * cell;
  }
  const owner = new Int32Array(N * N), edge = new Uint8Array(N * N), votes = new Uint16Array(cols * cols * 5);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gi = Math.floor(x / cell), gj = Math.floor(y / cell);
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let a = -1; a <= 1; a++) for (let e = -1; e <= 1; e++) {
      const ii = gi + a, jj = gj + e;
      const wi = (ii + cols) % cols, wj = (jj + cols) % cols;
      const ox = ii < 0 ? -N : ii >= cols ? N : 0, oy = jj < 0 ? -N : jj >= cols ? N : 0;
      const dx = x - (sx[wj * cols + wi] + ox), dy = y - (sy[wj * cols + wi] + oy), d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = wj * cols + wi; } else if (d < d2) d2 = d;
    }
    const k = y * N + x;
    owner[k] = best;
    edge[k] = (Math.sqrt(d2) - Math.sqrt(d1)) < 1.15 ? 1 : 0;
    votes[best * 5 + classify(x + 0.5, y + 0.5)]++;
  }
  const tone = new Uint8Array(cols * cols * 3);
  for (let s = 0; s < cols * cols; s++) {
    let pick = 0, top = -1;
    for (let m = 0; m < 5; m++) { const score = votes[s * 5 + m] * (m === 1 ? 1.6 : 1); if (score > top) { top = score; pick = m; } }
    const k = 0.93 + rnd() * 0.14;
    for (let ch = 0; ch < 3; ch++) tone[s * 3 + ch] = Math.max(0, Math.min(255, pal[pick][ch] * k));
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(N, N);
  for (let k = 0; k < N * N; k++) {
    const o = owner[k] * 3;
    const c = edge[k] ? grout : [tone[o], tone[o + 1], tone[o + 2]];
    image.data[k * 4] = c[0]; image.data[k * 4 + 1] = c[1]; image.data[k * 4 + 2] = c[2]; image.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Строит тайл асинхронно (после отдачи управления браузеру). Возвращает data:-URL или '' при ошибке. */
export function buildTile(kindId, colors) {
  const kind = KINDS[kindId];
  if (!kind) return Promise.resolve('');
  return new Promise(resolve => {
    setTimeout(() => {
      try { resolve(draw(kind, colors)); } catch (error) { report('мозаика', error); resolve(''); }
    }, 0);
  });
}

/**
 * Картинка → мозаика: уменьшаем до сетки (1 пиксель = 1 тессера), красим тессеры цветом пикселя с лёгким разбросом тона,
 * цвета слегка квантуем, между тессерами тёмный раствор.
 */
export function mosaicify(source, width, height, cell, levels = 7) {
  const gap = Math.max(1, Math.round(cell / 8));
  const cols = Math.max(1, Math.round(width / cell)), rows = Math.max(1, Math.round(height / cell));
  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(source, 0, 0, cols, rows);
  const data = sg.getImageData(0, 0, cols, rows).data;
  const rnd = rng(5);
  const out = document.createElement('canvas');
  out.width = cols * cell; out.height = rows * cell;
  const ctx = out.getContext('2d');
  const q = v => Math.round(v / 255 * (levels - 1)) / (levels - 1) * 255;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    if (data[i + 3] < 110) continue;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x * cell, y * cell, cell, cell);
    const k = 1 + (rnd() * 2 - 1) * 0.05;
    const ch = v => Math.max(0, Math.min(255, Math.round(q(v) * k)));
    ctx.fillStyle = `rgb(${ch(data[i])},${ch(data[i + 1])},${ch(data[i + 2])})`;
    ctx.fillRect(x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap);
  }
  return out.toDataURL('image/png');
}
