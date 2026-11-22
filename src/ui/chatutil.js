/**
 * Общие мелочи для работы с чатами: подпись давности, превью последнего сообщения, открытие чата персонажа.
 * Нужны и Галерее на главной (atrium.js), и окну «Архив» (archive.js).
 */
import { stContext } from './kit.js';

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

/** Номер персонажа в списке Таверны по имени файла аватара; бросает ошибку, если такого нет. */
export function characterIndex(avatar) {
  const id = stContext()?.characters?.findIndex(c => c.avatar === avatar) ?? -1;
  if (id < 0) throw new Error(`персонаж ${avatar} не найден`);
  return id;
}

/** Открывает персонажа по аватару (родной выбор карточки). */
export async function selectByAvatar(avatar) {
  const id = characterIndex(avatar);
  await stContext().selectCharacterById(id);
  return id;
}

/** Открывает чат персонажа по аватару и имени файла (с .jsonl или без). */
export async function openChatByFile(avatar, file) {
  await selectByAvatar(avatar);
  const ctx = stContext();
  const name = String(file).replace(/\.jsonl$/, '');
  if (ctx.getCurrentChatId?.() !== name) await ctx.openCharacterChat(name);
}
