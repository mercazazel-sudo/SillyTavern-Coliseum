/**
 * «Перегенерировать с правкой»: пункт меню чата, который не просто запускает перегенерацию, а сначала спрашивает,
 * что не так с последним ответом, и передаёт это модели как временную подсказку к одному запросу.
 *
 * Как устроено:
 *  - пункт добавлен в родное меню чата (#options) сразу под «Regenerate», это обычный элемент a[id], поэтому его можно скрыть
 *    во вкладке «Меню чата» наравне с родными;
 *  - текст правки кладётся через setExtensionPrompt (позиция «в чате», глубина 0, роль system): он попадает в конец запроса;
 *  - затем нажимается родной #option_regenerate, всю остальную работу (свайп, группы, стриминг) делает сама Таверна;
 *  - подсказка снимается, как только ответ получен, остановлен, чат сменился или прошло время (страховка).
 * Подсказка не пишется в историю чата и не остаётся в карточках, ничего в данных пользователя не меняется.
 */
import { report } from '../core/guard.js';
import { esc } from './kit.js';

export const ITEM_ID = 'col_option_regen_note';
const PROMPT_KEY = 'col_regen_note';
const MAX_LEN = 1500;
const SAFETY_MS = 10 * 60 * 1000;

export function startRegenNote(doc, { settings, save }) {
  const view = doc.defaultView;
  const undo = [];
  const ctx = () => globalThis.SillyTavern?.getContext?.() ?? {};
  const options = doc.getElementById('options');
  const native = doc.getElementById('option_regenerate');
  if (!options || !native) { report('перегенерация с правкой', new Error('нет меню чата или пункта Regenerate')); return () => {}; }

  settings.regenNote ??= { last: '' };
  const S = settings.regenNote;

  /* ───────── пункт меню ───────── */
  const item = doc.createElement('a');
  item.id = ITEM_ID;
  item.title = 'Перегенерировать ответ, сказав модели, что в нём не так';
  item.innerHTML = '<i class="fa-lg fa-solid fa-pen-to-square"></i><span>Перегенерировать с правкой</span>';
  native.after(item);
  undo.push(() => item.remove());

  /* ───────── временная подсказка ───────── */
  let active = false, timer = 0;
  const clearNote = () => {
    if (!active) return;
    active = false; view.clearTimeout(timer);
    try { ctx().setExtensionPrompt?.(PROMPT_KEY, '', 1, 0); } catch (error) { report('снятие подсказки перегенерации', error); }
  };
  const buildNote = text => `[The previous version of your reply was rejected. What is wrong with it, in the user's words: "${text}". Write a new reply that fixes this. Keep the scene, characters and tone consistent. Never mention or quote this note.]`;
  const setNote = text => {
    const c = ctx();
    if (typeof c.setExtensionPrompt !== 'function') throw new Error('нет setExtensionPrompt в контексте');
    c.setExtensionPrompt(PROMPT_KEY, buildNote(text), 1, 0, false, 0);   // IN_CHAT, глубина 0, роль system
    active = true;
    view.clearTimeout(timer);
    timer = view.setTimeout(clearNote, SAFETY_MS);
  };

  const events = () => { const c = ctx(); return c.eventSource && c.eventTypes ? { source: c.eventSource, types: c.eventTypes } : null; };
  const ev = events();
  const listeners = [];
  if (ev) {
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_RECEIVED', 'CHAT_CHANGED']) {
      const type = ev.types[name]; if (!type) continue;
      ev.source.on(type, clearNote); listeners.push([type, clearNote]);
    }
  }
  undo.push(() => { for (const [type, fn] of listeners) ev?.source.removeListener(type, fn); clearNote(); });

  /* ───────── окно ввода ───────── */
  let open = false;
  const askNote = () => new Promise(resolve => {
    const shade = doc.createElement('div');
    shade.className = 'col-ask col-ask-fixed';
    shade.innerHTML = `<div class="col-ask-box col-regen-box" role="dialog" aria-label="Перегенерировать с правкой">
      <h4>Перегенерировать с правкой</h4>
      <p>Опиши, что не так с последним ответом. Это увидит только модель, в чат это не попадёт.</p>
      <textarea class="col-input col-regen-text" rows="5" maxlength="${MAX_LEN}" placeholder="Например: слишком много описаний, нужен диалог; персонаж не стал бы так говорить; ответ слишком длинный"></textarea>
      <div class="col-regen-meta"><span data-count></span><span>Ctrl+Enter отправить, Esc отмена</span></div>
      <div class="col-ask-btns"><button type="button" class="col-btn col-primary" data-act="ok">Перегенерировать</button><button type="button" class="col-btn" data-act="cancel">Отмена</button></div></div>`;
    doc.body.append(shade);
    const field = shade.querySelector('textarea');
    const count = shade.querySelector('[data-count]');
    field.value = S.last || '';
    const paint = () => { count.textContent = `${field.value.length} / ${MAX_LEN}`; };
    paint(); field.addEventListener('input', paint);
    const close = value => { shade.remove(); resolve(value); };
    const submit = () => { const text = field.value.trim(); if (!text) { field.classList.add('col-bad'); field.focus(); return; } close(text); };
    shade.addEventListener('click', event => {
      if (event.target === shade) return close(null);
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'ok') submit(); else if (act === 'cancel') close(null);
    });
    shade.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') close(null);
      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
    });
    field.addEventListener('input', () => field.classList.remove('col-bad'));
    field.focus();
  });

  const busy = () => { const stop = doc.getElementById('mes_stop'); return !!stop && view.getComputedStyle(stop).display !== 'none'; };

  const run = async () => {
    if (open) return;
    if (busy()) { globalThis.toastr?.warning?.('Идёт генерация. Дождись ответа или останови её.', 'Перегенерация с правкой'); return; }
    open = true;
    let text;
    try { text = await askNote(); } finally { open = false; }
    if (!text) return;
    try {
      S.last = text; save();
      setNote(text);
      // перегенерацию запускает сама Таверна: так работают и свайпы, и группы, и стриминг
      native.click();
      // если генерация не началась (например, Таверна отказалась), подсказку не оставляем висеть
      view.setTimeout(() => { if (active && !busy()) clearNote(); }, 4000);
    } catch (error) {
      clearNote();
      report('перегенерация с правкой', error);
      globalThis.toastr?.error?.('Не удалось запустить перегенерацию. Подробности в консоли.', 'Перегенерация с правкой');
    }
  };
  const onClick = event => { event.preventDefault(); run(); };   // событие идёт дальше: родной обработчик документа сам закроет меню
  item.addEventListener('click', onClick);
  undo.push(() => item.removeEventListener('click', onClick));

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат перегенерации с правкой', error); } } };
}
