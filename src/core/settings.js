/** Настройки Колизея живут в extensionSettings.coliseum (их сохраняет сама Таверна). */
export const KEY = 'coliseum';

import { appearanceIds, appearanceProfile } from './appearances.js';

export const BACKGROUNDS = Object.freeze([...new Set(appearanceIds().flatMap(id => appearanceProfile(id).backgrounds.map(([key]) => key)))]);
export const WINDOW_STYLES = Object.freeze(['ctx', 'portico', 'stone', 'scroll']);
export const APPEARANCES = Object.freeze(appearanceIds());

const APPEARANCE_DEFAULTS = Object.freeze({
  coliseum: Object.freeze({ palette: appearanceProfile('coliseum').defaultPalette, bg: appearanceProfile('coliseum').defaultBackground }),
  camelot: Object.freeze({ palette: appearanceProfile('camelot').defaultPalette, bg: appearanceProfile('camelot').defaultBackground }),
});

const DEFAULTS = Object.freeze({
  enabled: true,
  appearance: 'coliseum', // полное оформление: coliseum или camelot
  appearancePrefs: null,  // последняя палитра и фон отдельно для каждого оформления
  userPalettes: null,     // пользовательские палитры по оформлениям
  theme: 'marble',   // id палитры или 'custom'
  bg: 'geo',         // geo, round, curl или none
  custom: null,      // старая «Моя палитра» (переносится в список тем)
  themes: null,      // свои темы: [{ id, name, colors }]
  sideOff: false,    // колонна скрыта
  lowVision: false, lowVisionTone: 'dark', lowVisionScale: 125, // режим для слабовидящих: тёмная или светлая палитра и размер 100..160%
  cvdMode: 'off', cvdStrength: 60, // фильтр аватарок для цветовой слепоты: off, rg (красно-зелёный), by (сине-жёлтый) и сила 0..100
  sharpImages: false, // чёткие аватарки и фоны: оригиналы вместо сжатых миниатюр
  ws: 'ctx',         // оформление окон: ctx (по умолчанию), portico, stone, scroll
  bgScale: 100, bgPx: 50, bgPy: 50, bgVeil: 40, bgCell: 8, // свой фон: масштаб, сдвиг, затемнение, размер тессеры
  bgName: '',        // имя файла своего фона
  thumbs: null,      // миниатюры масок в круглой рамке: { idМаски: { zoom, x, y } }
});

const copy = value => JSON.parse(JSON.stringify(value));
const validAppearance = value => APPEARANCES.includes(value) ? value : 'coliseum';

/**
 * Переносит старую схему, где theme означал палитру, в схему с отдельным оформлением.
 * Старые поля theme/bg/themes остаются рабочим зеркалом активного оформления: старым модулям
 * не нужно знать о миграции, а переключатель оформления сохраняет их значения раздельно.
 */
export function migrateAppearanceSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  settings.appearance = validAppearance(settings.appearance);

  if (!settings.appearancePrefs || typeof settings.appearancePrefs !== 'object' || Array.isArray(settings.appearancePrefs)) {
    settings.appearancePrefs = {
      coliseum: {
        palette: typeof settings.theme === 'string' ? settings.theme : APPEARANCE_DEFAULTS.coliseum.palette,
        bg: typeof settings.bg === 'string' ? settings.bg : APPEARANCE_DEFAULTS.coliseum.bg,
      },
      camelot: copy(APPEARANCE_DEFAULTS.camelot),
    };
  }
  for (const id of APPEARANCES) {
    const fallback = APPEARANCE_DEFAULTS[id];
    const prefs = settings.appearancePrefs[id];
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) settings.appearancePrefs[id] = copy(fallback);
    if (typeof settings.appearancePrefs[id].palette !== 'string') settings.appearancePrefs[id].palette = fallback.palette;
    if (typeof settings.appearancePrefs[id].bg !== 'string') settings.appearancePrefs[id].bg = fallback.bg;
  }

  if (!settings.userPalettes || typeof settings.userPalettes !== 'object' || Array.isArray(settings.userPalettes)) {
    settings.userPalettes = {
      coliseum: Array.isArray(settings.themes) ? copy(settings.themes) : [],
      camelot: [],
    };
  }
  for (const id of APPEARANCES) if (!Array.isArray(settings.userPalettes[id])) settings.userPalettes[id] = [];

  const active = settings.appearancePrefs[settings.appearance];
  // Зеркальные поля импортируем только при первом переходе со старой схемы. После этого
  // appearancePrefs является источником истины, иначе старое зеркало перезапишет другой профиль при старте.
  const firstMigration = !settings.appearanceSchema;
  if (firstMigration && settings.appearance === 'coliseum') {
    if (typeof settings.theme === 'string') active.palette = settings.theme;
    if (typeof settings.bg === 'string') active.bg = settings.bg;
    if (Array.isArray(settings.themes)) settings.userPalettes.coliseum = copy(settings.themes);
  }
  settings.appearanceSchema = 1;
  settings.theme = active.palette;
  settings.bg = active.bg;
  settings.themes = settings.userPalettes[settings.appearance];
  return settings;
}

/** Запоминает текущие зеркальные поля и включает другое оформление без потери выбора. */
export function selectAppearance(settings, next) {
  if (!settings.appearanceSchema || !settings.appearancePrefs || !settings.userPalettes) migrateAppearanceSettings(settings);
  const current = settings.appearance;
  settings.appearancePrefs[current] = { palette: settings.theme, bg: settings.bg };
  settings.userPalettes[current] = copy(settings.themes ?? []);
  settings.appearance = validAppearance(next);
  const prefs = settings.appearancePrefs[settings.appearance];
  settings.theme = prefs.palette;
  settings.bg = prefs.bg;
  settings.themes = settings.userPalettes[settings.appearance];
  return settings;
}

/** Возвращает объект настроек, дописывая недостающие поля значениями по умолчанию. */
export function getSettings(context) {
  const store = context.extensionSettings;
  if (!store[KEY] || typeof store[KEY] !== 'object') store[KEY] = {};
  const settings = store[KEY];
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (!(name in settings)) settings[name] = value;
  }
  migrateAppearanceSettings(settings);
  if (!Array.isArray(settings.themes)) settings.themes = [];
  if (!appearanceProfile(settings.appearance).backgrounds.some(([id]) => id === settings.bg)) {
    settings.bg = appearanceProfile(settings.appearance).defaultBackground;
    settings.appearancePrefs[settings.appearance].bg = settings.bg;
  }
  if (!WINDOW_STYLES.includes(settings.ws)) settings.ws = DEFAULTS.ws;
  return settings;
}

export const saver = context => () => context.saveSettingsDebounced?.();
