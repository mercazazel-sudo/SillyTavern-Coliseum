/**
 * Окна Колизея. Родные выдвижные панели Таверны (настройки ИИ, соединение, расширения, персоны и так далее)
 * переезжают целиком внутрь наших плавающих окон: со всеми полями и сохранением, как они есть. Пустая родная панель скрыта.
 * Окно таскается за шапку, меняет размер за уголок, сворачивается в док, разворачивается «на всё окно» (двойной клик по шапке).
 * Закрывается только крестом. Положение и размер запоминаются.
 * Если Таверна или другое расширение открывает родной ящик сама (кнопки на приветственном экране), открываем соответствующее окно.
 */
import { report } from '../core/guard.js';
import { createSeam, fitPair } from './seam.js';

export const LAYER_ID = 'col-layer';
export const DOCK_ID = 'col-dock';

const SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const TAB_ICONS = {
  ai: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  api: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  format: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/>',
  git: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
  chat: '<path d="M5 5h14v10H11l-4 4v-4H5z"/>',
  bg: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 3 3-3 4 4"/>',
  themes: '<path d="M3.5 5.5h6M4.3 7.5h4.4M5.2 7.5v9M7.8 7.5v9M3.5 18.5h6"/><path d="M14.5 18.5h6M15.2 18.5V9.5M19.8 18.5V9.5M14.5 9.5v-3h1.3v1.4h1.3V6.5h1.3v1.4h1.3V6.5h1.3v3"/><path d="M12 4v16" stroke-dasharray="1.5 2.2" stroke-width="1.2"/>',
  theme: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 3-3C20 8 16.5 3 12 3z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="11" r="1"/>',
};

/** Окна. role: lib — камень (библиотеки), pop — свиток (настройки и редакторы). */
/** Внешние ссылки (адреса взяты из родного приветствия Таверны). */
const LINKS = [
  { title: 'Документация', icon: 'doc', href: 'https://docs.sillytavern.app/' },
  { title: 'GitHub', icon: 'git', fa: 'fa-github', href: 'https://github.com/SillyTavern/SillyTavern' },
  { title: 'Discord', icon: 'chat', fa: 'fa-discord', href: 'https://discord.gg/sillytavern' },
];

export const SECTIONS = [
  {
    id: 'settings', title: 'Акрополь · настройки', role: 'pop', w: 980, h: 700, hub: true,
    tabs: [
      { id: 'ai', title: 'Ответ ИИ', drawer: 'ai-config-button', content: 'left-nav-panel' },
      { id: 'api', title: 'Соединение', drawer: 'sys-settings-button', content: 'rm_api_block' },
      { id: 'format', title: 'Формат ответа', drawer: 'advanced-formatting-button', content: 'AdvancedFormatting' },
      { id: 'user', title: 'Пользователь', drawer: 'user-settings-button', content: 'user-settings-block' },
      { id: 'bg', title: 'Фон', drawer: 'backgrounds-button', content: 'Backgrounds' },
    ],
  },
  { id: 'chars', title: 'Пантеон · персонажи', role: 'lib', w: 1160, h: 720, drawer: 'rightNavHolder', custom: true },
  { id: 'masks', title: 'Маски · персоны', role: 'lib', w: 1280, h: 780, drawer: 'persona-management-button', custom: true },
  { id: 'lore', title: 'Библиотека · лорбуки', role: 'lib', w: 1120, h: 700, drawer: 'WI-SP-button', custom: true },
  { id: 'loreedit', title: 'Свиток лорбука', role: 'pop', w: 1040, h: 680, custom: true },
  { id: 'chatlore', title: 'Лорбуки чата', role: 'pop', w: 760, h: 620, custom: true },
  { id: 'trace', title: 'Что сработало из лорбуков', role: 'pop', w: 860, h: 700, custom: true },
  { id: 'wiset', title: 'Настройки активации лорбуков', role: 'pop', w: 820, h: 640, content: 'wiActivationSettings' },
  { id: 'hand', title: 'Под рукой', role: 'pop', w: 760, h: 700, custom: true },
  { id: 'ext', title: 'Мастерская · расширения', role: 'lib', w: 1120, h: 700, drawer: 'extensions-settings-button', custom: true },
];

const titleFor = (profile, def) => {
  const label = profile?.labels?.[def.id];
  if (!label) return def.title;
    const suffix = def.title.includes(' · ') ? ` · ${def.title.split(' · ')[1]}` : '';
  return `${label}${suffix}`;
};

const FULL_ICON = '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2" width="10" height="10"/></svg>';
const RESTORE_ICON = '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="4.5" width="7.5" height="7.5"/><path d="M4.5 4.5V2h7.5v7.5H9.5"/></svg>';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const FLOOR_W = { ext: 1000, lore: 1000, masks: 1000, settings: 820 };   // меньше этого ширины окна открываться не будут
const FLOOR_H = { ext: 620, lore: 620, masks: 620, settings: 700 };

/** Окна, которые открываются приклеенными сбоку к другому окну: Свиток лорбука стоит вплотную справа от Библиотеки. */
const GLUE = { loreedit: 'lore' };
const GLUE_MIN_WIDTH = 620;        // свиток при первом приклеивании не уже этого
const SEAM_MIN_HOST = 380, SEAM_MIN_CHILD = 420;   // пределы, до которых можно дотянуть шов вручную

export function startWindows(doc, { settings, save, shared }) {
  const view = doc.defaultView;
  const body = doc.body;
  const undo = [];
  const bus = shared.bus ??= new EventTarget();
  settings.windows ??= {};
  // версия раскладки окон: при смене размеров по умолчанию забываем старые сохранённые размеры
  if (settings.winv !== 4) { settings.windows = {}; settings.winv = 4; save(); }

  const layer = doc.createElement('div');
  layer.id = LAYER_ID;
  const dock = doc.createElement('div');
  dock.id = DOCK_ID;
  body.append(layer, dock);
  undo.push(() => { layer.remove(); dock.remove(); });

  const sideWidth = () => (body.classList.contains('col-side-off') ? 0 : parseInt(view.getComputedStyle(body).getPropertyValue('--col-side-w'), 10) || 0);
  const fit = rect => {
    const left0 = sideWidth() + 8;
    const width = clamp(rect.width, 380, view.innerWidth - left0 - 8);
    const height = clamp(rect.height, 260, view.innerHeight - 24);
    return { width, height, left: clamp(rect.left, left0, view.innerWidth - width - 8), top: clamp(rect.top, 8, view.innerHeight - height - 40) };
  };

  const wins = new Map();
  let zTop = 3100;
  const seams = [];
  const changed = () => { bus.dispatchEvent(new Event('windows')); seams.forEach(x => x.update()); };

  function createWin(def) {
    const el = doc.createElement('section');
    el.className = `col-win col-win-${def.role}`;
    el.dataset.win = def.id;
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', def.title);
    el.innerHTML = `<header class="col-wh"><span class="col-grip" aria-hidden="true"></span><h2></h2><span class="col-sp"></span>
      <button type="button" class="col-wmin" title="Свернуть">–</button>
      <button type="button" class="col-wmax" title="На всё окно">${FULL_ICON}</button>
      <button type="button" class="col-wx" title="Закрыть">×</button></header><div class="col-wb"></div>`;
    el.querySelector('h2').textContent = def.title;
    // свой уголок для изменения размера: родной resize не виден у окон без обрезки содержимого и перекрывается телом окна
    const grow = doc.createElement('div');
    grow.className = 'col-grow'; grow.title = 'Потяни, чтобы изменить размер'; grow.setAttribute('aria-hidden', 'true');
    el.append(grow);
    layer.append(el);

    const saved = settings.windows[def.id];
    const index = wins.size;
    // окна с несколькими колонками не открываются меньше удобного размера: у ужатого окна список и настройки слипаются,
    // а такой размер мог попасть в настройки случайно (окно браузера было маленьким при открытии, чужая вкладка, проба)
    const floorW = FLOOR_W[def.id] ? Math.min(FLOOR_W[def.id], def.w) : 0, floorH = FLOOR_H[def.id] ? Math.min(FLOOR_H[def.id], def.h) : 0;
    let rect = fit({
      width: Math.max(saved?.width ?? def.w, floorW), height: Math.max(saved?.height ?? def.h, floorH),
      left: saved?.left ?? sideWidth() + (view.innerWidth - sideWidth() - def.w) / 2 + (index % 4) * 26 - 30,
      top: saved?.top ?? (view.innerHeight - def.h) / 2 + (index % 4) * 26 - 20,
    });
    const isFull = () => el.classList.contains('col-full');
    const followers = [];
    let glued = false, hostSaved = null;
    const host = () => { const h = GLUE[def.id] && wins.get(GLUE[def.id]); return h && h.isOpen && !h.isFull() ? h : null; };
    const apply = () => {
      if (isFull()) {
        const l = sideWidth() + 14;
        Object.assign(el.style, { left: `${l}px`, top: '12px', width: `${view.innerWidth - l - 14}px`, height: `${view.innerHeight - 24}px` });
        seam?.update();
        followers.forEach(fn => fn());
        return;
      }
      const owner = glued ? host() : null;
      if (glued && !owner) glued = false;
      if (owner) {
        // приклеенное окно: левый край на правом краю хозяина, те же верх и высота; ширину урезаем, если не помещается
        const r = owner.rect();
        const left = r.left + r.width - 1;
        rect = fit({ left, top: r.top, width: Math.min(rect.width, view.innerWidth - 8 - left), height: r.height });
      } else rect = fit(rect);
      Object.assign(el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      seam?.update();
      followers.forEach(fn => fn());
    };
    const remember = () => { if (!glued) { settings.windows[def.id] = { ...rect }; save(); } };
    /** Приклеенное окно носит оформление хозяина (камень, свиток или портик), чтобы пара выглядела одним целым. */
    const ROLE_CLASSES = ['col-win-lib', 'col-win-pop', 'col-win-home'];
    const syncRole = () => {
      const owner = glued ? host() : null;
      el.classList.toggle('col-glued', !!owner);
      const role = owner && ROLE_CLASSES.find(c => owner.el.classList.contains(c));
      if (role) { el.classList.remove(...ROLE_CLASSES); el.classList.add(role); }
    };
    /** Шов со стрелками между окном и его хозяином: тянет границу, общая ширина пары не меняется. */
    const seam = GLUE[def.id] ? createSeam(doc, {
      pair: () => {
        const owner = glued ? host() : null;
        if (!owner || el.hidden || isFull()) return null;
        const o = owner.rect();
        return { x: rect.left, top: rect.top, height: rect.height, z: parseInt(el.style.zIndex, 10) || 3100, leftLeft: o.left, leftW: o.width, rightW: rect.width, minLeft: SEAM_MIN_HOST, minRight: SEAM_MIN_CHILD };
      },
      onSplit: (hostW, editW) => {
        const owner = host(); if (!owner) return;
        owner.el.classList.add('col-temp-geo');
        rect.width = editW;
        owner.set({ width: hostW }, false);          // хозяин тянет окно за собой через followers
        if (hostSaved) { const n = owner.rect(); hostSaved.moved = { left: n.left, width: n.width }; }
      },
      onEnd: (hostW, editW) => { settings.glueSplit ??= {}; settings.glueSplit[def.id] = { host: hostW, edit: editW }; save(); },
    }) : null;
    if (seam) { seams.push(seam); undo.push(() => seam.destroy()); }
    /** Приклеивание: при необходимости сдвигаем и сужаем хозяина, чтобы рядом поместилось окно шириной не меньше GLUE_MIN_WIDTH. */
    const glue = () => {
      try {
        const owner = host();
        if (!owner || isFull()) { glued = false; seam?.update(); return; }
        const left0 = sideWidth() + 8, right0 = view.innerWidth - 8, avail = right0 - left0;
        const r = owner.rect();
        const sp = settings.glueSplit?.[def.id];          // разделение, выбранное шовом в прошлый раз
        const want = Math.max(sp ? SEAM_MIN_CHILD : GLUE_MIN_WIDTH, sp?.edit ?? settings.windows[def.id]?.width ?? def.w);
        const fitted = fitPair(sp?.host ?? r.width, want, avail, SEAM_MIN_HOST, sp ? SEAM_MIN_CHILD : GLUE_MIN_WIDTH);
        if (!fitted) { glued = false; seam?.update(); return; }       // экран слишком узкий: окно остаётся свободным
        const [hostW, editW] = fitted;
        const nextLeft = clamp(r.left, left0, right0 - hostW - editW + 1);
        if (!hostSaved) hostSaved = { owner, orig: { left: r.left, width: r.width }, moved: { left: r.left, width: r.width } };
        if (Math.abs(nextLeft - r.left) > 1 || Math.abs(hostW - r.width) > 1) {
          owner.el.classList.add('col-temp-geo');
          owner.set({ left: nextLeft, width: hostW }, false);   // временный сдвиг: в настройки не пишется
        }
        const now = owner.rect(); hostSaved.moved = { left: now.left, width: now.width };
        rect.width = editW;
        glued = true;
        syncRole();
        apply();
      } catch (error) { glued = false; report(`склейка окна ${def.id}`, error); }
    };
    /** Когда приклеенное окно закрыто, хозяин возвращается на прежнее место и размер (если за это время его не двигали). */
    const unglue = () => {
      glued = false;
      el.classList.remove('col-glued');
      bus.dispatchEvent(new Event('ws'));   // applyStyle вернёт окну собственный стиль
      seam?.update();
      if (!hostSaved) return;
      const { owner, orig, moved } = hostSaved; hostSaved = null;
      const now = owner.rect();
      if (Math.abs(now.left - moved.left) < 2 && Math.abs(now.width - moved.width) < 2) owner.set({ left: orig.left, width: orig.width }, false);
      owner.el.classList.remove('col-temp-geo');
    };

    const pill = doc.createElement('button');
    pill.type = 'button';
    pill.className = 'col-pill';
    pill.hidden = true;
    pill.textContent = def.title;
    dock.append(pill);

    const api = {
      id: def.id, el, body: el.querySelector('.col-wb'),
      get isOpen() { return !el.hidden; },
      front() { el.style.zIndex = String(++zTop); seam?.update(); },
      open() { pill.hidden = true; if (el.hidden) { el.hidden = false; apply(); } if (GLUE[def.id]) glue(); api.front(); changed(); },
      isFull,
      syncRole,
      rect: () => ({ ...rect }),
      /** Меняет положение или размер; persist=false для временных сдвигов (пристыковка), они не запоминаются. */
      set(patch, persist = true) { Object.assign(rect, patch); apply(); if (persist) remember(); },
      addFollower(fn) { followers.push(fn); },
      get isGlued() { return glued; },
      minimize() { if (el.hidden) return; el.hidden = true; pill.hidden = false; if (GLUE[def.id]) unglue(); changed(); },
      close() { pill.hidden = true; if (!el.hidden) { el.hidden = true; } if (GLUE[def.id]) unglue(); changed(); },
      toggle() { if (el.hidden) api.open(); else api.close(); },
      refit() { if (!el.hidden) apply(); },
      toggleFull() {
        const on = el.classList.toggle('col-full');
        apply();
        const b = el.querySelector('.col-wmax');
        b.title = on ? 'Вернуть окно' : 'На всё окно';
        b.innerHTML = on ? RESTORE_ICON : FULL_ICON;
      },
    };
    el.querySelector('.col-wmin').addEventListener('click', () => api.minimize());
    el.querySelector('.col-wx').addEventListener('click', () => api.close());
    el.querySelector('.col-wmax').addEventListener('click', () => api.toggleFull());
    pill.addEventListener('click', () => api.open());
    el.addEventListener('pointerdown', () => api.front());

    grow.addEventListener('pointerdown', event => {
      if (event.button !== 0 || isFull() || glued) return;
      event.preventDefault(); event.stopPropagation();
      const start = { x: event.clientX, y: event.clientY, w: rect.width, h: rect.height };
      try { grow.setPointerCapture?.(event.pointerId); } catch { /* синтетические события */ }
      el.classList.add('col-dragging'); doc.body.classList.add('col-grow-active');
      const move = ev => {
        const maxW = view.innerWidth - rect.left - 8, maxH = view.innerHeight - rect.top - 8;
        rect.width = clamp(start.w + ev.clientX - start.x, 380, maxW); rect.height = clamp(start.h + ev.clientY - start.y, 260, maxH);
        apply();
      };
      const up = () => {
        grow.removeEventListener('pointermove', move); grow.removeEventListener('pointerup', up); grow.removeEventListener('pointercancel', up);
        el.classList.remove('col-dragging'); doc.body.classList.remove('col-grow-active');
        remember();
      };
      grow.addEventListener('pointermove', move); grow.addEventListener('pointerup', up); grow.addEventListener('pointercancel', up);
    });

    const head = el.querySelector('.col-wh');
    head.addEventListener('dblclick', event => { if (!event.target.closest('button')) api.toggleFull(); });
    head.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button') || isFull()) return;
      glued = false;
      const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      head.setPointerCapture?.(event.pointerId);
      el.classList.add('col-dragging');
      const move = ev => { rect.left = start.left + ev.clientX - start.x; rect.top = start.top + ev.clientY - start.y; apply(); };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        head.removeEventListener('pointercancel', up);
        el.classList.remove('col-dragging');
        remember();
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
      head.addEventListener('pointercancel', up);
    });

    let timer = null;
    const ro = view.ResizeObserver ? new view.ResizeObserver(() => {
      if (el.hidden || isFull() || el.classList.contains('col-dragging')) return;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      rect.width = box.width; rect.height = box.height;
      clearTimeout(timer); if (!el.classList.contains('col-temp-geo')) timer = setTimeout(remember, 300);
      followers.forEach(fn => fn());
    }) : null;
    ro?.observe(el);
    const onResize = () => api.refit();
    view.addEventListener('resize', onResize);
    undo.push(() => { ro?.disconnect(); view.removeEventListener('resize', onResize); clearTimeout(timer); el.remove(); pill.remove(); });

    wins.set(def.id, api);
    // приклеенное окно следует за хозяином: двигается и тянется вместе с ним
    const ownerWin = GLUE[def.id] && wins.get(GLUE[def.id]);
    ownerWin?.addFollower(() => { if (glued && !el.hidden) apply(); });
    return api;
  }

  /** Переносит родной блок внутрь окна; при откате возвращает на прежнее место. */
  const moveIn = (node, target) => {
    if (!node) return false;
    const home = { parent: node.parentElement, next: node.nextSibling };
    target.append(node);
    node.classList.add('col-moved');
    undo.push(() => {
      node.classList.remove('col-moved');
      home.parent?.insertBefore(node, home.next?.parentNode === home.parent ? home.next : null);
    });
    return true;
  };

  const iconOf = drawer => doc.querySelector(`#${CSS.escape(drawer)} .drawer-icon`);
  const select = (def, tabId) => {
    const hub = def.hubUi;
    if (!hub) return;
    for (const tab of hub.nav.querySelectorAll('[data-tab]')) tab.classList.toggle('on', tab.dataset.tab === tabId);
    for (const pane of hub.panes.children) pane.hidden = pane.dataset.pane !== tabId;
  };

  // когда Таверна открывает родной ящик сама, показываем наше окно и возвращаем иконку в «закрыто»
  const watch = (drawer, onOpen) => {
    const icon = iconOf(drawer);
    if (!icon) return;
    const observer = new view.MutationObserver(() => {
      if (!icon.classList.contains('openIcon')) return;
      icon.classList.replace('openIcon', 'closedIcon');
      onOpen();
    });
    observer.observe(icon, { attributes: true, attributeFilter: ['class'] });
    undo.push(() => observer.disconnect());
  };

  for (const def of SECTIONS) {
    try {
      const win = createWin(def);
      if (def.hub) {
        win.body.innerHTML = '<div class="col-hub"><nav class="col-vtabs" role="tablist"></nav><div class="col-panes"></div></div>';
        def.hubUi = { nav: win.body.querySelector('.col-vtabs'), panes: win.body.querySelector('.col-panes') };
        // ссылки стоят внизу списка вкладок; новые вкладки встают перед ними
        const links = doc.createElement('div');
        links.className = 'col-vlinks';
        links.innerHTML = `<div class="col-vsub">Ссылки</div>${LINKS.map(l => `<a class="col-vlink" href="${l.href}" target="_blank" rel="noopener noreferrer">${l.fa ? `<i class="fa-brands ${l.fa}" aria-hidden="true"></i>` : `${SVG}${TAB_ICONS[l.icon]}</svg>`}<span>${l.title}</span></a>`).join('')}`;
        def.hubUi.nav.append(links);
        def.hubUi.links = links;
        const addTab = (id, title, icon, node) => {
          const tab = doc.createElement('button');
          tab.type = 'button';
          tab.dataset.tab = id;
          tab.setAttribute('role', 'tab');
          tab.innerHTML = `${SVG}${icon}</svg><span></span>`;
          tab.querySelector('span').textContent = title;
          tab.addEventListener('click', () => select(def, id));
          const pane = doc.createElement('section');
          pane.className = 'col-pane';
          pane.dataset.pane = id;
          pane.hidden = true;
          def.hubUi.nav.insertBefore(tab, def.hubUi.links);
          def.hubUi.panes.append(pane);
          if (node) moveIn(node, pane);
          return pane;
        };
        for (const tab of def.tabs) {
          const node = doc.getElementById(tab.content);
          if (!node) { report(`блок ${tab.content}`, new Error('не найден')); continue; }
          addTab(tab.id, tab.title, TAB_ICONS[tab.id] ?? '', node);
          watch(tab.drawer, () => { select(def, tab.id); win.open(); });
        }
        // другие модули добавляют сюда свои вкладки (например, палитра и фон)
        shared.hubTab = (id, title, iconKey) => addTab(id, title, TAB_ICONS[iconKey] ?? '', null);
        select(def, def.tabs[0].id);
        undo.push(() => { delete shared.hubTab; });
      } else if (def.custom) {
        // содержимое строит отдельный модуль; родная панель остаётся скрытой на месте
        if (def.drawer) watch(def.drawer, () => win.open());
      } else {
        const node = doc.getElementById(def.content);
        if (!node) { report(`блок ${def.content}`, new Error('не найден')); continue; }
        moveIn(node, win.body);
        watch(def.drawer, () => win.open());
      }
    } catch (error) { report(`окно ${def.id}`, error); }
  }

  shared.windows = {
    list: SECTIONS,
    get: id => wins.get(id),
    isOpen: id => !!wins.get(id)?.isOpen,
    anyOpen: () => [...wins.values()].some(w => w.isOpen),
    toggle: id => wins.get(id)?.toggle(),
    open: id => wins.get(id)?.open(),
    closeAll: () => { for (const w of wins.values()) if (w.isOpen) w.close(); },
    selectTab: (id, tabId) => { const def = SECTIONS.find(s => s.id === id); if (def) select(def, tabId); },
  };
  undo.push(() => { delete shared.windows; });

  // оформление окон: по умолчанию роль у каждого окна своя, иначе один стиль на все
  const STYLE_ROLE = { portico: 'home', stone: 'lib', scroll: 'pop' };
  const applyStyle = () => {
    for (const def of SECTIONS) {
      const win = wins.get(def.id);
      if (!win) continue;
      win.el.classList.remove('col-win-lib', 'col-win-pop', 'col-win-home');
      win.el.classList.add(`col-win-${STYLE_ROLE[settings.ws] ?? def.role}`);
      win.syncRole?.();
    }
  };
  bus.addEventListener('ws', applyStyle);
  undo.push(() => bus.removeEventListener('ws', applyStyle));
  applyStyle();

  const applyAppearance = event => {
    const profile = event?.detail ?? shared.appearance?.current?.();
    for (const def of SECTIONS) {
      const title = titleFor(profile, def);
      const win = wins.get(def.id);
      if (!win) continue;
      win.el.setAttribute('aria-label', title);
      win.el.querySelector('.col-wh h2').textContent = title;
      const pill = [...dock.children].find(item => item.textContent === def.title || item.dataset.win === def.id);
      if (pill) { pill.textContent = title; pill.dataset.win = def.id; }
    }
  };
  bus.addEventListener('appearance', applyAppearance);
  undo.push(() => bus.removeEventListener('appearance', applyAppearance));
  applyAppearance();

  const onSide = () => { for (const w of wins.values()) w.refit(); };
  bus.addEventListener('side', onSide);
  undo.push(() => bus.removeEventListener('side', onSide));

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат окон', error); } } };
}
