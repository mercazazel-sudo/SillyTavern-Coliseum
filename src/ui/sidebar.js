/**
 * Левая колонна вместо верхней панели Таверны.
 * Родная панель остаётся в странице (её прячет стиль), а пункты колонны нажимают на её кнопки-ящики,
 * поэтому всё, что Таверна и другие расширения вешают на эти кнопки, продолжает работать.
 * Стрелка-язычок на краю колонны прячет её; состояние хранится в настройках.
 */
import { report } from '../core/guard.js';

export const SIDE_ID = 'col-side';
export const TOGGLE_ID = 'col-side-toggle';
const SIDE_WIDTH = 252;

const SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Пункты колонны: название, подпись, иконка и id родного ящика, который пункт открывает (null = «домой»). */
const ITEMS = [
  { id: 'settings', title: 'Акрополь', hint: 'настройки', win: 'settings', icon: '<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/>' },
  { id: 'home', title: 'Атриум', hint: 'дом', win: null, icon: '<path d="M4 20V10a8 8 0 0 1 16 0v10M8 20v-7a4 4 0 0 1 8 0v7"/>' },
  { id: 'chars', title: 'Пантеон', hint: 'персонажи', win: 'chars', icon: '<path d="M3 9 12 4l9 5H3zM5 11v8M10 11v8M14 11v8M19 11v8M3 20h18"/>' },
  { id: 'masks', title: 'Маски', hint: 'персоны', win: 'masks', icon: '<path d="M5 5c4 1 10 1 14 0 1 6-1 13-7 15C6 18 4 11 5 5z"/><path d="M8.5 10c1-.6 2-.6 3 0M13 10c1-.6 2-.6 3 0M9 15c2 1.4 4 1.4 6 0"/>' },
  { id: 'lore', title: 'Библиотека', hint: 'лорбуки', win: 'lore', icon: '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4zM6 4a2 2 0 0 0-2 2v2h2M10 9h6M10 13h6"/>' },
  { id: 'ext', title: 'Мастерская', hint: 'расширения', win: 'ext', icon: '<g transform="translate(13 7.2) rotate(20)"><path d="M-4 0H7" stroke-width="1.7"/><rect x="-8.4" y="-3.2" width="4.6" height="6.4" rx=".8" fill="currentColor"/></g><path d="M2.5 11.5H19a2.2 2.2 0 0 1-2.2 3.2H14v3h2.6v3H7.4v-3H10v-3H8.4c-3 0-4.9-1.4-5.9-3.2z"/>' },
];

/** Капитель и база колонны. Заливка берётся из токенов палитры через градиенты в #col-defs. */
const CAPITAL = `<svg class="col-cap" viewBox="0 0 252 50" aria-hidden="true">
  <defs><g id="col-carve">
    <circle cx="31" cy="21" r="8"/><circle cx="31" cy="21" r="4.6"/><circle cx="31" cy="21" r="1.5"/>
    <circle cx="221" cy="21" r="8"/><circle cx="221" cy="21" r="4.6"/><circle cx="221" cy="21" r="1.5"/>
    <path d="M40 15Q126 33 212 15"/>
    <path d="M26 33.5v4.5M38 33.5v4.5M50 33.5v4.5M62 33.5v4.5M74 33.5v4.5M86 33.5v4.5M98 33.5v4.5M110 33.5v4.5M122 33.5v4.5M134 33.5v4.5M146 33.5v4.5M158 33.5v4.5M170 33.5v4.5M182 33.5v4.5M194 33.5v4.5M206 33.5v4.5M218 33.5v4.5M230 33.5v4.5"/>
  </g></defs>
  <rect class="s" x="0.5" y="0.5" width="251" height="10"/>
  <rect class="hl" x="1" y="1" width="250" height="1.3"/>
  <path class="s" d="M6 10.5H246V22Q246 31 232 31H214Q206 31 198 27H54Q46 31 38 31H20Q6 31 6 22Z"/>
  <use href="#col-carve" class="h" transform="translate(0 1.3)"/>
  <use href="#col-carve" class="c"/>
  <rect class="r" x="12" y="39" width="228" height="4" rx="2"/>
  <rect class="s" x="14" y="43" width="224" height="6.5"/>
  <rect class="hl" x="15" y="43.6" width="222" height="1.1"/>
</svg>`;
const BASE = `<svg class="col-base" viewBox="0 0 252 34" aria-hidden="true">
  <rect class="s" x="14" y="0.5" width="224" height="4"/>
  <rect class="s" x="8" y="4.5" width="236" height="9" rx="4.5"/>
  <rect class="hl" x="16" y="5.4" width="220" height="1.2" rx=".6"/>
  <rect class="r" x="14" y="13.5" width="224" height="3.5"/>
  <rect class="s" x="4" y="17" width="244" height="10" rx="5"/>
  <rect class="hl" x="12" y="18" width="228" height="1.2" rx=".6"/>
  <rect class="s" x="0.5" y="27" width="251" height="6.5"/>
  <rect class="hl" x="1" y="27.6" width="250" height="1.1"/>
</svg>`;

/** Башня Камелота (из макета): зубцы, галерея, машикули, цоколь; ствол — кладка. */
const TOWER_CAP = `<svg class="col-cap col-tower" viewBox="0 0 252 52" aria-hidden="true">
  <defs><g id="col-tcarve">
    <path d="M4 8.5H38M21 .5V8.5M12 8.5V16M30 8.5V16"/><path d="M56.5 8.5H90.5M73.5 .5V8.5M64.5 8.5V16M82.5 8.5V16"/>
    <path d="M109 8.5H143M126 .5V8.5M117 8.5V16M135 8.5V16"/><path d="M161.5 8.5H195.5M178.5 .5V8.5M169.5 8.5V16M187.5 8.5V16"/>
    <path d="M214 8.5H248M231 .5V8.5M222 8.5V16M240 8.5V16"/>
    <path d="M8 36V29A8 8 0 0 1 24 29V36M32 36V29A8 8 0 0 1 48 29V36M56 36V29A8 8 0 0 1 72 29V36M80 36V29A8 8 0 0 1 96 29V36M104 36V29A8 8 0 0 1 120 29V36M128 36V29A8 8 0 0 1 144 29V36M152 36V29A8 8 0 0 1 168 29V36M176 36V29A8 8 0 0 1 192 29V36M200 36V29A8 8 0 0 1 216 29V36M224 36V29A8 8 0 0 1 240 29V36"/>
  </g></defs>
  <path class="s" d="M4 .5H38V16H4ZM56.5 .5H90.5V16H56.5ZM109 .5H143V16H109ZM161.5 .5H195.5V16H161.5ZM214 .5H248V16H214Z"/>
  <path class="hl" d="M5 1H37V2.2H5ZM57.5 1H89.5V2.2H57.5ZM110 1H142V2.2H110ZM162.5 1H194.5V2.2H162.5ZM215 1H247V2.2H215Z"/>
  <rect class="s" x="2" y="16" width="248" height="6.5"/><rect class="hl" x="3" y="16.6" width="246" height="1.1"/>
  <rect class="s" x="4" y="22.5" width="244" height="13.5"/><path class="s" d="M4 36H248L238 46.5H14Z"/>
  <use href="#col-tcarve" class="h" transform="translate(0 1.3)"/><use href="#col-tcarve" class="c"/>
  <rect class="r" x="13" y="46.5" width="226" height="4"/><rect class="hl" x="14" y="47" width="224" height="1"/>
</svg>`;
const TOWER_BASE = `<svg class="col-base col-tower" viewBox="0 0 252 38" aria-hidden="true">
  <path class="s" d="M14 .5H238L246 22H6Z"/><path class="hl" d="M14.5 1H237.5V2.1H14.5Z"/>
  <path class="c" d="M11.5 11H240.5M8.8 17H243.2M60 1V11M150 1V11M34 11V17M104 11V17M196 11V17M80 17V22M170 17V22"/>
  <rect class="r" x="3" y="22" width="246" height="4"/><rect class="s" x=".5" y="26" width="251" height="11.5"/><rect class="hl" x="1" y="26.6" width="250" height="1.1"/>
  <path class="c" d="M44 26V37.5M98 26V37.5M152 26V37.5M206 26V37.5"/>
</svg>`;
const TOWER_SHAFT = `<svg class="col-bricks" aria-hidden="true"><defs><pattern id="col-brk" width="56" height="28" patternUnits="userSpaceOnUse">
  <rect x="28" y="0" width="28" height="14" style="fill:var(--col-fl-d)" opacity=".5"/><rect x="0" y="14" width="14" height="14" style="fill:var(--col-fl-d)" opacity=".5"/><rect x="42" y="14" width="14" height="14" style="fill:var(--col-fl-d)" opacity=".5"/>
  <rect x="14" y="14" width="28" height="14" style="fill:var(--col-fl-l)" opacity=".5"/>
  <path d="M0 1.5H56M0 15.5H56" style="stroke:var(--col-st-hl);fill:none"/>
  <path d="M0 .5H56M0 14.5H56M28.5 0V14M14.5 14V28M42.5 14V28" style="stroke:var(--col-st-ln);fill:none;opacity:.75"/>
</pattern></defs><rect width="100%" height="100%" fill="url(#col-brk)"/></svg>`;
/** Значки меню Камелота: башня, стрельчатые ворота, корона, маска шута (картинка), свиток, наковальня. */
const CAMELOT_ICONS = {
  settings: '<path d="M4 21V8h3V5.5h2.5V8h5V5.5H17V8h3v13M3 21h18M10 21v-5a2 2 0 0 1 4 0v5"/>',
  home: '<path d="M4 21V11C4 7 8 4 12 2 16 4 20 7 20 11V21M8 21V14.5C8 12 10 10.5 12 9 14 10.5 16 12 16 14.5V21M12 9V21M8 16.5H16"/>',
  chars: '<path d="M3.5 18.5 2.5 8.5l5 4 4.5-7 4.5 7 5-4-1 10zM4 21.5h16"/><circle cx="2.5" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="4.6" r="1" fill="currentColor"/><circle cx="21.5" cy="8" r="1" fill="currentColor"/>',
  masks: null,
  lore: '<path d="M5.5 2.8h12.5a1.3 1.3 0 0 1 1.3 1.3v14.7H5.5z"/><path d="M8.5 2.8v16M5.5 6.3h3M5.5 15.3h3"/><path d="M13.9 6.4l2.5 2.5-2.5 2.5-2.5-2.5z"/><circle cx="13.9" cy="8.9" r=".7" fill="currentColor"/><path d="M10.9 14.2h6M11.9 16.2h4"/><path d="M5.5 18.8v.7a1.3 1.3 0 0 0 1.3 1.3h12.5V18.8"/><path d="M19.3 6v12.8M20.8 7.2v13.6H6.8"/><path d="M15.6 18.8v3.7l-1.1-.9-1.1.9v-3.7" fill="currentColor" stroke-width="1"/>',
  ext: null,
};
const DEFS = `<svg id="col-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="col-stoneV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--col-st-hi)"/><stop offset=".5" style="stop-color:var(--col-st-mid)"/><stop offset="1" style="stop-color:var(--col-st-lo)"/></linearGradient>
  <linearGradient id="col-stoneR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--col-st-lo)"/><stop offset="1" style="stop-color:var(--col-st-mid)"/></linearGradient>
</defs></svg>`;

const CHEVRON_LEFT = '<svg viewBox="0 0 12 20" width="12" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 3 3 10l6 7"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 12 20" width="12" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3l6 7-6 7"/></svg>';

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function startSidebar(doc, { settings, save, stopAll, shared }) {
  const view = doc.defaultView;
  const body = doc.body;
  const undo = [];

  const defs = doc.createElement('div');
  defs.innerHTML = DEFS;
  const defsEl = defs.firstElementChild;
  body.append(defsEl);
  undo.push(() => defsEl.remove());

  const side = doc.createElement('aside');
  side.id = SIDE_ID;
  side.innerHTML = `
    <div class="col-shaft"></div>
    ${CAPITAL}
    <div class="col-brand"><h1>Колизей</h1></div>
    <div class="col-rule"><i></i></div>
    <nav class="col-nav">${ITEMS.map(item => `<a href="#" data-item="${item.id}">${SVG}${item.icon}</svg><span>${escapeHtml(item.title)}<small>${escapeHtml(item.hint)}</small></span></a>`).join('')}</nav>
    <div class="col-foot"><span class="col-off" role="button" tabindex="0">Выключить до перезагрузки</span></div>
    ${BASE}`;
  body.append(side);
  undo.push(() => side.remove());

  const toggle = doc.createElement('button');
  toggle.id = TOGGLE_ID;
  toggle.type = 'button';
  body.append(toggle);
  undo.push(() => toggle.remove());

  const setOff = off => {
    settings.sideOff = off;
    body.classList.toggle('col-side-off', off);
    // ширину задаём здесь же: от неё зависят и стрелка, и поле чата (инлайн-значение перебивает правило из css)
    body.style.setProperty('--col-side-w', off ? '0px' : `${SIDE_WIDTH}px`);
    toggle.title = off ? 'Показать колонну' : 'Скрыть колонну';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.innerHTML = off ? CHEVRON_RIGHT : CHEVRON_LEFT;
    save();
    shared.bus?.dispatchEvent(new Event('side'));
  };
  toggle.addEventListener('click', () => setOff(!settings.sideOff));
  setOff(!!settings.sideOff);
  undo.push(() => body.classList.remove('col-side-off'));

  undo.push(() => body.style.removeProperty('--col-side-w'));

  // ── связь с нашими окнами ──
  const sync = () => {
    const w = shared.windows;
    for (const link of side.querySelectorAll('[data-item]')) {
      const item = ITEMS.find(entry => entry.id === link.dataset.item);
      link.classList.toggle('on', item.win ? !!w?.isOpen(item.win) : !w?.anyOpen());
    }
  };
  const applyAppearance = event => {
    const profile = event?.detail ?? shared.appearance?.current?.();
    if (!profile) return;
    side.querySelector('.col-brand h1').textContent = profile.labels.brand;
    const camelot = profile.id === 'camelot';
    // каркас: колонна или башня
    const shaft = side.querySelector('.col-shaft');
    const wantTower = camelot && !side.querySelector('.col-cap.col-tower');
    const wantColumn = !camelot && side.querySelector('.col-cap.col-tower');
    if (wantTower || wantColumn) {
      side.querySelector('.col-cap')?.remove(); side.querySelector('.col-base')?.remove();
      shaft.insertAdjacentHTML('afterend', camelot ? TOWER_CAP : CAPITAL);
      side.insertAdjacentHTML('beforeend', camelot ? TOWER_BASE : BASE);
      shaft.innerHTML = camelot ? TOWER_SHAFT : '';
    }
    for (const link of side.querySelectorAll('[data-item]')) {
      const title = profile.labels[link.dataset.item];
      if (title) link.querySelector('span').firstChild.textContent = title;
      // значок: свой у Камелота, иначе исходный
      const item = ITEMS.find(entry => entry.id === link.dataset.item);
      const svg = link.querySelector('svg'), mask = link.querySelector('.col-navmask');
      if (camelot && item.id === 'masks') {
        svg?.toggleAttribute('hidden', true);
        if (!mask) link.insertAdjacentHTML('afterbegin', '<i class="col-navmask" aria-hidden="true"></i>');
      } else {
        mask?.remove();
        if (svg) { svg.toggleAttribute('hidden', false); svg.innerHTML = camelot && CAMELOT_ICONS[item.id] ? CAMELOT_ICONS[item.id] : item.icon; }
      }
    }
  };
  side.addEventListener('click', event => {
    const link = event.target.closest('[data-item]');
    if (link) {
      event.preventDefault();
      const item = ITEMS.find(entry => entry.id === link.dataset.item);
      try {
        if (!shared.windows) { report('колонна', new Error('окна не запущены')); return; }
        if (item.win) shared.windows.toggle(item.win); else if (shared.atrium) shared.atrium.show(); else shared.windows.closeAll();
      } catch (error) { report('пункт колонны', error); }
      return;
    }
    if (event.target.closest('.col-off')) stopAll();
  });
  shared.bus?.addEventListener('windows', sync);
  shared.bus?.addEventListener('appearance', applyAppearance);
  undo.push(() => { shared.bus?.removeEventListener('windows', sync); shared.bus?.removeEventListener('appearance', applyAppearance); });
  applyAppearance();
  sync();

  return () => { for (const fn of undo.reverse()) fn(); };
}
