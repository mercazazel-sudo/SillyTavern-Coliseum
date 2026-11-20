/**
 * Свиток лорбука: редактор записей. Слева записи с поиском, значком режима и точкой включения; справа поля записи:
 * название, режим срабатывания, ключи, логика и вторичные ключи («пометы на полях»), текст со счётчиком токенов,
 * параметры вставки (позиция, глубина, роль, порядок, вероятность, группа) и «тонкие настройки» (регистр, целые слова,
 * глубина сканирования, липкость, перезарядка, задержка, рекурсия, бюджет, где ещё искать ключи, фильтр персонажей).
 * Поля записи совпадают с полями родного редактора Таверны, неизвестные поля сохраняются как есть.
 * Сохранение само, через секунду после правки, средствами Таверны (saveWorldInfo).
 */
import { report } from '../core/guard.js';
import { ask, debounce, esc } from './kit.js';

const POSITIONS = [
  [0, 'Перед описанием персонажа'], [1, 'После описания персонажа'], [2, 'Заметка автора: сверху'], [3, 'Заметка автора: снизу'],
  [4, 'На глубине в чате'], [5, 'Примеры диалога: сверху'], [6, 'Примеры диалога: снизу'], [7, 'В «выход» (outlet)'],
];
const LOGIC = [[0, 'любой из них'], [3, 'все они'], [1, 'не все'], [2, 'ни один']];
const ROLES = [[0, 'Система'], [1, 'Пользователь'], [2, 'Ассистент']];
const TRI = [['', 'как в общих настройках'], ['1', 'да'], ['0', 'нет']];
const MATCH = [
  ['matchCharacterDescription', 'описании персонажа'], ['matchCharacterPersonality', 'характере персонажа'], ['matchScenario', 'сценарии'],
  ['matchCharacterDepthPrompt', 'заметке персонажа на глубине'], ['matchCreatorNotes', 'заметках автора'], ['matchPersonaDescription', 'описании маски'],
];

const modeOf = e => (e.constant ? 'always' : e.vectorized ? 'vector' : 'keys');
const MODE_TITLE = { keys: 'по ключам', always: 'всегда', vector: 'по смыслу' };
const MODE_MARK = { keys: 'К', always: '∞', vector: '≈' };
const tri = v => (v === null || v === undefined ? '' : v ? '1' : '0');

export async function startLoreEditor(doc, { shared }) {
  const win = shared.windows?.get('loreedit');
  if (!win) { report('свиток', new Error('нет окна')); return () => {}; }
  const undo = [];
  let wi;
  try { wi = await import('/scripts/world-info.js'); } catch (error) { report('свиток: модуль лорбуков', error); return () => {}; }
  const ctx = () => globalThis.SillyTavern.getContext();
  const state = { book: '', data: null, uid: null, query: '', status: '', fine: false };

  win.body.innerHTML = `<div class="col-edit">
    <aside class="col-edit-side">
      <div class="col-edit-book"><label class="col-sw" title="Лорбук работает во всех чатах"><input type="checkbox" data-bookglob><i></i><span>Глобально</span></label>
        <button type="button" class="col-btn" data-act="links" title="Персонажи, чат и маски, к которым привязана книга">Связи</button></div>
      <label class="col-search"><input class="col-input" type="search" placeholder="поиск записи"></label>
      <div class="col-edit-bulk"><button type="button" class="col-btn" data-act="allon">Все вкл</button><button type="button" class="col-btn" data-act="alloff">Все выкл</button></div>
      <div class="col-edit-list" data-r="list"></div>
      <button type="button" class="col-btn" data-act="new">＋ Запись</button></aside>
    <section class="col-edit-main" data-r="main"></section></div>`;
  const $ = sel => win.body.querySelector(`[data-r="${sel}"]`);
  const search = win.body.querySelector('input[type="search"]');
  const entries = () => Object.values(state.data?.entries ?? {}).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.uid - b.uid);
  const current = () => state.data?.entries?.[state.uid] ?? null;
  const titleOf = e => (e.comment || (Array.isArray(e.key) ? e.key.join(', ') : '') || `Запись ${e.uid}`);

  const setStatus = text => { state.status = text; const el = win.body.querySelector('[data-r="status"]'); if (el) el.textContent = text; };
  const flush = async () => {
    if (!state.data || !state.book) return;
    try { await ctx().saveWorldInfo(state.book, state.data, true); setStatus('сохранено'); shared.bus.dispatchEvent(new Event('lore')); }
    catch (error) { report('сохранение лорбука', error); setStatus('не удалось сохранить'); }
  };
  const saveSoon = debounce(flush, 1000);
  const touch = () => { setStatus('правлю…'); saveSoon(); };

  const tokens = debounce(async () => {
    const e = current(), el = win.body.querySelector('[data-r="tok"]');
    if (!e || !el) return;
    try { const n = await ctx().getTokenCountAsync?.(String(e.content ?? '')); el.textContent = typeof n === 'number' ? `≈ ${n} ток.` : ''; } catch { el.textContent = ''; }
  }, 400);

  const renderList = () => {
    const q = state.query;
    const shown = entries().filter(e => !q || `${titleOf(e)} ${(e.key ?? []).join(' ')} ${e.content ?? ''}`.toLowerCase().includes(q));
    $('list').innerHTML = shown.length ? shown.map(e => { const m = modeOf(e); return `<div class="col-edit-row${e.uid === state.uid ? ' on' : ''}" data-u="${e.uid}" draggable="true" title="Перетащи, чтобы поменять порядок">
      <i class="col-dot${e.disable ? ' off' : ''}" data-dot="${e.uid}" title="${e.disable ? 'Выключена: нажми, чтобы включить' : 'Включена: нажми, чтобы выключить'}"></i>
      <b class="col-mode col-mode-${m}" title="Срабатывает ${MODE_TITLE[m]}">${MODE_MARK[m]}</b><span>${esc(titleOf(e))}</span></div>`; }).join('')
      : '<p class="col-empty">Записей нет.</p>';
  };
  const chips = (arr, kind) => `${(arr ?? []).map((k, i) => `<span class="col-chip${kind === 'sec' ? ' sec' : ''}">${esc(k)}<button type="button" data-rm="${kind}:${i}" title="Убрать">×</button></span>`).join('')}<input class="col-chip-in" data-add="${kind}" placeholder="ключ…">`;
  const opts = (list, value) => list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const num = (e, f, t = 'num', ph = '') => `<input class="col-input col-num" type="number" data-f="${f}" data-t="${t}" value="${e[f] ?? ''}" placeholder="${ph}">`;
  /** Фильтр персонажей хранится объектом characterFilter: names (имена файлов карточек), tags (id тегов), isExclude. */
  const baseName = a => String(a ?? '').replace(/\.[^/.]+$/, '');
  const charLabel = file => (ctx().characters ?? []).find(c => baseName(c.avatar) === file)?.name ?? file;
  const tagLabel = id => (ctx().tags ?? []).find(t => t.id === id)?.name ?? id;
  const filterChips = e => {
    const f = e.characterFilter ?? {};
    const names = (f.names ?? []).map((n, i) => `<span class="col-chip">${esc(charLabel(n))}<button type="button" data-cfrm="n:${i}" title="Убрать">×</button></span>`);
    const tagsHtml = (f.tags ?? []).map((t, i) => `<span class="col-chip sec"># ${esc(tagLabel(t))}<button type="button" data-cfrm="t:${i}" title="Убрать">×</button></span>`);
    return `${names.join('')}${tagsHtml.join('')}<button type="button" class="col-btn col-mini" data-cfadd="n">＋ Персонаж</button><button type="button" class="col-btn col-mini" data-cfadd="t">＋ Тег</button>${names.length + tagsHtml.length ? '' : '<span class="col-note">для всех персонажей</span>'}`;
  };
  const ensureFilter = e => (e.characterFilter ??= { isExclude: false, names: [], tags: [] });
  const check = (e, f, label) => `<label class="col-chk"><span class="col-check"><input type="checkbox" data-f="${f}" data-t="bool" ${e[f] ? 'checked' : ''}><i></i></span>${esc(label)}</label>`;

  const renderMain = () => {
    const e = current();
    const box = $('main');
    if (!state.book) { box.innerHTML = '<p class="col-empty">Выбери лорбук в Библиотеке, нажав на книгу.</p>'; return; }
    if (!e) { box.innerHTML = `<h3 class="col-dropcap">${esc(state.book)}</h3><p class="col-empty">В этом лорбуке пока нет записей. Нажми «＋ Запись».</p>`; return; }
    const m = modeOf(e), pos = Number(e.position ?? 0);
    box.innerHTML = `<label class="col-sw col-entry-sw"><input type="checkbox" data-entry-on${e.disable ? '' : ' checked'}><i></i><span>Запись включена</span></label>
      <h4>Название записи</h4><input class="col-input col-edit-title" data-f="comment" data-t="str" value="${esc(e.comment ?? '')}" placeholder="название">
      <h4>Когда срабатывает</h4>
      <div class="col-seg" data-r="mode">${['keys', 'always', 'vector'].map(k => `<button type="button" class="col-segb${m === k ? ' on' : ''}" data-mode="${k}">${{ keys: 'По ключам', always: 'Всегда', vector: 'По смыслу' }[k]}</button>`).join('')}</div>
      ${m === 'always' ? '<p class="col-note">Запись входит в запрос всегда, ключи не нужны.</p>' : m === 'vector' ? '<p class="col-note">Запись выбирается по смыслу (векторный поиск): нужен включённый Vector Storage.</p>' : ''}
      <div${m === 'keys' ? '' : ' hidden'} data-r="keys"><h4>Ключи</h4><div class="col-chips" data-chips="key">${chips(e.key, 'key')}</div>
        <h4>Пометы на полях · вторичные ключи</h4><div class="col-chips" data-chips="keysecondary">${chips(e.keysecondary, 'sec')}</div>
        <div class="col-frow col-logic"><label>Вторичные ключи должны совпасть</label><select class="col-input" data-f="selectiveLogic" data-t="int">${opts(LOGIC, e.selectiveLogic ?? 0)}</select></div></div>
      <h4>Текст</h4><textarea class="col-input col-edit-text" data-f="content" data-t="str" placeholder="что известно о…">${esc(e.content ?? '')}</textarea>
      <div class="col-edit-foot2"><span class="col-note" data-r="tok"></span></div>
      <h4>Куда вставляется</h4>
      <div class="col-grid2">
        <label>Позиция<select class="col-input" data-f="position" data-t="int" data-redraw>${opts(POSITIONS, pos)}</select></label>
        <label>Порядок<input class="col-input col-num" type="number" data-f="order" data-t="num" value="${e.order ?? 100}"></label>
        <label${pos === 4 ? '' : ' hidden'}>Глубина<input class="col-input col-num" type="number" data-f="depth" data-t="num" value="${e.depth ?? 4}"></label>
        <label${pos === 4 ? '' : ' hidden'}>Роль<select class="col-input" data-f="role" data-t="int">${opts(ROLES, e.role ?? 0)}</select></label>
        <label${pos === 7 ? '' : ' hidden'}>Название «выхода»<input class="col-input" data-f="outletName" data-t="str" value="${esc(e.outletName ?? '')}"></label>
        <label>Вероятность, %<input class="col-input col-num" type="number" min="0" max="100" data-f="probability" data-t="num" value="${e.probability ?? 100}"></label>
        <label>Группа<input class="col-input" data-f="group" data-t="str" value="${esc(e.group ?? '')}" placeholder="без группы"></label>
      </div>
      <button type="button" class="col-fine-toggle" data-fine>${state.fine ? '▾' : '▸'} Тонкие настройки</button>
      <div class="col-fine"${state.fine ? '' : ' hidden'}>
        <div class="col-grid2">
          <label>Учитывать регистр<select class="col-input" data-f="caseSensitive" data-t="tri">${opts(TRI, tri(e.caseSensitive))}</select></label>
          <label>Только целые слова<select class="col-input" data-f="matchWholeWords" data-t="tri">${opts(TRI, tri(e.matchWholeWords))}</select></label>
          <label>Счёт по группе<select class="col-input" data-f="useGroupScoring" data-t="tri">${opts(TRI, tri(e.useGroupScoring))}</select></label>
          <label>Глубина сканирования${num(e, 'scanDepth', 'nnum', 'общая')}</label>
          <label>Липкость, сообщений${num(e, 'sticky', 'nnum', 'нет')}</label>
          <label>Перезарядка, сообщений${num(e, 'cooldown', 'nnum', 'нет')}</label>
          <label>Задержка, сообщений${num(e, 'delay', 'nnum', 'нет')}</label>
          <label>Вес в группе${num(e, 'groupWeight', 'num', '100')}</label>
        </div>
        <div class="col-checks">${check(e, 'excludeRecursion', 'Не срабатывать от текста других записей')}${check(e, 'preventRecursion', 'Текст этой записи не запускает другие')}${check(e, 'ignoreBudget', 'Игнорировать бюджет')}${check(e, 'groupOverride', 'Приоритет в группе')}</div>
        <h4>Искать ключи ещё в</h4><div class="col-checks">${MATCH.map(([f, t]) => check(e, f, t)).join('')}</div>
        <h4>Только для персонажей и тегов</h4>
        <div class="col-chips" data-r="cfilter">${filterChips(e)}</div>
        <div class="col-checks"><label class="col-chk"><span class="col-check"><input type="checkbox" data-cfx ${e.characterFilter?.isExclude ? 'checked' : ''}><i></i></span>Наоборот: для всех, кроме выбранных</label></div>
      </div>
      <div class="col-edit-foot"><span class="col-saved" data-r="status">${esc(state.status || 'сохранено')}</span>
        <span><button type="button" class="col-btn" data-act="move">В другой лорбук</button> <button type="button" class="col-btn" data-act="dup">Дублировать</button> <button type="button" class="col-btn col-danger" data-act="del">Удалить запись</button></span></div>`;
    tokens();
  };
  const syncBook = () => { const cb = win.body.querySelector('[data-bookglob]'); if (cb) { cb.checked = !!shared.loreLib?.isGlobal?.(state.book); cb.disabled = !state.book; } };
  const render = () => { syncBook(); renderList(); renderMain(); win.el.querySelector('h2').textContent = state.book ? `Свиток · ${state.book}` : 'Свиток лорбука'; };

  const openBook = async (name, uid) => {
    await flush();
    try {
      state.data = await ctx().loadWorldInfo(name);
      state.book = name;
      state.uid = uid !== undefined && state.data?.entries?.[uid] ? Number(uid) : (entries()[0]?.uid ?? null);
      state.status = '';
    } catch (error) { report('открытие лорбука', error); globalThis.toastr?.error?.('Не удалось открыть лорбук.', 'Колизей'); return; }
    render();
    win.open();
  };

  /** Значение поля из элемента по его типу (data-t). */
  const valueOf = el => {
    switch (el.dataset.t) {
      case 'num': { const n = Number(el.value); return Number.isFinite(n) ? n : 0; }
      case 'nnum': return el.value === '' ? null : Number(el.value);
      case 'int': return Number(el.value);
      case 'tri': return el.value === '' ? null : el.value === '1';
      case 'bool': return el.checked;
      case 'list': return el.value.split(',').map(s => s.trim()).filter(Boolean);
      default: return el.value;
    }
  };
  const onField = event => {
    const e = current();
    if (event.target.matches?.('[data-cfx]') && e) { ensureFilter(e).isExclude = event.target.checked; touch(); return; }
    if (event.target === search) { state.query = search.value.trim().toLowerCase(); renderList(); return; }
    const el = event.target.closest?.('[data-f]');
    if (!el || !e) return;
    // текстовые поля правим по вводу, остальные по выбору
    if (event.type === 'input' && !['str', 'num', 'nnum', 'list'].includes(el.dataset.t)) return;
    if (event.type === 'change' && ['str'].includes(el.dataset.t)) return;
    e[el.dataset.f] = valueOf(el);
    if (el.dataset.f === 'comment') renderList();
    if (el.dataset.f === 'content') tokens();
    if (el.dataset.redraw !== undefined) { renderMain(); renderList(); }
    touch();
  };
  // перетаскивание записи в списке меняет её порядок (поле order): запись встаёт перед той, на которую её бросили
  const reorder = (uid, beforeUid) => {
    const list = entries().filter(e => e.uid !== uid), at = list.findIndex(e => e.uid === beforeUid);
    list.splice(at < 0 ? list.length : at, 0, state.data.entries[uid]);
    const i = list.findIndex(e => e.uid === uid), prev = list[i - 1]?.order, next = list[i + 1]?.order;
    const moved = list[i];
    if (prev === undefined && next !== undefined && next > 0) moved.order = next - 1;
    else if (next === undefined && prev !== undefined) moved.order = prev + 1;
    else if (prev !== undefined && next !== undefined && next - prev > 1) moved.order = Math.floor((prev + next) / 2);
    else if (prev === undefined && next === undefined) { /* единственная запись */ }
    else list.forEach((e, k) => { e.order = (k + 1) * 10; }); // зазора нет: перенумеровываем с шагом 10, относительный порядок сохраняется
  };
  let dragUid = null;
  win.body.addEventListener('dragstart', event => { const row = event.target.closest?.('.col-edit-row'); if (!row) return; dragUid = Number(row.dataset.u); row.classList.add('dragging'); event.dataTransfer?.setData('text/plain', String(dragUid)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
  win.body.addEventListener('dragover', event => { const row = event.target.closest?.('.col-edit-row'); if (!row || dragUid === null) return; event.preventDefault(); win.body.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before')); if (Number(row.dataset.u) !== dragUid) row.classList.add('drop-before'); });
  win.body.addEventListener('drop', event => {
    const row = event.target.closest?.('.col-edit-row');
    if (!row || dragUid === null || Number(row.dataset.u) === dragUid) return;
    event.preventDefault();
    reorder(dragUid, Number(row.dataset.u)); dragUid = null;
    render(); touch();
  });
  win.body.addEventListener('dragend', () => { dragUid = null; win.body.querySelectorAll('.dragging, .drop-before').forEach(el => el.classList.remove('dragging', 'drop-before')); });
  win.body.addEventListener('input', onField);
  win.body.addEventListener('change', onField);
  win.body.addEventListener('keydown', event => {
    const input = event.target.closest('[data-add]');
    const e = current();
    if (!input || !e) return;
    const prop = input.dataset.add === 'sec' ? 'keysecondary' : 'key';
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const value = input.value.trim().replace(/,$/, '');
      if (!value) return;
      e[prop] = [...(e[prop] ?? []), value];
      renderMain(); renderList(); touch();
      win.body.querySelector(`[data-add="${input.dataset.add}"]`)?.focus();
    } else if (event.key === 'Backspace' && !input.value && e[prop]?.length) {
      e[prop].pop(); renderMain(); renderList(); touch();
      win.body.querySelector(`[data-add="${input.dataset.add}"]`)?.focus();
    }
  });

  /** Копирует (или переносит) запись в другой лорбук. */
  const sendEntry = async () => {
    const src = current();
    if (!src) return;
    const books = ctx().getWorldInfoNames().filter(n => n !== state.book);
    if (!books.length) { globalThis.toastr?.info?.('Других лорбуков нет.', 'Колизей'); return; }
    const target = await ask(win.el, { title: `«${titleOf(src)}»: в какой лорбук?`, options: books.map(n => ({ value: n, label: n })) });
    if (!target) return;
    const how = await ask(win.el, { title: 'Копировать или перенести?', options: [{ value: 'copy', label: 'Копировать: запись останется и здесь' }, { value: 'move', label: 'Перенести: убрать из этого лорбука' }] });
    if (!how) return;
    try {
      const data = await ctx().loadWorldInfo(target);
      const entry = wi.createWorldInfoEntry(target, data);
      if (!entry) throw new Error('не удалось создать запись');
      Object.assign(entry, structuredClone({ ...src, uid: entry.uid }));
      await ctx().saveWorldInfo(target, data, true);
      if (how === 'move') {
        await wi.deleteWorldInfoEntry(state.data, state.uid, { silent: true });
        state.uid = entries()[0]?.uid ?? null; render(); touch();
      }
      globalThis.toastr?.success?.(how === 'move' ? `Перенесено в «${target}».` : `Скопировано в «${target}».`, 'Колизей');
      shared.bus.dispatchEvent(new Event('lore'));
    } catch (error) { report('перенос записи', error); globalThis.toastr?.error?.('Не удалось перенести запись.', 'Колизей'); }
  };

  win.body.addEventListener('click', async event => {
    const t = event.target;
    const entryOn = t.closest('[data-entry-on]');
    if (entryOn) { const e = current(); if (e) { e.disable = !entryOn.checked; renderList(); touch(); } return; }
    if (t.closest('[data-bookglob]')) { if (state.book) { shared.loreLib?.toggleGlobal?.(state.book); setTimeout(syncBook, 500); } return; }
    const bulk = t.closest('[data-act="allon"], [data-act="alloff"]');
    if (bulk) { const off = bulk.dataset.act === 'alloff'; for (const e of entries()) e.disable = off; renderList(); renderMain(); touch(); return; }
    if (t.closest('[data-act="links"]')) { if (state.book) await shared.loreLib?.openLinks?.(state.book); setTimeout(syncBook, 300); return; }
    const dot = t.closest('[data-dot]');
    if (dot) { const e = state.data.entries[dot.dataset.dot]; e.disable = !e.disable; renderList(); touch(); return; }
    const row = t.closest('.col-edit-row');
    if (row) { state.uid = Number(row.dataset.u); render(); return; }
    const modeBtn = t.closest('[data-mode]');
    if (modeBtn && current()) {
      const e = current(), k = modeBtn.dataset.mode;
      e.constant = k === 'always'; e.vectorized = k === 'vector';
      if (k === 'keys') e.selective = true;
      renderMain(); renderList(); touch(); return;
    }
    if (t.closest('[data-fine]')) { state.fine = !state.fine; renderMain(); return; }
    const cfrm = t.closest('[data-cfrm]');
    if (cfrm && current()) {
      const [kind, index] = cfrm.dataset.cfrm.split(':'), f = ensureFilter(current());
      (kind === 'n' ? f.names : f.tags).splice(Number(index), 1);
      renderMain(); touch(); return;
    }
    const cfadd = t.closest('[data-cfadd]');
    if (cfadd && current()) {
      const f = ensureFilter(current());
      if (cfadd.dataset.cfadd === 'n') {
        const chars = (ctx().characters ?? []).filter(c => !f.names.includes(baseName(c.avatar)));
        const v = await ask(win.el, { title: 'Для какого персонажа?', options: chars.map(c => ({ value: baseName(c.avatar), label: c.name })) });
        if (v) { f.names.push(v); renderMain(); touch(); }
      } else {
        const tags = (ctx().tags ?? []).filter(x => !f.tags.includes(x.id));
        const v = await ask(win.el, { title: 'Для какого тега?', options: tags.map(x => ({ value: x.id, label: x.name })) });
        if (v) { f.tags.push(v); renderMain(); touch(); }
      }
      return;
    }
    const rm = t.closest('[data-rm]');
    if (rm) {
      const [kind, index] = rm.dataset.rm.split(':');
      current()[kind === 'sec' ? 'keysecondary' : 'key'].splice(Number(index), 1);
      renderMain(); renderList(); touch(); return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (!act || !state.data) return;
    if (act === 'new') {
      const entry = wi.createWorldInfoEntry(state.book, state.data);
      if (entry) { state.uid = entry.uid; render(); touch(); }
    } else if (act === 'dup' && current()) {
      const entry = wi.createWorldInfoEntry(state.book, state.data);
      if (entry) {
        const src = current();
        Object.assign(entry, structuredClone({ ...src, uid: entry.uid }), { comment: `${src.comment ?? ''} (копия)`.trim() });
        state.uid = entry.uid; render(); touch();
      }
    } else if (act === 'move' && current()) {
      await sendEntry();
    } else if (act === 'del' && current()) {
      if (await ask(win.el, { title: 'Удалить запись?', text: `«${titleOf(current())}» исчезнет из лорбука.`, ok: 'Удалить', danger: true })) {
        try { await wi.deleteWorldInfoEntry(state.data, state.uid, { silent: true }); } catch (error) { report('удаление записи', error); }
        state.uid = entries()[0]?.uid ?? null; render(); touch();
      }
    }
  });

  const onWindows = () => { if (!win.isOpen) flush(); };
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => { shared.bus.removeEventListener('windows', onWindows); flush(); });
  shared.loreEditor = { open: openBook };
  undo.push(() => { delete shared.loreEditor; });
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат свитка', error); } } };
}
