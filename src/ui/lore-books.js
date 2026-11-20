/**
 * Александрия: галерея лорбуков в виде книг над родным редактором Таверны.
 * Список берётся из родного селектора #world_editor_select, выбор книги нажимает его же, поэтому редактор записей остаётся родным.
 * Книга с ленточкой-закладкой включена глобально (по родному списку #world_info).
 */
import { report } from '../core/guard.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const HUES = ['a', 'b', 'c'];

export function startLoreBooks(doc) {
  const view = doc.defaultView;
  const undo = [];
  const select = doc.getElementById('world_editor_select');
  const holder = doc.getElementById('wi-holder');
  if (!select || !holder) { report('галерея лорбуков', new Error('нет родного селектора лорбуков')); return () => {}; }

  const gallery = doc.createElement('section');
  gallery.id = 'col-books';
  gallery.innerHTML = '<div class="col-books-head"><h3>Книги</h3><label class="col-books-search"><input type="search" placeholder="найти лорбук…" aria-label="Поиск по лорбукам"></label></div><div class="col-books-grid"></div>';
  holder.before(gallery);
  undo.push(() => gallery.remove());
  const grid = gallery.querySelector('.col-books-grid');
  const search = gallery.querySelector('input');

  const globalNames = () => new Set([...doc.querySelectorAll('#world_info option:checked')].map(o => o.textContent.trim()));

  const render = () => {
    try {
      const books = [...select.options].filter(o => o.value !== '' && !/^---/.test(o.textContent)).map(o => ({ value: o.value, name: o.textContent.trim(), selected: o.selected }));
      const globals = globalNames();
      const query = search.value.trim().toLowerCase();
      const shown = books.filter(b => !query || b.name.toLowerCase().includes(query));
      grid.innerHTML = shown.length
        ? shown.map((b, i) => `<button type="button" class="col-book col-book-${HUES[i % HUES.length]}${b.selected ? ' sel' : ''}" data-value="${escapeHtml(b.value)}" title="${escapeHtml(b.name)}">
            <i class="col-spine"></i>${globals.has(b.name) ? '<i class="col-rib" title="Включён глобально"></i>' : ''}<i class="col-orn">❖</i><span class="col-bt">${escapeHtml(b.name)}</span></button>`).join('')
        : `<p class="col-books-empty">${books.length ? 'Ничего не найдено.' : 'Лорбуков пока нет.'}</p>`;
    } catch (error) { report('галерея лорбуков', error); }
  };

  grid.addEventListener('click', event => {
    const card = event.target.closest('.col-book');
    if (!card) return;
    const jq = view.jQuery ?? globalThis.jQuery;
    if (jq) jq(select).val(card.dataset.value).trigger('change'); else { select.value = card.dataset.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
    render();
  });
  search.addEventListener('input', render);

  // список и выбор меняются родным кодом: следим за ними
  const observer = new view.MutationObserver(render);
  observer.observe(select, { childList: true, attributes: true, subtree: true });
  const globalSelect = doc.getElementById('world_info');
  if (globalSelect) observer.observe(globalSelect, { childList: true, attributes: true, subtree: true });
  select.addEventListener('change', render);
  undo.push(() => { observer.disconnect(); select.removeEventListener('change', render); });

  // родная строка выбора книги дублирует галерею: прячем всё, кроме кнопок-действий (создать, импорт, экспорт, правка, удаление)
  const row = select.closest('.flex-container');
  const hidden = [];
  if (row) {
    for (const child of row.children) {
      const isAction = child.matches('.menu_button, .menu_button_icon') || child.querySelector('.menu_button, .menu_button_icon');
      if (!isAction || child.contains(select) || child.matches('.select2, .select2-container')) { child.classList.add('col-hidden'); hidden.push(child); }
    }
    select.classList.add('col-hidden');
    undo.push(() => { for (const el of hidden) el.classList.remove('col-hidden'); select.classList.remove('col-hidden'); });
  }

  render();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат галереи лорбуков', error); } } };
}
