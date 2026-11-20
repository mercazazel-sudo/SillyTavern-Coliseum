/**
 * Что модель знает о маске: два режима «или/или».
 *   «Анкета» — поля и разделы собираются в родное «Описание» маски; лорбук маски при этом отключается (запоминается).
 *   «Лорбук» — к маске подключён готовый лорбук; описание очищается (анкета остаётся в настройках и вернётся при переключении).
 * Режим меняется только по явному выбору. Пока он не выбран, ничего не записывается и не отключается.
 * Данные анкеты: settings.dossiers[id] = { mode, fmt, sections[{id,title,text,kind}], arc{tone,text}, loreSaved }.
 * Модель получает анкету тем же путём, что раньше описание: в поле «Описание» маски.
 */
import { report } from '../core/guard.js';
import { ask, debounce, esc } from './kit.js';

const TEMPLATES = {
  short: { title: 'Короткая', lines: ['Возраст', 'Занятие'], texts: ['Внешность', 'Характер', 'Прошлое'] },
  full: { title: 'Подробная', lines: ['Имя', 'Возраст', 'Пол', 'Занятие'], texts: ['Внешность', 'Характер', 'История', 'Речь и манеры', 'Отношения', 'Особенности'] },
};
const SUGGEST = ['Внешность', 'Характер', 'История', 'Речь и манеры', 'Отношения', 'Навыки', 'Слабости', 'Заметки'];
const TONES = [
  { v: -2, t: 'Тёмный путь', a: 'окружение склоняется к враждебному, жестокому отношению', en: 'the people around lean towards hostile, cruel treatment' },
  { v: -1, t: 'Скорее тёмный', a: 'окружение чаще недоброжелательно', en: 'the people around are more often unfriendly' },
  { v: 0, t: 'Ровный', a: 'окружение относится ровно, без перекоса в добро или зло', en: 'the people around treat them evenly, with no tilt towards good or evil' },
  { v: 1, t: 'Скорее светлый', a: 'окружение чаще доброжелательно', en: 'the people around are more often friendly' },
  { v: 2, t: 'Светлый путь', a: 'окружение тянется к доброму, тёплому отношению', en: 'the people around lean towards kind, warm treatment' },
];
const ARC_MAX = 180;
const uid = () => Math.random().toString(36).slice(2, 9);
const ICON_FORM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></svg>';
const ICON_LORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4zM6 4a2 2 0 0 0-2 2v2h2M10 9h6M10 13h6"/></svg>';
const ICON_ARC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18c4 0 5-12 9-12 3 0 3 6 7 6M16 9l4 3-4 3"/></svg>';

const orderOf = d => [...d.sections.filter(s => s.kind === 'line'), ...d.sections.filter(s => s.kind !== 'line')];
const toneOf = arc => TONES.find(x => x.v === arc?.tone);

/** Собирает текст для модели. Пустое пропускается. */
export function compile(d) {
  const parts = orderOf(d).map(s => ({ title: String(s.title ?? '').trim(), text: String(s.text ?? '').trim() })).filter(s => s.text);
  let out = d.fmt === 'prose'
    ? parts.map(s => (s.title ? `${s.title}. ${s.text}` : s.text)).join('\n\n')
    : parts.map(s => (s.title ? `${s.title}: ${s.text}` : s.text)).join('\n');
  const tone = toneOf(d.arc), note = String(d.arc?.text ?? '').trim();
  if (tone || note) {
    const en = d.lang === 'en';
    const arc = `${en ? 'Character arc (where to steer the story)' : 'Развитие персонажа (куда вести сюжет)'}: ${[en ? tone?.en : tone?.a, note].filter(Boolean).join('. ')}`;
    out = out ? `${out}${d.fmt === 'prose' ? '\n\n' : '\n'}${arc}` : arc;
  }
  return out;
}

export function createDossier({ doc, settings, save, ctx, activeId, getSelected, host, rerender, setLore }) {
  settings.dossiers ??= {};
  const store = settings.dossiers;
  const get = id => {
    const d = (store[id] ??= { mode: '', fmt: 'list', sections: [], arc: { tone: null, text: '' }, loreSaved: '' });
    d.sections ??= []; d.arc ??= { tone: null, text: '' };
    for (const s of d.sections) s.kind ??= 'text';
    return d;
  };
  const opened = new Map(); // раскрытые разделы в этой сессии
  const descriptor = id => ctx().powerUserSettings?.persona_descriptions?.[id];
  const nativeDesc = id => String(descriptor(id)?.description ?? '').trim();
  const nativeLore = id => String(descriptor(id)?.lorebook ?? '');

  /** Записывает текст в «Описание» маски. Надетая: через родное поле (Таверна сама обновит и сохранит); иначе напрямую. */
  const write = (id, text) => {
    try {
      const d = descriptor(id);
      if (!d) throw new Error('у маски нет описания в настройках');
      if (id === activeId()) {
        const area = doc.getElementById('persona_description');
        if (area) { area.value = text; area.dispatchEvent(new Event('input', { bubbles: true })); return; }
        ctx().powerUserSettings.persona_description = text;
      }
      d.description = text;
      ctx().saveSettingsDebounced?.();
    } catch (error) { report('запись анкеты в описание', error); }
  };
  /** Немедленная запись настроек Таверны: обычное сохранение откладывается на секунду и теряется, если страницу или сервер закрыли раньше. */
  const saveNow = async () => {
    try { const script = await import('/script.js'); await script.saveSettings(); }
    catch (error) { report('немедленное сохранение анкеты', error); save(); }
  };
  const sync = id => { const d = get(id); if (d.mode === 'form') write(id, compile(d)); save(); };
  const commit = debounce(id => sync(id), 450);

  const tokens = async text => {
    try { const n = await ctx().getTokenCountAsync?.(text); if (Number.isFinite(n)) return n; } catch { /* оценим по длине */ }
    return Math.ceil(text.length / 3.6);
  };
  const fit = el => { if (!el?.scrollHeight) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`; };
  const paint = async id => {
    doc.querySelectorAll('.col-dx-x').forEach(fit);
    const d = get(id);
    const full = d.mode === 'form' ? compile(d) : d.mode === 'lore' ? nativeDesc(id) : '';
    const n = full ? await tokens(full) : 0;
    const badge = doc.querySelector('[data-dx-tok2]');
    if (badge) badge.textContent = full ? `${n} ток.${d.mode === 'lore' ? ' (описание)' : ''}` : 'пусто';
    const box = doc.querySelector('[data-dx-pre]');
    if (!box) return;
    const text = compile(d);
    box.querySelector('pre').textContent = text || 'Пока пусто: заполни поля и разделы.';
    const label = box.querySelector('[data-dx-tok]');
    if (label) label.textContent = text ? `${n} ток.` : 'пусто';
  };
  const paintSoon = debounce(id => paint(id), 300);

  /* ───────── разметка ───────── */
  const modeCards = (cur, small) => {
    const card = (mode, icon, title, hint) => `<button type="button" class="col-dx-mode${cur === mode ? ' on' : ''}" data-dx-mode="${mode}" aria-pressed="${cur === mode}">
        <span class="col-dx-mi">${icon}</span><span class="col-dx-mt"><b>${title}</b><small>${hint}</small></span>${cur === mode ? '<em>уходит модели</em>' : ''}</button>`;
    return `<div class="col-dx-modes${small ? ' small' : ''}" role="group" aria-label="Как передавать информацию о маске">
      ${card('form', ICON_FORM, 'Анкета', 'Поля и разделы. Собираются в описание маски.')}${card('lore', ICON_LORE, 'Лорбук', 'Обычное описание и лорбук, как в Таверне.')}</div>`;
  };

  const lineHtml = s => `<label class="col-dx-line" data-sec="${esc(s.id)}"><span>${esc(s.title)}</span><input data-dx-linev value="${esc(s.text)}" placeholder="—" aria-label="${esc(s.title)}"><button type="button" data-dx-del title="Убрать поле" tabindex="-1">×</button></label>`;
  const secHtml = (s, i, list) => {
    const isOpen = opened.get(s.id) === true;
    const filled = !!String(s.text).trim();
    return `<article class="col-dx-sec${isOpen ? ' open' : ''}${filled ? ' filled' : ''}" data-sec="${esc(s.id)}">
      <header data-dx-toggle><i class="col-dx-caret"></i><b>${esc(s.title) || 'Без названия'}</b><span class="col-dx-meta">${filled ? `${String(s.text).trim().length} зн.` : 'пусто'}</span></header>
      ${filled && !isOpen ? `<p class="col-dx-peek">${esc(String(s.text).trim().replace(/\s+/g, ' ').slice(0, 90))}</p>` : ''}
      <div class="col-dx-body"><input class="col-dx-t" data-dx-title value="${esc(s.title)}" placeholder="Название раздела" aria-label="Название раздела">
        <textarea class="col-dx-x" data-dx-text rows="3" placeholder="Что модель должна знать…">${esc(s.text)}</textarea>
        <div class="col-dx-ctl"><button type="button" data-dx-up${i === 0 ? ' disabled' : ''}>▲ выше</button><button type="button" data-dx-down${i === list.length - 1 ? ' disabled' : ''}>▼ ниже</button><button type="button" data-dx-del class="danger">Удалить</button></div></div></article>`;
  };
  const arcHtml = d => {
    const cur = d.arc.tone;
    return `<article class="col-dx-arc"><header><span class="col-dx-ai">${ICON_ARC}</span><span><b>Развитие персонажа</b><small>Куда вести историю: как окружение будет относиться к персонажу</small></span><button type="button" class="col-btn col-gen col-dx-arcgen" data-dx-arcgen title="Модель прочитает анкету (или лорбук) и предложит направление">✦ Предложить</button></header>
      <div class="col-dx-tones" role="group" aria-label="Куда вести персонажа">${TONES.map(x => `<button type="button" class="t${x.v}${cur === x.v ? ' on' : ''}" data-dx-tone="${x.v}" title="${esc(x.a)}">${esc(x.t)}</button>`).join('')}</div>
      <input class="col-dx-arcin" data-dx-arctext maxlength="${ARC_MAX}" value="${esc(d.arc.text)}" placeholder="Коротко, например: сначала ему не доверяют, потом принимают" aria-label="Развитие персонажа, коротко">
      <small class="col-dx-hint">Нажми выбранный вариант ещё раз, чтобы убрать. Уходит модели одной строкой.</small></article>`;
  };

  /** Весь раздел «Что знает модель». */
  const html = me => {
    const d = get(me.id), lore = me.lore;
    if (!d.mode) {
      const have = [nativeDesc(me.id) ? `описание ${nativeDesc(me.id).length} зн.` : '', lore ? `лорбук «${lore}»` : ''].filter(Boolean);
      return `<section class="col-ms-sec col-dx"><h4>Что знает модель о маске</h4>
        <p class="col-note">Выбери один способ. «Анкета» собирает описание из полей, «Лорбук» оставляет привычное описание и подключённый лорбук. Данные второго способа сохранятся.${have.length ? ` Сейчас у маски: ${esc(have.join(' и '))}.` : ''}</p>${modeCards('', false)}</section>`;
    }
    const head = `<h4 class="col-dx-h">Что знает модель о маске<span class="col-dx-tokbadge" data-dx-tok2 title="Сколько токенов это занимает в каждом запросе к модели"></span></h4>${modeCards(d.mode, true)}`;
    if (d.mode === 'lore') {
      return `<section class="col-ms-sec col-dx">${head}
        <h5 class="col-dx-sub">Описание</h5>
        <textarea class="col-input col-me-desc" data-desc placeholder="кто ты в этой истории… (обычное описание, как в Таверне)">${esc(me.desc)}</textarea>
        <div class="col-dx-tools sm">${d.descRu !== undefined ? '<span class="col-badge on">English</span><button type="button" class="col-btn" data-dx-desclang="ru" title="Вернуть русский текст описания">Вернуть русский</button>' : '<button type="button" class="col-btn" data-dx-desclang="en" title="Перевести описание на английский (русский вариант сохранится)">Перевести на английский</button>'}</div>
        <h5 class="col-dx-sub">Лорбук</h5>
        <div class="col-dx-lore">${lore ? `<div class="col-dx-book"><span class="col-dx-mi">${ICON_LORE}</span><button type="button" class="col-ms-book" data-lore-open="${esc(lore)}" title="Открыть в свитке">${esc(lore)}</button></div>`
          : '<p class="col-note">Лорбук не подключён.</p>'}
          <div class="col-ms-btns"><button type="button" class="col-btn${lore ? '' : ' col-primary'}" data-lore-link>${lore ? 'Сменить' : 'Подключить лорбук'}</button>${lore ? '<button type="button" class="col-btn col-danger" data-lore-unlink>Отвязать</button>' : ''}
            <button type="button" class="col-btn" data-dx-import title="Скопировать записи лорбука в разделы анкеты">Перенести в анкету</button></div>
          ${d.sections.length ? `<p class="col-note">Анкета (${d.sections.length} разд.) сохранена. Она вернётся, если включить режим «Анкета».</p>` : ''}</div></section>`;
    }
    const lines = d.sections.filter(s => s.kind === 'line'), texts = d.sections.filter(s => s.kind !== 'line');
    const used = new Set(d.sections.map(s => s.title.trim().toLowerCase()));
    const sugg = SUGGEST.filter(t => !used.has(t.toLowerCase())).slice(0, 5).map(t => `<button type="button" class="col-dx-chip" data-dx-add="${esc(t)}">+ ${esc(t)}</button>`).join('');
    return `<section class="col-ms-sec col-dx">${head}
      <button type="button" class="col-dx-idea" data-dx-idea><span class="col-dx-ideai">✦</span><span><b>Сгенерировать по идее</b><small>Напиши, что знаешь о персонаже. Анкету составит модель.</small></span></button>
      <div class="col-dx-tools"><button type="button" class="col-btn col-gen" data-dx-gen title="Модель прочитает записи лорбука и сама заполнит разделы анкеты">✦ Сгенерировать по лорбуку</button><button type="button" class="col-btn" data-dx-import title="Скопировать записи лорбука как есть">Из лорбука</button></div>
      <div class="col-dx-tools sm"><button type="button" class="col-btn" data-dx-tpl>Шаблон</button>${d.lang === 'en' ? '<span class="col-badge on">English</span><button type="button" class="col-btn" data-dx-lang="ru" title="Вернуть русский текст">Вернуть русский</button>' : '<button type="button" class="col-btn" data-dx-lang="en" title="Перевести всю анкету на английский (русский вариант сохранится)">Перевести на английский</button>'}</div>
      ${lines.length ? `<div class="col-dx-lines">${lines.map(lineHtml).join('')}</div>` : ''}
      <div class="col-dx-secs">${texts.map((s, i) => secHtml(s, i, texts)).join('') || (lines.length ? '' : '<p class="col-note">Пока пусто. Выбери шаблон или добавь поле и раздел.</p>')}</div>
      <div class="col-dx-add"><button type="button" class="col-btn" data-dx-newline>+ Поле</button><button type="button" class="col-btn" data-dx-new>+ Раздел</button>${sugg}</div>
      ${arcHtml(d)}
      <details class="col-ds-pre" data-dx-pre><summary>Что уйдёт модели <b data-dx-tok></b></summary>
        <div class="col-dx-fmtrow"><span>Как записать текст</span><span class="col-ds-fmt"><button type="button" class="${d.fmt === 'list' ? 'on' : ''}" data-dx-fmt="list" title="Каждое поле с новой строки: «Характер: ...»">Строками</button><button type="button" class="${d.fmt === 'prose' ? 'on' : ''}" data-dx-fmt="prose" title="Разделы идут абзацами: «Характер. ...»">Абзацами</button></span></div>
        <p class="col-dx-hint">Это только оформление, смысл остаётся тем же. Ниже видно, как выглядит результат.</p><pre></pre></details></section>`;
  };

  /* ───────── переключение режима ───────── */
  /** Если анкета ещё пуста, прежнее описание маски не теряется: оно становится разделом «Заметки». */
  const ensureSections = id => {
    const d = get(id);
    if (d.sections.length) return;
    const text = nativeDesc(id);
    if (text) d.sections = [{ id: uid(), title: 'Заметки', text, kind: 'text' }];
    else {
      for (const t of TEMPLATES.short.lines) d.sections.push({ id: uid(), title: t, text: '', kind: 'line' });
      for (const t of TEMPLATES.short.texts) d.sections.push({ id: uid(), title: t, text: '', kind: 'text' });
    }
  };
  /**
   * «Анкета»: описание собирается из разделов, лорбук отключается (запоминается).
   * «Лорбук»: обычное описание, как в Таверне, плюс лорбук. Своё обычное описание каждый режим хранит отдельно (descSaved).
   */
  const applyMode = (id, mode) => {
    const d = get(id);
    const first = !d.mode;
    if (mode === 'form') {
      d.descSaved = String(descriptor(id)?.description ?? ''); // обычное описание (то, что сейчас в поле) вернётся при переключении назад
      ensureSections(id);
      d.loreSaved = nativeLore(id);
      if (d.loreSaved) setLore(id, '');
      d.mode = 'form';
      write(id, compile(d));
    } else {
      if (!first) {
        // у анкеты, начатой до появления descSaved, прежнее описание лежит в разделе «Заметки»
        const back = d.descSaved ?? String(d.sections.find(x => norm(x.title) === 'заметки')?.text ?? '');
        write(id, back);
      }
      d.mode = 'lore';
      if (d.loreSaved && !nativeLore(id)) setLore(id, d.loreSaved);
    }
    save(); rerender(); saveNow();
  };

  const after = id => { sync(id); rerender(); saveNow(); };
  const findSec = (id, el) => get(id).sections.find(s => s.id === el.closest('[data-sec]')?.dataset.sec);

  /* ───────── импорт из лорбука (несколько записей) ───────── */
  const pickEntries = (book, entries) => new Promise(resolve => {
    const shade = doc.createElement('div');
    shade.className = 'col-ask';
    const label = e => String(e.comment || (e.key ?? []).join(', ') || `запись ${e.uid}`).slice(0, 90);
    shade.innerHTML = `<div class="col-ask-box col-dx-imp" role="dialog" aria-label="Записи лорбука"><h4>Записи из «${esc(book)}»</h4>
      <p>Отметь, что скопировать в разделы анкеты. Это копия: потом лорбук и анкета живут отдельно.</p>
      <div class="col-dx-implist">${entries.map(e => `<label><input type="checkbox" value="${esc(String(e.uid))}"><span>${esc(label(e))}</span><small>${String(e.content).trim().length} зн.</small></label>`).join('')}</div>
      <div class="col-ask-btns"><button type="button" class="col-btn" data-act="all">Все</button><button type="button" class="col-btn col-primary" data-act="ok">Добавить выбранные</button><button type="button" class="col-btn" data-act="cancel">Отмена</button></div></div>`;
    host().append(shade);
    const boxes = () => [...shade.querySelectorAll('input[type="checkbox"]')];
    const refresh = () => { const n = boxes().filter(b => b.checked).length; shade.querySelector('[data-act="ok"]').textContent = n ? `Добавить выбранные (${n})` : 'Добавить выбранные'; };
    shade.addEventListener('change', refresh);
    const close = value => { shade.remove(); resolve(value); };
    shade.addEventListener('click', event => {
      if (event.target === shade) return close([]);
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'all') { const all = boxes().every(b => b.checked); boxes().forEach(b => { b.checked = !all; }); refresh(); }
      else if (act === 'ok') close(boxes().filter(b => b.checked).map(b => b.value));
      else if (act === 'cancel') close([]);
    });
    shade.addEventListener('keydown', event => { if (event.key === 'Escape') close([]); });
    shade.querySelector('[data-act="ok"]').focus();
  });
  const entryLabel = e => String(e.comment || (e.key ?? []).join(', ') || `запись ${e.uid}`).slice(0, 90);
  /** Выбор лорбука и записей в нём. Возвращает { book, chosen[] } или null. */
  const selectEntries = async id => {
    const names = typeof ctx().getWorldInfoNames === 'function' ? ctx().getWorldInfoNames() : [];
    if (!names.length) { await ask(host(), { title: 'Лорбуков нет', text: 'Сначала создай лорбук в Библиотеке.', ok: 'Понятно' }); return null; }
    const attached = nativeLore(id) || get(id).loreSaved;
    const book = (attached && names.includes(attached)) ? attached
      : await ask(host(), { title: 'Из какого лорбука взять?', options: [...names].sort((a, b) => a.localeCompare(b, 'ru')).map(n => ({ value: n, label: n })) });
    if (!book) return null;
    const data = await ctx().loadWorldInfo(book);
    const entries = Object.values(data?.entries ?? {}).filter(e => String(e.content ?? '').trim());
    if (!entries.length) { await ask(host(), { title: 'В лорбуке нет записей с текстом', ok: 'Понятно' }); return null; }
    const picked = await pickEntries(book, entries.slice(0, 400));
    if (!picked.length) return null;
    return { book, chosen: picked.map(u => entries.find(x => String(x.uid) === u)).filter(Boolean) };
  };
  const importFromLore = async id => {
    try {
      const sel = await selectEntries(id);
      if (!sel) return;
      const d = get(id);
      for (const e of sel.chosen) {
        const section = { id: uid(), title: String(e.comment || (e.key ?? [])[0] || `Запись ${e.uid}`).slice(0, 60), text: String(e.content).trim(), kind: 'text' };
        d.sections.push(section);
        opened.set(section.id, false);
      }
      save();
      if (d.mode === 'form') sync(id);
      rerender();
      globalThis.toastr?.success?.(d.mode === 'form' ? `Добавлено разделов: ${sel.chosen.length}.` : `Добавлено разделов: ${sel.chosen.length}. Включи режим «Анкета», чтобы они ушли модели.`, 'Колизей');
    } catch (error) { report('импорт из лорбука в анкету', error); globalThis.toastr?.error?.('Не удалось взять записи из лорбука. Подробности в консоли.', 'Колизей'); }
  };

  /* ───────── запросы к модели (родное generateRaw: то API, что подключено сейчас) ───────── */
  const norm = v => String(v ?? '').trim().toLowerCase();
  const personaName = id => String(ctx().powerUserSettings?.personas?.[id] ?? ctx().name1 ?? 'персонаж');
  const parseJson = raw => {
    const t = String(raw ?? '').replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('модель не вернула разборчивый ответ');
    return JSON.parse(t.slice(a, b + 1));
  };
  /** Окно «Модель работает…» с отменой. */
  const working = text => {
    const shade = doc.createElement('div');
    shade.className = 'col-ask';
    shade.innerHTML = `<div class="col-ask-box" role="dialog" aria-label="${esc(text)}"><h4>${esc(text)}</h4><p>Запрос идёт к подключённой модели, это может занять до минуты.</p><div class="col-ask-btns"><button type="button" class="col-btn" data-act="cancel">Отмена</button></div></div>`;
    host().append(shade);
    const job = { cancelled: false, close: () => shade.remove(), onCancel: null };
    shade.addEventListener('click', event => {
      if (!event.target.closest('[data-act="cancel"]')) return;
      job.cancelled = true;
      try { ctx().eventSource?.emit?.(ctx().eventTypes?.GENERATION_STOPPED); } catch { /* не страшно */ }
      shade.remove(); job.onCancel?.();
    });
    return job;
  };
  /** Выполняет запрос; при отмене возвращает null, при ошибке показывает сообщение и тоже null. */
  const askModel = async (label, { prompt, systemPrompt, responseLength = 1800 }) => {
    const job = working(label);
    try {
      if (typeof ctx().generateRaw !== 'function') throw new Error('в этой версии Таверны нет generateRaw');
      const cancelled = new Promise((_, reject) => { job.onCancel = () => reject(new Error('cancelled')); });
      const raw = await Promise.race([ctx().generateRaw({ prompt, systemPrompt, responseLength }), cancelled]);
      return parseJson(raw);
    } catch (error) {
      if (String(error?.message) !== 'cancelled') {
        report(label, error);
        globalThis.toastr?.error?.(`Не получилось: ${error?.message ?? error}. Проверь, что API подключено.`, 'Колизей');
      }
      return null;
    } finally { job.close(); }
  };

  /** Окно проверки: что предложила модель по каждому пункту. Возвращает [{ index, text, mode }] отмеченного. */
  const reviewDialog = (title, rows) => new Promise(resolve => {
    const shade = doc.createElement('div');
    shade.className = 'col-ask';
    shade.innerHTML = `<div class="col-ask-box col-dx-imp col-dx-rv" role="dialog" aria-label="${esc(title)}"><h4>${esc(title)}</h4>
      <p>Проверь и поправь текст. Записывается только отмеченное.</p>
      <div class="col-dx-rvlist">${rows.map((r, i) => `<div class="col-dx-rvrow" data-i="${i}"><label class="col-dx-rvh"><input type="checkbox" data-ck${r.checked ? ' checked' : ''}><b>${esc(r.title)}</b><small>${r.old ? `сейчас ${r.old.length} зн.` : 'пусто'}</small></label>
        <textarea class="col-dx-rvx" rows="2">${esc(r.text)}</textarea>
        ${r.old ? `<div class="col-dx-rvm"><label><input type="radio" name="m${i}" value="replace" checked> заменить</label><label><input type="radio" name="m${i}" value="append"> дописать к имеющемуся</label></div>` : ''}</div>`).join('')}</div>
      <div class="col-ask-btns"><button type="button" class="col-btn col-primary" data-act="ok">Записать отмеченное</button><button type="button" class="col-btn" data-act="cancel">Отмена</button></div></div>`;
    host().append(shade);
    shade.querySelectorAll('.col-dx-rvx').forEach(fit);
    const close = value => { shade.remove(); resolve(value); };
    shade.addEventListener('input', event => { if (event.target.matches('.col-dx-rvx')) fit(event.target); });
    shade.addEventListener('click', event => {
      if (event.target === shade) return close([]);
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') return close([]);
      if (act !== 'ok') return;
      close([...shade.querySelectorAll('.col-dx-rvrow')].filter(r => r.querySelector('[data-ck]').checked).map(r => ({
        index: Number(r.dataset.i), text: r.querySelector('.col-dx-rvx').value.trim(), mode: r.querySelector('input[type="radio"]:checked')?.value ?? 'replace',
      })).filter(x => x.text));
    });
    shade.addEventListener('keydown', event => { if (event.key === 'Escape') close([]); });
  });

  /** «Сгенерировать по лорбуку»: модель читает записи и заполняет пункты анкеты своими словами. */
  const generateFromLore = async id => {
    try {
      const d = get(id);
      if (!d.sections.length) { ensureSections(id); }
      const sel = await selectEntries(id);
      if (!sel) return;
      const lore = sel.chosen.map(e => `### ${entryLabel(e)}\n${String(e.content).trim()}`).join('\n\n').slice(0, 24000);
      const est = await tokens(lore);
      if (est > 5000 && !(await ask(host(), { title: 'Большой запрос', text: `В модель уйдёт примерно ${est} токенов (это ваш расход на подключённом API). Отправить?`, ok: 'Отправить' }))) return;
      const targets = d.sections.map(s => ({ title: s.title, size: s.kind === 'line' ? 'одна короткая строка' : '1–4 предложения' }));
      const res = await askModel('Модель читает лорбук…', {
        systemPrompt: 'Ты помощник для ролевых игр. По записям лорбука составь анкету персонажа. Используй только факты из записей, ничего не придумывай и не добавляй от себя. Если для пункта в записях нет данных, верни для него пустую строку. Пиши по-русски, кратко, без воды, от третьего лица. Отвечай строго одним JSON-объектом без пояснений и без markdown.',
        prompt: `Персонаж: ${personaName(id)}\n\nПункты анкеты:\n${JSON.stringify(targets)}\n\nЗаписи лорбука «${sel.book}»:\n${lore}\n\nФормат ответа: {"items":[{"title":"название пункта как в списке","text":"текст"}]} — для каждого пункта списка, в том же порядке.`,
        responseLength: 1800,
      });
      if (!res) return;
      const items = Array.isArray(res.items) ? res.items : [];
      const rows = d.sections.map((s, i) => {
        const it = items.find(x => norm(x.title) === norm(s.title)) ?? (items.length === d.sections.length ? items[i] : null);
        const text = String(it?.text ?? '').trim(), old = String(s.text ?? '').trim();
        return { title: s.title, old, text, checked: !!text && !old };
      });
      if (!rows.some(r => r.text)) { await ask(host(), { title: 'Модель ничего не нашла', text: 'В выбранных записях нет сведений для этих пунктов. Выбери другие записи.', ok: 'Понятно' }); return; }
      const chosen = await reviewDialog('Что предложила модель', rows.filter(r => r.text).map(r => r));
      if (!chosen.length) return;
      const shown = rows.filter(r => r.text);
      for (const c of chosen) {
        const idx = d.sections.findIndex(s => s.title === shown[c.index].title);
        const sec = d.sections[idx];
        if (!sec) continue;
        sec.text = c.mode === 'append' && String(sec.text).trim() ? `${String(sec.text).trim()}\n${c.text}` : c.text;
        if (sec.kind !== 'line') opened.set(sec.id, true);
      }
      after(id);
      globalThis.toastr?.success?.(`Записано пунктов: ${chosen.length}.`, 'Колизей');
    } catch (error) { report('генерация анкеты по лорбуку', error); globalThis.toastr?.error?.('Не удалось сгенерировать анкету. Подробности в консоли.', 'Колизей'); }
  };

  /** «Предложить» развитие: по анкете, а если она пуста, по подключённому лорбуку. */
  const suggestArc = async id => {
    try {
      const d = get(id);
      let source = compile({ ...d, arc: { tone: null, text: '' }, lang: '' }).trim();
      if (source.length < 40) {
        const book = nativeLore(id) || d.loreSaved;
        if (book) {
          const data = await ctx().loadWorldInfo(book);
          source = Object.values(data?.entries ?? {}).map(e => String(e.content ?? '').trim()).filter(Boolean).join('\n\n').slice(0, 8000);
        }
      }
      if (!source.trim()) { await ask(host(), { title: 'Не из чего предлагать', text: 'Заполни анкету или подключи лорбук маски: модель отталкивается от того, что известно о персонаже.', ok: 'Понятно' }); return; }
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await askModel('Модель думает над развитием…', {
          systemPrompt: 'Ты помощник для ролевых игр. По сведениям о персонаже предложи, куда вести его историю: как окружение будет относиться к нему по мере сюжета. Не придумывай фактов, которых нет в сведениях. Отвечай строго одним JSON-объектом без пояснений: {"tone": целое число от -2 до 2, где -2 враждебное и жестокое окружение, 0 ровное, 2 доброжелательное и тёплое; "text": короткая фраза по-русски, до 150 знаков, о том, как должно меняться отношение к персонажу}.',
          prompt: `Персонаж: ${personaName(id)}\n\nСведения:\n${source}`,
          responseLength: 300,
        });
        if (!res) return;
        const tone = TONES.find(x => x.v === Math.max(-2, Math.min(2, Math.round(Number(res.tone)))));
        const text = String(res.text ?? '').trim().slice(0, ARC_MAX);
        if (!tone) throw new Error('модель не указала направление');
        const pick = await ask(host(), { title: 'Предложенное развитие', text: `${tone.t}. ${text}`, options: [{ value: 'ok', label: 'Принять' }, { value: 'again', label: 'Предложить другое' }] });
        if (pick === 'ok') { d.arc.tone = tone.v; d.arc.text = text; after(id); return; }
        if (pick !== 'again') return;
      }
    } catch (error) { report('предложение развития', error); globalThis.toastr?.error?.('Не удалось предложить развитие. Подробности в консоли.', 'Колизей'); }
  };

  /** Окно с полем для идеи. Возвращает текст или null. */
  let lastIdea = '';
  const ideaDialog = () => new Promise(resolve => {
    const shade = doc.createElement('div');
    shade.className = 'col-ask';
    shade.innerHTML = `<div class="col-ask-box col-dx-imp" role="dialog" aria-label="Сгенерировать по идее"><h4>Сгенерировать по идее</h4>
      <p>Опиши персонажа как умеешь: пара фраз, образ, роль в истории. Чего не хватает, модель придумает в духе твоей идеи.</p>
      <textarea class="col-input col-dx-idea-in" rows="6" placeholder="например: бывшая наёмница, осела в портовом городе, не доверяет магам, скрывает шрам…">${esc(lastIdea)}</textarea>
      <div class="col-ask-btns"><button type="button" class="col-btn col-primary" data-act="ok">Сгенерировать</button><button type="button" class="col-btn" data-act="cancel">Отмена</button></div></div>`;
    host().append(shade);
    const area = shade.querySelector('textarea');
    const close = value => { if (value) lastIdea = value; shade.remove(); resolve(value); };
    shade.addEventListener('click', event => {
      if (event.target === shade) return close(null);
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') close(null);
      else if (act === 'ok') { const v = area.value.trim(); if (v) close(v); else area.focus(); }
    });
    shade.addEventListener('keydown', event => {
      if (event.key === 'Escape') close(null);
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { const v = area.value.trim(); if (v) close(v); }
    });
    area.focus();
  });

  /** «Сгенерировать по идее»: из короткого описания модель заполняет поля, разделы и предлагает развитие. */
  const generateFromIdea = async id => {
    try {
      const d = get(id);
      const idea = await ideaDialog();
      if (!idea) return;
      // пустая анкета получает полный набор пунктов, чтобы было что заполнять
      const have = new Set(d.sections.map(x => norm(x.title)));
      if (d.sections.length < 3) {
        for (const t of TEMPLATES.full.lines) if (!have.has(norm(t))) d.sections.push({ id: uid(), title: t, text: '', kind: 'line' });
        for (const t of TEMPLATES.full.texts) if (!have.has(norm(t))) d.sections.push({ id: uid(), title: t, text: '', kind: 'text' });
      }
      const targets = d.sections.map(x => ({ title: x.title, size: x.kind === 'line' ? 'одна короткая строка' : '1–4 предложения' }));
      const res = await askModel('Модель составляет анкету…', {
        systemPrompt: 'Ты помощник для ролевых игр. По краткой идее составь анкету персонажа. Опирайся на то, что сказано в идее, и сохраняй это точно. Недостающие детали придумывай правдоподобно, в духе идеи, без противоречий, без пафоса и без штампов. Пиши по-русски, кратко, от третьего лица. Если пункт не имеет смысла для этого персонажа, верни для него пустую строку. Для "arc" выбери, как окружение будет относиться к персонажу по мере сюжета: tone целое от -2 (враждебное, жестокое) до 2 (доброжелательное, тёплое), text короткая фраза до 150 знаков. Отвечай строго одним JSON-объектом без пояснений и без markdown.',
        prompt: `Идея: ${idea}\n\nПункты анкеты:\n${JSON.stringify(targets)}\n\nФормат ответа: {"items":[{"title":"название пункта как в списке","text":"текст"}],"arc":{"tone":0,"text":"..."}} — для каждого пункта списка, в том же порядке.`,
        responseLength: 2000,
      });
      if (!res) { rerender(); return; }
      const items = Array.isArray(res.items) ? res.items : [];
      const rows = d.sections.map((sec, i) => {
        const it = items.find(x => norm(x.title) === norm(sec.title)) ?? (items.length === d.sections.length ? items[i] : null);
        const text = String(it?.text ?? '').trim(), old = String(sec.text ?? '').trim();
        return { title: sec.title, old, text, checked: !!text && !old };
      }).filter(r => r.text);
      if (!rows.length) { await ask(host(), { title: 'Модель не вернула текст', text: 'Попробуй описать идею подробнее.', ok: 'Понятно' }); rerender(); return; }
      const chosen = await reviewDialog('Анкета по твоей идее', rows);
      for (const c of chosen) {
        const sec = d.sections.find(x => x.title === rows[c.index].title);
        if (!sec) continue;
        sec.text = c.mode === 'append' && String(sec.text).trim() ? `${String(sec.text).trim()}\n${c.text}` : c.text;
        if (sec.kind !== 'line') opened.set(sec.id, false);
      }
      const tone = TONES.find(x => x.v === Math.max(-2, Math.min(2, Math.round(Number(res.arc?.tone)))));
      const arcText = String(res.arc?.text ?? '').trim().slice(0, ARC_MAX);
      if (tone && (arcText || tone)) {
        const pick = await ask(host(), { title: 'Развитие персонажа', text: `${tone.t}. ${arcText}`, options: [{ value: 'ok', label: 'Принять' }, { value: 'skip', label: 'Пропустить' }] });
        if (pick === 'ok') { d.arc.tone = tone.v; d.arc.text = arcText; }
      }
      after(id);
      if (chosen.length) globalThis.toastr?.success?.(`Записано пунктов: ${chosen.length}.`, 'Колизей');
    } catch (error) { report('генерация анкеты по идее', error); globalThis.toastr?.error?.('Не удалось сгенерировать анкету. Подробности в консоли.', 'Колизей'); }
  };

  /** Перевод анкеты на английский: русский вариант хранится рядом и возвращается кнопкой. */
  const translateAll = async id => {
    try {
      const d = get(id);
      if (!d.sections.some(s => String(s.text).trim())) { await ask(host(), { title: 'Переводить нечего', text: 'В анкете пока нет текста.', ok: 'Понятно' }); return; }
      if (!(await ask(host(), { title: 'Перевести анкету на английский?', text: 'Русский вариант сохранится, вернуть его можно кнопкой. Запрос уйдёт подключённой модели.', ok: 'Перевести' }))) return;
      const payload = { items: d.sections.map(s => ({ title: s.title, text: s.text })), arc: d.arc.text };
      const res = await askModel('Модель переводит анкету…', {
        systemPrompt: 'You are a precise translator. Translate the given Russian JSON values into natural English, one to one, without adding, omitting or explaining anything. Keep the JSON structure and the order of items exactly. Empty strings stay empty. Reply with the JSON object only, no markdown.',
        prompt: JSON.stringify(payload),
        responseLength: 2500,
      });
      if (!res) return;
      if (!Array.isArray(res.items) || res.items.length !== d.sections.length) throw new Error('перевод вернулся неполным');
      d.sections.forEach((s, i) => {
        s.ruTitle ??= s.title; s.ruText ??= s.text;
        s.title = String(res.items[i]?.title ?? s.title).trim() || s.title;
        s.text = String(res.items[i]?.text ?? '').trim();
      });
      d.arc.ruText ??= d.arc.text;
      d.arc.text = String(res.arc ?? '').trim().slice(0, ARC_MAX * 2);
      d.lang = 'en';
      after(id);
      globalThis.toastr?.success?.('Анкета переведена. Модель теперь получает английский текст.', 'Колизей');
    } catch (error) { report('перевод анкеты', error); globalThis.toastr?.error?.('Не удалось перевести анкету. Подробности в консоли.', 'Колизей'); }
  };
  /** Перевод обычного описания (режим «Лорбук»): русский текст хранится в descRu и возвращается кнопкой. */
  const translateDesc = async id => {
    try {
      const d = get(id), text = nativeDesc(id);
      if (!String(text).trim()) { await ask(host(), { title: 'Переводить нечего', text: 'Описание пока пустое.', ok: 'Понятно' }); return; }
      if (!(await ask(host(), { title: 'Перевести описание на английский?', text: 'Русский вариант сохранится, вернуть его можно кнопкой. Запрос уйдёт подключённой модели.', ok: 'Перевести' }))) return;
      const res = await askModel('Модель переводит описание…', {
        systemPrompt: 'You are a precise translator. Translate the Russian text in the "text" field into natural English without adding, omitting or explaining anything. Keep line breaks, lists and formatting. Reply with a JSON object {"text": "..."} only, no markdown.',
        prompt: JSON.stringify({ text }),
        responseLength: 2500,
      });
      if (!res) return;
      const out = String(res.text ?? '').trim();
      if (!out) throw new Error('перевод вернулся пустым');
      d.descRu = text;
      write(id, out);
      save(); rerender();
      globalThis.toastr?.success?.('Описание переведено. Модель получает английский текст.', 'Колизей');
    } catch (error) { report('перевод описания', error); globalThis.toastr?.error?.('Не удалось перевести описание. Подробности в консоли.', 'Колизей'); }
  };
  const revertDesc = async id => {
    const d = get(id);
    if (!(await ask(host(), { title: 'Вернуть русский текст?', text: 'Правки, сделанные в английской версии, пропадут.', ok: 'Вернуть', danger: true }))) return;
    write(id, d.descRu ?? ''); delete d.descRu;
    save(); rerender();
  };
  const revertLang = async id => {
    const d = get(id);
    if (!(await ask(host(), { title: 'Вернуть русский текст?', text: 'Правки, сделанные в английской версии, пропадут.', ok: 'Вернуть', danger: true }))) return;
    for (const s of d.sections) { if (s.ruTitle !== undefined) { s.title = s.ruTitle; delete s.ruTitle; } if (s.ruText !== undefined) { s.text = s.ruText; delete s.ruText; } }
    if (d.arc.ruText !== undefined) { d.arc.text = d.arc.ruText; delete d.arc.ruText; }
    d.lang = '';
    after(id);
  };

  /* ───────── события ───────── */
  const onClick = async event => {
    const t = event.target, id = getSelected();
    if (!id || !t.closest('.col-dx')) return false;
    const d = get(id);
    const mode = t.closest('[data-dx-mode]');
    if (mode) { if (mode.dataset.dxMode !== d.mode) applyMode(id, mode.dataset.dxMode); return true; }
    const toggle = t.closest('[data-dx-toggle]');
    if (toggle) {
      const sec = toggle.closest('.col-dx-sec'), on = !sec.classList.contains('open');
      sec.classList.toggle('open', on); opened.set(sec.dataset.sec, on);
      if (on) { const area = sec.querySelector('textarea'); fit(area); area?.focus(); }
      return true;
    }
    const tone = t.closest('[data-dx-tone]');
    if (tone) { const v = Number(tone.dataset.dxTone); d.arc.tone = d.arc.tone === v ? null : v; after(id); return true; }
    const fmt = t.closest('[data-dx-fmt]');
    if (fmt) { d.fmt = fmt.dataset.dxFmt; after(id); return true; }
    if (t.closest('[data-dx-del]')) { event.preventDefault(); const s = findSec(id, t); if (s) { d.sections = d.sections.filter(x => x !== s); after(id); } return true; }
    const move = t.closest('[data-dx-up],[data-dx-down]');
    if (move) {
      const s = findSec(id, t), group = d.sections.filter(x => (x.kind === 'line') === (s.kind === 'line'));
      const i = group.indexOf(s), other = group[move.hasAttribute('data-dx-up') ? i - 1 : i + 1];
      if (s && other) { const a = d.sections.indexOf(s), b = d.sections.indexOf(other); [d.sections[a], d.sections[b]] = [d.sections[b], d.sections[a]]; after(id); }
      return true;
    }
    const add = t.closest('[data-dx-add]');
    if (add) { const s = { id: uid(), title: add.dataset.dxAdd, text: '', kind: 'text' }; d.sections.push(s); opened.set(s.id, true); after(id); return true; }
    if (t.closest('[data-dx-new]')) {
      const title = await ask(host(), { title: 'Название раздела', input: 'например: Привычки', ok: 'Добавить' });
      if (title) { const s = { id: uid(), title, text: '', kind: 'text' }; d.sections.push(s); opened.set(s.id, true); after(id); }
      return true;
    }
    if (t.closest('[data-dx-newline]')) {
      const title = await ask(host(), { title: 'Название поля', text: 'Короткое значение в одну строку: возраст, занятие, рост.', input: 'например: Рост', ok: 'Добавить' });
      if (title) { d.sections.push({ id: uid(), title, text: '', kind: 'line' }); after(id); }
      return true;
    }
    if (t.closest('[data-dx-tpl]')) {
      const pick = await ask(host(), { title: 'Какие поля и разделы добавить?', text: 'Уже существующие не трогаются.', options: Object.entries(TEMPLATES).map(([value, v]) => ({ value, label: `${v.title}: ${[...v.lines, ...v.texts].join(', ')}` })) });
      if (pick) {
        const have = new Set(d.sections.map(s => s.title.trim().toLowerCase()));
        for (const title of TEMPLATES[pick].lines) if (!have.has(title.toLowerCase())) d.sections.push({ id: uid(), title, text: '', kind: 'line' });
        for (const title of TEMPLATES[pick].texts) if (!have.has(title.toLowerCase())) d.sections.push({ id: uid(), title, text: '', kind: 'text' });
        after(id);
      }
      return true;
    }
    if (t.closest('[data-dx-import]')) { await importFromLore(id); return true; }
    if (t.closest('[data-dx-gen]')) { await generateFromLore(id); return true; }
    if (t.closest('[data-dx-idea]')) { await generateFromIdea(id); return true; }
    if (t.closest('[data-dx-arcgen]')) { await suggestArc(id); return true; }
    const dl = t.closest('[data-dx-desclang]');
    if (dl) { if (dl.dataset.dxDesclang === 'en') await translateDesc(id); else await revertDesc(id); return true; }
    const lang = t.closest('[data-dx-lang]');
    if (lang) { if (lang.dataset.dxLang === 'en') await translateAll(id); else await revertLang(id); return true; }
    return false;
  };

  /** Ввод: данные обновляются без перерисовки, чтобы не сбивать курсор. */
  const commitDesc = debounce((id, text) => { write(id, text); save(); }, 450);
  const onInput = event => {
    const id = getSelected(), el = event.target;
    if (id && el.matches?.('[data-desc]') && get(id).mode === 'lore') { commitDesc(id, el.value); paintSoon(id); return true; }
    if (!id || !el.matches?.('[data-dx-title],[data-dx-text],[data-dx-linev],[data-dx-arctext]')) return false;
    const d = get(id);
    if (el.matches('[data-dx-arctext]')) d.arc.text = el.value.slice(0, ARC_MAX);
    else {
      const s = findSec(id, el);
      if (!s) return true;
      if (el.matches('[data-dx-title]')) { s.title = el.value; const b = el.closest('.col-dx-sec')?.querySelector('header b'); if (b) b.textContent = el.value || 'Без названия'; }
      else {
        s.text = el.value;
        const sec = el.closest('.col-dx-sec');
        if (sec) { sec.classList.toggle('filled', !!el.value.trim()); const m = sec.querySelector('.col-dx-meta'); if (m) m.textContent = el.value.trim() ? `${el.value.trim().length} зн.` : 'пусто'; fit(el); }
      }
    }
    commit(id);
    paint(id);
    return true;
  };

  return { html, onClick, onInput, paintPreview: paint };
}
