/**
 * Палитры Колизея. Каждая задаёт токены (CSS-переменные --col-*) и цвета мозаики.
 * «Своя» палитра выводится из восьми цветов конструктора.
 */

/** Восемь цветов конструктора. */
export const CUSTOM_KEYS = Object.freeze(['page', 'card', 'ink', 'gold', 'accent', 'narr', 'speech', 'think']);

/**
 * «Ясная»: палитра для людей с нарушением цветового восприятия (красно-зелёный тип, самый частый).
 * Нигде нет пары красный/зелёный: акценты строятся на синем, оранжевом и жёлтом (цвета, различимые при дальтонизме).
 * Повествование, речь и мысли отличаются ещё и яркостью, а «хорошо» и «внимание» это синий и оранжевый.
 * Контраст текста к фону карточки не ниже 6:1 (повествование 13, речь 10, мысли 8.7, подписи 6.4).
 * Общая для обоих оформлений: для Камелота та же палитра добавлена в CAMELOT_PALETTES.
 */
export const CLEAR_PALETTE = Object.freeze({
  id: 'clear', title: 'Ясная · красно-зелёный', dark: true,
  tokens: {
    page: '#0f1419', card: '#18202a', side: '#0b1015', side2: '#131a22',
    ink: '#f4f1e8', ink2: '#d3d8de', faint: '#98a3ad', line: '#3a4757',
    gold: '#e6b84a', gold2: '#f5d076', accent: '#1f6fb8', 'accent-ink': '#ffffff',
    tint: '#1f2b38', ok: '#56b4e9', warn: '#e69f00', shadow: 'rgba(0,0,0,.55)',
    narr: '#f0e6cc', speech: '#ffc34d', think: '#7fc4f2',
    'fl-d': 'rgba(0,0,0,.42)', 'fl-l': 'rgba(255,255,255,.05)', cyl: 'rgba(0,0,0,.48)',
    'vein-op': '0', cap: '#18202a',
    'st-hi': '#2a3644', 'st-mid': '#1c2530', 'st-lo': '#10161d', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(190,220,255,.12)',
  },
  mosaic: {
    roman: { G: '#1b2531', L: '#0b1118', Y: '#151e28', O: '#8a6a22', R: '#2f6fa6', grout: '#0a0f14', veil: 0.22 },
    geo: { G: '#1b2531', L: '#0b1118', Y: '#151e28', O: '#8a6a22', R: '#2f6fa6', grout: '#0a0f14', veil: 0.22 },
  },
});

/**
 * «Ясная 2»: палитра для людей, которые путают синий с зелёным и жёлтый с розовым (тританопия, редкий тип).
 * Смысл несут красный и зелёный (эта ось при таком виде различается) и яркость; синего и жёлтого для различения нет,
 * фон нейтрально-графитовый, без синевы. Контраст текста к карточке: повествование 13.5, мысли 10, речь 8.3, подписи 6.5.
 */
export const CLEAR2_PALETTE = Object.freeze({
  id: 'clear2', title: 'Ясная · сине-жёлтый', dark: true,
  tokens: {
    page: '#141414', card: '#1f1f1f', side: '#0e0e0e', side2: '#181818',
    ink: '#f2efe9', ink2: '#d0cdc6', faint: '#a6a29c', line: '#444240',
    gold: '#d89a6a', gold2: '#ecb88c', accent: '#a82a34', 'accent-ink': '#ffffff',
    tint: '#2a2523', ok: '#6fcf7f', warn: '#ff7a66', shadow: 'rgba(0,0,0,.55)',
    narr: '#efe8dc', speech: '#ffa07a', think: '#8fdc9a',
    'fl-d': 'rgba(0,0,0,.42)', 'fl-l': 'rgba(255,255,255,.05)', cyl: 'rgba(0,0,0,.48)',
    'vein-op': '0', cap: '#1f1f1f',
    'st-hi': '#30302f', 'st-mid': '#222221', 'st-lo': '#121212', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(255,235,220,.10)',
  },
  mosaic: {
    roman: { G: '#232120', L: '#0e0d0d', Y: '#1a1918', O: '#8a5a3a', R: '#8a2a32', grout: '#0b0a0a', veil: 0.22 },
    geo: { G: '#232120', L: '#0e0d0d', Y: '#1a1918', O: '#8a5a3a', R: '#8a2a32', grout: '#0b0a0a', veil: 0.22 },
  },
});

/**
 * Палитры режима «Для слабовидящих» (тёмная и светлая). Не входят в списки палитр: подставляются, пока режим включён,
 * а выбранная пользователем палитра не затирается. Контраст основного текста к карточке не ниже 12:1, подписей не ниже 10:1,
 * рамки заметные (не ниже 6:1). Золото и акцент строятся на одном ярком (тёмная) или тёмном (светлая) оттенке без красного и зелёного.
 */
const lvTokens = (t, extra) => ({
  ...t, 'accent-ink': extra.accentInk, tint: extra.tint, shadow: extra.shadow,
  'fl-d': extra.fld, 'fl-l': extra.fll, cyl: extra.cyl, 'vein-op': '0', cap: t.card,
  'st-hi': extra.hi, 'st-mid': extra.mid, 'st-lo': extra.lo, 'st-ln': extra.ln, 'st-hl': extra.hl,
});
export const LV_DARK = Object.freeze({
  id: 'lv-dark', title: 'Для слабовидящих · тёмная', dark: true,
  tokens: lvTokens({
    page: '#0a0a0a', card: '#161616', side: '#000000', side2: '#101010',
    ink: '#ffffff', ink2: '#ececec', faint: '#cfcfcf', line: '#9a9a9a',
    gold: '#ffd54a', gold2: '#ffe58a', accent: '#ffd54a', ok: '#7fd4ff', warn: '#ffb03a',
    narr: '#ffffff', speech: '#ffe066', think: '#a0dcff',
  }, { accentInk: '#000000', tint: '#262626', shadow: 'rgba(0,0,0,.7)', fld: 'rgba(0,0,0,.5)', fll: 'rgba(255,255,255,.06)', cyl: 'rgba(0,0,0,.55)', hi: '#2e2e2e', mid: '#1c1c1c', lo: '#0c0c0c', ln: 'rgba(0,0,0,.7)', hl: 'rgba(255,255,255,.14)' }),
  mosaic: { roman: { G: '#101010', L: '#000000', Y: '#0a0a0a', O: '#3a3010', R: '#1c1c1c', grout: '#000000', veil: 0.5 }, geo: { G: '#101010', L: '#000000', Y: '#0a0a0a', O: '#3a3010', R: '#1c1c1c', grout: '#000000', veil: 0.5 } },
});
export const LV_LIGHT = Object.freeze({
  id: 'lv-light', title: 'Для слабовидящих · светлая', dark: false,
  tokens: lvTokens({
    page: '#ffffff', card: '#f6f3ec', side: '#ece8de', side2: '#e0dbcd',
    ink: '#000000', ink2: '#1c1c1c', faint: '#3b3b3b', line: '#4a4a4a',
    gold: '#5a3600', gold2: '#3d2400', accent: '#0b3d91', ok: '#003a66', warn: '#662900',
    narr: '#111111', speech: '#4a2400', think: '#082a5e',
  }, { accentInk: '#ffffff', tint: '#e6e1d3', shadow: 'rgba(0,0,0,.25)', fld: 'rgba(0,0,0,.12)', fll: 'rgba(255,255,255,.6)', cyl: 'rgba(0,0,0,.14)', hi: '#f6f3ec', mid: '#e3ded0', lo: '#cfc9b8', ln: 'rgba(0,0,0,.5)', hl: 'rgba(255,255,255,.8)' }),
  mosaic: { roman: { G: '#f1eee6', L: '#d6d0bf', Y: '#e8e4d8', O: '#d9c79a', R: '#d6d0bf', grout: '#ffffff', veil: 0.5 }, geo: { G: '#f1eee6', L: '#d6d0bf', Y: '#e8e4d8', O: '#d9c79a', R: '#d6d0bf', grout: '#ffffff', veil: 0.5 } },
});

export const PALETTES = Object.freeze([
  {
    id: 'marble', title: 'Паросский мрамор', dark: false,
    tokens: {
      page: '#f6f2ea', card: '#fffdf8', side: '#ece6d9', side2: '#e3dccb',
      ink: '#2b2a35', ink2: '#5c5a68', faint: '#8d8a96', line: '#cfc6b0',
      gold: '#a8812c', gold2: '#c9a24a', accent: '#2c3e6b', 'accent-ink': '#ffffff',
      tint: '#efe8d6', ok: '#4f7d5d', warn: '#9a4a2f', shadow: 'rgba(60,50,30,.18)',
      narr: '#7a3b5e', speech: '#3f6b3a', think: '#2c3e6b',
      'fl-d': 'rgba(90,70,30,.10)', 'fl-l': 'rgba(255,255,255,.45)', cyl: 'rgba(80,60,30,.10)',
      'vein-op': '.30', cap: '#efe9dc',
      'st-hi': '#f4efe3', 'st-mid': '#e7e0cf', 'st-lo': '#d3cab4', 'st-ln': 'rgba(95,78,40,.38)', 'st-hl': 'rgba(255,255,255,.7)',
    },
    mosaic: {
      roman: { G: '#f1ead9', L: '#7a7468', Y: '#b3b09b', O: '#dcc08c', R: '#cf8b72', grout: '#cfc5ad', veil: 0.30 },
      geo: { G: '#eee6d2', L: '#5c4739', Y: '#eee6d2', O: '#cfae6a', R: '#b7765b', grout: '#c8bca3', veil: 0.22 },
    },
  },
  {
    id: 'porphyry', title: 'Порфир', dark: true,
    tokens: {
      page: '#1d1220', card: '#2a1a2e', side: '#170d1a', side2: '#22142a',
      ink: '#efe4d2', ink2: '#c9b8a6', faint: '#8f7f8c', line: '#4a2f4d',
      gold: '#d4af5a', gold2: '#e8c978', accent: '#8a2f5c', 'accent-ink': '#fbeedd',
      tint: '#35203a', ok: '#8cc29a', warn: '#e08a63', shadow: 'rgba(0,0,0,.5)',
      narr: '#e1a0c4', speech: '#b6d68c', think: '#b7a4ec',
      'fl-d': 'rgba(0,0,0,.35)', 'fl-l': 'rgba(255,255,255,.05)', cyl: 'rgba(0,0,0,.45)',
      'vein-op': '.20', cap: '#2a1a2e',
      'st-hi': '#35253d', 'st-mid': '#281b2f', 'st-lo': '#1a1020', 'st-ln': 'rgba(0,0,0,.55)', 'st-hl': 'rgba(255,255,255,.10)',
    },
    mosaic: {
      roman: { G: '#241628', L: '#5c4a3c', Y: '#33233a', O: '#6f5530', R: '#7b3547', grout: '#180e1c', veil: 0.22 },
      geo: { G: '#4b3d52', L: '#1d1222', Y: '#4b3d52', O: '#7b6538', R: '#6e3445', grout: '#150b18', veil: 0.18 },
    },
  },
  {
    id: 'blackfig', title: 'Чернофигурная', dark: true,
    tokens: {
      page: '#121110', card: '#1c1a18', side: '#0c0b0a', side2: '#171513',
      ink: '#f0e3cf', ink2: '#c4b49c', faint: '#857a6a', line: '#3b3128',
      gold: '#d9772b', gold2: '#ef9a52', accent: '#c8601c', 'accent-ink': '#140d07',
      tint: '#27211b', ok: '#9bc08a', warn: '#e98a5a', shadow: 'rgba(0,0,0,.55)',
      narr: '#e7a27a', speech: '#a8c982', think: '#c3a9e6',
      'fl-d': 'rgba(0,0,0,.45)', 'fl-l': 'rgba(255,255,255,.045)', cyl: 'rgba(0,0,0,.5)',
      'vein-op': '.16', cap: '#1c1a18',
      'st-hi': '#2c2824', 'st-mid': '#1e1b18', 'st-lo': '#12100e', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(255,255,255,.08)',
    },
    mosaic: {
      roman: { G: '#1f1b17', L: '#4e3520', Y: '#2a2520', O: '#6c4b2a', R: '#7e3c27', grout: '#0f0d0b', veil: 0.22 },
      geo: { G: '#41382e', L: '#14100d', Y: '#41382e', O: '#7d6032', R: '#6e3b25', grout: '#0e0c0a', veil: 0.18 },
    },
  },
  {
    id: 'basalt', title: 'Базальт', dark: true,
    tokens: {
      page: '#17181a', card: '#212326', side: '#131416', side2: '#1d1e21',
      ink: '#e4e1d8', ink2: '#b5b2a8', faint: '#7e7c75', line: '#3a3c40',
      gold: '#a99a6c', gold2: '#c4b688', accent: '#6d8294', 'accent-ink': '#f4f1ea',
      tint: '#2b2c2f', ok: '#8aa890', warn: '#c59a78', shadow: 'rgba(0,0,0,.5)',
      narr: '#cba9a4', speech: '#a8bb92', think: '#a9acc9',
      'fl-d': 'rgba(0,0,0,.4)', 'fl-l': 'rgba(255,255,255,.045)', cyl: 'rgba(0,0,0,.45)',
      'vein-op': '.16', cap: '#212326',
      'st-hi': '#2d2f33', 'st-mid': '#222428', 'st-lo': '#16171a', 'st-ln': 'rgba(0,0,0,.55)', 'st-hl': 'rgba(255,255,255,.08)',
    },
    mosaic: {
      roman: { G: '#202225', L: '#5e5848', Y: '#2c2e32', O: '#5c553e', R: '#4b5560', grout: '#131416', veil: 0.22 },
      geo: { G: '#3a3c40', L: '#16171a', Y: '#3a3c40', O: '#6f6648', R: '#4f5b66', grout: '#101113', veil: 0.18 },
    },
  },
  CLEAR_PALETTE,
  CLEAR2_PALETTE,
]);

/* ── цвет ── */
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = parts => '#' + parts.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const luminance = hex => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

/** Берёт только корректные #rrggbb, остальное заменяет серым, чтобы расчёт не падал. */
export function cleanColors(colors) {
  const result = {};
  for (const key of CUSTOM_KEYS) result[key] = HEX.test(colors?.[key] ?? '') ? colors[key] : '#888888';
  return result;
}

/** Из восьми цветов конструктора выводит все токены и цвета мозаики. */
export function deriveCustom(input) {
  const c = cleanColors(input);
  const dark = luminance(c.page) < 0.45;
  const side = mix(c.page, c.ink, dark ? 0.12 : 0.06);
  const side2 = mix(c.page, c.ink, dark ? 0.22 : 0.12);
  const line = mix(c.page, c.ink, dark ? 0.26 : 0.20);
  const tokens = {
    page: c.page, card: c.card, side, side2, ink: c.ink,
    ink2: mix(c.ink, c.page, 0.30), faint: mix(c.ink, c.page, 0.52), line,
    gold: c.gold, gold2: mix(c.gold, '#ffffff', 0.25), accent: c.accent,
    'accent-ink': luminance(c.accent) > 0.55 ? '#1b1712' : '#ffffff',
    tint: mix(c.card, c.gold, dark ? 0.16 : 0.12),
    ok: dark ? '#8cc29a' : '#4f7d5d', warn: dark ? '#e08a63' : '#9a4a2f',
    shadow: dark ? 'rgba(0,0,0,.5)' : 'rgba(60,50,30,.18)',
    narr: c.narr, speech: c.speech, think: c.think,
    'fl-d': dark ? 'rgba(0,0,0,.4)' : 'rgba(90,70,30,.10)', 'fl-l': dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.45)',
    cyl: dark ? 'rgba(0,0,0,.45)' : 'rgba(80,60,30,.10)', 'vein-op': dark ? '.18' : '.30', cap: c.card,
    'st-hi': dark ? mix(side, '#ffffff', 0.08) : mix(c.page, '#ffffff', 0.5), 'st-mid': side, 'st-lo': side2,
    'st-ln': dark ? 'rgba(0,0,0,.55)' : mix(line, c.ink, 0.35), 'st-hl': dark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.7)',
  };
  const G = mix(c.page, c.ink, dark ? 0.03 : 0.05);
  const GG = dark ? mix(c.page, c.ink, 0.20) : mix(c.page, c.gold, 0.10);
  const mosaic = {
    roman: dark
      ? { G, L: mix(G, c.gold, 0.30), Y: mix(G, c.ink, 0.10), O: mix(G, c.gold, 0.35), R: mix(G, c.accent, 0.50), grout: mix(G, '#000000', 0.35), veil: 0.22 }
      : { G, L: mix(G, c.ink, 0.50), Y: mix(G, c.ink, 0.28), O: mix(G, c.gold, 0.50), R: mix(G, c.accent, 0.50), grout: mix(G, c.ink, 0.15), veil: 0.30 },
    geo: dark
      ? { G: GG, L: mix(c.page, '#000000', 0.30), Y: GG, O: mix(GG, c.gold, 0.45), R: mix(GG, c.accent, 0.40), grout: mix(c.page, '#000000', 0.40), veil: 0.18 }
      : { G: GG, L: mix(GG, c.ink, 0.62), Y: GG, O: mix(GG, c.gold, 0.55), R: mix(GG, c.accent, 0.55), grout: mix(GG, c.ink, 0.12), veil: 0.22 },
  };
  return { id: 'custom', title: 'Моя палитра', dark, tokens, mosaic };
}

/** Палитра по настройкам: своя, если выбрана и задана, иначе встроенная (по умолчанию первая). */
export function resolvePalette(settings, palettes = PALETTES) {
  if (typeof settings.theme === 'string' && settings.theme.startsWith('u:')) {
    const own = (settings.themes ?? []).find(t => t.id === settings.theme);
    if (own) return { ...deriveCustom(own.colors), id: own.id, title: own.name };
  }
  if (settings.theme === 'custom' && settings.custom) return deriveCustom(settings.custom);
  return palettes.find(p => p.id === settings.theme) ?? palettes[0];
}
