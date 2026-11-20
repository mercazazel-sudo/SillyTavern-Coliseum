/**
 * Мастерская: список расширений с тумблерами, фильтры, панель выбранного. Данные и действия: модуль расширений самой Таверны
 * (enableExtension, disableExtension, deleteExtension), поэтому всё, что она делает при включении и удалении, сохраняется.
 * Родные настройки выбранного расширения (блок «inline-drawer» из списка расширений Таверны) показываются справа.
 */
import { report } from '../core/guard.js';
import { ask, debounce, esc } from './kit.js';

const FILTERS = [
  { id: 'all', title: 'Все' },
  { id: 'upd', title: 'Обновления' },
  { id: 'off', title: 'Отключённые' },
  { id: 'user', title: 'Пользовательские' },
  { id: 'system', title: 'Системные' },
];
// слова, по которым кнопки разных расширений путаются («Generate Image» и «Generate Caption»)
const BTN_SKIP = new Set(['generate', 'generation', 'open', 'show', 'attach']);
const SETTINGS_ROOTS = '#extensions_settings, #extensions_settings2';

export async function startExtensionsLib(doc, { settings, save, shared }) {
  const win = shared.windows?.get('ext');
  if (!win) { report('мастерская', new Error('нет окна')); return () => {}; }
  const view = doc.defaultView;
  const undo = [];
  let api;
  let headers = () => ({ 'Content-Type': 'application/json' });
  try { api = await import('/scripts/extensions.js'); } catch (error) { report('мастерская: модуль расширений', error); return () => {}; }
  try { headers = (await import('/script.js')).getRequestHeaders; } catch (error) { report('мастерская: заголовки запросов', error); }

  // порядок и закрепления хранятся в настройках Колизея
  settings.extOrder ??= [];
  settings.extPinned ??= [];
  settings.extBtn ??= {}; // ручные привязки кнопок: имя расширения → ключи кнопок (top:… / wand:…)
  settings.extBind ??= {}; // ручные привязки: имя расширения → заголовок родного блока настроек
  // upd: имя → { upToDate, branch, hash, remote, error, busy, done }; результат проверки версий через сервер Таверны
  const state = { filter: 'all', query: '', selected: '', changed: 0, adopted: null, drag: '', freeHead: '', upd: {}, checking: false, checked: false };
  win.body.innerHTML = `<div class="col-lib col-ext">
    <nav class="col-lib-side"><h4>Фильтры</h4><div data-r="filters"></div></nav>
    <section class="col-lib-main">
      <div class="col-lib-bar"><label class="col-search"><input class="col-input" type="search" placeholder="найти расширение…"></label>
        <button type="button" class="col-btn" data-act="check" title="Спросить у сервера, вышли ли новые версии сторонних расширений">Проверить обновления</button>
        <button type="button" class="col-btn" data-act="install">Установить</button></div>
      <div class="col-ext-list" data-r="list"></div>
      <div class="col-ext-foot"><span class="col-saved" data-r="changed">Изменений: 0</span><span class="col-foot-btns"><button type="button" class="col-btn" data-act="updall" hidden>Обновить все</button><button type="button" class="col-btn col-primary" data-act="reload">Перезагрузить</button></span></div>
    </section>
    <aside class="col-lib-detail" data-r="detail"></aside></div>`;
  const $ = sel => win.body.querySelector(`[data-r="${sel}"]`);
  const search = win.body.querySelector('input[type="search"]');

  const items = () => {
    const disabled = new Set(api.extension_settings.disabledExtensions ?? []);
    return (api.extensionNames ?? []).map(name => {
      const m = api.getExtensionManifest(name) ?? {};
      return {
        name, enabled: !disabled.has(name), type: api.extensionTypes?.[name] ?? 'local',
        title: m.display_name || name.replace(/^third-party\//, ''), version: m.version ?? '', author: m.author ?? '',
        desc: m.description ?? '', home: m.homePage ?? '',
      };
    }).map(x => ({ ...x, pinned: settings.extPinned.includes(x.name), upd: state.upd[x.name] })).sort((a, b) => {
      const group = x => (!x.enabled ? 3 : x.pinned ? 0 : x.type === 'system' ? 2 : 1);
      const rank = x => { const i = settings.extOrder.indexOf(x.name); return i < 0 ? 1e6 : i; };
      return group(a) - group(b) || rank(a) - rank(b) || a.title.localeCompare(b.title, 'ru');
    });
  };
  const visible = all => all.filter(x => {
    if (state.filter === 'off' && x.enabled) return false;
    if (state.filter === 'upd' && x.upd?.upToDate !== false && !x.upd?.done) return false;
    if (state.filter === 'system' && x.type !== 'system') return false;
    if (state.filter === 'user' && x.type === 'system') return false;
    return !state.query || `${x.title} ${x.author}`.toLowerCase().includes(state.query);
  });

  /* ───────── кнопки расширения в меню: вынос на колонну ───────── */
  /** Кнопки, которые похожи на данное расширение по названию, плюс привязанные вручную. */
  const buttonsOf = x => {
    const all = (shared.hand?.buttons?.() ?? []).filter(b => /\p{L}/u.test(b.title)); // счётчики вроде «1 / 2» не кнопки
    const mine = new Set(settings.extBtn[x.name] ?? []);
    const roots = [...new Set(norm(`${x.title} ${x.name.replace(/^third-party\//, '')}`).split(' ').filter(w => w.length >= 3 && !GENERIC.has(w) && !BTN_SKIP.has(w)))];
    const auto = b => {
      const words = norm(`${b.id} ${b.title}`).split(' ').filter(w => w.length >= 3 && !GENERIC.has(w) && w !== 'wand' && w !== 'menu' && w !== 'button' && w !== 'item' && w !== 'container' && w !== 'top' && w !== 'topbar');
      return roots.some(r => words.some(w => w === r || sameRoot(w, r)));
    };
    return all.filter(b => mine.has(b.key) || auto(b)).map(b => ({ ...b, manual: mine.has(b.key) }));
  };
  const buttonsHtml = x => {
    if (!x.enabled) return '';
    if (!shared.hand) return '';
    const own = buttonsOf(x);
    const rows = own.map(b => `<div class="col-ext-btn" data-bk="${esc(b.key)}"><i class="fa-solid ${esc(b.fa)}"></i><span>${esc(b.title)}</span>${b.manual ? '<a href="#" data-btn-off title="Убрать привязку">×</a>' : ''}<label class="col-check" title="Показывать в левой колонне"><input type="checkbox" data-btn-pin ${shared.hand.isOn(b.key) ? 'checked' : ''}><i></i></label></div>`).join('');
    return `<h4>Кнопки на колонне</h4>
      ${rows ? `<p class="col-note">Эти кнопки расширение добавило в меню. Отметь, и они появятся в левой колонне в разделе «Под рукой».</p><div class="col-ext-btns">${rows}</div>`
        : '<p class="col-note">В меню кнопок этого расширения не нашлось. Если она есть, привяжи её вручную.</p>'}
      <div class="col-btnrow"><button type="button" class="col-btn" data-btn-bind>Привязать кнопку</button></div>`;
  };

  /* ───────── поиск родных настроек расширения ───────── */
  const norm = t => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  // слова, которые есть у десятков расширений и ничего не говорят о конкретном
  const GENERIC = new Set(['image', 'images', 'extension', 'extensions', 'chat', 'data', 'token', 'message', 'messages', 'model', 'models', 'settings', 'manager', 'tool', 'tools', 'template', 'templates', 'prompt', 'prompts']);
  const wordsOf = t => norm(t).split(' ').filter(w => w.length >= 4 && !GENERIC.has(w));
  /** Общие корни: «reply» и «replies», «кот-тамагочи» и «котик-тамагочи». */
  const sameRoot = (a, b) => {
    const min = Math.min(a.length, b.length);
    if (min < 5) return false;
    let k = 0;
    while (k < min && a[k] === b[k]) k++;
    return k >= Math.max(4, min - 1) || (k >= 6);
  };
  /** Насколько заголовок блока похож на название расширения (0 — ничего общего). */
  const similarity = (title, head) => {
    // служебные ключи вида ext_sum_title / ext_translate_title: корень «sum» и «translate» сравниваем со словами названия
    const keyed = /^ext_([a-z0-9]+)_title$/.exec(String(head));
    if (keyed) {
      const root = keyed[1];
      const hit = norm(title).split(' ').some(w => {
        const min = Math.min(w.length, root.length);
        if (min < 3) return false;
        let k = 0; while (k < min && w[k] === root[k]) k++;
        return k >= Math.min(root.length, 5);
      });
      return hit ? 70 : 0;
    }
    const nt = norm(title), nh = norm(head);
    if (!nt || !nh) return 0;
    if (nt === nh) return 100;
    if (nt.includes(nh) || nh.includes(nt)) return 80;
    let best = 0;
    for (const part of String(title).split(/[\/|·—–]/)) {
      const np = norm(part);
      if (np && (np === nh || np.includes(nh) || nh.includes(np))) best = Math.max(best, 70);
    }
    // общие корни слов: «котик-тамагочи» и «кот-тамагочи» делят «тамагочи»
    const wt = wordsOf(title);
    const hits = wordsOf(head).filter(x => wt.some(y => sameRoot(x, y))).length;
    return hits ? Math.max(best, 40 + hits * 10) : best;
  };
  /**
   * Родные блоки настроек, сгруппированные по контейнеру расширения (.extension_container): у одного расширения их может быть несколько
   * (например, у генерации картинок «Image Generation» и «Image Prompt Templates»). Группа сопоставляется с расширением целиком.
   */
  const nativeBlocks = () => {
    const singles = [];
    for (const root of SETTINGS_ROOTS.split(', ')) {
      for (const drawer of doc.querySelectorAll(`${root} .inline-drawer`)) {
        const header = drawer.querySelector(':scope > .inline-drawer-header');
        const head = header?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
        // Таверна переводит заголовок, но исходное название оставляет в data-i18n: по нему совпадение не зависит от языка интерфейса
        const keys = [...(header ? [header, ...header.querySelectorAll('[data-i18n]')] : [])].map(e => e.getAttribute('data-i18n')).filter(k => k && !k.startsWith('['));
        if (head && !drawer.closest('.col-ext-native')) singles.push({ drawer, head, keys: [head, ...keys], id: keys[0] ?? head, group: drawer.closest('.extension_container') ?? drawer });
      }
    }
    const byGroup = new Map();
    for (const blk of singles) { if (!byGroup.has(blk.group)) byGroup.set(blk.group, []); byGroup.get(blk.group).push(blk); }
    return [...byGroup.values()].map(list => ({
      drawer: list[0].drawer, drawers: list.map(i => i.drawer), head: list.map(i => i.head).join(' · '), keys: list.flatMap(i => i.keys), id: list[0].id,
    }));
  };
  const scoreOf = (title, block) => Math.max(...block.keys.map(k => similarity(title, k)));
  /** Кому какой блок достался: сначала ручные привязки, потом лучшие совпадения (каждый блок один раз). */
  const assignment = all => {
    const blocks = nativeBlocks(), owner = new Map(), taken = new Set();
    for (const x of all) {
      const bound = settings.extBind[x.name];
      const block = bound && blocks.find(b => (b.id === bound || b.head === bound) && !taken.has(b));
      if (block) { owner.set(x.name, { ...block, manual: true }); taken.add(block); }
    }
    const pairs = [];
    for (const x of all) if (!owner.has(x.name)) for (const b of blocks) if (!taken.has(b)) { const score = scoreOf(x.title, b); if (score >= 50) pairs.push({ x, b, score }); }
    pairs.sort((l, r) => r.score - l.score);
    for (const { x, b } of pairs) if (!owner.has(x.name) && !taken.has(b)) { owner.set(x.name, { ...b, manual: false }); taken.add(b); }
    return { owner, free: blocks.filter(b => !taken.has(b)) };
  };
  const release = () => {
    if (!state.adopted?.length) { state.adopted = null; return; }
    for (const { node, parent, next } of [...state.adopted].reverse()) {
      node.classList.remove('col-adopted');
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    state.adopted = null;
  };
  /** Переносит родные блоки группы в панель. У одноблочного расширения заголовок прячем (он дублирует название), у многоблочного оставляем. */
  const adopt = (slot, group) => {
    state.adopted = group.drawers.map(node => ({ node, parent: node.parentElement, next: node.nextSibling }));
    const single = group.drawers.length === 1;
    for (const node of group.drawers) {
      if (single) { node.classList.add('col-adopted'); node.querySelector(':scope > .inline-drawer-content')?.classList.add('col-open'); }
      slot.append(node);
    }
  };
  undo.push(release);

  /* ───────── обновления: проверка и установка идут через серверные запросы самой Таверны ───────── */
  const serverName = name => name.replace('third-party', '');
  const isGlobal = name => api.extensionTypes?.[name] === 'global';
  const pending = () => Object.entries(state.upd).filter(([, u]) => u.upToDate === false).map(([n]) => n);
  const updBadge = x => {
    const u = x.upd;
    if (!u) return '';
    if (u.busy) return '<span class="col-upd-tag busy">обновляю…</span>';
    if (u.done) return '<span class="col-upd-tag done" title="Перезагрузи страницу, чтобы обновление заработало">обновлено · перезагрузи</span>';
    if (u.upToDate === false) return `<span class="col-upd-tag">есть обновление</span><button type="button" class="col-btn col-upd" data-upd="${esc(x.name)}">Обновить</button>`;
    return '';
  };
  /** Красный значок с числом на пункте «Мастерская» в колонне. */
  const paintBadge = () => {
    const link = doc.querySelector('#col-side [data-item="ext"]');
    if (!link) return;
    const n = pending().length;
    let badge = link.querySelector('.col-navbadge');
    if (!n) { badge?.remove(); return; }
    if (!badge) { badge = doc.createElement('i'); badge.className = 'col-navbadge'; link.append(badge); }
    badge.textContent = String(n);
    badge.title = `Обновлений расширений: ${n}`;
  };
  undo.push(() => doc.querySelectorAll('#col-side .col-navbadge').forEach(b => b.remove()));
  const checkOne = async name => {
    try {
      const response = await fetch('/api/extensions/version', { method: 'POST', headers: headers(), body: JSON.stringify({ extensionName: serverName(name), global: isGlobal(name) }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (state.upd[name]?.busy || state.upd[name]?.done) return; // пока шла проверка, расширение уже обновили: не затираем
      state.upd[name] = { upToDate: data.isUpToDate !== false, branch: data.currentBranchName ?? '', hash: String(data.currentCommitHash ?? '').slice(0, 7), remote: data.remoteUrl ?? '' };
    } catch { state.upd[name] = { upToDate: true, error: true }; }
  };
  /** Проверяет все сторонние расширения, по три за раз: каждая проверка — git-запрос на сервере. */
  const checkAll = async ({ announce = false } = {}) => {
    if (state.checking) return;
    state.checking = true;
    const queue = (api.extensionNames ?? []).filter(n => n.startsWith('third-party'));
    const repaint = () => { renderFilters(items()); renderList(items()); paintBadge(); const b = win.body.querySelector('[data-act="check"]'); if (b) b.textContent = state.checking ? 'Проверяю…' : 'Проверить обновления'; };
    repaint();
    const worker = async () => { for (let n = queue.shift(); n; n = queue.shift()) { await checkOne(n); if (win.isOpen) repaint(); } };
    await Promise.all([worker(), worker(), worker()]);
    state.checking = false; state.checked = true;
    try { view.localStorage.setItem('coliseum.updcheck', new Date().toDateString()); } catch { /* без хранилища проверка просто повторится */ }
    if (win.isOpen) { repaint(); renderDetail(items()); } else paintBadge();
    const list = pending();
    if (announce && list.length) globalThis.toastr?.info?.(list.map(n => `• ${api.getExtensionManifest(n)?.display_name || serverName(n).replace(/^\//, '')}`).join('\n'), 'Колизей: есть обновления расширений');
  };
  const updateOne = async name => {
    const u = state.upd[name] ?? (state.upd[name] = { upToDate: false });
    if (u.busy) return;
    u.busy = true; render();
    try {
      const response = await fetch('/api/extensions/update', { method: 'POST', headers: headers(), body: JSON.stringify({ extensionName: serverName(name), global: isGlobal(name) }) });
      if (!response.ok) throw new Error((await response.text()) || response.statusText);
      const data = await response.json();
      state.upd[name] = { ...u, busy: false, upToDate: true, done: !data.isUpToDate, hash: String(data.shortCommitHash ?? u.hash ?? '') };
      if (!data.isUpToDate) state.changed++;
    } catch (error) {
      u.busy = false; report('обновление расширения', error);
      globalThis.toastr?.error?.(`Не удалось обновить расширение: ${error?.message ?? error}`, 'Колизей');
    }
    render(); paintBadge();
  };

  const detailUpdate = x => {
    if (x.type === 'system') return '';
    const u = x.upd;
    const where = u && !u.error && u.hash ? `<small>ветка ${esc(u.branch)} · ${esc(u.hash)}</small>` : '';
    if (!u) return `<div class="col-upd-box"><span>Версия не проверялась</span><button type="button" class="col-btn" data-check-one="${esc(x.name)}">Проверить</button></div>`;
    if (u.busy) return '<div class="col-upd-box"><span>Обновляю…</span></div>';
    if (u.done) return `<div class="col-upd-box ok"><span>Обновлено до ${esc(u.hash)}. Перезагрузи страницу.</span></div>`;
    if (u.error) return `<div class="col-upd-box"><span>Не удалось узнать версию (это не git-расширение или нет сети)</span><button type="button" class="col-btn" data-check-one="${esc(x.name)}">Ещё раз</button></div>`;
    if (u.upToDate === false) return `<div class="col-upd-box hot"><span>Вышло обновление</span>${where}<button type="button" class="col-btn col-primary" data-upd="${esc(x.name)}">Обновить</button></div>`;
    return `<div class="col-upd-box ok"><span>Версия свежая</span>${where}</div>`;
  };

  const renderFilters = all => {
    $('filters').innerHTML = FILTERS.map(f => {
      const count = f.id === 'all' ? all.length : f.id === 'upd' ? all.filter(x => x.upd?.upToDate === false).length : f.id === 'off' ? all.filter(x => !x.enabled).length : f.id === 'system' ? all.filter(x => x.type === 'system').length : all.filter(x => x.type !== 'system').length;
      return `<a class="col-side-it${state.filter === f.id ? ' on' : ''}${f.id === 'upd' && count ? ' hot' : ''}" data-f="${f.id}">${esc(f.title)}<small>${count}</small></a>`;
    }).join('');
  };
  const renderList = all => {
    const shown = visible(all);
    const seen = new Set();
    const plain = state.filter === 'all' && !state.query;
    const divider = x => {
      const key = !x.enabled ? 'off' : (x.type === 'system' && !x.pinned) ? 'sys' : '';
      if (!plain || !key || seen.has(key)) return '';
      // разделитель нужен, только если выше есть хоть одна строка другой группы
      if (!shown.some(i => i !== x && (key === 'off' ? i.enabled : (i.enabled && !(i.type === 'system' && !i.pinned))))) return '';
      seen.add(key);
      return `<div class="col-ext-div"><span>${key === 'off' ? 'Выключены' : 'Системные'}</span></div>`;
    };
    $('list').innerHTML = shown.length ? shown.map(x => {
      return `${divider(x)}<div class="col-ext-row${state.selected === x.name ? ' on' : ''}${x.enabled ? '' : ' off'}${x.pinned ? ' pinned' : ''}" data-n="${esc(x.name)}" draggable="true">
      <span class="col-grip" title="Перетащи, чтобы поменять порядок"></span>
      <label class="col-check"><input type="checkbox" ${x.enabled ? 'checked' : ''} data-toggle="${esc(x.name)}"><i></i></label>
      <div class="col-ext-name"><b>${esc(x.title)}</b><small>${esc([x.version && `версия ${x.version}`, x.author, x.type === 'system' ? 'системное' : ''].filter(Boolean).join(' · '))}</small></div>
      ${updBadge(x)}
      <button type="button" class="col-icon col-pin${x.pinned ? ' on' : ''}" data-pin="${esc(x.name)}" title="${x.pinned ? 'Открепить' : 'Закрепить наверху'}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7"/></svg></button>
      ${x.type === 'system' ? '' : `<button type="button" class="col-icon" data-del="${esc(x.name)}" title="Удалить расширение">×</button>`}</div>`;
    }).join('')
      : `<p class="col-empty">${state.filter === 'upd' ? (state.checking ? 'Проверяю версии…' : state.checked ? 'Обновлений нет: всё свежее.' : 'Версии ещё не проверялись. Нажми «Проверить обновления».') : 'Ничего не найдено.'}</p>`;
  };
  const renderDetail = all => {
    release();
    const x = all.find(i => i.name === state.selected);
    const box = $('detail');
    if (!x) {
      const { free } = assignment(all);
      const chosen = free.find(b => b.id === state.freeHead);
      if (chosen) {
        box.innerHTML = `<h4>Настройки без хозяина</h4><h3 class="col-dropcap">${esc(chosen.head)}</h3><p class="col-note"><a href="#" data-freeback>← к списку</a></p><div class="col-ext-native" data-r="native"></div>`;
        adopt(box.querySelector('[data-r="native"]'), chosen);
        return;
      }
      box.innerHTML = `<p class="col-empty">Выбери расширение в списке: здесь появятся его настройки.</p>${free.length ? `<h4>Настройки без хозяина</h4><p class="col-note">Эти блоки не похожи ни на одно расширение. Открой нужный или привяжи к расширению вручную.</p><div class="col-freelist">${free.map(b => `<button type="button" class="col-ask-opt" data-free="${esc(b.id)}">${esc(b.head)}</button>`).join('')}</div>` : ''}`;
      return;
    }
    box.innerHTML = `<h4>Выбрано</h4><h3 class="col-dropcap">${esc(x.title)}</h3>
      <p class="col-note">${esc([x.version && `версия ${x.version}`, x.author].filter(Boolean).join(' · ') || 'без описания')}</p>
      ${x.desc ? `<p class="col-note">${esc(x.desc)}</p>` : ''}
      ${detailUpdate(x)}
      <div class="col-btnrow"><button type="button" class="col-btn" data-act="toggle">${x.enabled ? 'Выключить' : 'Включить'}</button>${x.home ? `<a class="col-btn" href="${esc(x.home)}" target="_blank" rel="noopener noreferrer">Страница</a>` : ''}</div>
      ${buttonsHtml(x)}
      <div class="col-ext-native" data-r="native"></div>`;
    const slot = box.querySelector('[data-r="native"]');
    const { owner, free } = assignment(all);
    const hit = owner.get(x.name);
    if (!x.enabled) {
      slot.innerHTML = '<p class="col-note">Расширение выключено: включи его и перезагрузи страницу, чтобы увидеть настройки.</p>';
    } else if (hit) {
      adopt(slot, hit);
      if (hit.manual) slot.insertAdjacentHTML('afterbegin', '<p class="col-note col-bound">Настройки привязаны вручную · <a href="#" data-unbind>отвязать</a></p>');
    } else {
      slot.innerHTML = `<p class="col-note">Настройки этого расширения не нашлись по названию. ${free.length ? 'Выбери блок вручную: так и запомню.' : 'Родных блоков настроек сейчас нет (расширение может не иметь настроек или загрузилось позже).'}</p>${free.length ? '<button type="button" class="col-btn" data-bind>Привязать настройки</button>' : ''}`;
    }
  };
  const render = () => {
    const all = items();
    renderFilters(all); renderList(all); renderDetail(all);
    $('changed').textContent = `Изменений: ${state.changed}`;
    const all2 = pending().length, upall = win.body.querySelector('[data-act="updall"]');
    if (upall) { upall.hidden = !all2; upall.textContent = `Обновить все (${all2})`; }
  };

  const toggle = async name => {
    const on = !(api.extension_settings.disabledExtensions ?? []).includes(name);
    try {
      if (on) await api.disableExtension(name, false); else await api.enableExtension(name, false);
      state.changed++;
    } catch (error) { report('переключение расширения', error); globalThis.toastr?.error?.('Не удалось переключить расширение.', 'Колизей'); }
    render();
  };

  win.body.addEventListener('click', async event => {
    const filter = event.target.closest('[data-f]');
    if (filter) { state.filter = filter.dataset.f; render(); return; }
    const freeBtn = event.target.closest('[data-free]');
    if (freeBtn) { state.freeHead = freeBtn.dataset.free; render(); return; }
    if (event.target.closest('[data-freeback]')) { event.preventDefault(); state.freeHead = ''; render(); return; }
    if (event.target.closest('[data-unbind]')) { event.preventDefault(); delete settings.extBind[state.selected]; save(); render(); return; }
    if (event.target.closest('[data-bind]')) {
      const { free } = assignment(items());
      const head = await ask(win.el, { title: 'Какие настройки принадлежат этому расширению?', options: free.map(b => ({ value: b.id, label: b.head })) });
      if (head) { settings.extBind[state.selected] = head; save(); render(); }
      return;
    }
    const pinBtn = event.target.closest('[data-btn-pin]');
    if (pinBtn) { shared.hand?.setOn(pinBtn.closest('[data-bk]').dataset.bk, pinBtn.checked); return; }
    if (event.target.closest('[data-btn-off]')) {
      event.preventDefault();
      const key = event.target.closest('[data-bk]').dataset.bk;
      settings.extBtn[state.selected] = (settings.extBtn[state.selected] ?? []).filter(k => k !== key);
      save(); render(); return;
    }
    if (event.target.closest('[data-btn-bind]')) {
      const taken = new Set(buttonsOf(items().find(i => i.name === state.selected) ?? { name: state.selected, title: '' }).map(b => b.key));
      const free = (shared.hand?.buttons?.() ?? []).filter(b => !taken.has(b.key));
      if (!free.length) { await ask(win.el, { title: 'Кнопок больше нет', text: 'Все кнопки меню уже привязаны к этому расширению.', ok: 'Понятно' }); return; }
      const key = await ask(win.el, { title: 'Какая кнопка принадлежит этому расширению?', options: free.map(b => ({ value: b.key, label: b.title + (b.key.startsWith('top:') ? ' · верхняя панель' : '') })) });
      if (key) { (settings.extBtn[state.selected] ??= []).push(key); save(); render(); }
      return;
    }
    const upd = event.target.closest('[data-upd]');
    if (upd) { event.stopPropagation(); await updateOne(upd.dataset.upd); return; }
    const one = event.target.closest('[data-check-one]');
    if (one) { state.upd[one.dataset.checkOne] = undefined; delete state.upd[one.dataset.checkOne]; await checkOne(one.dataset.checkOne); render(); paintBadge(); return; }
    const pin = event.target.closest('[data-pin]');
    if (pin) {
      const name = pin.dataset.pin, at = settings.extPinned.indexOf(name);
      if (at >= 0) settings.extPinned.splice(at, 1); else settings.extPinned.push(name);
      save(); render(); return;
    }
    if (event.target.closest('[data-toggle]')) { event.preventDefault(); await toggle(event.target.closest('[data-toggle]').dataset.toggle); return; }
    const del = event.target.closest('[data-del]');
    if (del) {
      const name = del.dataset.del;
      if (await ask(win.el, { title: 'Удалить расширение?', text: `«${name.replace(/^third-party\//, '')}» будет стёрто с диска без возможности вернуть.`, ok: 'Удалить', danger: true })) {
        try {
          // Таверна называет расширение «/Имя» (из «third-party/Имя» вырезано слово third-party): так его понимает сервер.
          // Полное имя «third-party/Имя» сервер превращает в «third-partyИмя», не находит папку и молча ничего не удаляет.
          const nativeName = name.replace('third-party', '');
          let clean = false;
          if (api.getExtensionManifest(name)?.hooks?.clean) {
            clean = !!(await ask(win.el, { title: 'Очистить данные расширения?', text: 'У расширения есть очистка: убрать его данные вместе с удалением.', ok: 'Очистить и удалить', cancel: 'Только удалить' }));
          }
          await api.deleteExtension(nativeName, clean);
          state.changed++;
        } catch (error) { report('удаление расширения', error); globalThis.toastr?.error?.('Не удалось удалить расширение. Подробности в консоли.', 'Колизей'); }
        render();
      }
      return;
    }
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'reload') { view.location.reload(); return; }
    if (act === 'check') { await checkAll(); return; }
    if (act === 'updall') { for (const name of pending()) await updateOne(name); return; }
    if (act === 'install') { try { await api.openThirdPartyExtensionMenu(); } catch (error) { report('установка расширения', error); } return; }
    if (act === 'toggle') { await toggle(state.selected); return; }
    const row = event.target.closest('.col-ext-row');
    if (row && !event.target.closest('.col-check')) { state.freeHead = ''; state.selected = state.selected === row.dataset.n ? '' : row.dataset.n; render(); }
  });
  search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); renderList(items()); });

  // перетаскивание: строка встаёт перед той, на которую её бросили; через границу закрепления она берёт закрепление соседа
  const list = $('list');
  const rowOf = target => target.closest?.('.col-ext-row');
  list.addEventListener('dragstart', event => {
    const row = rowOf(event.target);
    if (!row) return;
    state.drag = row.dataset.n;
    row.classList.add('dragging');
    event.dataTransfer?.setData('text/plain', state.drag);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  list.addEventListener('dragover', event => {
    const row = rowOf(event.target);
    if (!row || !state.drag) return;
    event.preventDefault();
    list.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before'));
    if (row.dataset.n !== state.drag) row.classList.add('drop-before');
  });
  list.addEventListener('drop', event => {
    const row = rowOf(event.target);
    if (!row || !state.drag || row.dataset.n === state.drag) return;
    event.preventDefault();
    const sequence = items().map(x => x.name).filter(n => n !== state.drag);
    sequence.splice(sequence.indexOf(row.dataset.n), 0, state.drag);
    settings.extOrder = sequence;
    const targetPinned = settings.extPinned.includes(row.dataset.n), mine = settings.extPinned.indexOf(state.drag);
    if (targetPinned && mine < 0) settings.extPinned.push(state.drag);
    if (!targetPinned && mine >= 0) settings.extPinned.splice(mine, 1);
    state.drag = '';
    save(); render();
  });
  list.addEventListener('dragend', () => { state.drag = ''; list.querySelectorAll('.dragging, .drop-before').forEach(el => el.classList.remove('dragging', 'drop-before')); });

  /** Отчёт о сопоставлении настроек: у кого нашлись, у кого нет, какие блоки ничьи. Вызов: window.__coliseumAudit() в консоли. */
  const audit = () => {
    const all = items(), { owner, free } = assignment(all);
    const matched = all.filter(x => owner.has(x.name)).map(x => ({ расширение: x.title, блок: owner.get(x.name).head, способ: owner.get(x.name).manual ? 'вручную' : 'по названию', сходство: scoreOf(x.title, owner.get(x.name)) }));
    const without = all.filter(x => x.enabled && !owner.has(x.name)).map(x => x.title);
    return { всего: all.length, нашлись: matched, 'включены, настроек нет': without, 'блоки без хозяина': free.map(b => b.head) };
  };
  view.__coliseumAudit = audit;
  undo.push(() => { delete view.__coliseumAudit; });

  // некоторые расширения добавляют блок настроек позже открытия окна: перерисовываем панель, когда список блоков меняется
  let lastHeads = '';
  const watchBlocks = debounce(() => {
    const heads = nativeBlocks().map(b => b.head).join('|');
    if (heads !== lastHeads) { lastHeads = heads; if (win.isOpen && !state.adopted?.length) renderDetail(items()); }
  }, 400);
  const blockObserver = new view.MutationObserver(watchBlocks);
  for (const root of SETTINGS_ROOTS.split(', ')) { const el = doc.querySelector(root); if (el) blockObserver.observe(el, { childList: true, subtree: false }); }
  undo.push(() => blockObserver.disconnect());

  // первое открытие окна проверяет версии само; раз в сутки проверка идёт и в фоне, как у самой Таверны
  const onWindows = () => { if (win.isOpen) { render(); if (!state.checked && !state.checking) checkAll(); } else release(); };
  let daily = '';
  try { daily = view.localStorage.getItem('coliseum.updcheck') ?? ''; } catch { /* нет хранилища */ }
  if (daily !== new Date().toDateString()) { const t = view.setTimeout(() => { if (!state.checked && !state.checking) checkAll({ announce: true }); }, 12000); undo.push(() => view.clearTimeout(t)); }
  shared.bus.addEventListener('windows', onWindows);
  undo.push(() => shared.bus.removeEventListener('windows', onWindows));
  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат мастерской', error); } } };
}
