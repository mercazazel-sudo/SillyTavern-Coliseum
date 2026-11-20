/**
 * «Лорбуки чата» и «Что сработало из лорбуков».
 *  - Лорбуки чата: какие книги работают в открытом чате и через кого они подключены (глобально, персонаж, дополнительный, маска, чат).
 *  - Что сработало: записи, которые вошли в запрос последнего ответа (по событию Таверны WORLD_INFO_ACTIVATED), и те, что не вошли,
 *    с ПРИБЛИЗИТЕЛЬНОЙ причиной: Таверна не отдаёт точную, поэтому причина угадывается по ключам и недавнему тексту чата.
 * Оба окна открываются пунктами меню у поля ввода (кнопка «≡») и из других мест Колизея.
 */
import { report } from '../core/guard.js';
import { debounce, esc } from './kit.js';

const baseName = a => String(a ?? '').replace(/\.[^/.]+$/, '');
const POS = ['перед описанием', 'после описания', 'заметка автора: сверху', 'заметка автора: снизу', 'на глубине', 'примеры: сверху', 'примеры: снизу', 'outlet'];
const modeOf = e => (e.constant ? ['∞', 'всегда'] : e.vectorized ? ['≈', 'по смыслу'] : ['К', 'по ключам']);

export async function startLoreTrace(doc, { shared }) {
  const traceWin = shared.windows?.get('trace'), chatWin = shared.windows?.get('chatlore');
  if (!traceWin || !chatWin) { report('разбор лорбуков', new Error('нет окон')); return () => {}; }
  const view = doc.defaultView;
  const undo = [];
  let wi;
  try { wi = await import('/scripts/world-info.js'); } catch (error) { report('разбор лорбуков: модуль', error); return () => {}; }
  const ctx = () => globalThis.SillyTavern.getContext();
  const last = { entries: [], at: 0 };

  /* ───────── какие книги работают сейчас и через кого ───────── */
  const activeBooks = () => {
    const c = ctx(), out = new Map();
    const add = (name, via) => { if (!name) return; if (!out.has(name)) out.set(name, []); if (!out.get(name).includes(via)) out.get(name).push(via); };
    (wi.selected_world_info ?? []).forEach(n => add(n, 'глобально'));
    const chars = [];
    if (c.groupId) {
      const group = (c.groups ?? []).find(g => String(g.id) === String(c.groupId));
      for (const av of group?.members ?? []) { const ch = (c.characters ?? []).find(x => x.avatar === av); if (ch) chars.push(ch); }
    } else if (c.characterId !== undefined && c.characters?.[c.characterId]) chars.push(c.characters[c.characterId]);
    for (const ch of chars) {
      add(ch.data?.extensions?.world, `персонаж «${ch.name}»: основной`);
      const extra = (wi.world_info?.charLore ?? []).find(l => l.name === baseName(ch.avatar));
      (extra?.extraBooks ?? []).forEach(n => add(n, `персонаж «${ch.name}»: дополнительный`));
    }
    add(c.powerUserSettings?.persona_description_lorebook, 'маска');
    add(c.chatMetadata?.[wi.METADATA_KEY], 'этот чат');
    const known = new Set(c.getWorldInfoNames?.() ?? []);
    return [...out].map(([name, via]) => ({ name, via })).filter(b => known.has(b.name));
  };
  const chatIsOpen = () => { const c = ctx(); return !!(c.chatId && (c.characterId !== undefined || c.groupId)); };

  /* ───────── окно «Лорбуки чата» ───────── */
  const renderChatLore = async () => {
    const books = activeBooks();
    const counts = await Promise.all(books.map(async b => { try { return Object.keys((await ctx().loadWorldInfo(b.name))?.entries ?? {}).length; } catch { return 0; } }));
    chatWin.body.innerHTML = `<div class="col-trace">
      <h3>Лорбуки чата</h3>
      <p class="col-note">${chatIsOpen() ? 'Книги, которые работают в открытом чате, и через кого они подключены.' : 'Чат не открыт: показаны только глобальные книги и книга маски.'}</p>
      ${books.length ? books.map((b, i) => `<div class="col-tr-book"><div class="col-tr-head"><b>${esc(b.name)}</b><small>${counts[i]} зап.</small>
          <span><button type="button" class="col-btn col-mini" data-open="${esc(b.name)}">Открыть</button> <button type="button" class="col-btn col-mini" data-links="${esc(b.name)}">Связи</button></span></div>
        <div class="col-tr-via">${b.via.map(v => `<span class="col-chip sec">${esc(v)}</span>`).join('')}</div></div>`).join('')
        : '<p class="col-empty">Ни один лорбук сейчас не подключён.</p>'}</div>`;
  };
  chatWin.body.addEventListener('click', event => {
    const open = event.target.closest('[data-open]');
    if (open) { shared.loreEditor?.open(open.dataset.open); return; }
    const links = event.target.closest('[data-links]');
    if (links) shared.loreLib?.openLinks(links.dataset.links);
  });

  /* ───────── окно «Что сработало» ───────── */
  const recentText = depth => (ctx().chat ?? []).slice(-Math.max(1, depth)).map(m => String(m?.mes ?? '')).join('\n').toLowerCase();
  /** Приблизительная причина, почему запись не вошла в запрос. */
  const guessReason = e => {
    if (e.disable) return 'выключена';
    if (e.constant) return 'всегда, но не вошла: вероятность, группа или бюджет';
    if (e.vectorized && !(e.key ?? []).length) return 'по смыслу: не нашлась похожей по смыслу';
    const keys = (e.key ?? []).filter(Boolean);
    if (!keys.length) return 'нет ключей';
    const text = recentText(e.scanDepth ?? wi.world_info_depth ?? 2);
    const hit = keys.some(k => (k.startsWith('/') ? false : text.includes(String(k).toLowerCase())));
    if (!hit) return 'ключ не встретился в недавнем тексте';
    return 'ключ встретился, но не вошла: вторичные ключи, вероятность, перезарядка, группа или бюджет';
  };
  const matchedKey = e => {
    const text = recentText(e.scanDepth ?? wi.world_info_depth ?? 2);
    return (e.key ?? []).find(k => !String(k).startsWith('/') && text.includes(String(k).toLowerCase())) ?? '';
  };
  const when = at => (at ? new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
  const tokenCount = async text => { try { const n = await ctx().getTokenCountAsync?.(String(text ?? '')); return typeof n === 'number' ? n : null; } catch { return null; } };

  let showSkipped = false;
  const renderTrace = async () => {
    const got = last.entries;
    const gotKeys = new Set(got.map(e => `${e.world}.${e.uid}`));
    const byBook = new Map();
    for (const e of got) { if (!byBook.has(e.world)) byBook.set(e.world, []); byBook.get(e.world).push(e); }
    const tok = await Promise.all(got.map(e => tokenCount(e.content)));
    const total = tok.reduce((s, n) => s + (n ?? 0), 0);
    let idx = 0;
    const gotHtml = got.length ? [...byBook].map(([book, list]) => `<div class="col-tr-book"><div class="col-tr-head"><b>${esc(book)}</b><small>${list.length} зап.</small></div>
      ${list.map(e => { const [mark, mt] = modeOf(e), n = tok[got.indexOf(e)]; idx++; const key = matchedKey(e);
        return `<div class="col-tr-row" data-b="${esc(book)}" data-u="${e.uid}"><b class="col-mode col-mode-${e.constant ? 'always' : e.vectorized ? 'vector' : 'keys'}" title="${mt}">${mark}</b>
        <span class="col-tr-name">${esc(e.comment || (e.key ?? []).join(', ') || `Запись ${e.uid}`)}</span>
        <small>${esc(key ? `ключ «${key}»` : mt)} · ${esc(POS[e.position] ?? '')}${n !== null ? ` · ≈${n} ток.` : ''}</small></div>`; }).join('')}</div>`).join('')
      : `<p class="col-empty">${last.at ? 'В последнем запросе ни одна запись не сработала.' : 'Пока ни одна запись не срабатывала в этой сессии. Отправь сообщение или сгенерируй ответ.'}</p>`;

    let skippedHtml = '';
    if (showSkipped) {
      const rows = [];
      for (const b of activeBooks()) {
        let data; try { data = await ctx().loadWorldInfo(b.name); } catch { continue; }
        for (const e of Object.values(data?.entries ?? {})) {
          if (gotKeys.has(`${b.name}.${e.uid}`)) continue;
          rows.push({ book: b.name, e, reason: guessReason(e) });
        }
      }
      rows.sort((a, c) => (a.e.disable ? 1 : 0) - (c.e.disable ? 1 : 0));
      skippedHtml = `<div class="col-tr-skip"><p class="col-note">Причины приблизительные: Таверна не сообщает точную, поэтому они угаданы по ключам и недавнему тексту.</p>
        ${rows.slice(0, 80).map(r => `<div class="col-tr-row" data-b="${esc(r.book)}" data-u="${r.e.uid}"><b class="col-mode">${modeOf(r.e)[0]}</b><span class="col-tr-name">${esc(r.e.comment || (r.e.key ?? []).join(', ') || `Запись ${r.e.uid}`)}<em>${esc(r.book)}</em></span><small>${esc(r.reason)}</small></div>`).join('') || '<p class="col-empty">Все записи подключённых книг вошли.</p>'}
        ${rows.length > 80 ? `<p class="col-note">…и ещё ${rows.length - 80}.</p>` : ''}</div>`;
    }
    traceWin.body.innerHTML = `<div class="col-trace">
      <h3>Что сработало из лорбуков</h3>
      <p class="col-note">${last.at ? `Последний запрос, ${esc(when(last.at))}: ${got.length} зап. из ${byBook.size} книг${total ? `, около ${total} токенов` : ''}.` : 'Данные появятся после первого ответа.'}</p>
      ${gotHtml}
      <button type="button" class="col-fine-toggle" data-skip>${showSkipped ? '▾' : '▸'} Не вошли</button>${skippedHtml}</div>`;
  };
  traceWin.body.addEventListener('click', event => {
    if (event.target.closest('[data-skip]')) { showSkipped = !showSkipped; renderTrace(); return; }
    const row = event.target.closest('.col-tr-row');
    if (row) shared.loreEditor?.open(row.dataset.b, Number(row.dataset.u));
  });

  /* ───────── события и меню ───────── */
  const types = ctx().eventTypes ?? {};
  const onActivated = list => {
    try { last.entries = Array.isArray(list) ? list.map(e => ({ ...e })) : []; last.at = Date.now(); if (traceWin.isOpen) renderTrace(); } catch (error) { report('срабатывание лорбуков', error); }
  };
  if (types.WORLD_INFO_ACTIVATED && ctx().eventSource?.on) {
    ctx().eventSource.on(types.WORLD_INFO_ACTIVATED, onActivated);
    undo.push(() => ctx().eventSource.removeListener?.(types.WORLD_INFO_ACTIVATED, onActivated));
  } else report('разбор лорбуков', new Error('нет события WORLD_INFO_ACTIVATED'));
  const refresh = debounce(() => { if (chatWin.isOpen) renderChatLore(); }, 250);
  for (const name of ['CHAT_CHANGED', 'WORLDINFO_UPDATED', 'SETTINGS_UPDATED']) {
    const type = types[name];
    if (!type || !ctx().eventSource?.on) continue;
    ctx().eventSource.on(type, refresh);
    undo.push(() => ctx().eventSource.removeListener?.(type, refresh));
  }
  const onWindows = () => { if (chatWin.isOpen) renderChatLore(); if (traceWin.isOpen) renderTrace(); };
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => shared.bus.removeEventListener('windows', onWindows));

  // пункты меню у поля ввода (кнопка «≡»)
  const menu = doc.querySelector('#options .options-content');
  if (menu) {
    const make = (id, icon, text, open) => {
      const item = doc.createElement('a');
      item.id = id;
      item.innerHTML = `<i class="fa-lg fa-solid ${icon}"></i><span>${text}</span>`;
      item.addEventListener('click', () => {
        open();
        const options = doc.getElementById('options');
        if (options && view.getComputedStyle(options).display !== 'none') { const jq = view.jQuery ?? globalThis.jQuery; const btn = doc.getElementById('options_button'); if (jq && btn) jq(btn).trigger('click'); }
      });
      menu.append(item);
      undo.push(() => item.remove());
    };
    make('col-opt-chatlore', 'fa-book-atlas', 'Лорбуки чата', () => { chatWin.open(); renderChatLore(); });
    make('col-opt-trace', 'fa-key', 'Что сработало из лорбуков', () => { traceWin.open(); renderTrace(); });
  }
  shared.loreTrace = { openChatLore: () => { chatWin.open(); renderChatLore(); }, openTrace: () => { traceWin.open(); renderTrace(); } };
  undo.push(() => { delete shared.loreTrace; });
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат разбора лорбуков', error); } } };
}
