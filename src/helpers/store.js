/** Данные помощников. Лежат в настройках Колизея (extensionSettings.coliseum.helpers), сохраняет сама Таверна. */
import { SETS, DEFAULT_SET } from './presets.js';

export const HISTORY_LIMIT = 200;

/** Заполняет недостающие поля настроек. */
export function prepare(settings) {
  if (!SETS.some(s => s.id === settings.set)) settings.set = DEFAULT_SET;
  settings.activeId ??= '';
  settings.open ??= false;
  settings.bubble ??= true; // показывать кругляшок
  settings.pos ??= null; // { left, top } в пикселях окна браузера
  settings.custom ??= [];
  settings.histories ??= {};
  return settings;
}

/** Набор помощников привязан к теме: id набора берётся у активного оформления (Колизей: античные, Камелот: фантастические). */
let boundSetId = () => null;
export const bindSetProvider = fn => { boundSetId = typeof fn === 'function' ? fn : () => null; };

export function currentSet(settings) {
  const id = boundSetId() ?? settings.set;
  return SETS.find(s => s.id === id) ?? SETS[0];
}

/** Помощники активного набора и свои (свои доступны во всех наборах). */
export function allHelpers(settings) {
  return [...currentSet(settings).helpers.map(p => ({ ...p, preset: true })), ...settings.custom.map(c => ({ ...c, preset: false }))];
}

/** Помощник по id; если такого нет в активном наборе, первый из списка. */
export function getHelper(settings, id) {
  const list = allHelpers(settings);
  return list.find(h => h.id === id) ?? list[0];
}

export function getHistory(settings, id) {
  return (settings.histories[id] ??= []);
}

/** Добавляет сообщение и обрезает старые. Сообщения: { role: 'user'|'assistant', content, error? }. */
export function pushMessage(settings, id, message) {
  const history = getHistory(settings, id);
  history.push(message);
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return message;
}

export function clearHistory(settings, id) {
  settings.histories[id] = [];
}

export function clearAllHistories(settings) {
  settings.histories = {};
}

/**
 * Один раз переносит данные из отдельного расширения «Спутники» (extensionSettings.sputniki):
 * чаты, своих помощников и положение кругляшка. Старый ключ остаётся как резервная копия.
 * Возвращает true, если перенос был.
 */
export function migrateFromSputniki(extensionSettings, target) {
  if (target.migrated) return false;
  const old = extensionSettings?.sputniki;
  if (!old || typeof old !== 'object') return false;
  const clone = value => { try { return structuredClone(value); } catch { return undefined; } };
  target.set = 'fantasy'; // у старой расширки был только этот набор
  target.activeId = typeof old.activeId === 'string' ? old.activeId : '';
  target.open = !!old.open;
  target.pos = clone(old.pos) ?? null;
  target.custom = Array.isArray(old.custom) ? clone(old.custom) ?? [] : [];
  target.histories = old.histories && typeof old.histories === 'object' ? clone(old.histories) ?? {} : {};
  target.migrated = 'sputniki';
  return true;
}
