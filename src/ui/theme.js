/**
 * Тема: ставит на body класс col-on и раскладывает токены палитры в переменные --col-*.
 * Всё, что делает Колизей, живёт под body.col-on, поэтому «выключить» значит снять класс и переменные.
 * Другие модули узнают о смене палитры через shared.bus (событие 'palette') и читают shared.theme.current().
 */
import { cleanColors, deriveCustom, resolvePalette, LV_DARK, LV_LIGHT } from '../core/palettes.js';
import { APPEARANCE_PROFILES, appearanceProfile } from '../core/appearances.js';
import { selectAppearance } from '../core/settings.js';

export function startTheme(doc, { settings, save, shared }) {
  const body = doc.body;
  const bus = shared.bus ??= new EventTarget();
  let applied = [];
  let preview = null; // цвета, которые показываются, пока открыт редактор (не сохраняются)
  if (!Array.isArray(settings.themes)) settings.themes = [];

  const clearTokens = () => {
    for (const name of applied) body.style.removeProperty(name);
    applied = [];
  };

  /** Режим «Для слабовидящих» подставляет свою палитру, выбранная пользователем при этом не меняется. */
  const lowVision = () => (settings.lowVision ? (settings.lowVisionTone === 'light' ? LV_LIGHT : LV_DARK) : null);
  const activePalette = () => (preview ? deriveCustom(preview) : lowVision() ?? resolvePalette(settings, appearanceProfile(settings.appearance).palettes));

  const apply = () => {
    clearTokens();
    const profile = appearanceProfile(settings.appearance);
    const palette = activePalette();
    for (const [name, value] of Object.entries(palette.tokens)) {
      const property = `--col-${name}`;
      body.style.setProperty(property, value);
      applied.push(property);
    }
    body.dataset.colTheme = palette.id;
    body.dataset.colAppearance = profile.id;
    body.classList.toggle('col-dark', palette.dark);
    bus.dispatchEvent(new CustomEvent('palette', { detail: palette }));
  };

  shared.theme = {
    get list() { return appearanceProfile(settings.appearance).palettes; },
    current: activePalette,
    /** Заново применяет палитру (например, после включения режима для слабовидящих). */
    refresh: apply,
    /** Включает встроенную палитру или 'custom'. */
    set(id) {
      const list = appearanceProfile(settings.appearance).palettes;
      if (id === 'custom' && !settings.custom) settings.custom = { ...cleanColors(resolvePalette(settings, list).tokens) };
      const known = id === 'custom' || list.some(p => p.id === id) || settings.themes.some(t => t.id === id);
      settings.theme = known ? id : list[0].id;
      settings.appearancePrefs[settings.appearance].palette = settings.theme;
      save();
      apply();
    },
    /** Меняет один цвет конструктора и включает свою палитру. */
    setCustomColor(key, value) {
      settings.custom = cleanColors({ ...(settings.custom ?? cleanColors(resolvePalette(settings, appearanceProfile(settings.appearance).palettes).tokens)), [key]: value });
      settings.theme = 'custom';
      save();
      apply();
    },
    clearCustom() {
      settings.custom = null;
      if (settings.theme === 'custom') settings.theme = appearanceProfile(settings.appearance).defaultPalette;
      save();
      apply();
    },
    derive: deriveCustom,
    /** Показывает цвета на странице, не сохраняя их. Пока идёт предпросмотр, список и текущая палитра берутся из него. */
    preview(colors) { preview = cleanColors(colors); apply(); },
    endPreview() { if (preview) { preview = null; apply(); } },
    /** Сохраняет новую свою тему, включает её и возвращает id. */
    addUser(name, colors) {
      const id = `u:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      settings.themes.push({ id, name: String(name).trim().slice(0, 40) || 'Без названия', colors: cleanColors(colors) });
      preview = null;
      settings.theme = id;
      settings.appearancePrefs[settings.appearance].palette = id;
      save(); apply();
      return id;
    },
    updateUser(id, name, colors) {
      const own = settings.themes.find(t => t.id === id);
      if (!own) return false;
      own.name = String(name).trim().slice(0, 40) || own.name;
      own.colors = cleanColors(colors);
      preview = null;
      save(); apply();
      return true;
    },
    removeUser(id) {
      settings.themes = settings.themes.filter(t => t.id !== id);
      if (settings.theme === id) settings.theme = appearanceProfile(settings.appearance).defaultPalette;
      preview = null;
      save(); apply();
    },
  };

  shared.appearance = {
    profiles: APPEARANCE_PROFILES,
    current: () => appearanceProfile(settings.appearance),
    set(id) {
      if (!APPEARANCE_PROFILES[id] || id === settings.appearance) return;
      preview = null;
      selectAppearance(settings, id);
      save();
      apply();
      bus.dispatchEvent(new CustomEvent('appearance', { detail: appearanceProfile(settings.appearance) }));
      bus.dispatchEvent(new Event('bg'));
    },
  };

  if (settings.custom && !settings.themes.some(t => t.name === 'Моя палитра')) {
    const id = `u:old${Date.now().toString(36)}`;
    settings.themes.push({ id, name: 'Моя палитра', colors: cleanColors(settings.custom) });
    if (settings.theme === 'custom') settings.theme = id;
    settings.custom = null;
    save();
  }

  body.classList.add('col-on');
  apply();

  return () => {
    clearTokens();
    body.classList.remove('col-on', 'col-dark');
    delete body.dataset.colTheme;
    delete body.dataset.colAppearance;
    delete shared.theme;
    delete shared.appearance;
  };
}
