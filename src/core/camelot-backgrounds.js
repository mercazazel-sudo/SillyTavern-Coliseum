import { report } from './guard.js';

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rgba = (hex, alpha) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return `rgba(${r},${g},${b},${alpha})`; };
const blend = (a, b, t) => { const x = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)); const y = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return `#${x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('')}`; };
const jitter = (hex, amount, random) => { const n = parseInt(hex.slice(1), 16), k = 1 + (random() * 2 - 1) * amount; const c = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${c(n >> 16 & 255)},${c(n >> 8 & 255)},${c(n & 255)})`; };

const stone = (g, x, y, w, h, base, palette, seed) => {
  const random = rng(seed); g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let i = 0, n = w * h / 55; i < n; i++) {
    g.fillStyle = random() < .5 ? rgba(palette.L, .05 + random() * .09) : `rgba(255,255,255,${.02 + random() * .05})`;
    g.fillRect(x + random() * w, y + random() * h, 1 + random() * 2.4, 1 + random() * 1.6);
  }
  g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
  g.fillStyle = rgba(palette.L, .45); g.fillRect(x, y + h - 2.5, w, 2.5); g.fillRect(x + w - 2.5, y, 2.5, h);
};

const drawAshlar = (g, size, palette, random) => {
  g.fillStyle = palette.grout; g.fillRect(0, 0, size, size); let y = 0;
  [32, 40, 24, 36, 28, 40, 32, 36, 28, 40, 24, 24].forEach(h => {
    const count = 6 + Math.floor(random() * 3), weights = Array.from({ length: count }, () => .7 + random() * .8), sum = weights.reduce((a, b) => a + b);
    const widths = weights.map(v => Math.round(v / sum * size)); widths[count - 1] = size - widths.slice(0, -1).reduce((a, b) => a + b);
    let x = Math.floor(random() * size);
    widths.forEach(width => { const seed = Math.floor(random() * 1e9), color = jitter(random() < .35 ? palette.Y : palette.G, .05, random); for (const offset of [0, -size]) { const xx = x + offset; if (xx + width > 0 && xx < size) stone(g, xx + 1.5, y + 1.5, width - 3, h - 3, color, palette, seed); } x = (x + width) % size; });
    y += h;
  });
};

const drawFlags = (g, size, palette, random) => {
  const count = 4, cell = size / count; g.fillStyle = palette.grout; g.fillRect(0, 0, size, size);
  for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) { const dark = (i + j) & 1; stone(g, i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3, jitter(dark ? palette.Y : palette.G, .04, random), palette, 100 + j * 7 + i); if (dark) { g.strokeStyle = rgba(palette.L, .4); g.lineWidth = 1; g.strokeRect(i * cell + 14.5, j * cell + 14.5, cell - 29, cell - 29); } }
  for (let j = 0; j <= count; j++) for (let i = 0; i <= count; i++) { const x = i * cell, y = j * cell, d = 10; g.beginPath(); g.moveTo(x, y - d); g.lineTo(x + d, y); g.lineTo(x, y + d); g.lineTo(x - d, y); g.closePath(); g.fillStyle = palette.O; g.fill(); g.strokeStyle = palette.L; g.lineWidth = 1.4; g.stroke(); g.fillStyle = rgba(palette.L, .6); g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
};

const drawChain = (g, size, palette) => {
  g.fillStyle = palette.grout; g.fillRect(0, 0, size, size); const dx = 24, dy = 12, radius = 10.5;
  for (let j = -1; j <= size / dy + 1; j++) for (let i = -1; i <= size / dx + 1; i++) { const x = i * dx + ((j & 1) ? dx / 2 : 0), y = j * dy; g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = palette.L; g.stroke(); g.lineWidth = 3; g.strokeStyle = ((i + j) & 1) ? palette.Y : palette.G; g.stroke(); g.beginPath(); g.arc(x, y, radius, Math.PI * 1.08, Math.PI * 1.62); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.2)'; g.stroke(); }
};

/* ── мотивы эмалевых плиток (по макету): контуры в рамке 100x100 ── */
const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const turns = (d, angles) => angles.map(a => ({ d, a }));
const petalRing = (R, n) => { let d = circ(50, 50, R); for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n; d += circ((50 + R * Math.cos(a)).toFixed(2), (50 + R * Math.sin(a)).toFixed(2), R); } return d; };
export const MOTIFS = {
  fleur: [{ d: 'M50 8C60 22 61 38 50 54C39 38 40 22 50 8ZM45 56C31 47 14 46 11 31C26 26 41 36 47 52ZM55 56C69 47 86 46 89 31C74 26 59 36 53 52ZM35 58H65V65H35ZM50 66C44 74 44 82 50 92C56 82 56 74 50 66ZM44 66C33 65 26 73 32 82C37 78 40 74 44 71ZM56 66C67 65 74 73 68 82C63 78 60 74 56 71Z' }],
  quatre: [{ d: circ(50, 50, 40), m: 's', w: 5 }, { d: circ(50, 33, 15) + circ(67, 50, 15) + circ(50, 67, 15) + circ(33, 50, 15) + 'M38 38H62V62H38Z' }, { d: circ(17, 17, 4) + circ(83, 17, 4) + circ(17, 83, 4) + circ(83, 83, 4) }],
  rosette: [...turns('M50 50C58 40 72 40 84 50C72 60 58 60 50 50Z', [0, 45, 90, 135, 180, 225, 270, 315]), { d: circ(50, 50, 9) }],
  cross: [{ d: 'M46 18H54V82H46ZM18 46H82V54H18Z' }, ...turns(circ(50, 11, 5.5) + circ(43.5, 18, 4.5) + circ(56.5, 18, 4.5), [0, 90, 180, 270]), ...turns(circ(24, 17, 6) + circ(17.5, 27, 6) + circ(30.5, 27, 6), [0, 90, 180, 270]), { d: circ(50, 50, 11) }],
  flower: [{ d: circ(50, 50, 40), m: 's', w: 4 }, { d: petalRing(20, 6), m: 's', w: 3 }],
  leaves4: [{ d: 'M50 8L92 50L50 92L8 50Z', m: 's', w: 3.5 }, ...turns('M50 50C52 34 64 22 80 20C78 36 66 48 50 50Z', [0, 90, 180, 270]), { d: circ(50, 50, 5) }],
};
export const MOTIF_NAMES = Object.keys(MOTIFS);
const drawMotif = (g, name, x, y, scale, color) => {
  for (const part of MOTIFS[name]) {
    g.save(); g.translate(x, y); g.scale(scale, scale);
    if (part.a) { g.translate(50, 50); g.rotate(part.a * Math.PI / 180); g.translate(-50, -50); }
    const path = new Path2D(part.d);
    if (part.m === 's') { g.lineWidth = part.w; g.lineJoin = 'round'; g.strokeStyle = color; g.stroke(path); } else { g.fillStyle = color; g.fill(path); }
    g.restore();
  }
};

/* 5. плитки с эмалью: шахматка, у каждой плитки свой мотив светлой глазурью по полю */
const drawTiles = (g, size, palette, random) => {
  const count = 4, cell = size / count, light = parseInt(palette.G.slice(1, 3), 16) > 150;
  g.fillStyle = palette.grout; g.fillRect(0, 0, size, size);
  const inlay = light ? blend(palette.O, '#5a3b12', .25) : blend(palette.O, '#f2cc72', .5);
  for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) {
    const ground = (i * 3 + j * 2) % 5 === 0 ? blend(palette.G, palette.R, .45) : ((i + j) & 1 ? palette.Y : palette.G);
    stone(g, i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3, jitter(ground, .04, random), palette, 200 + i + j * 4);
    g.globalAlpha = .92; drawMotif(g, MOTIF_NAMES[(i + j * 2) % MOTIF_NAMES.length], i * cell + 14, j * cell + 14, (cell - 28) / 100, inlay); g.globalAlpha = 1;
  }
};

/* 4. мозаика собора (по макету): синее поле, золотые розетки с колесом, кольца, цветы-звёзды. Рисуется вектором и режется на тессеры 4 px. */
const drawCathedral = (g, size, P) => {
  const N = 600, U = 300;
  const light = parseInt(P.G.slice(1, 3), 16) > 150;
  const field = light ? blend(P.G, '#9fb2cf', .5) : blend(P.G, P.R, .38), gold = blend(P.O, '#f2cc72', .45), ice = light ? '#e4ecf6' : blend(P.R, '#ffffff', .55),
    green = blend(field, '#3f8a5a', .55), white = blend(field, '#efe9d8', .8), ink = blend(P.L, '#000000', .55), rust = blend(field, '#a8461f', .75), deep = blend(field, '#000000', .45);
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const v = cv.getContext('2d');
  v.fillStyle = field; v.fillRect(0, 0, N, N);
  const disc = (x, y, r, c) => { v.beginPath(); v.arc(x, y, r, 0, 7); v.fillStyle = c; v.fill(); };
  const petals = (x, y, n, len, wd, c, a0) => { for (let k = 0; k < n; k++) { v.save(); v.translate(x, y); v.rotate(a0 + k * 2 * Math.PI / n); v.beginPath(); v.ellipse(len / 2, 0, len / 2, wd, 0, 0, 7); v.fillStyle = c; v.fill(); v.restore(); } };
  const roundelA = (x, y) => {
    for (let k = 0; k < 4; k++) {
      v.save(); v.translate(x, y); v.rotate(k * Math.PI / 2 + Math.PI / 4);
      v.strokeStyle = gold; v.lineWidth = 3; v.beginPath(); v.moveTo(52, 0); v.lineTo(92, 0); v.stroke();
      petals(78, 0, 3, 24, 5, gold, -1.2); petals(92, 0, 3, 18, 4.5, gold, -.9); v.restore();
    }
    disc(x, y, 56, gold); disc(x, y, 48, ink); disc(x, y, 45, gold); disc(x, y, 38, ink); disc(x, y, 35, ice); disc(x, y, 31, white); disc(x, y, 28, deep);
    for (let k = 0; k < 10; k++) { v.save(); v.translate(x, y); v.rotate(k * Math.PI / 5); v.beginPath(); v.moveTo(0, 0); v.lineTo(27, -4.5); v.lineTo(27, 4.5); v.closePath(); v.fillStyle = k & 1 ? white : ice; v.fill(); v.restore(); }
    disc(x, y, 7, gold);
  };
  const roundelB = (x, y) => {
    for (let k = 0; k < 20; k++) { v.save(); v.translate(x, y); v.rotate(k * Math.PI / 10); v.beginPath(); v.moveTo(54, -6); v.lineTo(62, 0); v.lineTo(54, 6); v.closePath(); v.fillStyle = ice; v.fill(); v.restore(); }
    disc(x, y, 55, ice); disc(x, y, 50, white); disc(x, y, 45, green); disc(x, y, 38, ice); disc(x, y, 33, ink); disc(x, y, 30, white); disc(x, y, 26, rust);
    v.strokeStyle = green; v.lineWidth = 3; v.beginPath(); v.moveTo(x - 17, y - 17); v.lineTo(x + 17, y + 17); v.moveTo(x + 17, y - 17); v.lineTo(x - 17, y + 17); v.stroke();
    disc(x, y, 6, gold);
  };
  const flower = (x, y) => { petals(x, y, 8, 38, 6.5, ice, Math.PI / 8); petals(x, y, 8, 16, 3.5, white, Math.PI / 8); disc(x, y, 4, gold); };
  for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) {
    const ox = i * U, oy = j * U;
    roundelA(75 + ox, 75 + oy); roundelB(225 + ox, 225 + oy); flower(225 + ox, 75 + oy); flower(75 + ox, 225 + oy);
    for (const [dx, dy] of [[150, 150], [150, 0], [0, 150], [150, 75], [75, 150]]) disc(dx + ox, dy + oy, 5, gold);
  }
  /* нарезка на тессеры: сетка 4 px, раствор 1 px */
  const cell = 4, gap = 1, cols = N / cell;
  const sm = document.createElement('canvas'); sm.width = sm.height = cols; const sg = sm.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high'; sg.drawImage(cv, 0, 0, cols, cols);
  const data = sg.getImageData(0, 0, cols, cols).data, rnd = rng(5);
  g.clearRect(0, 0, size, size);
  for (let y = 0; y < cols; y++) for (let x = 0; x < cols; x++) {
    const k = (y * cols + x) * 4, f = 1 + (rnd() * 2 - 1) * .05, ch = c => Math.max(0, Math.min(255, Math.round(c * f)));
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x * cell, y * cell, cell, cell);
    g.fillStyle = `rgb(${ch(data[k])},${ch(data[k + 1])},${ch(data[k + 2])})`; g.fillRect(x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap);
  }
};

const KINDS = Object.freeze({ ashlar: [384, drawAshlar], flags: [512, drawFlags], chain: [480, drawChain], cathedral: [600, drawCathedral, .10], tiles: [480, drawTiles, .30] });

export function buildCamelotTile(kindId, palette) {
  const kind = KINDS[kindId]; if (!kind) return Promise.resolve('');
  return new Promise(resolve => setTimeout(() => { try { const [size, draw, vadd = 0] = kind, canvas = document.createElement('canvas'); canvas.width = canvas.height = size; draw(canvas.getContext('2d'), size, palette.mosaic.roman, rng(23)); resolve({ url: canvas.toDataURL('image/png'), size, veil: Math.min(.6, palette.mosaic.roman.veil + vadd) }); } catch (error) { report('фон Камелота', error); resolve(null); } }, 0));
}

export const isCamelotBackground = id => !!KINDS[id];
