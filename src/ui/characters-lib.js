/**
 * Пантеон: библиотека персонажей. Слева выбранный (арка с портретом, имя, теги, описание), справа фильтры, поиск и карточки.
 * Список берётся из данных Таверны, а редактор карточки остаётся РОДНЫМ: кнопка «Править карточку» открывает прямо в окне родную
 * форму Таверны (имя, описание, первое сообщение, расширенные настройки, промпты, лорбук, избранное, дублировать, экспорт, удалить),
 * чтобы все её возможности были на месте. Родная форма работает только с выбранным персонажем, поэтому правка выбирает его
 * так же, как Таверна (открывается его чат).
 */
import { report } from '../core/guard.js';
import { debounce, esc, initials } from './kit.js';

const FILTERS = [{ id: 'all', title: 'Все' }, { id: 'chats', title: 'С чатами' }, { id: 'fav', title: 'Избранные' }];

export async function startCharactersLib(doc, { shared }) {
  const win = shared.windows?.get('chars');
  if (!win) { report('пантеон', new Error('нет окна')); return () => {}; }
  const view = doc.defaultView;
  const undo = [];
  const ctx = () => globalThis.SillyTavern.getContext();
  const jq = () => view.jQuery ?? globalThis.jQuery;
  const press = el => { const $ = jq(); if ($ && el) $(el).trigger('click'); else el?.click(); };
  const state = { sel: '', filter: 'all', query: '', mode: 'list', holder: null };

  win.body.innerHTML = `<div class="col-lib col-chars">
    <section class="col-me-pane" data-r="me"></section>
    <section class="col-lib-main">
      <div data-r="listview" class="col-lib-main-in">
        <div class="col-fpills" data-r="pills"></div>
        <div class="col-lib-bar"><label class="col-search"><input class="col-input" type="search" placeholder="имя, тег, автор…"></label>
          <button type="button" class="col-btn" data-act="add">Добавить</button>
          <button type="button" class="col-btn" data-act="import">Импорт</button></div>
        <div class="col-cards" data-r="cards"></div>
      </div>
      <div data-r="editview" class="col-lib-main-in" hidden>
        <div class="col-edit-bar"><button type="button" class="col-btn" data-act="back">← К списку</button><span class="col-edit-name" data-r="editname"></span></div>
        <div class="col-ch-slot" data-r="slot"></div>
      </div>
    </section></div>`;
  const $ = sel => win.body.querySelector(`[data-r="${sel}"]`);
  const search = win.body.querySelector('input[type="search"]');

  /* ───────── данные ───────── */
  const list = () => (ctx().characters ?? []).map((c, index) => ({
    index, name: c.name ?? '?', avatar: c.avatar, desc: String(c.description ?? '').trim(), note: String(c.creatorcomment ?? c.data?.creator_notes ?? '').trim(),
    author: c.data?.creator ?? '', fav: c.fav === true || c.fav === 'true' || !!c.data?.extensions?.fav, hasChat: Number(c.date_last_chat) > 0 || Number(c.chat_size) > 0,
    tags: (ctx().tagMap?.[c.avatar] ?? []).map(id => (ctx().tags ?? []).find(t => t.id === id)?.name).filter(Boolean),
  }));
  const thumb = avatar => { try { return ctx().getThumbnailUrl?.('avatar', avatar) ?? ''; } catch { return ''; } };
  const activeAvatar = () => { const id = ctx().characterId; return id === undefined || id === null ? '' : ctx().characters?.[id]?.avatar ?? ''; };
  const pic = (c, cls) => `<div class="${cls}"><img src="${esc(thumb(c.avatar))}" alt="" data-fallback="${esc(c.name)}"></div>`;

  /* ───────── отрисовка ───────── */
  const renderPills = all => {
    $('pills').innerHTML = FILTERS.map(f => {
      const n = f.id === 'all' ? all.length : f.id === 'fav' ? all.filter(c => c.fav).length : all.filter(c => c.hasChat).length;
      return `<button type="button" class="col-fp${state.filter === f.id ? ' on' : ''}" data-f="${f.id}">${esc(f.title)}<small>${n}</small></button>`;
    }).join('');
  };
  const renderCards = all => {
    const q = state.query;
    const shown = all.filter(c => (state.filter === 'all' || (state.filter === 'fav' ? c.fav : c.hasChat)) && (!q || `${c.name} ${c.author} ${c.tags.join(' ')} ${c.desc}`.toLowerCase().includes(q)));
    const act = activeAvatar();
    $('cards').innerHTML = shown.length ? shown.map(c => `<article class="col-card${c.avatar === state.sel ? ' sel' : ''}" data-av="${esc(c.avatar)}">
      ${pic(c, 'col-card-pic arch')}<b>${esc(c.name)}</b>${c.fav ? '<small class="fav">★ избранный</small>' : ''}${c.avatar === act ? '<small>сейчас открыт</small>' : ''}</article>`).join('')
      : `<p class="col-empty">${all.length ? 'Ничего не найдено.' : 'Персонажей пока нет. Нажми «Добавить» или «Импорт».'}</p>`;
  };
  const renderMe = all => {
    const me = all.find(c => c.avatar === state.sel) ?? all[0];
    const box = $('me');
    if (!me) { box.innerHTML = '<p class="col-empty">Персонажей пока нет.</p>'; return; }
    state.sel = me.avatar;
    box.innerHTML = `<div class="col-me-big">${pic(me, 'col-me-pic arch')}</div>
      <h3 class="col-me-name">${esc(me.name)}</h3>
      <p class="col-me-title">${esc(me.author ? `автор: ${me.author}` : me.fav ? 'избранный' : 'персонаж')}</p>
      ${me.tags.length ? `<div class="col-tagrow">${me.tags.slice(0, 8).map(t => `<span class="col-chip">${esc(t)}</span>`).join('')}</div>` : ''}
      <h4>Описание</h4><div class="col-me-text">${esc(me.desc || me.note || 'Описания нет.')}</div>
      <div class="col-btnrow col-center"><button type="button" class="col-btn col-primary" data-act="open">Открыть чат</button>
        <button type="button" class="col-btn" data-act="newchat">Новый чат</button>
        <button type="button" class="col-btn" data-act="edit">Править карточку</button>
        <button type="button" class="col-btn" data-act="chats">Все чаты</button></div>`;
  };
  const render = () => {
    const all = list();
    renderPills(all); renderCards(all); renderMe(all);
    $('listview').hidden = state.mode !== 'list';
    $('editview').hidden = state.mode !== 'edit';
  };

  /* ───────── родной редактор ───────── */
  const block = () => doc.getElementById('rm_ch_create_block');
  const release = () => {
    if (!state.holder) return;
    const { node, parent, next } = state.holder;
    node.classList.remove('col-ch-editor', 'col-moved');
    parent?.insertBefore(node, next?.parentNode === parent ? next : null);
    state.holder = null;
  };
  undo.push(release);
  const adopt = () => {
    const node = block();
    if (!node) { report('редактор персонажа', new Error('нет #rm_ch_create_block')); return false; }
    if (node.parentElement !== $('slot')) {
      state.holder = { node, parent: node.parentElement, next: node.nextSibling };
      node.classList.add('col-ch-editor', 'col-moved');
      $('slot').append(node);
    }
    return true;
  };
  const showEditor = name => { state.mode = 'edit'; $('editname').textContent = name ?? ''; render(); adopt(); };
  const backToList = () => { release(); state.mode = 'list'; render(); };

  /** Выбирает персонажа как Таверна (она при этом открывает его чат); если он уже выбран, просто показывает форму. */
  const selectNative = async index => {
    const c = ctx();
    await c.selectCharacterById(index);
    // смена персонажа только грузит чат: повторный вызов уже выбранного заполняет родную форму
    await new Promise(r => setTimeout(r, 400));
    if (String(ctx().characterId) === String(index)) await ctx().selectCharacterById(index);
  };

  win.body.addEventListener('click', async event => {
    const t = event.target;
    const pill = t.closest('[data-f]');
    if (pill) { state.filter = pill.dataset.f; render(); return; }
    const card = t.closest('.col-card');
    if (card) { state.sel = card.dataset.av; render(); return; }
    const act = t.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const me = list().find(c => c.avatar === state.sel);
    try {
      if (act === 'back') backToList();
      else if (act === 'open' && me) { await ctx().selectCharacterById(me.index); win.close(); }
      else if (act === 'newchat' && me) {
        // родное действие Таверны «Начать новый чат» работает с выбранным персонажем; окно закрываем, чтобы не мешало её вопросу
        if (String(ctx().characterId) !== String(me.index)) { await ctx().selectCharacterById(me.index); await new Promise(r => setTimeout(r, 400)); }
        win.close();
        press(doc.getElementById('option_start_new_chat'));
      }
      else if (act === 'edit' && me) { await selectNative(me.index); showEditor(me.name); }
      else if (act === 'chats' && me) {
        await selectNative(me.index);
        press(doc.getElementById('option_select_chat'));
      } else if (act === 'add') { press(doc.getElementById('rm_button_create')); showEditor('Новый персонаж'); }
      else if (act === 'import') press(doc.getElementById('character_import_button'));
    } catch (error) { report('действие в пантеоне', error); globalThis.toastr?.error?.('Не удалось выполнить действие. Подробности в консоли.', 'Колизей'); }
  });
  search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); renderCards(list()); });
  win.body.addEventListener('error', event => {
    const img = event.target;
    if (img.tagName === 'IMG' && img.dataset.fallback !== undefined) img.replaceWith(Object.assign(doc.createElement('span'), { className: 'col-initials', textContent: initials(img.dataset.fallback) }));
  }, true);

  /* ───────── слежение ───────── */
  const types = ctx().eventTypes ?? {};
  const rerender = debounce(() => { if (state.mode === 'list') render(); else renderCards(list()); }, 250);
  for (const name of ['CHAT_CHANGED', 'CHARACTER_PAGE_LOADED', 'SETTINGS_UPDATED', 'APP_READY']) {
    const type = types[name];
    if (!type || !ctx().eventSource?.on) continue;
    ctx().eventSource.on(type, rerender);
    undo.push(() => ctx().eventSource.removeListener?.(type, rerender));
  }
  const grid = doc.getElementById('rm_print_characters_block');
  if (grid) { const observer = new view.MutationObserver(rerender); observer.observe(grid, { childList: true }); undo.push(() => observer.disconnect()); }
  const onWindows = () => { if (!win.isOpen) { if (state.mode === 'edit') backToList(); } else render(); };
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => shared.bus.removeEventListener('windows', onWindows));

  state.sel = activeAvatar() || list()[0]?.avatar || '';
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат пантеона', error); } } };
}
