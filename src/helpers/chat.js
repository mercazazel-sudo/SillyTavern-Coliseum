/** Запрос к модели Таверны. Идёт через generateRaw, основной чат не затрагивается. */
import { buildSystemPrompt } from './presets.js';

const CONTEXT_MESSAGES = 30; // сколько последних реплик диалога уходит модели

/**
 * Возвращает текст ответа или бросает ошибку.
 * history: массив { role, content, error? }; сообщения с error в запрос не попадают.
 */
export async function ask({ context, helper, history, responseLength = null }) {
  if (typeof context.generateRaw !== 'function') throw new Error('В этой версии Таверны нет generateRaw');
  const messages = history
    .filter(m => !m.error && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-CONTEXT_MESSAGES)
    .map(m => ({ role: m.role, content: String(m.sent ?? m.content) })); // sent: текст с вложениями, есть только у последнего вложенного
  if (!messages.length) throw new Error('Пустой запрос');
  const prompt = [{ role: 'system', content: buildSystemPrompt(helper) }, ...messages];
  return await context.generateRaw({ prompt, responseLength });
}

/** Прерывает текущую генерацию. Сигнал общий для Таверны: остановится и основной запрос, если он идёт. */
export function stop(context) {
  const type = context.eventTypes?.GENERATION_STOPPED;
  if (type) context.eventSource.emit(type);
}
