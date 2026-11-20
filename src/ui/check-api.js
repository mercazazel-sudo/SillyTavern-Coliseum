/**
 * «Проверить соединение»: пункт меню чата. Нажимает родную кнопку «Connect» для текущего API (то же, что делает Таверна в
 * настройках соединения) и показывает итог уведомлением: есть связь или нет и что ответила Таверна.
 * Пункт обычный a[id] в меню чата, поэтому его можно скрыть во вкладке «Меню чата» в настройках, как любой другой.
 * Ничего не отправляет модели и не тратит токены: это проверка статуса, а не тестовое сообщение.
 */
import { report } from '../core/guard.js';

export const ITEM_ID = 'col_option_check_api';
const CONNECT = { openai: '#api_button_openai', textgenerationwebui: '#api_button_textgenerationwebui', kobold: '#api_button', novel: '#api_button_novel' };

export function startCheckApi(doc) {
  const view = doc.defaultView;
  const options = doc.getElementById('options');
  if (!options) { report('проверка соединения', new Error('нет меню чата')); return () => {}; }
  const ctx = () => globalThis.SillyTavern?.getContext?.() ?? {};

  const item = doc.createElement('a');
  item.id = ITEM_ID;
  item.title = 'Проверить, отвечает ли подключённый ИИ (то же, что кнопка «Connect» в настройках соединения)';
  item.innerHTML = '<i class="fa-lg fa-solid fa-plug-circle-check"></i><span>Проверить соединение</span>';
  const anchor = doc.getElementById('col_option_lock_persona') ?? doc.getElementById('col_option_regen_note') ?? doc.getElementById('option_regenerate');
  if (anchor) anchor.after(item); else options.querySelector('.options-content')?.append(item);

  let busy = false;
  const sleep = ms => new Promise(resolve => view.setTimeout(resolve, ms));
  const loading = () => !!doc.querySelector('.api_button.disabled');
  const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, 'Соединение', { timeOut: 7000 });

  const run = async event => {
    event.preventDefault();   // событие идёт дальше: родной обработчик документа сам закроет меню
    if (busy) return;
    const selector = CONNECT[ctx().mainApi];
    const button = selector && doc.querySelector(selector);
    if (!button) { toast('warning', 'Для этого типа API автоматическая проверка не поддерживается. Откройте настройки, вкладка «Соединение».'); return; }
    busy = true; item.classList.add('col-busy');
    try {
      view.jQuery?.(button).trigger('click');
      // сначала ждём, пока Таверна начнёт проверку, затем пока закончит (не дольше 25 секунд)
      for (let i = 0; i < 8 && !loading(); i++) await sleep(150);
      for (let i = 0; i < 100 && loading(); i++) await sleep(250);
      const status = String(ctx().onlineStatus ?? 'no_connection');
      if (status === 'no_connection' || !status.trim()) toast('error', 'Нет соединения с ИИ. Проверьте ключ, адрес и выбранный API.');
      else toast('success', `Соединение есть: ${status}`);
    } catch (error) {
      report('проверка соединения', error);
      toast('error', 'Не удалось проверить соединение. Подробности в консоли.');
    } finally { busy = false; item.classList.remove('col-busy'); }
  };
  item.addEventListener('click', run);

  return () => { item.removeEventListener('click', run); item.remove(); };
}
