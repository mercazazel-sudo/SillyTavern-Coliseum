/**
 * Мини-навык «собрать персонажа и лорбук».
 * Помощник выдаёт в ответе блок ```st-card с JSON; здесь блок находится, проверяется и по кнопке пользователя
 * превращается в настоящую карточку и лорбук Таверны. Ничего не создаётся без нажатия кнопки.
 * Только добавление: имена всегда уникальные, существующее не перезаписывается.
 */

const BLOCK = /```[ \t]*st-card[ \t]*\r?\n?([\s\S]*?)```/i;

export const LIMITS = {
  name: 60, description: 4000, personality: 2000, scenario: 2000, first_mes: 3000, mes_example: 3000,
  tag: 30, tags: 8, entries: 12, title: 80, keys: 8, key: 40, content: 1500, book: 60,
};

/** Инструкция для системного промпта: когда и как выдавать блок. */
export const SKILL_PROMPT = [
  'Навык «собрать персонажа». В этом окне ты помощник, а не партнёр по игре: НИКОГДА не играй роль персонажа и не пиши реплик за него. Если пользователь хочет поиграть, придумать историю или просит персонажа или лорбук, твоя задача подготовить основу для игры.',
  'Если не хватает важного, задай не больше двух коротких вопросов. Иначе: 1-2 живые фразы в своём характере (если человеку грустно, сначала по-человечески поддержи), затем ровно ОДИН блок такого вида, без пояснений внутри, и после блока одна короткая фраза:',
  '```st-card',
  '{"character":{"name":"","age":25,"description":"","personality":"","scenario":"","first_mes":"","mes_example":"","tags":["",""]},"lorebook":{"name":"","entries":[{"title":"","keys":["",""],"content":""}]}}',
  '```',
  'Правила: персонаж ВЗРОСЛЫЙ, age число не меньше 18; если просят младше, откажись и предложи взрослого. Пиши на русском, от третьего лица; пользователя называй [[user]], персонажа [[char]] (именно так, в двойных квадратных скобках, настоящих имён не подставляй). ПИШИ КОРОТКО: description до 600 знаков (внешность, характер, манера речи), personality до 200, scenario 1-2 предложения, first_mes 2-3 предложения (действия в *звёздочках*, речь обычным текстом, без действий и слов за [[user]]), mes_example оставь пустым. Лорбук 3-4 записи по 250 знаков: место, важная деталь и отдельная запись «Сюжет» из трёх шагов; keys это слова, по которым запись срабатывает.',
  'Ты только предлагаешь набросок: пользователь сам нажмёт «Загрузить в Таверну». Не говори, что уже загрузил, и не вставляй блок st-card, если не собираешь персонажа.',
].join('\n');

// Таверна подставляет имя персоны вместо {{user}} ещё до модели, поэтому в инструкции метки [[user]] и [[char]];
// здесь они возвращаются в настоящие макросы, чтобы карточка работала с любой персоной.
const fixMacros = text => text.replace(/\[\[\s*user\s*\]\]/gi, '{{user}}').replace(/\[\[\s*char\s*\]\]/gi, '{{char}}');
const clean = (value, max) => fixMacros(String(value ?? '').replace(/\u0000/g, '').trim()).slice(0, max);
const safeFile = (value, max) => clean(value, max).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/^\.+/, '').trim();

/** Проверяет и чистит присланное моделью. Возвращает { card } или { problem }. */
export function validateCard(raw) {
  const c = raw?.character;
  if (!c || typeof c !== 'object') return { problem: 'в блоке нет раздела character' };
  const name = safeFile(c.name, LIMITS.name);
  if (!name) return { problem: 'у персонажа нет имени' };
  const age = Number(c.age);
  if (!Number.isFinite(age)) return { problem: 'не указан возраст персонажа' };
  if (age < 18) return { problem: `персонаж младше 18 лет (указано ${Math.round(age)}), такого не загружаю` };
  const description = clean(c.description, LIMITS.description);
  const firstMes = clean(c.first_mes, LIMITS.first_mes);
  if (!description) return { problem: 'нет описания персонажа' };
  if (!firstMes) return { problem: 'нет первой реплики персонажа' };
  const tags = (Array.isArray(c.tags) ? c.tags : []).map(t => clean(t, LIMITS.tag)).filter(Boolean).slice(0, LIMITS.tags);

  const entries = [];
  const book = raw?.lorebook;
  if (book && Array.isArray(book.entries)) {
    for (const e of book.entries.slice(0, LIMITS.entries)) {
      const keys = (Array.isArray(e?.keys) ? e.keys : []).map(k => clean(k, LIMITS.key)).filter(Boolean).slice(0, LIMITS.keys);
      const content = clean(e?.content, LIMITS.content);
      if (!keys.length || !content) continue;
      entries.push({ title: clean(e?.title, LIMITS.title) || keys[0], keys, content });
    }
  }
  return {
    card: {
      character: {
        name, age: Math.round(age), description,
        personality: clean(c.personality, LIMITS.personality),
        scenario: clean(c.scenario, LIMITS.scenario),
        first_mes: firstMes,
        mes_example: clean(c.mes_example, LIMITS.mes_example),
        tags,
      },
      lorebook: entries.length ? { name: safeFile(book?.name, LIMITS.book) || `${name} (лорбук)`, entries } : null,
    },
  };
}

/** Находит блок в ответе. Возвращает { text (без блока), card, problem }. */
export function extractCard(text) {
  const source = String(text ?? '');
  const match = BLOCK.exec(source);
  if (!match) return { text: source, card: null, problem: null };
  const rest = (source.slice(0, match.index) + source.slice(match.index + match[0].length)).trim();
  let parsed;
  try { parsed = JSON.parse(match[1].trim()); } catch (error) { return { text: rest, card: null, problem: `блок не читается как JSON (${error.message})` }; }
  const result = validateCard(parsed);
  return { text: rest, card: result.card ?? null, problem: result.problem ?? null };
}

/** Свободное имя лорбука: к занятому добавляется номер. */
function uniqueBookName(base, existing) {
  const taken = new Set(existing.map(n => String(n).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}

/**
 * Создаёт лорбук (если есть записи), затем персонажа со ссылкой на него.
 * Возвращает { avatar, bookName, entries }. При ошибке бросает Error с понятным текстом.
 */
export async function uploadCard(context, card, helperName = '') {
  const { getRequestHeaders } = await import('/script.js');
  let bookName = '';
  let entryCount = 0;

  if (card.lorebook) {
    const wi = await import('/scripts/world-info.js');
    bookName = uniqueBookName(card.lorebook.name, context.getWorldInfoNames?.() ?? []);
    const data = { entries: {} };
    card.lorebook.entries.forEach((entry, index) => {
      const uid = index;
      data.entries[uid] = {
        uid, ...structuredClone(wi.newWorldInfoEntryTemplate),
        key: entry.keys, keysecondary: [], comment: entry.title, content: entry.content,
        constant: false, selective: false, disable: false, order: 100 + index, displayIndex: index,
      };
    });
    const saved = await fetch('/api/worldinfo/edit', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ name: bookName, data }) });
    if (!saved.ok) throw new Error(`лорбук не сохранился (ответ сервера ${saved.status})`);
    entryCount = card.lorebook.entries.length;
    try { await wi.updateWorldInfoList(); } catch { /* список обновится сам при следующем открытии */ }
  }

  const c = card.character;
  const body = {
    ch_name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.first_mes,
    mes_example: c.mes_example,
    creator_notes: helperName ? `Набросок собран помощником «${helperName}». Проверь и поправь текст перед игрой.` : 'Набросок собран помощником. Проверь и поправь текст перед игрой.',
    system_prompt: '', post_history_instructions: '', creator: '', character_version: '',
    tags: c.tags, talkativeness: '0.5', world: bookName,
    depth_prompt_prompt: '', depth_prompt_depth: '4', depth_prompt_role: 'system',
    fav: 'false', alternate_greetings: [], extensions: '{}',
  };
  const response = await fetch('/api/characters/create', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
  if (!response.ok) {
    const where = bookName ? ` Лорбук «${bookName}» уже создан и остался в Библиотеке.` : '';
    throw new Error(`персонаж не создался (ответ сервера ${response.status}).${where}`);
  }
  const avatar = (await response.text()).trim();
  try { await context.getCharacters?.(); } catch { /* список обновится при перезагрузке */ }
  return { avatar, bookName, entries: entryCount };
}
