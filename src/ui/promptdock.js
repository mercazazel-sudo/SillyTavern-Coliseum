/**
 * Окно редактирования промпта пресета (родная панель #completion_prompt_manager_popup: «Редактирование», «Просмотр»,
 * история чата, примеры диалога) раскрывается не поверх страницы, а приклеенным сбоку справа к окну «Цитадель»:
 * те же верх и высота, ширина по размеру окна настроек. Окно настроек при необходимости сдвигается влево,
 * чтобы рядом поместилась панель. Панель следует за окном при его перетаскивании и изменении размера.
 * Сама панель и её поля остаются родными (сохранение, кнопки, события Таверны не тронуты): меняется только положение.
 */
import { report } from '../core/guard.js';
import { createSeam, fitPair } from './seam.js';

const POPUP_ID = 'completion_prompt_manager_popup';
const MIN_W = 520, MAX_W = 820, MIN_HOST = 480, SEAM_MIN_HOST = 380, SEAM_MIN_POP = 360, SPLIT_KEY = 'promptpop';
const ROLE_CLASSES = ['col-win-lib', 'col-win-pop', 'col-win-home'];
const PROPS = ['position', 'left', 'top', 'width', 'height', 'right', 'margin', 'max-height', 'min-width', 'z-index', 'overflow'];

export function startPromptDock(doc, { settings, save, shared }) {
  const view = doc.defaultView;
  const popup = doc.getElementById(POPUP_ID);
  if (!popup) { report('пристыковка редактора промптов', new Error(`нет #${POPUP_ID}`)); return () => {}; }
  const undo = [];

  /** Шапка как у окон (точки, заголовок): родной заголовок панели внутри прячется стилем, а название берём из него. */
  const head = doc.createElement('header');
  head.className = 'col-wh col-pm-head';
  head.innerHTML = '<span class="col-grip" aria-hidden="true"></span><h2></h2>';
  popup.prepend(head);
  undo.push(() => head.remove());
  const titleOf = () => {
    for (const area of popup.querySelectorAll(':scope > div')) {
      if (view.getComputedStyle(area).display === 'none') continue;
      const t = area.querySelector('h3')?.textContent.trim(); if (t) return t;
    }
    return 'Редактирование';
  };

  const sideWidth = () => (doc.body.classList.contains('col-side-off') ? 0 : parseInt(view.getComputedStyle(doc.body).getPropertyValue('--col-side-w'), 10) || 0);
  const host = () => shared.windows?.get('settings') ?? null;
  const isOpen = () => popup.classList.contains('openDrawer');

  /** Положение окна настроек до пристыковки: возвращаем его, когда панель закрылась, а окно за это время не двигали. */
  let saved = null;
  const restoreHost = () => {
    const win = host();
    if (saved && win) {
      const now = win.rect();
      if (Math.abs(now.left - saved.moved.left) < 2 && Math.abs(now.width - saved.moved.width) < 2) win.set({ left: saved.orig.left, width: saved.orig.width }, false);
      win.el.classList.remove('col-temp-geo');
    }
    saved = null;
  };
  const release = () => {
    if (!popup.classList.contains('col-pm-docked')) { if (saved) restoreHost(); seam.update(); return; }
    restoreHost();
    popup.classList.remove('col-pm-docked', ...ROLE_CLASSES);
    for (const name of PROPS) popup.style.removeProperty(name);
    popup.style.removeProperty('--cn');
    seam.update();
  };

  let busy = false;
  let dragSplit = null;   // пока тянут шов: текущее разделение, чтобы пересчёт не вернул старое
  const apply = () => {
    if (busy) return;
    busy = true;
    try {
      const win = host();
      if (isOpen() && win && !win.isOpen && popup.classList.contains('col-pm-docked')) {
        // окно настроек закрыли или свернули: панель была его частью, закрываем её родной кнопкой (как крестик внутри самой панели)
        release();
        doc.getElementById('completion_prompt_manager_popup_close_button')?.click();
        return;
      }
      if (!isOpen() || !win?.isOpen) { release(); return; }
      let r = win.el.getBoundingClientRect();
      const left0 = sideWidth() + 8, right0 = view.innerWidth - 8, avail = right0 - left0;
      let popW = Math.max(MIN_W, Math.min(r.width, MAX_W));
      if (win.isFull()) {
        // окно на весь экран: панель ложится поверх его правой части
        popW = Math.min(popW, Math.max(MIN_W, r.width - MIN_HOST));
        place(r.right - popW, r.top, popW, r.height, win);
        return;
      }
      // разделение: либо выбранное швом в прошлый раз, либо по умолчанию (окно настроек как есть, панели остаток места, не меньше MIN_W)
      const sp = dragSplit ?? settings.glueSplit?.[SPLIT_KEY];
      const wantPop = sp ? sp.pop : popW;
      const fitted = fitPair(sp ? sp.host : r.width, wantPop, avail, sp ? SEAM_MIN_HOST : MIN_HOST, sp ? SEAM_MIN_POP : MIN_W);
      if (!fitted) { release(); return; }
      const hostW = fitted[0]; popW = fitted[1];
      if (!saved) { const o = win.rect(); saved = { orig: { left: o.left, width: o.width }, moved: { left: o.left, width: o.width } }; }
      if (Math.abs(hostW - r.width) > 1) { win.el.classList.add('col-temp-geo'); win.set({ width: hostW }, false); }
      r = win.el.getBoundingClientRect();
      const nextLeft = Math.max(left0, Math.min(r.left, right0 - r.width - popW + 2));
      if (Math.abs(nextLeft - r.left) > 1) { win.el.classList.add('col-temp-geo'); win.set({ left: nextLeft }, false); }
      r = win.el.getBoundingClientRect();
      if (saved) { const now = win.rect(); saved.moved = { left: now.left, width: now.width }; }
      place(r.right - 1, r.top, Math.max(240, Math.min(popW, right0 - (r.right - 1))), r.height, win);
      seam.update();
    } catch (error) { report('пристыковка редактора промптов', error); }
    finally { busy = false; }
  };
  function place(left, top, width, height, win) {
    popup.classList.add('col-pm-docked');
    const role = ROLE_CLASSES.find(c => win.el.classList.contains(c));
    for (const c of ROLE_CLASSES) popup.classList.toggle(c, c === role);
    const t = titleOf(); if (head.querySelector('h2').textContent !== t) head.querySelector('h2').textContent = t;
    const set = (name, value) => { if (popup.style.getPropertyValue(name) !== value || popup.style.getPropertyPriority(name) !== 'important') popup.style.setProperty(name, value, 'important'); };
    set('position', 'fixed'); set('left', `${Math.round(left)}px`); set('top', `${Math.round(top)}px`);
    set('width', `${Math.round(width)}px`); set('height', `${Math.round(height)}px`);
    set('right', 'auto'); set('margin', '0'); set('max-height', 'none'); set('min-width', '0'); set('overflow', 'visible');
    set('z-index', String((parseInt(win.el.style.zIndex, 10) || 3100) + 1));
    const cn = String(Math.max(3, Math.round((width + 2 - 34) / 52) + 1));
    if (popup.style.getPropertyValue('--cn') !== cn) popup.style.setProperty('--cn', cn);
  }

  /** Шов между окном настроек и панелью: тянет границу, раскрывая одну из сторон. */
  const seam = createSeam(doc, {
    pair: () => {
      const win = host();
      if (!win?.isOpen || win.isFull() || !popup.classList.contains('col-pm-docked')) return null;
      const o = win.rect(), p = popup.getBoundingClientRect();
      return { x: p.left, top: p.top, height: p.height, z: parseInt(popup.style.zIndex, 10) || 3100, leftLeft: o.left, leftW: o.width, rightW: p.width, minLeft: SEAM_MIN_HOST, minRight: SEAM_MIN_POP };
    },
    onSplit: (hostW, popW) => {
      const win = host(); if (!win) return;
      dragSplit = { host: hostW, pop: popW };
      win.el.classList.add('col-temp-geo');
      apply();
      if (saved) { const n = win.rect(); saved.moved = { left: n.left, width: n.width }; }
    },
    onEnd: (hostW, popW) => { dragSplit = null; settings.glueSplit ??= {}; settings.glueSplit[SPLIT_KEY] = { host: hostW, pop: popW }; save(); apply(); },
  });
  undo.push(() => seam.destroy());

  // слежение: открытие и закрытие панели, движение и размер окна настроек
  let queued = 0;
  const later = () => { if (queued) return; queued = view.requestAnimationFrame(() => { queued = 0; apply(); }); };
  const popupObserver = new view.MutationObserver(later);
  popupObserver.observe(popup, { attributes: true, attributeFilter: ['class'] });
  undo.push(() => popupObserver.disconnect());

  let hostObserver = null, followed = null;
  const bindHost = () => {
    const win = host();
    if (!win || followed === win) return;
    followed = win;
    win.addFollower(apply);
    hostObserver?.disconnect();
    hostObserver = new view.MutationObserver(later);
    hostObserver.observe(win.el, { attributes: true, attributeFilter: ['hidden', 'class'] });
  };
  bindHost();
  const bindTimer = view.setInterval(() => { bindHost(); if (isOpen()) apply(); }, 700);   // запасной пересчёт: тема, масштаб, колонна
  view.addEventListener('resize', later);
  undo.push(() => { view.clearInterval(bindTimer); if (queued) view.cancelAnimationFrame(queued); view.removeEventListener('resize', later); hostObserver?.disconnect(); release(); });

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат пристыковки редактора промптов', error); } } };
}
