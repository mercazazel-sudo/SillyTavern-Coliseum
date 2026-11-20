/**
 * Миниатюра маски в круглой рамке (кнопка у поля ввода): у каждой маски свой масштаб и сдвиг фото.
 * Хранится в settings.thumbs[idМаски] = { zoom, x, y }: zoom в процентах ширины круга (100 = фото по ширине круга),
 * x и y в процентах (0 = левый или верхний край, 50 = середина). Чистые функции, Таверны и DOM не знают.
 */
export const THUMB_LIMITS = Object.freeze({ zoom: [100, 320], x: [0, 100], y: [0, 100] });
export const THUMB_DEFAULT = Object.freeze({ zoom: 100, x: 50, y: 25 });

const clamp = (value, [min, max], fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback; };

/** Приводит настройку миниатюры к допустимым значениям; без настройки возвращает значения по умолчанию. */
export function normalizeThumb(raw) {
  return {
    zoom: clamp(raw?.zoom, THUMB_LIMITS.zoom, THUMB_DEFAULT.zoom),
    x: clamp(raw?.x, THUMB_LIMITS.x, THUMB_DEFAULT.x),
    y: clamp(raw?.y, THUMB_LIMITS.y, THUMB_DEFAULT.y),
  };
}

/**
 * Строка style для круглой миниатюры. Два слоя одной картинки: верхний с выбранным масштабом, нижний «cover» подстраховывает
 * от пустых углов, если картинка широкая и при выбранном масштабе не закрывает круг.
 */
export function thumbStyle(url, raw) {
  const t = normalizeThumb(raw);
  const u = `url('${String(url).replace(/'/g, '%27')}')`;
  return `background-image:${u},${u};background-repeat:no-repeat,no-repeat;background-size:${t.zoom}% auto,cover;background-position:${t.x}% ${t.y}%,center top`;
}
