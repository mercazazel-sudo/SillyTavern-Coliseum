/**
 * «Закрепить маску за чатом»: пункт меню чата, который включает и выключает родную привязку персоны к текущему чату
 * (то же, что значок замка в Persona Management: «Lock persona to current chat», chat_metadata.persona).
 * Вся работа идёт через родные функции Таверны togglePersonaLock/isPersonaLocked, поэтому сохранение, уведомления
 * и подмена персоны при открытии чата работают как обычно.
 * Подпись пункта показывает действие и имя маски, значок: замок закрыт или открыт.
 */
import { report } from '../core/guard.js';

export const ITEM_ID = 'col_option_lock_persona';

/** Значок: рисунок автора, маска с замком; в CSS окрашивается цветом пункта (assets/icons/mask-lock-on.png и mask-lock-off.png). */

export async function startLockPersona(doc) {
  const view = doc.defaultView;
  const undo = [];
  const options = doc.getElementById('options');
  if (!options) { report('закрепление маски', new Error('нет меню чата')); return () => {}; }
  let personas;
  try { personas = await import('/scripts/personas.js'); } catch (error) { report('закрепление маски: модуль персон', error); return () => {}; }
  const ctx = () => globalThis.SillyTavern?.getContext?.() ?? {};

  const item = doc.createElement('a');
  item.id = ITEM_ID;
  item.innerHTML = '<span class="col-lockico off" aria-hidden="true"></span><span class="col-lock-label"></span>';
  const anchor = doc.getElementById('col_option_regen_note') ?? doc.getElementById('option_regenerate');
  if (anchor) anchor.after(item); else options.querySelector('.options-content')?.append(item);
  undo.push(() => item.remove());

  const locked = () => { try { return !!personas.isPersonaLocked('chat'); } catch { return false; } };
  /** Подпись и значок по текущему состоянию; вызывается при открытии меню и по событиям Таверны. */
  const paint = () => {
    const c = ctx();
    const name = (c.name1 ?? '').trim();
    const on = locked();
    const label = on ? 'Открепить маску от чата' : 'Закрепить маску за чатом';
    item.querySelector('.col-lock-label').textContent = label;
    const ico = item.querySelector('.col-lockico'); ico.classList.toggle('on', on); ico.classList.toggle('off', !on);
    item.title = on
      ? `Маска «${name}» закреплена за этим чатом: при открытии чата она надевается сама. Нажми, чтобы открепить.`
      : `Закрепить маску «${name}» за этим чатом: при открытии чата она будет надеваться сама.`;
    item.classList.toggle('col-lock-on', on);
  };
  paint();

  const c0 = ctx();
  const handlers = [];
  if (c0.eventSource && c0.eventTypes) {
    for (const name of ['CHAT_CHANGED', 'PERSONA_CHANGED', 'PERSONA_UPDATED', 'SETTINGS_UPDATED']) {
      const type = c0.eventTypes[name]; if (!type) continue;
      c0.eventSource.on(type, paint); handlers.push([type, paint]);
    }
  }
  undo.push(() => { for (const [type, fn] of handlers) c0.eventSource?.removeListener(type, fn); });
  const button = doc.getElementById('options_button');
  const onOpen = () => view.setTimeout(paint, 30);
  button?.addEventListener('click', onOpen);
  undo.push(() => button?.removeEventListener('click', onOpen));

  let busy = false;
  const onClick = async event => {
    event.preventDefault();   // событие идёт дальше: родной обработчик документа закроет меню сам
    if (busy) return;
    const c = ctx();
    if (!c.chatId) { globalThis.toastr?.warning?.('Сначала открой чат, затем закрепляй маску.', 'Закрепление маски'); return; }
    busy = true;
    try { await personas.togglePersonaLock('chat'); }
    catch (error) { report('закрепление маски', error); globalThis.toastr?.error?.('Не удалось изменить закрепление. Подробности в консоли.', 'Закрепление маски'); }
    finally { busy = false; paint(); }
  };
  item.addEventListener('click', onClick);
  undo.push(() => item.removeEventListener('click', onClick));

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат закрепления маски', error); } } };
}
