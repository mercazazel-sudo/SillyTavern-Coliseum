import { PALETTES } from './palettes.js';

const camelotPalette = (id, title, dark, tokens, mosaic) => ({ id, title, dark, tokens, mosaic });

export const CAMELOT_PALETTES = Object.freeze([
  camelotPalette('limestone', 'Известняк', false, {
    page: '#ece8df', card: '#faf7f0', side: '#ddd8cb', side2: '#cec8b8', ink: '#25262b', ink2: '#55565e', faint: '#85868d',
    line: '#bdb7a4', gold: '#8a6a1f', gold2: '#b08d3a', accent: '#8c2d2d', 'accent-ink': '#ffffff', tint: '#e6dfcb', ok: '#4f7d5d', warn: '#9a4a2f', shadow: 'rgba(40,40,30,.2)',
    narr: '#7a3b4e', speech: '#3d6a3a', think: '#2f4a82', 'fl-d': 'rgba(60,55,40,.10)', 'fl-l': 'rgba(255,255,255,.40)', cyl: 'rgba(60,55,40,.14)',
    'vein-op': '0', cap: '#e9e5da', 'st-hi': '#e9e5da', 'st-mid': '#d7d2c3', 'st-lo': '#bdb7a5', 'st-ln': 'rgba(70,64,48,.45)', 'st-hl': 'rgba(255,255,255,.55)',
  }, { roman: { G: '#e4dfd2', L: '#a79f89', Y: '#d8d2c2', O: '#c4a15a', R: '#b46a5c', grout: '#bdb5a0', veil: .14 }, geo: { G: '#e4dfd2', L: '#a79f89', Y: '#d8d2c2', O: '#c4a15a', R: '#b46a5c', grout: '#bdb5a0', veil: .14 } }),
  camelotPalette('azure', 'Лазурный стяг', true, {
    page: '#0e1424', card: '#172138', side: '#0a0f1c', side2: '#111a2e', ink: '#e8e4d6', ink2: '#b9bdcc', faint: '#7b8296',
    line: '#2c3a5c', gold: '#d4af5a', gold2: '#ebca7c', accent: '#3f6fc0', 'accent-ink': '#ffffff', tint: '#1f2d4c', ok: '#8cc29a', warn: '#e08a63', shadow: 'rgba(0,0,0,.55)',
    narr: '#e0a9bd', speech: '#b3d68e', think: '#9db6f0', 'fl-d': 'rgba(0,0,0,.40)', 'fl-l': 'rgba(255,255,255,.05)', cyl: 'rgba(0,0,0,.45)',
    'vein-op': '0', cap: '#172138', 'st-hi': '#26324f', 'st-mid': '#1a2440', 'st-lo': '#0f1629', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(160,190,255,.12)',
  }, { roman: { G: '#1b2540', L: '#0c1224', Y: '#16203a', O: '#6e6034', R: '#2f4f8a', grout: '#0a1020', veil: .22 }, geo: { G: '#1b2540', L: '#0c1224', Y: '#16203a', O: '#6e6034', R: '#2f4f8a', grout: '#0a1020', veil: .22 } }),
  camelotPalette('crimson', 'Багряный дом', true, {
    page: '#1b0f10', card: '#2b1719', side: '#140a0b', side2: '#1f1112', ink: '#f0e4d2', ink2: '#cdb8a6', faint: '#8f7a77',
    line: '#4a2a2c', gold: '#d4a94f', gold2: '#e9c777', accent: '#a8322f', 'accent-ink': '#fbeedd', tint: '#3a2022', ok: '#8cc29a', warn: '#e8946a', shadow: 'rgba(0,0,0,.55)',
    narr: '#e6a3a3', speech: '#b8d48c', think: '#b7a6ea', 'fl-d': 'rgba(0,0,0,.45)', 'fl-l': 'rgba(255,255,255,.045)', cyl: 'rgba(0,0,0,.5)',
    'vein-op': '0', cap: '#2b1719', 'st-hi': '#3a2427', 'st-mid': '#2a1a1c', 'st-lo': '#1a0e10', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(255,200,190,.10)',
  }, { roman: { G: '#2b191b', L: '#120809', Y: '#241416', O: '#7a5a2c', R: '#7e2b2b', grout: '#0f0707', veil: .22 }, geo: { G: '#2b191b', L: '#120809', Y: '#241416', O: '#7a5a2c', R: '#7e2b2b', grout: '#0f0707', veil: .22 } }),
  camelotPalette('forest', 'Лесной удел', true, {
    page: '#0f1812', card: '#18261d', side: '#0a110c', side2: '#112017', ink: '#e6e6d2', ink2: '#b6c0aa', faint: '#7b8a78',
    line: '#2b4533', gold: '#c7a54a', gold2: '#e0c070', accent: '#3e7a4e', 'accent-ink': '#ffffff', tint: '#1f3326', ok: '#94cf9f', warn: '#e0925f', shadow: 'rgba(0,0,0,.55)',
    narr: '#dfa7b8', speech: '#bdda8a', think: '#a6b9ee', 'fl-d': 'rgba(0,0,0,.42)', 'fl-l': 'rgba(255,255,255,.05)', cyl: 'rgba(0,0,0,.48)',
    'vein-op': '0', cap: '#18261d', 'st-hi': '#243a2b', 'st-mid': '#19281e', 'st-lo': '#0f1a13', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(190,255,200,.10)',
  }, { roman: { G: '#1a2a20', L: '#0a120d', Y: '#15231a', O: '#6f5f2e', R: '#34693f', grout: '#09100b', veil: .22 }, geo: { G: '#1a2a20', L: '#0a120d', Y: '#15231a', O: '#6f5f2e', R: '#34693f', grout: '#09100b', veil: .22 } }),
  camelotPalette('iron', 'Чёрное железо', true, {
    page: '#131517', card: '#1e2225', side: '#0d0f11', side2: '#181b1e', ink: '#e3e5e6', ink2: '#b2b8bc', faint: '#7a8286',
    line: '#353b40', gold: '#aeb8c2', gold2: '#cfd8e0', accent: '#6a8fa6', 'accent-ink': '#0f1417', tint: '#272d31', ok: '#8aa890', warn: '#c59a78', shadow: 'rgba(0,0,0,.55)',
    narr: '#d4aeb0', speech: '#a9c394', think: '#a9b4d8', 'fl-d': 'rgba(0,0,0,.42)', 'fl-l': 'rgba(255,255,255,.05)', cyl: 'rgba(0,0,0,.48)',
    'vein-op': '0', cap: '#1e2225', 'st-hi': '#2e3438', 'st-mid': '#212629', 'st-lo': '#15181a', 'st-ln': 'rgba(0,0,0,.6)', 'st-hl': 'rgba(255,255,255,.09)',
  }, { roman: { G: '#25292d', L: '#0f1113', Y: '#1d2124', O: '#6a7680', R: '#4e6577', grout: '#0c0e0f', veil: .22 }, geo: { G: '#25292d', L: '#0f1113', Y: '#1d2124', O: '#6a7680', R: '#4e6577', grout: '#0c0e0f', veil: .22 } }),
]);

const commonLabels = { masks: 'Маски', hand: 'Под рукой', chatlore: 'Лорбуки чата', trace: 'Что сработало из лорбуков', wiset: 'Настройки активации лорбуков' };

export const APPEARANCE_PROFILES = Object.freeze({
  coliseum: Object.freeze({
    id: 'coliseum', title: 'Колизей', description: 'Мрамор, мозаика, колонны и античные свитки',
    defaultPalette: 'marble', defaultBackground: 'geo', palettes: PALETTES,
    backgrounds: Object.freeze([['geo', 'Мозаика «Лепестки»'], ['round', 'Мозаика «Розетки»'], ['curl', 'Мозаика «Завитки»'], ['imgmosaic', 'Мозаика: своё изображение'], ['img', 'Свой фон']]),
    labels: Object.freeze({ ...commonLabels, brand: 'Колизей', settings: 'Акрополь', home: 'Атриум', chars: 'Пантеон', lore: 'Библиотека', loreedit: 'Свиток лорбука', ext: 'Мастерская' }),
    helperSet: 'antiquity',
  }),
  camelot: Object.freeze({
    id: 'camelot', title: 'Камелот', description: 'Камень, зубцы, стрельчатые арки и драконы',
    defaultPalette: 'limestone', defaultBackground: 'cathedral', palettes: CAMELOT_PALETTES,
    backgrounds: Object.freeze([['ashlar', 'Кладка «Крепостная стена»'], ['chain', 'Кольчуга «Стража»'], ['cathedral', 'Мозаика «Собор»'], ['flags', 'Плиты «Большой зал»'], ['tiles', 'Плиты «Эмаль»'], ['imgmosaic', 'Мозаика: своё изображение'], ['img', 'Свой фон']]),
    labels: Object.freeze({ ...commonLabels, brand: 'Камелот', settings: 'Цитадель', home: 'Большой зал', chars: 'Двор', lore: 'Скрипторий', loreedit: 'Свиток Скриптория', ext: 'Кузница' }),
    helperSet: 'fantasy',
  }),
});

export const appearanceProfile = id => APPEARANCE_PROFILES[id] ?? APPEARANCE_PROFILES.coliseum;
export const appearanceIds = () => Object.keys(APPEARANCE_PROFILES);
