/**
 * Архив чатов для завершённых игр.
 * В архив уходит КОНКРЕТНЫЙ чат, а не персонаж: у персонажа остальные чаты остаются в Галерее на главной, а если в архиве
 * оказались все его чаты, карточка персонажа просто пропадает из Галереи (сам персонаж никуда не девается).
 * Что хранится: `settings.chatArchive[«аватар|файл чата»] = { avatar, file, name, ts, last, items, mes }`. Данные о чате снимаются
 * в момент отправки в архив, поэтому окно архива не зависит от списка последних чатов Таверны. Сами чаты не трогаются.
 * Окно «Архив» (карточки по персонажам, как Галерея), пункты меню чата «Отправить чат в архив» и «Вернуть чат из архива».
 */
import { report } from '../core/guard.js';
import { ago, preview } from './atrium.js';
import { esc } from './kit.js';

export const ITEM_ID = 'col_option_archive_chat';
export const DELETE_ID = 'col_option_delete_chat';
const keyOf = (avatar, file) => `${avatar}|${String(file).replace(/\.jsonl$/, '')}`;
const live = () => globalThis.SillyTavern?.getContext?.();

/** Данные архива и их изменение. Возвращает объект, который кладётся в shared.archive. */
function createApi(settings, save, bus) {
  settings.chatArchive ??= {};
  const emit = () => bus?.dispatchEvent(new Event('archive'));
  return {
    has: (avatar, file) => !!settings.chatArchive[keyOf(avatar, file)],
    add(info) {
      if (!info?.avatar || !info?.file) return false;
      const file = String(info.file).replace(/\.jsonl$/, '');
      settings.chatArchive[keyOf(info.avatar, file)] = { avatar: info.avatar, file, name: String(info.name ?? ''), ts: Date.now(), last: info.last ?? '', items: Number(info.items) || 0, mes: preview(info.mes ?? '', 160) };
      save(); emit(); return true;
    },
    remove(avatar, file) { const k = keyOf(avatar, file); if (!settings.chatArchive[k]) return false; delete settings.chatArchive[k]; save(); emit(); return true; },
    count: () => Object.keys(settings.chatArchive).length,
    /** Удаляет файл чата целиком (не сообщения) после подтверждения. info: { avatar, name, file }. true, если чат удалён. */
    async deleteChat(info, shared) {
      const ctx = live();
      const file = String(info?.file ?? '').replace(/\.jsonl$/, '');
      const id = ctx?.characters?.findIndex(c => c.avatar === info?.avatar) ?? -1;
      if (!file || id < 0) { globalThis.toastr?.error?.('Не нашёл персонажа этого чата.', 'Удаление чата'); return false; }
      const answer = await ctx.callGenericPopup(
        `<h3>Удалить чат целиком?</h3><p>Чат «${esc(info.name)}» (${esc(file)}) будет удалён вместе со всеми сообщениями. Вернуть его нельзя.</p>`,
        ctx.POPUP_TYPE.CONFIRM, '', { okButton: 'Удалить чат', cancelButton: 'Отмена' });
      if (answer !== ctx.POPUP_RESULT.AFFIRMATIVE) return false;
      try {
        // открытый чат сначала закрываем, чтобы он не пересохранился сам после удаления
        if (ctx.characterId !== undefined && Number(ctx.characterId) === id && ctx.chatId === file) await shared?.atrium?.show();
        const script = await import('/script.js');
        await script.deleteCharacterChatByName(id, file);
        const res = await fetch('/api/characters/chats', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: info.avatar }) });
        const left = res.ok ? Object.values(await res.json()).filter(x => x && typeof x === 'object') : [];
        if (res.ok && left.some(x => String(x.file_name).replace(/\.jsonl$/, '') === file)) throw new Error('файл чата остался на диске');
      } catch (error) {
        report('удалить чат', error);
        globalThis.toastr?.error?.('Не удалось удалить чат. Подробности в консоли.', 'Удаление чата');
        return false;
      }
      delete settings.chatArchive[keyOf(info.avatar, file)];
      save(); emit();
      globalThis.toastr?.success?.(`Чат «${info.name}» удалён.`, 'Удаление чата');
      return true;
    },
    /** Архивные чаты, сгруппированные по персонажам; внутри чаты по свежести, группы по самому свежему чату. */
    groups() {
      const by = new Map();
      for (const entry of Object.values(settings.chatArchive)) {
        if (!by.has(entry.avatar)) by.set(entry.avatar, { avatar: entry.avatar, name: entry.name, cur: 0, chats: [] });
        by.get(entry.avatar).chats.push(entry);
      }
      const when = c => Date.parse(c.last) || c.ts || 0;
      for (const g of by.values()) g.chats.sort((a, b) => when(b) - when(a));
      return [...by.values()].sort((a, b) => when(b.chats[0]) - when(a.chats[0]));
    },
  };
}

/** Открывает чат персонажа по аватару и имени файла (так же, как кнопка «Открыть чат» в Галерее). */
export async function openChatByFile(avatar, file) {
  const ctx = live();
  if (!ctx) return;
  const id = ctx.characters.findIndex(c => c.avatar === avatar);
  if (id < 0) throw new Error(`персонаж ${avatar} не найден`);
  await ctx.selectCharacterById(id);
  const name = String(file).replace(/\.jsonl$/, '');
  if (ctx.getCurrentChatId?.() !== name) await ctx.openCharacterChat(name);
}

/** Окно «Архив»: карточки по персонажам. */
export function startArchive(doc, { settings, save, shared }) {
  const win = shared.windows?.get('archive');
  if (!win) { report('архив', new Error('нет окна')); return () => {}; }
  const undo = [];
  shared.bus ??= new EventTarget();
  const api = createApi(settings, save, shared.bus);
  shared.archive = api;
  undo.push(() => { delete shared.archive; });

  const root = doc.createElement('div');
  root.className = 'col-arch';
  win.body.append(root);
  undo.push(() => root.remove());

  const thumbOf = avatar => {
    try { return live()?.getThumbnailUrl?.('avatar', avatar) ?? ''; } catch { return ''; }
  };
  let groups = [];
  const render = () => {
    groups = api.groups();
    if (!groups.length) {
      root.innerHTML = '<p class="col-arch-empty">В архиве пока пусто. Отправить чат в архив можно кнопкой в углу карточки в Галерее или пунктом меню чата «Отправить чат в архив». Сам персонаж остаётся на месте, уходит только этот чат.</p>';
      return;
    }
    root.innerHTML = `<p class="col-note col-arch-note">Здесь завершённые чаты. «Вернуть» отправляет чат обратно в Галерею, «Открыть чат» открывает его, не возвращая.</p>
      <div class="col-arch-grid">${groups.map((g, i) => {
      const chat = g.chats[g.cur];
      const src = thumbOf(g.avatar);
      const dots = g.chats.length > 1
        ? `<div class="col-dots" role="tablist" aria-label="Архивные чаты персонажа">${g.chats.map((c, j) => `<button type="button" class="col-dot${j === g.cur ? ' on' : ''}" data-dot="${i}:${j}" role="tab" aria-selected="${j === g.cur}" title="${esc(`${ago(c.last)} · ${c.items} сообщ.`)}"></button>`).join('')}</div>`
        : '<div class="col-dots col-dots-empty"></div>';
      return `<article class="col-hcard" data-ch="${i}"><div class="col-pframe"><div class="col-pimg">${src ? `<img src="${esc(src)}" alt="">` : `<span>${esc((g.name || '?').slice(0, 2))}</span>`}</div></div>
        <h4>${esc(g.name)}</h4>
        <div class="col-by">${esc(ago(chat.last))} · ${esc(chat.items)} сообщ.</div>
        <p class="col-pq">${esc(chat.mes)}</p>${dots}
        <div class="col-arch-btns"><button type="button" class="menu_button col-go" data-open-chat="${i}">Открыть чат</button><button type="button" class="menu_button col-restore" data-restore="${i}" title="Вернуть этот чат в Галерею на главной">Вернуть</button><button type="button" class="menu_button col-del" data-del="${i}" title="Удалить файл этого чата целиком">Удалить чат</button></div></article>`;
    }).join('')}</div>`;
  };
  root.addEventListener('click', async event => {
    const dot = event.target.closest('[data-dot]');
    if (dot) { const [i, j] = dot.dataset.dot.split(':').map(Number); if (groups[i]?.chats[j]) { groups[i].cur = j; render(); } return; }
    const restore = event.target.closest('[data-restore]');
    if (restore) {
      const g = groups[Number(restore.dataset.restore)], chat = g?.chats[g.cur];
      if (chat && api.remove(chat.avatar, chat.file)) globalThis.toastr?.success?.(`Чат «${g.name}» вернулся в Галерею.`, 'Архив');
      return;
    }
    const del = event.target.closest('[data-del]');
    if (del) {
      const g = groups[Number(del.dataset.del)], chat = g?.chats[g.cur];
      if (chat) await api.deleteChat({ avatar: chat.avatar, name: g.name, file: chat.file }, shared);
      return;
    }
    const open = event.target.closest('[data-open-chat]');
    if (open) {
      const g = groups[Number(open.dataset.openChat)], chat = g?.chats[g.cur];
      if (!chat) return;
      try { await openChatByFile(chat.avatar, chat.file); win.close(); }
      catch (error) { report('открыть архивный чат', error); globalThis.toastr?.error?.('Не удалось открыть чат. Подробности в консоли.', 'Архив'); }
    }
  });
  const onChange = () => render();
  shared.bus.addEventListener('archive', onChange);
  shared.bus.addEventListener('windows', onChange);
  undo.push(() => { shared.bus.removeEventListener('archive', onChange); shared.bus.removeEventListener('windows', onChange); });
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат архива', error); } } };
}

/** Пункт меню чата: отправить открытый чат в архив или вернуть его оттуда. */
export function startArchiveItem(doc, { shared }) {
  const view = doc.defaultView;
  const options = doc.getElementById('options');
  if (!options || !shared.archive) { report('пункт архива', new Error('нет меню чата или архива')); return () => {}; }
  const item = doc.createElement('a');
  item.id = ITEM_ID;
  item.innerHTML = '<i class="fa-lg fa-solid fa-box-archive"></i><span></span>';
  const anchor = doc.getElementById('col_option_check_api') ?? doc.getElementById('col_option_lock_persona') ?? doc.getElementById('option_regenerate');
  if (anchor) anchor.after(item); else options.querySelector('.options-content')?.append(item);

  const current = () => {
    const ctx = live();
    if (!ctx?.chatId || ctx.groupId) return null;
    const character = ctx.characters?.[Number(ctx.characterId)];
    if (!character?.avatar) return null;
    const chat = ctx.chat ?? [];
    const last = chat.at(-1);
    return { avatar: character.avatar, name: character.name, file: ctx.chatId, items: chat.length, last: last?.send_date ?? '', mes: last?.mes ?? '' };
  };
  const paint = () => {
    const c = current();
    const archived = !!c && shared.archive.has(c.avatar, c.file);
    item.querySelector('span').textContent = archived ? 'Вернуть чат из архива' : 'Убрать чат в архив';
    item.title = archived ? 'Вернуть этот чат в Галерею на главной' : 'Завершённая игра: убрать этот чат с главной страницы в архив (остальные чаты персонажа остаются)';
  };
  paint();
  const onOpen = () => view.setTimeout(paint, 30);
  const button = doc.getElementById('options_button');
  button?.addEventListener('click', onOpen);
  const ctx0 = live();
  const handlers = [];
  for (const name of ['CHAT_CHANGED']) { const t = ctx0?.eventTypes?.[name]; if (t) { ctx0.eventSource.on(t, paint); handlers.push([t, paint]); } }
  shared.bus?.addEventListener('archive', paint);

  const onClick = async event => {
    event.preventDefault();   // событие идёт дальше: родной обработчик документа сам закроет меню
    const c = current();
    if (!c) { globalThis.toastr?.warning?.('Архив работает с чатами одного персонажа. Откройте такой чат.', 'Архив'); return; }
    if (shared.archive.has(c.avatar, c.file)) {
      shared.archive.remove(c.avatar, c.file);
      globalThis.toastr?.success?.('Чат вернулся в Галерею.', 'Архив'); paint(); return;
    }
    shared.archive.add(c);
    globalThis.toastr?.success?.(`Чат «${c.name}» отправлен в архив. Он ушёл с главной, остальные чаты персонажа на месте.`, 'Архив');
    paint();
    try { await shared.atrium?.show(); } catch (error) { report('архив: переход на главную', error); }
  };
  item.addEventListener('click', onClick);

  // «Удалить чат»: удаляет файл открытого чата целиком (не отдельные сообщения)
  const del = doc.createElement('a');
  del.id = DELETE_ID;
  del.title = 'Удалить этот чат целиком, вместе со всеми сообщениями (с подтверждением)';
  del.innerHTML = '<i class="fa-lg fa-solid fa-trash-can"></i><span>Удалить чат</span>';
  item.after(del);
  const onDelete = async event => {
    event.preventDefault();
    const c = current();
    if (!c) { globalThis.toastr?.warning?.('Удаление работает с чатами одного персонажа. Откройте такой чат.', 'Удаление чата'); return; }
    await shared.archive.deleteChat(c, shared);
  };
  del.addEventListener('click', onDelete);
  return () => {
    del.removeEventListener('click', onDelete); del.remove();
    item.removeEventListener('click', onClick); button?.removeEventListener('click', onOpen);
    for (const [t, fn] of handlers) ctx0?.eventSource?.removeListener?.(t, fn);
    shared.bus?.removeEventListener('archive', paint); item.remove();
  };
}
