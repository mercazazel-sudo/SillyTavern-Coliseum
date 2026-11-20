/**
 * Маски: библиотека персон. Слева выбранная маска крупно (фото или театральная маска, имя, описание, «Надеть»),
 * справа поиск, «Добавить» и карточки. Список и описания берутся из настроек Таверны, смена персоны делается её же функцией setUserAvatar,
 * а переименование, фото, дублирование и удаление нажимают родные кнопки (они открывают родные диалоги Таверны).
 */
import { report } from '../core/guard.js';
import { ask, debounce, esc, initials, maskSvg } from './kit.js';
import { createDossier } from './persona-dossier.js';
import { THUMB_LIMITS, normalizeThumb, thumbStyle } from '../core/thumbs.js';

const DEFAULT_AVATAR = 'user-default.png';

export async function startPersonaLib(doc, { shared, settings, save }) {
  const win = shared.windows?.get('masks');
  if (!win) { report('маски', new Error('нет окна')); return () => {}; }
  const view = doc.defaultView;
  const undo = [];
  let personas;
  try { personas = await import('/scripts/personas.js'); } catch (error) { report('маски: модуль персон', error); return () => {}; }
  const ctx = () => globalThis.SillyTavern.getContext();
  const jq = () => view.jQuery ?? globalThis.jQuery;
  const state = { selected: '', query: '' };

  win.body.innerHTML = `<div class="col-lib col-masks">
    <section class="col-ms-top">
      <div class="col-cards" data-r="cards"></div>
      <label class="col-search"><input class="col-input" type="search" placeholder="Найти маску…"></label>
      <button type="button" class="col-btn" data-native="#create_dummy_persona">+ Добавить</button>
      <button type="button" class="col-btn col-primary" data-ms-save title="Записать маски, анкеты и настройки на сервер сейчас и проверить, что запись дошла">Сохранить</button>
    </section>
    <section class="col-me-pane" data-r="me"></section></div>`;
  const $ = sel => win.body.querySelector(`[data-r="${sel}"]`);
  const search = win.body.querySelector('input[type="search"]');
  const dossier = createDossier({ doc, settings, save, ctx, activeId: () => activeId(), getSelected: () => state.selected, host: () => win.body.closest('.col-win') ?? win.body, rerender: () => render(), setLore: (id, book) => setLore(id, book) });

  const activeId = () => { const c = ctx(); return c.userAvatar ?? c.user_avatar ?? doc.querySelector('#user_avatar_block .avatar-container.selected')?.dataset.avatarId ?? ''; };
  const list = () => {
    const power = ctx().powerUserSettings ?? {};
    const names = power.personas ?? {}, descs = power.persona_descriptions ?? {};
    return Object.keys(names).map(id => ({ id, name: names[id] || id, desc: descs[id]?.description ?? '', title: descs[id]?.title ?? '', lore: descs[id]?.lorebook ?? '', conn: descs[id]?.connections ?? [] }));
  };
  const connName = c => {
    try {
      if (c.type === 'group') return ctx().groups?.find(g => g.id === c.id)?.name ?? 'группа';
      return ctx().characters?.find(ch => ch.avatar === c.id)?.name ?? c.id;
    } catch { return String(c?.id ?? '?'); }
  };
  const flags = me => {
    let isDefault = false, isChat = false;
    try { isDefault = ctx().powerUserSettings?.default_persona === me.id; isChat = ctx().chatMetadata?.persona === me.id; } catch { /* нет данных */ }
    return { isDefault, isChat };
  };
  /** Раздел «Когда надевается»: два переключателя (родные кнопки Таверны) и привязки к персонажам. */
  const linksHtml = (me, active) => {
    const { isDefault, isChat } = flags(me);
    const chips = me.conn.length
      ? me.conn.map((c, i) => `<span class="col-chip">${esc(connName(c))}<button type="button" data-unlink="${i}" title="Отвязать">×</button></span>`).join('')
      : '<span class="col-note">ни к кому не привязана</span>';
    const cur = ctx().characterId !== undefined && ctx().characters?.[Number(ctx().characterId)];
    const row = (native, on, title, hint) => `<button type="button" class="col-ms-row" data-native="${native}" title="${esc(hint)}"><span class="col-ms-rt">${esc(title)}<small>${esc(hint)}</small></span><span class="col-msw${on ? ' on' : ''}"><i></i></span></button>`;
    return `<section class="col-ms-sec"><h4>Когда надевается</h4>
      ${row('#lock_persona_default', isDefault, 'По умолчанию', 'для всех новых чатов')}
      ${row('#lock_user_name', isChat, 'В этом чате', 'закрепить за открытым чатом')}
      <div class="col-ms-sub">Привязана к персонажам</div>
      <div class="col-chips">${chips}</div>
      <div class="col-ms-btns"><button type="button" class="col-btn" data-link-char>Привязать к персонажу</button>
        ${cur ? `<button type="button" class="col-btn" data-native="#lock_persona_to_char" title="Привязать или отвязать от открытого сейчас персонажа">К ${esc(cur.name)}</button>` : ''}</div></section>`;
  };
  const thumb = id => { try { return ctx().getThumbnailUrl?.('persona', id) ?? ''; } catch { return ''; } };
  const picture = (p, cls) => {
    if (p.id === DEFAULT_AVATAR) return `<div class="${cls} nomask">${maskSvg(p.name)}</div>`;
    return `<div class="${cls}"><img src="${esc(thumb(p.id))}" alt="" data-fallback="${esc(p.name)}"></div>`;
  };

  /** Настройка миниатюры: круглый предпросмотр и три ползунка (масштаб, влево–вправо, вверх–вниз). Значения хранятся по маске. */
  const thumbPanel = me => {
    const t = normalizeThumb(settings.thumbs?.[me.id]);
    const row = (key, label, [min, max]) => `<label class="col-thumb-row"><span>${label}</span><input type="range" min="${min}" max="${max}" value="${t[key]}" data-thumb="${key}" aria-label="${label}"><output data-thumb-out="${key}">${t[key]}${key === 'zoom' ? '%' : ''}</output></label>`;
    return `<div class="col-thumb" data-thumb-panel hidden>
      <div class="col-thumb-prev" data-thumb-prev style="${esc(thumbStyle(thumb(me.id), t))}"></div>
      <div class="col-thumb-ctl">${row('zoom', 'Масштаб', THUMB_LIMITS.zoom)}${row('x', 'Влево — вправо', THUMB_LIMITS.x)}${row('y', 'Вверх — вниз', THUMB_LIMITS.y)}
        <button type="button" class="col-btn" data-thumb-reset>Сбросить</button></div></div>`;
  };
  /** Меняет настройку миниатюры у маски: предпросмотр, кружок у поля ввода и сохранение. */
  const setThumb = (id, patch) => {
    settings.thumbs = settings.thumbs && typeof settings.thumbs === 'object' ? settings.thumbs : {};
    settings.thumbs[id] = normalizeThumb({ ...(settings.thumbs[id] ?? {}), ...patch });
    save?.();
    shared?.paintPersona?.();
    return settings.thumbs[id];
  };

  const renderMe = all => {
    const me = all.find(p => p.id === state.selected) ?? all[0];
    const box = $('me');
    if (!me) { box.innerHTML = '<p class="col-empty">Масок пока нет. Нажми «Добавить».</p>'; return; }
    state.selected = me.id;
    const active = me.id === activeId();
    const f = flags(me);
    const badges = [active ? '<span class="col-badge on">Надета</span>' : '', f.isDefault ? '<span class="col-badge">★ по умолчанию</span>' : '', f.isChat ? '<span class="col-badge">● в этом чате</span>' : ''].join('');
    const prev = box.dataset.id === me.id ? [...box.querySelectorAll('.col-ms-a, .col-ms-b')].map(el => el.scrollTop) : [0, 0];
    box.dataset.id = me.id;
    box.innerHTML = `<div class="col-ms-grid"><div class="col-ms-a"><div class="col-ms-head">${picture(me, 'col-me-pic col-ms-pic')}
        <div class="col-ms-id"><h3 class="col-me-name">${esc(me.name)}</h3><p class="col-me-title">${esc(me.title || 'без титула')}</p><div class="col-ms-badges">${badges}</div></div></div>
      <div class="col-ms-actions"><button type="button" class="col-btn col-primary col-ms-wear" data-wear${active ? ' disabled' : ''}>${active ? 'Надета сейчас' : 'Надеть'}</button>
        <span class="col-ms-tools"><button type="button" class="col-btn" data-native="#persona_rename_button" title="Переименовать">Имя</button>
        <button type="button" class="col-btn" data-native="#persona_set_image_button" title="Сменить фото">Фото</button>
        <button type="button" class="col-btn" data-native="#persona_duplicate_button" title="Сделать копию">Копия</button>
        <button type="button" class="col-btn col-danger" data-native="#persona_delete_button" title="Удалить маску">Удалить</button></span></div>
      ${me.id === DEFAULT_AVATAR ? '' : `<button type="button" class="col-btn col-thumb-open" data-thumb-toggle title="Масштаб и сдвиг фото в круглой рамке у поля ввода">Настройка миниатюры</button>${thumbPanel(me)}`}
      ${linksHtml(me, active)}</div><div class="col-ms-b">${dossier.html(me)}</div></div>`;
    box.querySelectorAll('.col-ms-a, .col-ms-b').forEach((el, i) => { el.scrollTop = prev[i] ?? 0; });
    dossier.paintPreview(me.id);
  };
  const renderCards = all => {
    const q = state.query;
    const shown = all.filter(p => !q || `${p.name} ${p.title} ${p.desc}`.toLowerCase().includes(q));
    const act = activeId();
    $('cards').innerHTML = shown.length ? shown.map(p => `<article class="col-card${p.id === state.selected ? ' sel' : ''}${p.id === act ? ' act' : ''}" data-id="${esc(p.id)}">
      ${picture(p, 'col-card-pic')}<b>${esc(p.name)}</b>${p.id === act ? '<small>сейчас ты</small>' : ''}</article>`).join('') : '<p class="col-empty">Ничего не найдено.</p>';
  };
  const render = () => { const all = list(); renderMe(all); renderCards(all); };

  /** Родной блок персон показывает данные выбранной маски: выбираем её и ждём, пока он подтянется. */
  const choose = async id => {
    state.selected = id;
    try { await personas.setUserAvatar(id, { toastPersonaNameChange: false }); } catch (error) { report('смена персоны', error); }
    setTimeout(render, 250);
  };

  /** Меняет список привязок маски прямо в настройках Таверны и сохраняет их. */
  const editLinks = (id, change) => {
    try {
      const power = ctx().powerUserSettings, d = power?.persona_descriptions?.[id];
      if (!d) throw new Error('у маски нет описания в настройках');
      d.connections = change(d.connections ?? []);
      ctx().saveSettingsDebounced?.();
      render();
    } catch (error) { report('связи маски', error); }
  };
  /** Пишет лорбук маски в настройки Таверны; для надетой маски обновляет и её живое значение, чтобы лорбук сразу заработал. */
  const setLore = (id, book) => {
    try {
      const c = ctx(), power = c.powerUserSettings, d = power?.persona_descriptions?.[id];
      if (!d) throw new Error('у маски нет описания в настройках');
      d.lorebook = book;
      if (id === activeId()) power.persona_description_lorebook = book;
      c.saveSettingsDebounced?.();
      c.eventSource?.emit?.(c.eventTypes?.PERSONA_UPDATED, id);
      render();
    } catch (error) { report('лорбук маски', error); }
  };
  const pickLore = async () => {
    try {
      const names = typeof ctx().getWorldInfoNames === 'function' ? ctx().getWorldInfoNames() : [];
      if (!names.length) { await ask(win.body.closest('.col-win') ?? win.body, { title: 'Лорбуков нет', text: 'Сначала создай лорбук в Библиотеке.', ok: 'Понятно' }); return; }
      const picked = await ask(win.body.closest('.col-win') ?? win.body, { title: 'Какой лорбук привязать к маске?', options: [...names].sort((a, b) => a.localeCompare(b, 'ru')).map(n => ({ value: n, label: n })) });
      if (picked) setLore(state.selected, picked);
    } catch (error) { report('выбор лорбука маски', error); }
  };
  /** Выбор любого персонажа или группы из списка, не только открытого сейчас. */
  const linkToCharacter = async () => {
    try {
      const c = ctx(), id = state.selected;
      const have = new Set((c.powerUserSettings?.persona_descriptions?.[id]?.connections ?? []).map(x => `${x.type}:${x.id}`));
      const options = [
        ...(c.characters ?? []).filter(ch => ch?.avatar && !have.has(`character:${ch.avatar}`)).map(ch => ({ value: `character:${ch.avatar}`, label: ch.name })),
        ...(c.groups ?? []).filter(g => g?.id && !have.has(`group:${g.id}`)).map(g => ({ value: `group:${g.id}`, label: `${g.name} (группа)` })),
      ].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
      if (!options.length) { await ask(win.body.closest('.col-win') ?? win.body, { title: 'Привязывать некого', text: 'Все персонажи уже привязаны к этой маске.', ok: 'Понятно' }); return; }
      const picked = await ask(win.body.closest('.col-win') ?? win.body, { title: 'К какому персонажу привязать маску?', options });
      if (!picked) return;
      const sep = picked.indexOf(':'), type = picked.slice(0, sep), cid = picked.slice(sep + 1);
      const power = c.powerUserSettings;
      editLinks(id, list => [...list, { type, id: cid }]);
      // без «нескольких масок на персонажа» у остальных масок эта привязка снимается, как делает сама Таверна
      if (!power?.persona_allow_multi_connections) {
        for (const [other, d] of Object.entries(power?.persona_descriptions ?? {})) {
          if (other === id || !d.connections) continue;
          d.connections = d.connections.filter(x => !(x.type === type && x.id === cid));
        }
        c.saveSettingsDebounced?.();
      }
    } catch (error) { report('привязка маски', error); }
  };

  win.body.addEventListener('click', async event => {
    const t = event.target;
    const card = t.closest('.col-card');
    if (card) { state.selected = card.dataset.id; render(); return; }
    if (t.closest('[data-wear]')) { await choose(state.selected); return; }
    if (t.closest('[data-thumb-toggle]')) { const panel = win.body.querySelector('[data-thumb-panel]'); if (panel) panel.hidden = !panel.hidden; return; }
    if (t.closest('[data-thumb-reset]')) {
      if (settings.thumbs) delete settings.thumbs[state.selected];
      save?.(); shared?.paintPersona?.();
      const open = !win.body.querySelector('[data-thumb-panel]')?.hidden;
      render(); const panel = win.body.querySelector('[data-thumb-panel]'); if (panel && open) panel.hidden = false;
      return;
    }
    if (await dossier.onClick(event)) return;
    const unlink = t.closest('[data-unlink]');
    if (unlink) { editLinks(state.selected, list => list.filter((_, i) => i !== Number(unlink.dataset.unlink))); return; }
    if (t.closest('[data-link-char]')) { await linkToCharacter(); return; }
    const loreOpen = t.closest('[data-lore-open]');
    if (loreOpen) { shared.loreEditor?.open(loreOpen.dataset.loreOpen); return; }
    if (t.closest('[data-lore-link]')) { await pickLore(); return; }
    if (t.closest('[data-lore-unlink]')) { setLore(state.selected, ''); return; }
    const saveBtn = t.closest('[data-ms-save]');
    if (saveBtn) {
      saveBtn.disabled = true; const label = saveBtn.textContent; saveBtn.textContent = 'Сохраняю';
      try {
        if (!shared.saveAndVerify) throw new Error('защита вкладок не запущена');
        const r = await shared.saveAndVerify();
        if (r.ok) globalThis.toastr?.success?.('Сохранено на сервере: маски, анкеты и настройки.', 'Колизей');
        else globalThis.toastr?.error?.(`Запись не дошла: ${r.missing.slice(0, 4).join(', ')}. Скорее всего, открыта старая вкладка Таверны, закрой её и нажми снова.`, 'Колизей', { timeOut: 15000 });
      } catch (error) { report('кнопка «Сохранить»', error); globalThis.toastr?.error?.('Не удалось сохранить. Подробности в консоли.', 'Колизей'); }
      saveBtn.disabled = false; saveBtn.textContent = label;
      return;
    }
    const native = t.closest('[data-native]');
    if (native) {
      // родные кнопки действуют на надетую маску, поэтому сначала надеваем выбранную
      if (native.dataset.native !== '#create_dummy_persona' && state.selected !== activeId()) await choose(state.selected);
      const button = doc.querySelector(native.dataset.native);
      const $j = jq();
      if (button) { if ($j) $j(button).trigger('click'); else button.click(); } else report('родная кнопка', new Error(native.dataset.native));
      setTimeout(render, 600);
    }
  });
  win.body.addEventListener('input', event => {
    if (event.target === search) { state.query = search.value.trim().toLowerCase(); renderCards(list()); return; }
    const slider = event.target.closest?.('[data-thumb]');
    if (slider) {
      const t = setThumb(state.selected, { [slider.dataset.thumb]: slider.value });
      const prev = win.body.querySelector('[data-thumb-prev]');
      if (prev) prev.setAttribute('style', thumbStyle(thumb(state.selected), t));
      const out = win.body.querySelector(`[data-thumb-out="${slider.dataset.thumb}"]`);
      if (out) out.textContent = `${t[slider.dataset.thumb]}${slider.dataset.thumb === 'zoom' ? '%' : ''}`;
      return;
    }
    if (dossier.onInput(event)) return;
    if (event.target.matches('[data-desc]')) {
      if (state.selected !== activeId()) return;
      const area = doc.getElementById('persona_description');
      if (area) { area.value = event.target.value; area.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });
  win.body.addEventListener('error', event => {
    const img = event.target;
    if (img.tagName === 'IMG' && img.dataset.fallback !== undefined) img.replaceWith(Object.assign(doc.createElement('span'), { className: 'col-initials', textContent: initials(img.dataset.fallback) }));
  }, true);
  // описание нельзя править у маски, которая не надета: сообщаем об этом в подсказке
  win.body.addEventListener('focusin', event => {
    if (event.target.matches('[data-desc]') && state.selected !== activeId()) event.target.title = 'Описание правится у надетой маски: сначала нажми «Надеть».';
  });

  // пока курсор в поле левой колонки, не перерисовываем её: иначе набор текста прерывается
  const rerender = debounce(() => { const a = doc.activeElement; if (a && a.matches?.('input,textarea') && a.closest('.col-me-pane')) return; render(); }, 200);
  const observer = new view.MutationObserver(rerender);
  const block = doc.getElementById('user_avatar_block');
  if (block) observer.observe(block, { childList: true, attributes: true, subtree: true, attributeFilter: ['class'] });
  undo.push(() => observer.disconnect());
  const onWindows = () => { if (win.isOpen) render(); };
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => shared.bus.removeEventListener('windows', onWindows));
  state.selected = activeId();
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат масок', error); } } };
}
