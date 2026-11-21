/**
 * Фильтр аватарок для людей с цветовой слепотой (во вкладке «Палитра»): два режима и сила.
 * Это «дальтонизация»: цвета, которые человек не различает, сдвигаются в те, которые различает. Картинка получается
 * слегка иной, поэтому по умолчанию фильтр выключен.
 *   rg: красно-зелёный тип (модель дейтеранопии Machado 2009), потерянное различие переносится в яркость и синий канал;
 *   by: сине-жёлтый тип (тританопия), различие переносится в красный и зелёный каналы.
 * Матрица: M = I + t·K·(I − S), где S матрица модели зрения, K матрица переноса, t сила (0..1). При t = 0 это единичная матрица.
 * Применяется SVG-фильтром (в линейном RGB, как у модели) к аватаркам персонажей и масок по адресу картинки. Файлы не меняются.
 */
import { report } from '../core/guard.js';

export const CVD_MODES = Object.freeze(['off', 'rg', 'by']);
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// Machado, Oliveira, Fernandes 2009, полная степень (линейный RGB)
const SIM = {
  rg: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  by: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
// куда переносится ошибка: строки результата R, G, B
const SHIFT = {
  rg: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  by: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]],
};
const mul = (a, b) => a.map((row, i) => b[0].map((_, j) => row.reduce((sum, _v, k) => sum + a[i][k] * b[k][j], 0)));

/** Матрица 3×3 для режима и силы 0..100. */
export function cvdMatrix(mode, strength) {
  if (!SIM[mode]) return I;
  const t = Math.max(0, Math.min(100, Number(strength) || 0)) / 100;
  const err = I.map((row, i) => row.map((v, j) => v - SIM[mode][i][j]));
  const shifted = mul(SHIFT[mode], err);
  return I.map((row, i) => row.map((v, j) => v + t * shifted[i][j]));
}

/** Значения для feColorMatrix (4×5, без смещения и без изменения прозрачности). */
export const cvdValues = (mode, strength) => cvdMatrix(mode, strength)
  .map(row => [...row.map(v => +v.toFixed(5)), 0, 0].join(' ')).concat('0 0 0 1 0').join(' ');

const FILTER_ID = 'col-cvd-filter';
// аватарки персонажей и масок по адресу картинки: подходит и к <img>, и к background-image, и к «чётким картинкам»
const TARGETS = [
  'img[src*="type=avatar"]', 'img[src*="type=persona"]', 'img[src^="/characters/"]', 'img[src*="User%20Avatars"]',
  '[style*="type=avatar"]', '[style*="type=persona"]', '[style*="/characters/"]', '[style*="User%20Avatars"]',
].map(s => `body.col-cvd ${s}`).join(',\n');

export function startCvd(doc, { settings, save, shared }) {
  const undo = [];
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  svg.innerHTML = `<filter id="${FILTER_ID}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${cvdValues('off', 0)}"/></filter>`;
  doc.body.append(svg);
  const style = doc.createElement('style');
  style.textContent = `${TARGETS} { filter: url(#${FILTER_ID}); }`;
  doc.head.append(style);
  undo.push(() => { svg.remove(); style.remove(); doc.body.classList.remove('col-cvd'); });

  const apply = () => {
    const mode = CVD_MODES.includes(settings.cvdMode) ? settings.cvdMode : 'off';
    const strength = Number.isFinite(settings.cvdStrength) ? settings.cvdStrength : 60;
    svg.querySelector('feColorMatrix').setAttribute('values', cvdValues(mode, strength));
    doc.body.classList.toggle('col-cvd', mode !== 'off');
  };
  shared.cvd = {
    mode: () => settings.cvdMode,
    strength: () => settings.cvdStrength,
    set(mode, strength) {
      if (CVD_MODES.includes(mode)) settings.cvdMode = mode;
      if (strength !== undefined) settings.cvdStrength = Math.max(0, Math.min(100, Number(strength) || 0));
      save(); apply();
    },
  };
  undo.push(() => { delete shared.cvd; });
  try { apply(); } catch (error) { report('фильтр цветовой слепоты', error); }
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат фильтра цветовой слепоты', error); } } };
}
