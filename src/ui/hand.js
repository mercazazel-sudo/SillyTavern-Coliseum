/**
 * «Под рукой»: раздел в левой колонне, куда выносится то, что нужно часто.
 *  1) тогглы пресета (Chat Completion, Prompt Manager): ромбик включён/выключен, нажатие переключает родной тоггл;
 *  2) кнопки расширений: всё, что расширение добавило на верхнюю панель Таверны (например, Кулисы), подхватывается само,
 *     плюс пункты меню расширений («волшебная палочка»), которые закрепляются вручную.
 * Что показывать, настраивается в окне «Под рукой» (карандаш). Набор тогглов свой у каждого пресета.
 * Тогглы и кнопки действуют через родные элементы Таверны: она сама сохраняет изменения.
 */
import { report } from '../core/guard.js';
import { debounce, esc } from './kit.js';

/** Кнопки верхней панели, которые Таверна рисует сама: всё остальное в панели добавили расширения. */
const NATIVE_TOP = new Set(['ai-config-button', 'sys-settings-button', 'advanced-formatting-button', 'WI-SP-button', 'user-settings-button', 'backgrounds-button', 'extensions-settings-button', 'persona-management-button', 'rightNavHolder']);
const LABEL_MAX = 24;
const FA_SKIP = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-fw', 'fa-lg', 'fa-sm', 'fa-xs', 'fa-2x', 'closedIcon', 'openIcon', 'interactable', 'drawer-icon', 'fa']);

/** Название промпта без эмодзи и значков в начале. */
const plainName = name => String(name ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || String(name ?? '').trim();

export async function startHand(doc, { settings, save, shared }) {
  const view = doc.defaultView;
  const undo = [];
  const jq = () => view.jQuery ?? globalThis.jQuery;
  const nav = doc.querySelector('#col-side .col-nav');
  const win = shared.windows?.get('hand');
  if (!nav) { report('под рукой', new Error('нет колонны')); return () => {}; }

  settings.hand ??= { presets: {}, hideTop: [], wand: [], labels: {} };
  const H = settings.hand;
  H.presets ??= {}; H.hideTop ??= []; H.wand ??= []; H.labels ??= {};

  /* ───────── чтение родных данных ───────── */
  const ctx = () => globalThis.SillyTavern?.getContext?.() ?? {};
  const presetName = () => doc.querySelector('#settings_preset_openai option:checked')?.textContent?.trim() ?? '';
  const usesPM = () => ctx().mainApi === 'openai' && !!doc.getElementById('completion_prompt_manager_list');
  const readPrompts = () => [...doc.querySelectorAll('#completion_prompt_manager_list li.completion_prompt_manager_prompt')].map(row => {
    const toggle = row.querySelector('.prompt-manager-toggle-action');
    return {
      id: row.dataset.pmIdentifier ?? '', toggle, enabled: !!toggle?.classList.contains('fa-toggle-on'),
      name: row.querySelector('.completion_prompt_manager_prompt_name')?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
    };
  }).filter(p => p.id && p.toggle);
  const topButtons = () => [...(doc.getElementById('top-settings-holder')?.children ?? [])]
    .filter(el => el.id && !NATIVE_TOP.has(el.id) && !el.id.startsWith('col-') && (el.classList.contains('drawer') || el.querySelector('.drawer-icon, .drawer-toggle')))
    .map(el => {
      const icon = el.querySelector('.drawer-icon');
      const fa = [...(icon?.classList ?? [])].filter(c => c.startsWith('fa-') && !FA_SKIP.has(c));
      const title = (icon?.getAttribute('title') ?? el.getAttribute('title') ?? '').trim() || el.id.replace(/-/g, ' ');
      return { key: `top:${el.id}`, id: el.id, title, fa: fa.length ? fa.join(' ') : 'fa-puzzle-piece', el };
    });
  const wandItems = () => [...doc.querySelectorAll('#extensionsMenu .extension_container > div[id], #extensionsMenu > div[id]')]
    .filter(el => !el.closest('.col-moved:not(#extensionsMenu)'))  // меню расширений само помечено col-moved (переехало в меню чата), его пункты нужны
    .map(el => {
      const icon = el.querySelector('[class*="fa-"]');
      const fa = [...(icon?.classList ?? [])].filter(c => c.startsWith('fa-') && !FA_SKIP.has(c));
      return { key: `wand:${el.id}`, id: el.id, title: el.textContent.trim().replace(/\s+/g, ' ') || el.id, fa: fa.length ? fa.join(' ') : 'fa-bolt', el };
    });

  /* ───────── что вынесено ───────── */
  const chips = () => (H.presets[presetName()] ??= []);
  const isPinnedPrompt = id => (H.presets[presetName()] ?? []).some(c => c.id === id);
  const labelOf = (chip, prompt) => (chip.label || plainName(prompt?.name ?? '')).slice(0, 40);
  const visibleTop = () => topButtons().filter(b => !H.hideTop.includes(b.id));
  const pinnedWand = () => wandItems().filter(w => H.wand.includes(w.id));

  /** Включить или выключить кнопку в колонне: ключ вида top:<id> (панель Таверны) или wand:<id> (меню расширений). */
  const setExt = (key, on) => {
    const id = key.slice(key.indexOf(':') + 1);
    const arr = key.startsWith('top:') ? H.hideTop : H.wand;
    const inList = arr.includes(id);
    if (key.startsWith('top:')) { if (on && inList) arr.splice(arr.indexOf(id), 1); else if (!on && !inList) arr.push(id); }
    else if (on && !inList) arr.push(id); else if (!on && inList) arr.splice(arr.indexOf(id), 1);
  };
  const isExtOn = key => { const id = key.slice(key.indexOf(':') + 1); return key.startsWith('top:') ? !H.hideTop.includes(id) : H.wand.includes(id); };
  /** Кнопки без дублей: пустые заготовки и обёртки пунктов не берём, у обёртки остаются её настоящие пункты. */
  const publicButtons = () => [
    ...topButtons(),
    ...wandItems().filter(w => w.el.textContent.trim() && !(w.el.classList.contains('extension_container') && w.el.querySelector('[id]'))),
  ].map(({ key, id, title, fa }) => ({ key, id, title: plainName(title), fa }));
  shared.hand = { buttons: publicButtons, isOn: isExtOn, setOn: (key, on) => { setExt(key, on); save(); renderSection(); if (win?.isOpen) renderEditor(); } };
  undo.push(() => { delete shared.hand; });

  /* ───────── раздел в колонне ───────── */
  const section = doc.createElement('section');
  section.id = 'col-hand';
  nav.append(section);
  undo.push(() => section.remove());

  const press = el => { const $ = jq(); if ($) $(el).trigger('click'); else el.click(); };

  const renderSection = () => {
    try {
      const prompts = usesPM() ? readPrompts() : [];
      const byId = new Map(prompts.map(p => [p.id, p]));
      const pinned = (H.presets[presetName()] ?? []).filter(c => byId.has(c.id));
      const top = visibleTop(), wand = pinnedWand();
      const presetRows = pinned.map(c => { const p = byId.get(c.id); return `<div class="col-hand-it col-hand-preset${p.enabled ? ' on' : ''}" data-p="${esc(c.id)}" title="${esc(p.name)}${p.enabled ? ': включён' : ': выключен'}"><i class="col-pdot"></i><span>${esc(labelOf(c, p))}</span></div>`; });
      const extRows = [...top, ...wand].map(b => `<div class="col-hand-it col-hand-ext" data-e="${esc(b.key)}" title="${esc(b.title)}"><i class="fa-solid ${esc(b.fa)}"></i><span>${esc(plainName(b.title))}</span></div>`);
      section.innerHTML = `<div class="col-hand-head"><span>Под рукой</span><button type="button" class="col-hand-edit" title="Настроить">✎</button></div>`
        + (presetRows.length || extRows.length ? '' : '<div class="col-hand-empty">Пока пусто. Нажми карандаш и выбери, что держать здесь.</div>')
        + presetRows.join('') + (presetRows.length && extRows.length ? '<div class="col-hand-sep"></div>' : '') + extRows.join('');
    } catch (error) { report('раздел «Под рукой»', error); }
  };

  section.addEventListener('click', event => {
    if (event.target.closest('.col-hand-edit')) { win?.open(); renderEditor(); return; }
    const preset = event.target.closest('[data-p]');
    if (preset) {
      const prompt = readPrompts().find(p => p.id === preset.dataset.p);
      if (!prompt) { globalThis.toastr?.warning?.('Этого тоггла нет в открытом пресете.', 'Колизей'); return; }
      press(prompt.toggle);
      setTimeout(renderSection, 150);
      return;
    }
    const ext = event.target.closest('[data-e]');
    if (ext) {
      const all = [...topButtons(), ...wandItems()];
      const target = all.find(b => b.key === ext.dataset.e);
      if (!target) { globalThis.toastr?.warning?.('Этой кнопки больше нет: расширение отключено?', 'Колизей'); return; }
      // у кнопки верхней панели нажимаем иконку: клик поднимается к «ручке» ящика, и работают оба вида кнопок (родной ящик и кнопка расширения со своим обработчиком); у пункта меню расширений нажимаем сам пункт
      const clickable = target.key.startsWith('top:') ? (target.el.querySelector('.drawer-icon') ?? target.el.querySelector('.drawer-toggle') ?? target.el) : target.el;
      press(clickable);
    }
  });

  /* ───────── окно настройки ───────── */
  let lastEditorHtml = '';
  const renderEditor = () => {
    if (!win) return;
    // пока человек пишет подпись, окно не перерисовываем: пропадёт курсор
    if (doc.activeElement?.matches?.('.col-hand-label') && win.body.contains(doc.activeElement)) return;
    const prompts = usesPM() ? readPrompts() : [];
    const rows = prompts.map(p => {
      const chip = (H.presets[presetName()] ?? []).find(c => c.id === p.id);
      return `<div class="col-hand-row" data-id="${esc(p.id)}"><i class="col-pdot${p.enabled ? ' on' : ''}"></i><span class="col-hand-name">${esc(p.name)}</span>
        <input class="col-input col-hand-label" maxlength="${LABEL_MAX}" placeholder="${esc(plainName(p.name))}" value="${esc(chip?.label ?? '')}" ${chip ? '' : 'disabled'} title="Короткая подпись только для колонны: сам промпт не меняется">
        <label class="col-check"><input type="checkbox" data-pin ${chip ? 'checked' : ''}><i></i></label></div>`;
    }).join('');
    const top = topButtons(), wand = wandItems();
    const extRow = (b, on) => `<div class="col-hand-row" data-k="${esc(b.key)}"><i class="fa-solid ${esc(b.fa)} col-hand-ico"></i><span class="col-hand-name">${esc(plainName(b.title))}</span><span></span>
      <label class="col-check"><input type="checkbox" data-ext ${on ? 'checked' : ''}><i></i></label></div>`;
    const html = `<div class="col-hand-ed">
      <h3>Под рукой</h3>
      <p class="col-note">Всё, что отмечено, появится в левой колонне под главными разделами. Нажатие работает как нажатие на родную кнопку Таверны.</p>
      <h4>Тогглы пресета</h4>
      ${usesPM() ? `<p class="col-note">Набор для пресета: <b>${esc(presetName() || 'без названия')}</b>. У каждого пресета свой набор.</p>
        <div class="col-hand-list">${rows || '<p class="col-empty">В этом пресете нет тогглов.</p>'}</div>`
        : '<p class="col-note">Тогглы пресета работают с Chat Completion: у других API нет списка промптов с тогглами.</p>'}
      <h4>Кнопки с верхней панели Таверны</h4>
      <p class="col-note">Их добавили расширения. Появляются в колонне сами, лишнее можно снять.</p>
      <div class="col-hand-list">${top.map(b => extRow(b, !H.hideTop.includes(b.id))).join('') || '<p class="col-empty">Расширения не добавили кнопок на верхнюю панель.</p>'}</div>
      <h4>Пункты меню расширений</h4>
      <p class="col-note">То, что обычно лежит под «волшебной палочкой» у поля ввода. Отметь нужное.</p>
      <div class="col-hand-list">${wand.map(b => extRow(b, H.wand.includes(b.id))).join('') || '<p class="col-empty">В меню расширений пока ничего нет.</p>'}</div></div>`;
    // ничего не изменилось: не трогаем окно (иначе список прыгает наверх при каждом событии Таверны)
    if (html === lastEditorHtml && win.body.querySelector('.col-hand-ed')) return;
    lastEditorHtml = html;
    const scroll = win.body.querySelector('.col-hand-ed')?.scrollTop ?? 0;
    win.body.innerHTML = html;
    const fresh = win.body.querySelector('.col-hand-ed');
    if (fresh) fresh.scrollTop = scroll;
  };

  win?.body.addEventListener('change', event => {
    const row = event.target.closest('.col-hand-row');
    if (!row) return;
    if (event.target.matches('[data-pin]')) {
      const list = chips(), id = row.dataset.id, at = list.findIndex(c => c.id === id);
      if (event.target.checked && at < 0) list.push({ id, label: '' }); else if (!event.target.checked && at >= 0) list.splice(at, 1);
      if (!list.length) delete H.presets[presetName()];
    } else if (event.target.matches('[data-ext]')) {
      setExt(row.dataset.k, event.target.checked);
    }
    save(); renderSection(); renderEditor();
  });
  win?.body.addEventListener('input', event => {
    if (!event.target.matches('.col-hand-label')) return;
    const id = event.target.closest('.col-hand-row').dataset.id;
    const chip = (H.presets[presetName()] ?? []).find(c => c.id === id);
    if (chip) { chip.label = event.target.value.slice(0, LABEL_MAX).trim(); save(); renderSection(); }
  });

  /* ───────── слежение за родными элементами ───────── */
  const refresh = debounce(() => { renderSection(); if (win?.isOpen) renderEditor(); }, 150);
  const observer = new view.MutationObserver(refresh);
  const watch = (el, opts) => { if (el) observer.observe(el, opts); };
  watch(doc.getElementById('completion_prompt_manager_list'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  watch(doc.getElementById('settings_preset_openai'), { childList: true, subtree: true, attributes: true });
  watch(doc.getElementById('top-settings-holder'), { childList: true });
  watch(doc.getElementById('extensionsMenu'), { childList: true, subtree: true });
  undo.push(() => observer.disconnect());
  const preset = doc.getElementById('settings_preset_openai');
  preset?.addEventListener('change', refresh);
  undo.push(() => preset?.removeEventListener('change', refresh));
  const types = ctx().eventTypes ?? {};
  for (const name of ['OAI_PRESET_CHANGED_AFTER', 'MAIN_API_CHANGED', 'SETTINGS_LOADED_AFTER', 'APP_READY']) {
    const type = types[name];
    if (!type || !ctx().eventSource?.on) continue;
    ctx().eventSource.on(type, refresh);
    undo.push(() => ctx().eventSource.removeListener?.(type, refresh));
  }
  const onWindows = () => { if (win?.isOpen) renderEditor(); };
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => shared.bus.removeEventListener('windows', onWindows));

  // расширения иногда добавляют кнопки уже после старта: перечитываем с задержкой
  setTimeout(refresh, 3000); setTimeout(refresh, 9000);
  renderSection();
  renderEditor();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат «Под рукой»', error); } } };
}
