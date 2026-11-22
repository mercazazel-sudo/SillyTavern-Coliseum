/**
 * Одно меню чата вместо двух («колонна» и «волшебная палочка»).
 * Родное меню расширений (#extensionsMenu) переезжает внутрь родного меню чата (#options), кнопка палочки прячется.
 * Пункты остаются настоящими родными элементами, поэтому всё, что на них повесили Таверна и расширения, работает как раньше.
 * Какие пункты показывать, выбирается во вкладке «Меню чата» в Акрополе (хранится список скрытых id).
 */
import { report } from '../core/guard.js';
import { esc } from './kit.js';

const FA_SKIP = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-fw', 'fa-lg', 'fa-sm', 'fa-xs', 'fa-2x', 'interactable', 'fa']);
const STYLE_ID = 'col-menu-hide';

export function startChatMenu(doc, { settings, save, shared }) {
  const view = doc.defaultView;
  const undo = [];
  const options = doc.getElementById('options');
  if (!options) { report('меню чата', new Error('нет #options')); return () => {}; }

  settings.menu ??= { hidden: [] };
  settings.menu.hidden ??= [];
  const M = settings.menu;

  /* ───────── переезд меню расширений внутрь меню чата ───────── */
  const content = options.querySelector('.options-content') ?? options;
  let holder = null;
  const adopt = () => {
    const menu = doc.getElementById('extensionsMenu');
    if (!menu || menu.parentElement === content) return !!menu;
    holder = { node: menu, parent: menu.parentElement, next: menu.nextSibling };
    menu.classList.add('col-moved', 'col-menu-ext');
    content.append(menu);
    return true;
  };
  undo.push(() => {
    if (!holder) return;
    const { node, parent, next } = holder;
    node.classList.remove('col-moved', 'col-menu-ext');
    parent?.insertBefore(node, next?.parentNode === parent ? next : null);
    holder = null;
  });
  let watcher = null;
  if (!adopt()) {
    // Таверна достраивает меню расширений уже после старта
    watcher = new view.MutationObserver(() => { if (adopt()) { watcher.disconnect(); watcher = null; view.setTimeout(applyHidden, 0); } });
    watcher.observe(doc.body, { childList: true });
    undo.push(() => watcher?.disconnect());
  }

  /* ───────── список пунктов ───────── */
  const labelOf = el => (el.querySelector('span')?.textContent ?? el.textContent).trim().replace(/\s+/g, ' ') || el.id;
  const iconOf = (el, fallback) => {
    const icon = el.querySelector('[class*="fa-"]');
    const fa = [...(icon?.classList ?? [])].filter(c => c.startsWith('fa-') && !FA_SKIP.has(c));
    return fa.length ? fa.join(' ') : fallback;
  };
  /**
   * Ключ пункта: его id, а если id нет (так сделаны, например, пункты «Тавернного помощника»), то «txt:» и подпись.
   * Ключ записывается в data-col-menu-key, по нему пункт находится и прячется так же, как пункт с id.
   */
  const keyOf = el => {
    if (el.id) return el.id;
    if (!el.dataset.colMenuKey) {
      const label = labelOf(el);
      if (!label) return '';
      el.dataset.colMenuKey = `txt:${label}`;
    }
    return el.dataset.colMenuKey;
  };
  const EXT_ITEMS = '.extension_container > div, :scope > div:not(.extension_container)';
  /** Все пункты обоих меню без повторов. */
  const items = () => {
    const seen = new Set(), out = [];
    const push = (el, group, fallback) => {
      const key = keyOf(el);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ id: key, title: labelOf(el), fa: iconOf(el, fallback), group });
    };
    for (const el of options.querySelectorAll('.options-content > a[id]')) push(el, 'Чат', 'fa-circle');
    const ext = doc.getElementById('extensionsMenu');
    if (ext) for (const el of ext.querySelectorAll(EXT_ITEMS)) push(el, 'Расширения', 'fa-bolt');
    return out;
  };

  /* ───────── скрытие выбранных пунктов ───────── */
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  doc.head.append(style);
  undo.push(() => style.remove());
  const esc2 = id => (view.CSS?.escape ? view.CSS.escape(id) : id.replace(/[^\w-]/g, '\\$&'));
  const applyHidden = () => {
    items();   // проставляет ключи пунктам без id
    const quote = text => text.replace(/["\\]/g, '\\$&');
    style.textContent = M.hidden.map(id => (id.startsWith('txt:')
      ? `body.col-on #options [data-col-menu-key="${quote(id)}"]{display:none!important}`
      : `body.col-on #options #${esc2(id)}{display:none!important}`)).join('\n');
    tidy();
  };
  /** Разделители без видимых пунктов рядом прячем, чтобы не оставались пустые линии. */
  function tidy() {
    try {
      const shown = el => view.getComputedStyle(el).display !== 'none';
      const kids = [...content.children];
      let before = false;
      kids.forEach((el, i) => {
        if (el.tagName !== 'HR') { if (shown(el)) before = true; return; }
        const after = kids.slice(i + 1).some(k => k.tagName !== 'HR' && shown(k));
        el.classList.toggle('col-menu-hr-off', !before || !after);
        if (before && after) before = false;
      });
    } catch (error) { report('разделители меню', error); }
  }
  applyHidden();
  // расширения достраивают свои пункты позже (Teleport): помечаем их и применяем скрытие по мере появления
  {
    let timer = null;
    const later = () => { view.clearTimeout(timer); timer = view.setTimeout(applyHidden, 120); };
    const menu = doc.getElementById('extensionsMenu');
    if (menu) {
      const watch = new view.MutationObserver(later);
      watch.observe(menu, { childList: true, subtree: true });
      undo.push(() => watch.disconnect());
    }
    undo.push(() => view.clearTimeout(timer));
  }
  // видимость родных пунктов меняет сама Таверна при открытии меню: пересчитываем после открытия
  const button = doc.getElementById('options_button');
  const onOpen = () => view.setTimeout(tidy, 60);
  button?.addEventListener('click', onOpen);
  undo.push(() => button?.removeEventListener('click', onOpen));

  /* ───────── вкладка «Меню чата» в Акрополе ───────── */
  const pane = shared.hubTab?.('col-menu', 'Меню чата', 'chat');
  if (pane) {
    undo.push(() => { pane.remove(); doc.querySelectorAll('.col-vtabs [data-tab="col-menu"]').forEach(el => el.remove()); });
    pane.classList.add('col-set');
    let dirty = false, note = 'Изменения сохраняются сами, а кнопка делает это сразу.';
    /** Немедленная запись настроек Таверны (обычное сохранение откладывается на секунду и теряется, если страницу закрыть раньше). */
    const flush = async () => {
      try {
        const script = await import('/script.js');
        if (shared.saveAndVerify) {
          const r = await shared.saveAndVerify();
          if (r.ok) { dirty = false; note = 'Сохранено на сервере. Меню останется таким и после перезахода.'; }
          else { note = `Запись не дошла (${r.missing.slice(0, 3).join(', ')}). Скорее всего, открыта старая вкладка Таверны: закрой её и нажми «Сохранить» снова.`; }
        } else {
          await script.saveSettings();
          dirty = false; note = 'Сохранено. Меню останется таким и после перезахода.';
        }
      } catch (error) {
        report('сохранение меню чата', error);
        save(); note = 'Не удалось записать сразу, сохранение поставлено в очередь. Подробности в консоли.';
      }
      paintNote();
    };
    const paintNote = () => {
      const el = pane.querySelector('[data-menu-note]');
      if (el) { el.textContent = dirty ? 'Есть несохранённые изменения.' : note; el.classList.toggle('col-dirty', dirty); }
    };
    const onLeave = () => { if (dirty) { try { import('/script.js').then(m => m.saveSettings()); } catch { /* не страшно */ } } };
    view.addEventListener('pagehide', onLeave);
    undo.push(() => view.removeEventListener('pagehide', onLeave));
    const render = () => {
      const all = items();
      const groups = ['Чат', 'Расширения'];
      pane.innerHTML = `<h3>Меню чата</h3>
        <p class="col-note">Одно меню на кнопке-свитке слева от поля ввода. Выключенные пункты в нём не показываются; снова включить можно здесь.</p>
        <div class="col-btnrow col-msave"><button type="button" class="col-btn col-primary" data-menu="save">Сохранить</button><span class="col-note" data-menu-note></span></div>
        <div class="col-btnrow"><button type="button" class="col-btn" data-menu="all">Показать всё</button><button type="button" class="col-btn" data-menu="regen">Оставить только перегенерацию</button></div>
        ${groups.map(g => {
          const rows = all.filter(i => i.group === g);
          return rows.length ? `<h4>${g}</h4><div class="col-mrows">${rows.map(i => `<label class="col-mrow"><i class="fa-solid ${esc(i.fa)}"></i><span>${esc(i.title)}</span><span class="col-msw"><input type="checkbox" data-id="${esc(i.id)}"${M.hidden.includes(i.id) ? '' : ' checked'}><i></i></span></label>`).join('')}</div>` : '';
        }).join('')}`;
      paintNote();
    };
    pane.addEventListener('change', event => {
      const box = event.target.closest('[data-id]');
      if (!box) return;
      const id = box.dataset.id;
      M.hidden = M.hidden.filter(x => x !== id);
      if (!box.checked) M.hidden.push(id);
      dirty = true; save(); applyHidden(); paintNote();
    });
    pane.addEventListener('click', event => {
      const act = event.target.closest('[data-menu]')?.dataset.menu;
      if (!act) return;
      if (act === 'save') { flush(); return; }
      dirty = true;
      if (act === 'all') M.hidden = [];
      else if (act === 'regen') M.hidden = items().map(i => i.id).filter(id => id !== 'option_regenerate' && id !== 'col_option_regen_note' && id !== 'col_option_lock_persona');
      save(); applyHidden(); render();
    });
    render();
    // вкладка перестраивается при открытии окна: пункты расширений могли появиться позже
    const onWin = () => { if (shared.windows?.isOpen('settings')) render(); };
    shared.bus?.addEventListener('windows', onWin);
    undo.push(() => shared.bus?.removeEventListener('windows', onWin));
    view.setTimeout(render, 3000);
  }

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат меню чата', error); } } };
}
