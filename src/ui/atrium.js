/**
 * Атриум: домашняя страница вместо родного приветствия Таверны. Показывается, пока не открыт ни один чат.
 * Приветствие по времени суток и изречение дня, активная маска с быстрой сменой, последние чаты (серверный список Таверны).
 * Родное приветствие остаётся в странице, но скрыто, пока виден Атриум.
 */
import { report } from '../core/guard.js';

export const ATRIUM_ID = 'col-atrium';
const HOME_CLASS = 'col-home-on';
const MAX_CHARS = 8;  // персонажей в ряду
const MAX_DOTS = 6;   // чатов у одного персонажа (точки)

const MAXIMS = ['Познай самого себя.', 'Ничего сверх меры.', 'Торопись медленно.', 'Терпение горько, но плод его сладок.', 'Всё течёт.', 'Дорогу осилит идущий.'];

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const greeting = hour => (hour >= 5 && hour < 12 ? 'Доброе утро' : hour >= 12 && hour < 18 ? 'Добрый день' : hour >= 18 && hour < 23 ? 'Добрый вечер' : 'Доброй ночи');

/** Короткая дата: «сегодня», «вчера», «3 дня назад» и так далее. */
export function ago(timestamp) {
  const when = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  const days = Math.floor((Date.now() - when) / 864e5);
  if (!Number.isFinite(days) || days < 0) return '';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  const last = days % 10, tens = days % 100;
  const word = last === 1 && tens !== 11 ? 'день' : last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'дня' : 'дней';
  return days < 60 ? `${days} ${word} назад` : `${Math.round(days / 30)} мес. назад`;
}

/** Обрезает превью последнего сообщения: без разметки, по слову. */
export function preview(text, limit = 220) {
  const plain = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/[*_`~#>]+/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit * 0.6))}…`;
}

export function startAtrium(doc, { shared }) {
  const view = doc.defaultView;
  const body = doc.body;
  const undo = [];
  const live = () => globalThis.SillyTavern?.getContext?.();

  const root = doc.createElement('section');
  root.id = ATRIUM_ID;
  root.setAttribute('aria-label', 'Атриум');
  body.append(root);
  undo.push(() => { root.remove(); body.classList.remove(HOME_CLASS); });

  const state = { chars: [], loaded: false, error: '' };
  let temp = false; // идёт временный чат ассистента: у него нет персонажа, но Атриум показывать не нужно

  const chatIsOpen = () => {
    const ctx = live();
    return !!ctx && (ctx.characterId !== undefined && ctx.characterId !== null || !!ctx.groupId);
  };

  // ── активная маска и список масок берём из родного блока персон ──
  const personaList = () => [...doc.querySelectorAll('#user_avatar_block .avatar-container')].map(el => ({
    el,
    id: el.dataset.avatarId ?? el.querySelector('.avatar')?.dataset.avatarId ?? '',
    name: el.querySelector('.ch_name')?.textContent?.trim() || el.dataset.avatarId || 'Без имени',
    title: el.querySelector('.ch_description')?.textContent?.trim() ?? '',
    active: el.classList.contains('selected') || el.getAttribute('selected') === 'true',
  })).filter(p => p.id);
  const thumb = id => {
    const ctx = live();
    try { return ctx?.getThumbnailUrl?.('persona', id) ?? ''; } catch { return ''; }
  };
  const portrait = persona => {
    const src = persona ? thumb(persona.id) : '';
    return `<div class="col-frame"><div class="col-pic"${src ? ` style="background-image:url('${src.replace(/'/g, '%27')}')"` : ''}>${src ? '' : '<span>?</span>'}</div></div>`;
  };

  let menuOpen = null;   // номер карточки с открытым меню «⋯»
  const render = () => {
    const ctx = live();
    const personas = personaList();
    const me = personas.find(p => p.active) ?? personas[0] ?? null;
    const others = personas.filter(p => p !== me).slice(0, 4);
    const name = me?.name ?? ctx?.name1 ?? 'Странник';
    const hour = new Date().getHours();
    const maxim = MAXIMS[Math.floor(Date.now() / 864e5) % MAXIMS.length];

    const chatsHtml = state.chars.length
      ? `<div class="col-prow">${state.chars.map((ch, i) => {
        const chat = ch.chats[ch.cur];
        const dots = ch.chats.length > 1
          ? `<div class="col-dots" role="tablist" aria-label="Чаты персонажа">${ch.chats.map((c, j) => `<button type="button" class="col-dot${j === ch.cur ? ' on' : ''}" data-dot="${i}:${j}" role="tab" aria-selected="${j === ch.cur}" title="${escapeHtml(`${ago(c.last_mes)} · ${c.chat_items} сообщ.`)}"></button>`).join('')}</div>`
          : '<div class="col-dots col-dots-empty"></div>';
        return `<article class="col-hcard" data-ch="${i}"><div class="col-pframe"><div class="col-pimg">${chatThumb(chat)}</div></div>
          <h4>${escapeHtml(ch.name)}</h4>
          <div class="col-by">${escapeHtml(ago(chat.last_mes))} · ${escapeHtml(chat.chat_items)} сообщ.</div>
          <p class="col-pq">${escapeHtml(preview(chat.mes, 90))}</p>${dots}
          <button type="button" class="menu_button col-go" data-go="${i}">Открыть чат</button>
          <button type="button" class="col-arch-btn" data-menu="${i}" title="Действия с чатом" aria-label="Действия с чатом" aria-haspopup="true" aria-expanded="${menuOpen === i}"><i class="fa-solid fa-ellipsis"></i></button>
          ${menuOpen === i ? `<div class="col-cmenu" role="menu"><button type="button" role="menuitem" data-new="${i}" title="Начать с этим персонажем новый чат"><i class="fa-solid fa-plus"></i>Новый чат</button><button type="button" role="menuitem" data-arch="${i}" title="Завершённая игра: чат уйдёт с главной, остальные чаты персонажа останутся"><i class="fa-solid fa-box-archive"></i>Убрать в архив</button><button type="button" role="menuitem" data-del="${i}" title="Удалить файл чата целиком"><i class="fa-solid fa-trash-can"></i>Удалить чат</button></div>` : ''}</article>`;
      }).join('')}</div>`
      : `<p class="col-empty">${escapeHtml(state.loaded ? (state.error || `Чатов пока нет. Откройте персонажа в разделе «${(shared.appearance?.current?.().labels?.chars ?? 'Пантеон')}», и первая беседа появится здесь.`) : 'Загружаю чаты…')}</p>`;

    const labels = shared.appearance?.current?.().labels ?? { home: 'Атриум', chars: 'Пантеон' };
    root.setAttribute('aria-label', labels.home);
    root.innerHTML = `<div class="col-atr">
      <header class="col-greet"><i class="col-dragon" aria-hidden="true"></i><div class="col-gl">${escapeHtml(labels.home)}</div><h2>${greeting(hour)}</h2><div class="col-rule"><i></i></div><p>${escapeHtml(maxim)}</p></header>
      <section class="col-me">
        <div class="col-me-main">${portrait(me)}<div class="col-me-txt"><div class="col-gl">Сейчас на тебе</div><h3>${escapeHtml(name)}</h3>
          <p class="col-ttl">${escapeHtml(me?.title || 'без титула')}</p><button type="button" class="menu_button" data-open="masks">Все маски</button></div></div>
        ${others.length ? `<div class="col-sw"><span class="col-gl">Сменить</span>${others.map((p, i) => `<button type="button" class="col-swb" data-persona="${i}" title="${escapeHtml(p.name)}"><i style="background-image:url('${thumb(p.id).replace(/'/g, '%27')}')"></i><span>${escapeHtml(p.name)}</span></button>`).join('')}</div>` : ''}
      </section>
      <section class="col-recent"><div class="col-rh"><h3>Галерея</h3><a href="#" data-temp title="Чат с ассистентом, который не сохраняется в файл">Временный чат</a><a href="#" data-open="archive" title="Завершённые игры: чаты, убранные с главной">Архив${shared.archive?.count?.() ? ` · ${shared.archive.count()}` : ''}</a><a href="#" data-open="chars">Все персонажи →</a></div>${chatsHtml}</section></div>`;
    root._others = others;
  };

  const chatThumb = chat => {
    const ctx = live();
    let src = '';
    try { src = chat.avatar ? ctx?.getThumbnailUrl?.('avatar', chat.avatar) ?? '' : ''; } catch { /* без картинки */ }
    return src ? `<img src="${escapeHtml(src)}" alt="">` : `<span>${escapeHtml((chat.char_name ?? '?').slice(0, 2))}</span>`;
  };

  const loadChats = async () => {
    try {
      const ctx = live();
      const headers = ctx?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' };
      const res = await view.fetch('/api/chats/recent', { method: 'POST', headers, body: JSON.stringify({ max: 100 }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      // группы пока не открываем отсюда: берём чаты персонажей и собираем их по персонажам в порядке свежести
      const names = new Map((ctx?.characters ?? []).map(c => [c.avatar, c.name]));
      const byChar = new Map();
      for (const c of (Array.isArray(list) ? list : [])) {
        if (!c.avatar || !c.file_name || !(Number(c.chat_items) > 0) || !names.has(c.avatar)) continue;
        if (shared.archive?.has(c.avatar, c.file_name)) continue;   // этот чат в архиве; другие чаты персонажа остаются
        if (!byChar.has(c.avatar)) byChar.set(c.avatar, { avatar: c.avatar, name: names.get(c.avatar), cur: 0, chats: [] });
        const entry = byChar.get(c.avatar);
        if (entry.chats.length < MAX_DOTS) entry.chats.push({ ...c, char_name: entry.name });
      }
      state.chars = [...byChar.values()].slice(0, MAX_CHARS);
      state.error = '';
    } catch (error) {
      state.chars = [];
      state.error = 'Не удалось загрузить чаты.';
      report('последние чаты', error);
    }
    state.loaded = true;
    render();
  };

  const openChat = async chat => {
    const ctx = live();
    if (!chat || !ctx) return;
    try {
      const id = ctx.characters.findIndex(c => c.avatar === chat.avatar);
      if (id < 0) throw new Error(`персонаж ${chat.avatar} не найден`);
      await ctx.selectCharacterById(id);
      const file = String(chat.file_name).replace(/\.jsonl$/, '');
      if (ctx.getCurrentChatId?.() !== file) await ctx.openCharacterChat(file);
    } catch (error) {
      report('открыть чат', error);
      globalThis.toastr?.error?.('Не удалось открыть чат. Подробности в консоли.', 'Колизей');
    }
  };

  /** Новый чат с персонажем карточки: открываем персонажа и вызываем родное «Начать новый чат». */
  const newChat = async ch => {
    const ctx = live();
    if (!ch || !ctx) return;
    try {
      const id = ctx.characters.findIndex(c => c.avatar === ch.avatar);
      if (id < 0) throw new Error(`персонаж ${ch.avatar} не найден`);
      await ctx.selectCharacterById(id);
      const script = await import('/script.js');
      await script.doNewChat();
    } catch (error) {
      report('новый чат', error);
      globalThis.toastr?.error?.('Не удалось начать новый чат. Подробности в консоли.', 'Колизей');
    }
  };

  root.addEventListener('click', event => {
    if (event.target.closest('[data-temp]')) { event.preventDefault(); startTemp(); return; }
    const open = event.target.closest('[data-open]');
    if (open) { event.preventDefault(); shared.windows?.open(open.dataset.open); return; }
    const sw = event.target.closest('[data-persona]');
    if (sw) {
      const persona = root._others?.[Number(sw.dataset.persona)];
      const jq = view.jQuery ?? globalThis.jQuery;
      if (persona && jq) jq(persona.el).trigger('click');
      view.setTimeout(render, 400);
      return;
    }
    const dot = event.target.closest('[data-dot]');
    if (dot) {
      const [i, j] = dot.dataset.dot.split(':').map(Number);
      if (state.chars[i]?.chats[j]) { state.chars[i].cur = j; render(); }
      return;
    }
    const menu = event.target.closest('[data-menu]');
    if (menu) { const i = Number(menu.dataset.menu); menuOpen = menuOpen === i ? null : i; render(); return; }
    if (menuOpen !== null && !event.target.closest('[data-del], [data-arch], [data-new]')) { menuOpen = null; render(); return; }
    const fresh = event.target.closest('[data-new]');
    if (fresh) { menuOpen = null; render(); newChat(state.chars[Number(fresh.dataset.new)]); return; }
    const del = event.target.closest('[data-del]');
    if (del) {
      menuOpen = null; render();
      const ch = state.chars[Number(del.dataset.del)], chat = ch?.chats[ch.cur];
      if (chat) shared.archive?.deleteChat({ avatar: chat.avatar, name: ch.name, file: chat.file_name }, shared);
      return;
    }
    const arch = event.target.closest('[data-arch]');
    if (arch) {
      menuOpen = null;
      const ch = state.chars[Number(arch.dataset.arch)], chat = ch?.chats[ch.cur];
      if (chat && shared.archive?.add({ avatar: chat.avatar, name: ch.name, file: chat.file_name, items: chat.chat_items, last: chat.last_mes, mes: chat.mes })) {
        globalThis.toastr?.success?.(`Чат «${ch.name}» убран в архив.`, 'Архив');
        loadChats();
      }
      return;
    }
    const go = event.target.closest('[data-go]');
    if (go) { const ch = state.chars[Number(go.dataset.go)]; if (ch) openChat(ch.chats[ch.cur]); return; }
    const card = event.target.closest('.col-hcard');
    if (card && !event.target.closest('.col-dots')) { const ch = state.chars[Number(card.dataset.ch)]; if (ch) openChat(ch.chats[ch.cur]); }
  });

  const startTemp = async () => {
    temp = true;
    sync();
    try {
      const script = await import('/script.js');
      await script.newAssistantChat({ temporary: true });
    } catch (error) {
      temp = false; sync();
      report('временный чат', error);
      globalThis.toastr?.error?.('Не удалось начать временный чат. Подробности в консоли.', 'Колизей');
    }
  };
  const sync = () => {
    if (chatIsOpen()) temp = false;
    const home = !chatIsOpen() && !temp;
    body.classList.toggle(HOME_CLASS, home);
    if (home) { render(); loadChats(); }
  };
  const ctx0 = live();
  const types = ctx0?.eventTypes ?? {};
  for (const name of ['CHAT_CHANGED', 'APP_READY']) {
    if (types[name] && ctx0.eventSource?.on) {
      ctx0.eventSource.on(types[name], sync);
      undo.push(() => ctx0.eventSource.removeListener?.(types[name], sync));
    }
  }
  // «Атриум» в колонне: закрыть чат (если открыт) и показать домашнюю страницу
  shared.atrium = {
    show: async () => {
      temp = false;
      shared.windows?.closeAll();
      try { if (chatIsOpen()) await live()?.executeSlashCommandsWithOptions?.('/closechat'); } catch (error) { report('закрыть чат', error); }
      sync();
    },
    refresh: sync,
  };
  const onAppearance = () => render();
  shared.bus?.addEventListener('appearance', onAppearance);
  undo.push(() => shared.bus?.removeEventListener('appearance', onAppearance));
  const onArchive = () => { if (body.classList.contains(HOME_CLASS)) loadChats(); };
  shared.bus?.addEventListener('archive', onArchive);
  undo.push(() => shared.bus?.removeEventListener('archive', onArchive));
  undo.push(() => { delete shared.atrium; });

  render();
  sync();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат атриума', error); } } };
}
