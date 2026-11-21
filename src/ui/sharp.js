/**
 * «Чёткие картинки»: убирает размытие аватарок, масок и фонов.
 * Таверна показывает их через сжатые копии (`/thumbnail?type=…&file=…`). Пока параметр включён, такие адреса в `<img>` и в
 * `background-image` заменяются прямыми ссылками на оригиналы: аватары → `/characters/`, фоны → `/backgrounds/`, маски → `/User Avatars/`.
 * Адреса запоминаются в `data-col-sharp`, поэтому при выключении всё возвращается как было, без перезагрузки страницы.
 * Данные и файлы Таверны не меняются, `fetch` не подменяется.
 */
import { report } from '../core/guard.js';

const FOLDERS = { avatar: 'characters', bg: 'backgrounds', persona: 'User Avatars' };
const ATTR = 'data-col-sharp';

/** Адрес миниатюры → адрес оригинала; всё остальное возвращается без изменений. */
export function originalUrl(url, origin = 'http://localhost') {
  try {
    if (typeof url !== 'string' || !url.includes('/thumbnail')) return url;
    const u = new URL(url, origin);
    if (!u.pathname.endsWith('/thumbnail')) return url;
    const folder = FOLDERS[u.searchParams.get('type')];
    const file = u.searchParams.get('file');
    if (!folder || !file) return url;
    return `/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
  } catch { return url; }
}

export function startSharp(doc, { settings, save, shared }) {
  const view = doc.defaultView;
  const undo = [];
  let on = false;
  let observer = null;

  const sharpenImg = img => {
    const src = img.getAttribute('src');
    const next = originalUrl(src, view.location.origin);
    if (next === src) return;
    img.setAttribute(ATTR, src);
    img.setAttribute('src', next);
  };
  const sharpenBg = el => {
    const bg = el.style?.backgroundImage;
    if (!bg || !bg.includes('/thumbnail')) return;
    const next = bg.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, quote, raw) => `url(${quote}${originalUrl(raw, view.location.origin)}${quote})`);
    if (next === bg) return;
    el.setAttribute(ATTR, bg);
    el.style.backgroundImage = next;
  };
  const sharpenTree = root => {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'IMG') sharpenImg(root);
    sharpenBg(root);
    root.querySelectorAll?.('img').forEach(sharpenImg);
    root.querySelectorAll?.('[style*="thumbnail"]').forEach(sharpenBg);
  };

  const enable = () => {
    if (on) return;
    on = true;
    try {
      sharpenTree(doc.body);
      observer = new view.MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'childList') m.addedNodes.forEach(sharpenTree);
          else if (m.attributeName === 'src' && m.target.tagName === 'IMG') sharpenImg(m.target);
          else if (m.attributeName === 'style') sharpenBg(m.target);
        }
      });
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
    } catch (error) { report('чёткие картинки', error); }
  };
  const disable = () => {
    if (!on) return;
    on = false;
    observer?.disconnect(); observer = null;
    doc.querySelectorAll(`[${ATTR}]`).forEach(el => {
      const old = el.getAttribute(ATTR);
      el.removeAttribute(ATTR);
      if (el.tagName === 'IMG') el.setAttribute('src', old); else el.style.backgroundImage = old;
    });
  };

  shared.sharp = {
    isOn: () => on,
    set(value) { settings.sharpImages = !!value; save(); settings.sharpImages ? enable() : disable(); },
  };
  undo.push(() => { disable(); delete shared.sharp; });
  if (settings.sharpImages) enable();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат чётких картинок', error); } } };
}
