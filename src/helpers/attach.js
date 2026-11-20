/**
 * Вложения для помощника: последние ошибки и фрагмент чата.
 * Ничего не уходит модели само: текст берётся только когда пользователь нажал кнопку.
 */
import { report } from '../core/guard.js';

const ERROR_LIMIT = 10;
const ERROR_TEXT_CAP = 1200;
const CHAT_MESSAGES = 12;
const CHAT_MESSAGE_CAP = 800;
const NOISE = /ResizeObserver loop/i;

const cut = (text, cap) => {
  const s = String(text ?? '').trim();
  return s.length > cap ? `${s.slice(0, cap)}…` : s;
};

/** Разметка из тостов превращаем в обычный текст без исполнения. */
function plain(html) {
  const s = String(html ?? '');
  if (!/[<&]/.test(s)) return s;
  try { return new DOMParser().parseFromString(s, 'text/html').body.textContent ?? s; } catch { return s; }
}

/**
 * Запись ошибок: обёртка над toastr.error, события error и unhandledrejection.
 * Возвращает { list, last, stop }. onChange вызывается после каждой новой записи.
 */
export function startErrorLog(win, onChange = () => {}) {
  const entries = [];
  const undo = [];

  const add = (source, title, message) => {
    const text = cut(plain(message), ERROR_TEXT_CAP);
    if (!text || NOISE.test(text)) return;
    entries.push({ at: Date.now(), source, title: cut(plain(title), 200), message: text });
    if (entries.length > ERROR_LIMIT) entries.shift();
    try { onChange(); } catch (error) { report('onChange журнала ошибок', error); }
  };

  const toast = win.toastr;
  if (toast && typeof toast.error === 'function') {
    const original = toast.error;
    const wrapped = function (message, title, ...rest) {
      try { add('уведомление Таверны', title, message); } catch (error) { report('запись тоста', error); }
      return original.call(this, message, title, ...rest);
    };
    toast.error = wrapped;
    undo.push(() => { if (toast.error === wrapped) toast.error = original; });
  }

  const onError = e => add('ошибка страницы', '', `${e.message ?? 'Ошибка'}${e.filename ? ` (${String(e.filename).split('/').slice(-2).join('/')}:${e.lineno ?? '?'})` : ''}`);
  const onReject = e => add('необработанная ошибка', '', e.reason?.message ?? String(e.reason ?? 'Ошибка'));
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onReject);
  undo.push(() => { win.removeEventListener('error', onError); win.removeEventListener('unhandledrejection', onReject); });

  return {
    list: () => entries.slice(),
    last: () => entries[entries.length - 1] ?? null,
    stop: () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат журнала ошибок', error); } } },
  };
}

/** Текст вложения «ошибки»: последние до трёх записей, свежие в конце. */
export function errorsText(log, count = 3) {
  const items = log.list().slice(-count);
  if (!items.length) return '';
  return items.map(e => {
    const time = new Date(e.at).toLocaleTimeString('ru-RU');
    return `[${time}] ${e.source}${e.title ? ` «${e.title}»` : ''}: ${e.message}`;
  }).join('\n');
}

/** Есть ли что прикладывать из чата. */
export function chatMessages(context) {
  const chat = Array.isArray(context.chat) ? context.chat : [];
  return chat.filter(m => m && !m.is_system && typeof m.mes === 'string' && m.mes.trim());
}

/** Текст вложения «чат»: последние реплики текущего чата Таверны. */
export function chatText(context) {
  const rows = chatMessages(context).slice(-CHAT_MESSAGES);
  if (!rows.length) return '';
  const head = `Персонаж: ${context.name2 ?? '?'}; пользователь: ${context.name1 ?? '?'}. Последние реплики чата (${rows.length}):`;
  const body = rows.map(m => `${m.name || (m.is_user ? 'Пользователь' : 'Персонаж')}: ${cut(m.mes, CHAT_MESSAGE_CAP)}`);
  return [head, ...body].join('\n');
}
