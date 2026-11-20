/**
 * Александрия: библиотека лорбуков. Слева ниши (свои папки) и фильтр «включены глобально», сверху поиск, «Создать» и «Импорт»,
 * ниже книги. Книга включается глобально закладкой, правится в окне-свитке, переносится в нишу, экспортируется и удаляется.
 * Данные и действия берутся из модуля лорбуков самой Таверны, поэтому остальной интерфейс Таверны видит изменения.
 */
import { report } from '../core/guard.js';
import { ask, debounce, download, esc } from './kit.js';

export async function startLoreLib(doc, { settings, save, shared }) {
  const win = shared.windows?.get('lore');
  if (!win) { report('александрия', new Error('нет окна')); return () => {}; }
  const view = doc.defaultView;
  const undo = [];
  let wi;
  try { wi = await import('/scripts/world-info.js'); } catch (error) { report('александрия: модуль лорбуков', error); return () => {}; }
  const ctx = () => globalThis.SillyTavern.getContext();
  const jq = () => view.jQuery ?? globalThis.jQuery;

  settings.niches ??= { list: [], map: {} };
  const niches = settings.niches;
  const state = { filter: 'all', query: '', counts: new Map(), drag: '', dragN: '' };

  win.body.innerHTML = `<div class="col-lib col-lore">
    <nav class="col-lib-side"><h4>Ниши</h4><div data-r="niches"></div></nav>
    <section class="col-lib-main">
      <div class="col-lib-bar"><label class="col-search"><input class="col-input" type="search" placeholder="найти лорбук…"></label>
        <button type="button" class="col-btn" data-act="create">Создать</button>
        <button type="button" class="col-btn" data-act="import">Импорт</button>
        <button type="button" class="col-btn" data-act="wiset" title="Глубина сканирования, бюджет, рекурсия">Настройки активации</button><input type="file" accept=".json,.png" multiple hidden data-r="file"></div>
      <h3 class="col-lib-title" data-r="title">Все лорбуки</h3>
      <div class="col-books" data-r="books"></div></section></div>`;
  const $ = sel => win.body.querySelector(`[data-r="${sel}"]`);
  const search = win.body.querySelector('input[type="search"]');

  const names = () => (typeof ctx().getWorldInfoNames === 'function' ? ctx().getWorldInfoNames() : []);
  const globals = () => new Set(Array.isArray(wi.selected_world_info) ? wi.selected_world_info : []);
  const nicheOf = name => niches.map[name] ?? '';
  // вложенные ниши: у ниши может быть parent (id другой ниши)
  const nicheById = id => niches.list.find(n => n.id === id);
  const parentOf = n => (n.parent && n.parent !== n.id && nicheById(n.parent) ? n.parent : '');
  /** Ниши деревом в порядке обхода: [{ n, depth }] */
  const tree = () => {
    const out = [], seen = new Set();
    const walk = (parent, depth) => niches.list.filter(n => parentOf(n) === parent).forEach(n => { if (seen.has(n.id)) return; seen.add(n.id); out.push({ n, depth }); walk(n.id, depth + 1); });
    walk('', 0);
    niches.list.filter(n => !seen.has(n.id)).forEach(n => out.push({ n, depth: 0 })); // защита от повреждённых связей
    return out;
  };
  /** id ниши и всех вложенных в неё */
  const within = id => { const set = new Set([id]); let grew = true; while (grew) { grew = false; for (const n of niches.list) if (!set.has(n.id) && set.has(parentOf(n))) { set.add(n.id); grew = true; } } return set; };
  const pathOf = id => { const parts = []; for (let n = nicheById(id), i = 0; n && i < 20; n = nicheById(parentOf(n)), i++) parts.unshift(n.name); return parts.join(' / '); };
  const nicheLabel = ({ n, depth }) => `${'— '.repeat(depth)}${n.name}`;

  const countOf = async name => {
    if (state.counts.has(name)) return;
    state.counts.set(name, null);
    try {
      const data = await ctx().loadWorldInfo(name);
      state.counts.set(name, Object.keys(data?.entries ?? {}).length);
    } catch { state.counts.set(name, 0); }
    renderBooks();
  };

  const pluralize = n => { const l = n % 10, t = n % 100; return l === 1 && t !== 11 ? 'запись' : l >= 2 && l <= 4 && (t < 12 || t > 14) ? 'записи' : 'записей'; };

  const renderNiches = () => {
    const all = names(), g = globals();
    const rows = [
      { id: 'all', title: 'Все', count: all.length },
      { id: 'global', title: 'Включены глобально', count: all.filter(n => g.has(n)).length },
      ...tree().map(({ n, depth }) => ({ id: n.id, title: n.name, depth, count: all.filter(b => within(n.id).has(nicheOf(b))).length, own: true })),
      { id: 'none', title: 'Без ниши', count: all.filter(b => !nicheOf(b)).length },
    ];
    $('niches').innerHTML = rows.map(r => `<a class="col-side-it${state.filter === r.id ? ' on' : ''}" data-f="${esc(r.id)}"${r.own ? ' draggable="true"' : ''}${r.depth ? ` style="padding-left:${12 + r.depth * 18}px"` : ''}><span class="col-side-t">${esc(r.title)}</span>${r.own ? `<b class="col-side-add" data-sub="${esc(r.id)}" title="Создать вложенную нишу">＋</b>` : ''}<small>${r.count}</small></a>`).join('')
      + '<a class="col-side-it col-side-new" data-act="niche">＋ Новая ниша</a>';
  };

  const renderBooks = () => {
    const all = names(), g = globals();
    const shown = all.filter(n => {
      if (state.filter === 'global' && !g.has(n)) return false;
      if (state.filter === 'none' && nicheOf(n)) return false;
      if (!['all', 'global', 'none'].includes(state.filter) && !within(state.filter).has(nicheOf(n))) return false;
      return !state.query || n.toLowerCase().includes(state.query);
    });
    const rows = [{ id: 'all', title: 'Все лорбуки' }, { id: 'global', title: 'Включены глобально' }, { id: 'none', title: 'Без ниши' }, ...niches.list.map(n => ({ id: n.id, title: pathOf(n.id) }))];
    $('title').textContent = rows.find(r => r.id === state.filter)?.title ?? 'Все лорбуки';
    $('books').innerHTML = shown.length ? shown.map((n, i) => {
      const count = state.counts.get(n);
      if (count === undefined) countOf(n);
      return `<article class="col-book3 col-tone-${i % 3}${g.has(n) ? ' glob' : ''}" data-b="${esc(n)}" draggable="true">
        <button type="button" class="col-bookface" data-edit="${esc(n)}" title="Открыть свиток">
          <i class="col-spine"></i><i class="col-rib${g.has(n) ? ' on' : ''}" data-glob="${esc(n)}" title="${g.has(n) ? 'Включён глобально: нажми, чтобы выключить' : 'Нажми, чтобы включить глобально'}"></i>
          <i class="col-orn">❖</i><span class="col-bt">${esc(n)}</span><small>${typeof count === 'number' ? `${count} ${pluralize(count)}` : '…'}</small></button>
        <label class="col-sw col-bookglob" title="${g.has(n) ? 'Включён для всех чатов' : 'Включить для всех чатов'}"><input type="checkbox" data-glob="${esc(n)}"${g.has(n) ? ' checked' : ''}><i></i><span>${g.has(n) ? 'Включён' : 'Выключен'}</span></label>
        <div class="col-bookact"><button type="button" class="col-icon" data-edit="${esc(n)}" title="Править">✎</button><button type="button" class="col-icon" data-links="${esc(n)}" title="Связи: персонажи, чат, маски"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/></svg></button><button type="button" class="col-icon" data-move="${esc(n)}" title="В нишу">⌂</button><button type="button" class="col-icon" data-export="${esc(n)}" title="Экспорт">⤓</button><button type="button" class="col-icon" data-drop="${esc(n)}" title="Удалить">×</button></div></article>`;
    }).join('') : `<p class="col-empty">${all.length ? 'Ничего не найдено.' : 'Лорбуков пока нет. Нажми «Создать».'}</p>`;
  };
  const render = () => { renderNiches(); renderBooks(); };

  const setGlobal = name => {
    const $j = jq(), select = doc.getElementById('world_info');
    if (!$j || !select) { report('глобальный лорбук', new Error('нет родного списка')); return; }
    const index = names().indexOf(name);
    const current = new Set($j(select).val() ?? []);
    const key = String(index);
    if (current.has(key)) current.delete(key); else current.add(key);
    $j(select).val([...current]).trigger('change');
    setTimeout(render, 300);
  };


  /* ───────── связи книги: где она подключена и как привязать ───────── */
  const baseName = avatar => String(avatar ?? '').replace(/\.[^/.]+$/, '');
  const linksDialog = async name => {
    let ext;
    try { ext = await import('/scripts/extensions.js'); } catch (error) { report('связи: модуль расширений', error); return; }
    const shade = doc.createElement('div');
    shade.className = 'col-ask';
    win.el.append(shade);
    const chatOpen = () => { const c = ctx(); return !!(c.chatId && (c.characterId !== undefined || c.groupId)); };
    const gather = () => {
      const c = ctx(), chars = (c.characters ?? []).map((ch, index) => ({ ch, index }));
      const charLore = Array.isArray(wi.world_info?.charLore) ? wi.world_info.charLore : [];
      const files = charLore.filter(l => (l.extraBooks ?? []).includes(name)).map(l => l.name);
      const power = c.powerUserSettings ?? {};
      return {
        glob: globals().has(name),
        chatOk: chatOpen(), chatBound: c.chatMetadata?.[wi.METADATA_KEY] === name, chatTitle: c.chatId ?? '',
        primary: chars.filter(x => x.ch.data?.extensions?.world === name),
        extra: chars.filter(x => files.includes(baseName(x.ch.avatar))),
        personas: Object.entries(power.persona_descriptions ?? {}).filter(([, d]) => d?.lorebook === name).map(([id]) => power.personas?.[id] ?? id),
      };
    };
    const rowsOf = (list, act) => list.length ? list.map(x => `<div class="col-link-row"><span>${esc(x.ch.name)}</span><button type="button" class="col-icon" data-${act}="${x.index}" title="Отвязать">×</button></div>`).join('') : '<p class="col-note">никого</p>';
    const draw = () => {
      const g = gather();
      shade.innerHTML = `<div class="col-ask-box col-links" role="dialog" aria-label="Связи">
        <h4>Связи: «${esc(name)}»</h4>
        <div class="col-link-sec"><b>Глобально</b><span>${g.glob ? 'включён для всех чатов' : 'не включён'}</span><button type="button" class="col-btn" data-glob>${g.glob ? 'Выключить' : 'Включить'}</button></div>
        <div class="col-link-sec"><b>Этот чат</b><span>${g.chatOk ? (g.chatBound ? 'привязан к чату' : 'не привязан') : 'чат не открыт'}</span>${g.chatOk ? `<button type="button" class="col-btn" data-chat>${g.chatBound ? 'Отвязать' : 'Привязать'}</button>` : ''}</div>
        <div class="col-link-sec col-link-col"><b>Основной лорбук персонажей</b>${rowsOf(g.primary, 'unp')}<button type="button" class="col-btn" data-addp>＋ Персонажу</button></div>
        <div class="col-link-sec col-link-col"><b>Дополнительный лорбук персонажей</b>${rowsOf(g.extra, 'unx')}<button type="button" class="col-btn" data-addx>＋ Персонажу</button></div>
        <div class="col-link-sec"><b>Маски</b><span>${g.personas.length ? esc(g.personas.join(', ')) : 'не привязан'}</span><span class="col-note">привязка в окне «Маски»</span></div>
        <div class="col-ask-btns"><button type="button" class="col-btn" data-close>Закрыть</button></div></div>`;
    };
    const pickChar = async title => {
      const chars = ctx().characters ?? [];
      if (!chars.length) return -1;
      const v = await ask(win.el, { title, options: chars.map((c, i) => ({ value: String(i), label: c.name })) });
      return v === null ? -1 : Number(v);
    };
    const close = () => { shade.remove(); render(); };
    shade.addEventListener('click', async event => {
      const t = event.target;
      if (t === shade || t.closest('[data-close]')) { close(); return; }
      const c = ctx();
      try {
        if (t.closest('[data-glob]')) setGlobal(name);
        else if (t.closest('[data-chat]')) {
          if (c.chatMetadata?.[wi.METADATA_KEY] === name) delete c.chatMetadata[wi.METADATA_KEY]; else c.chatMetadata[wi.METADATA_KEY] = name;
          await c.saveMetadata?.();
        } else if (t.closest('[data-unp]')) {
          await ext.writeExtensionField(Number(t.closest('[data-unp]').dataset.unp), 'world', '');
        } else if (t.closest('[data-addp]')) {
          const i = await pickChar('Основной лорбук для какого персонажа?');
          if (i >= 0) {
            await ext.writeExtensionField(i, 'world', name);
            if (String(c.characterId) === String(i)) { const sel = doc.getElementById('character_world'); if (sel) { const opt = [...sel.options].find(o => o.textContent.trim() === name); if (opt) sel.value = opt.value; } }
          }
        } else if (t.closest('[data-unx]')) {
          const ch = c.characters[Number(t.closest('[data-unx]').dataset.unx)], list = wi.world_info.charLore ?? [];
          const at = list.findIndex(l => l.name === baseName(ch.avatar));
          if (at >= 0) { list[at].extraBooks = (list[at].extraBooks ?? []).filter(b => b !== name); if (!list[at].extraBooks.length) list.splice(at, 1); }
          c.saveSettingsDebounced?.();
        } else if (t.closest('[data-addx]')) {
          const i = await pickChar('Дополнительный лорбук для какого персонажа?');
          if (i >= 0) {
            const file = baseName(c.characters[i].avatar);
            wi.world_info.charLore ??= [];
            const entry = wi.world_info.charLore.find(l => l.name === file);
            if (entry) { entry.extraBooks = [...new Set([...(entry.extraBooks ?? []), name])]; } else wi.world_info.charLore.push({ name: file, extraBooks: [name] });
            c.saveSettingsDebounced?.();
          }
        }
      } catch (error) { report('связи лорбука', error); globalThis.toastr?.error?.('Не удалось изменить связь. Подробности в консоли.', 'Колизей'); }
      setTimeout(draw, 250);
    });
    draw();
  };

  shared.loreLib = { openLinks: name => { win.open(); return linksDialog(name); }, isGlobal: name => globals().has(name), toggleGlobal: name => { setGlobal(name); } };
  undo.push(() => { delete shared.loreLib; });
  win.body.addEventListener('click', async event => {
    const t = event.target;
    const linkBtn = t.closest('[data-links]');
    if (linkBtn) { await linksDialog(linkBtn.dataset.links); return; }
    const glob = t.closest('[data-glob]');
    if (glob) { event.stopPropagation(); setGlobal(glob.dataset.glob); return; }
    const edit = t.closest('[data-edit]');
    if (edit) { shared.loreEditor?.open(edit.dataset.edit); return; }
    const sub = t.closest('[data-sub]');
    if (sub) {
      event.stopPropagation();
      const parent = sub.dataset.sub;
      const name = await ask(win.el, { title: `Новая ниша внутри «${nicheById(parent)?.name ?? ''}»`, input: 'название', ok: 'Создать' });
      if (name) { niches.list.push({ id: `n${Date.now().toString(36)}`, name, parent }); save(); render(); }
      return;
    }
    const filter = t.closest('[data-f]');
    if (filter) { state.filter = filter.dataset.f; render(); return; }
    const move = t.closest('[data-move]');
    if (move) {
      const options = [{ value: '', label: 'Без ниши' }, ...tree().map(item => ({ value: item.n.id, label: nicheLabel(item) }))];
      const choice = await ask(win.el, { title: `«${move.dataset.move}»: в какую нишу?`, options });
      if (choice !== null) { if (choice) niches.map[move.dataset.move] = choice; else delete niches.map[move.dataset.move]; save(); render(); }
      return;
    }
    const exp = t.closest('[data-export]');
    if (exp) {
      try {
        const data = await ctx().loadWorldInfo(exp.dataset.export);
        download(doc, `${exp.dataset.export}.json`, data);
      } catch (error) { report('экспорт лорбука', error); }
      return;
    }
    const drop = t.closest('[data-drop]');
    if (drop) {
      if (await ask(win.el, { title: 'Удалить лорбук?', text: `«${drop.dataset.drop}» будет удалён вместе со всеми записями.`, ok: 'Удалить', danger: true })) {
        try { await wi.deleteWorldInfo(drop.dataset.drop); delete niches.map[drop.dataset.drop]; save(); } catch (error) { report('удаление лорбука', error); }
        render();
      }
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'create') {
      const name = await ask(win.el, { title: 'Новый лорбук', input: 'название', ok: 'Создать' });
      if (name) { try { await wi.createNewWorldInfo(name); } catch (error) { report('создание лорбука', error); } render(); }
    } else if (act === 'wiset') {
      shared.windows?.open('wiset');
    } else if (act === 'import') {
      $('file').click();
    } else if (act === 'niche') {
      const name = await ask(win.el, { title: 'Новая ниша', input: 'название', ok: 'Создать' });
      if (name) { niches.list.push({ id: `n${Date.now().toString(36)}`, name }); save(); render(); }
    }
  });
  // перетаскивание книги на нишу: допустимы свои ниши и «Без ниши»
  const targetOf = el => {
    const item = el.closest?.('.col-side-it[data-f]');
    if (!item) return null;
    const f = item.dataset.f;
    if (state.dragN) return (f === 'all' ? !!parentOf(nicheById(state.dragN) ?? {}) : niches.list.some(n => n.id === f) && !within(state.dragN).has(f)) ? item : null; // нишу нельзя вложить в себя или в свою вложенную
    return f === 'none' || niches.list.some(n => n.id === f) ? item : null;
  };
  const clearDrop = () => { win.body.querySelectorAll('.drop-on').forEach(el => el.classList.remove('drop-on')); };
  win.body.addEventListener('dragstart', event => {
    const nicheEl = event.target.closest?.('.col-side-it[draggable]');
    if (nicheEl && !event.target.closest('.col-book3')) {
      state.dragN = nicheEl.dataset.f;
      event.dataTransfer?.setData('text/plain', state.dragN);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      win.body.querySelector('.col-lore')?.classList.add('book-drag');
      return;
    }
    const book = event.target.closest?.('.col-book3');
    if (!book) return;
    state.drag = book.dataset.b;
    book.classList.add('dragging');
    event.dataTransfer?.setData('text/plain', state.drag);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    win.body.querySelector('.col-lore')?.classList.add('book-drag');
  });
  win.body.addEventListener('dragover', event => {
    const item = (state.drag || state.dragN) && targetOf(event.target);
    if (!item) return;
    event.preventDefault();
    clearDrop();
    item.classList.add('drop-on');
  });
  win.body.addEventListener('dragleave', event => { if (!win.body.contains(event.relatedTarget) || !targetOf(event.relatedTarget ?? doc.body)) clearDrop(); });
  win.body.addEventListener('drop', event => {
    const item = (state.drag || state.dragN) && targetOf(event.target);
    if (!item) return;
    event.preventDefault();
    if (state.dragN) {
      const moving = nicheById(state.dragN);
      if (moving) { if (item.dataset.f === 'all') delete moving.parent; else moving.parent = item.dataset.f; }
      state.dragN = '';
      save(); render();
      return;
    }
    if (item.dataset.f === 'none') delete niches.map[state.drag]; else niches.map[state.drag] = item.dataset.f;
    state.drag = '';
    save(); render();
  });
  win.body.addEventListener('dragend', () => {
    state.drag = ''; state.dragN = '';
    clearDrop();
    win.body.querySelector('.col-lore')?.classList.remove('book-drag');
    win.body.querySelectorAll('.col-book3.dragging').forEach(el => el.classList.remove('dragging'));
  });

  $('file').addEventListener('change', async event => {
    for (const file of event.target.files) { try { await wi.importWorldInfo(file); } catch (error) { report('импорт лорбука', error); } }
    event.target.value = '';
    setTimeout(render, 500);
  });
  search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); renderBooks(); });

  // список и глобальные книги меняет родной код: следим за их списками
  const rerender = debounce(render, 150);
  const observer = new view.MutationObserver(rerender);
  for (const id of ['world_info', 'world_editor_select']) { const el = doc.getElementById(id); if (el) observer.observe(el, { childList: true, attributes: true, subtree: true }); }
  undo.push(() => observer.disconnect());
  const onWindows = () => { if (win.isOpen) { state.counts.clear(); render(); } };
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => shared.bus.removeEventListener('windows', onWindows));
  shared.bus.addEventListener('lore', rerender);
  undo.push(() => shared.bus.removeEventListener('lore', rerender));
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат александрии', error); } } };
}
