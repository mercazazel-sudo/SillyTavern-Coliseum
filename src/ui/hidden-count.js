/**
 * «Скрытые сообщения»: первая строка меню чата показывает, сколько сообщений скрыто из запроса к модели и сколько их всего
 * (то, что делают `/hide` и глазок у сообщения). Заливка строки отражает долю скрытых. Считается по полю `is_system`
 * у сообщений текущего чата, то есть вместе с системными сообщениями, как это принято в Таверне.
 * Пересчёт идёт по событиям чата и при открытии меню, таймера нет. Строка обычный a[id], её можно скрыть во вкладке «Меню чата».
 * Эта реализация своя; в проекте нет кода расширения Hidden Messages Counter (оно под GPL-2.0).
 */
import { report } from '../core/guard.js';
import { stContext } from './kit.js';

export const ITEM_ID = 'col_option_hidden_count';

/** Сколько скрытых и всего в массиве сообщений; процент округлён. */
export function countHidden(chat) {
  const list = Array.isArray(chat) ? chat : [];
  const hidden = list.filter(message => message?.is_system === true).length;
  return { hidden, total: list.length, percent: list.length ? Math.round((hidden / list.length) * 100) : 0 };
}

export function startHiddenCount(doc) {
  const view = doc.defaultView;
  const options = doc.getElementById('options');
  if (!options) { report('скрытые сообщения', new Error('нет меню чата')); return () => {}; }
  const live = stContext;

  const item = doc.createElement('a');
  item.id = ITEM_ID;
  item.innerHTML = '<i class="fa-lg fa-solid fa-ghost"></i><span>Скрыто сообщений</span><b></b>';
  item.title = 'Сколько сообщений скрыто из запроса к модели (команды /hide и /unhide, глазок у сообщения) и сколько всего в чате';
  const content = options.querySelector('.options-content');
  if (content) content.prepend(item); else options.prepend(item);
  const stop = event => { event.preventDefault(); event.stopPropagation(); };   // строка только показывает число, меню не закрывает
  item.addEventListener('click', stop);

  const paint = () => {
    try {
      const { hidden, total, percent } = countHidden(live()?.chat);
      item.querySelector('b').textContent = `${hidden} / ${total}`;
      item.classList.toggle('col-has-hidden', hidden > 0);
      item.style.setProperty('--col-hidden-pct', `${percent}%`);
    } catch (error) { report('скрытые сообщения', error); }
  };
  paint();

  const undo = [() => item.removeEventListener('click', stop), () => item.remove()];
  const later = () => view.setTimeout(paint, 100);
  const ctx = live();
  for (const name of ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_DELETED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED']) {
    const type = ctx?.eventTypes?.[name];
    if (type && ctx.eventSource?.on) { ctx.eventSource.on(type, later); undo.push(() => ctx.eventSource.removeListener?.(type, later)); }
  }
  // /hide и глазок могут не присылать события, поэтому считаем ещё раз при открытии меню
  const button = doc.getElementById('options_button');
  const onOpen = () => view.setTimeout(paint, 30);
  button?.addEventListener('click', onOpen);
  undo.push(() => button?.removeEventListener('click', onOpen));

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат скрытых сообщений', error); } } };
}
