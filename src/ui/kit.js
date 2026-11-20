/**
 * Общий набор для библиотек Колизея: экранирование, маска-обложка, диалоги в нашем оформлении.
 * Диалоги не используют родные окна Таверны: они рисуются поверх окна, в котором вызваны.
 */
export const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Первая буква имени для обложки без картинки. */
export const initials = name => String(name ?? '?').trim().slice(0, 2).toUpperCase() || '?';

/** Театральная маска: смеющаяся или печальная, цвет берётся из палитры. Выбор по строке, чтобы у одного имени маска не менялась. */
export function maskSvg(seed = '', tone = 0) {
  const sum = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const comic = sum % 2 === 0;
  const fill = ['var(--col-accent)', 'var(--col-gold)', 'var(--col-ink2)'][(sum + tone) % 3];
  const mouth = comic ? 'M21 51Q35 67 49 51Q35 58 21 51Z' : 'M21 59Q35 44 49 59Q35 52 21 59Z';
  const brows = comic ? 'M14 23Q23 15 32 24M56 23Q47 15 38 24' : 'M14 20Q23 27 32 22M56 20Q47 27 38 22';
  return `<svg class="col-mask" viewBox="0 0 70 84" aria-hidden="true">
    <path d="M7 11Q35 0 63 11Q69 44 57 66Q35 87 13 66Q1 44 7 11Z" fill="color-mix(in srgb, ${fill} 55%, var(--col-card))" stroke="var(--col-gold)" stroke-width="1.6"/>
    <path d="M13 17Q22 8 36 8" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2.2" stroke-linecap="round"/>
    <path d="${brows}" fill="none" stroke="var(--col-gold)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M15 32Q23 24 32 33Q24 38 15 32Z M55 32Q47 24 38 33Q46 38 55 32Z ${mouth}" fill="var(--col-page)" stroke="var(--col-gold)" stroke-width="1"/>
  </svg>`;
}

/**
 * Диалог поверх окна. Возвращает промис с введённым текстом, выбранным значением или true/false.
 * @param {HTMLElement} host окно, внутри которого показать диалог
 * @param {{ title: string, text?: string, input?: string|null, value?: string, options?: {value:string,label:string}[], ok?: string, cancel?: string, danger?: boolean }} spec
 */
export function ask(host, spec) {
  return new Promise(resolve => {
    const shade = host.ownerDocument.createElement('div');
    shade.className = 'col-ask';
    const optionsHtml = spec.options ? `<div class="col-ask-opts">${spec.options.map(o => `<button type="button" class="col-ask-opt" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>` : '';
    shade.innerHTML = `<div class="col-ask-box" role="dialog" aria-label="${esc(spec.title)}">
      <h4>${esc(spec.title)}</h4>${spec.text ? `<p>${esc(spec.text)}</p>` : ''}
      ${spec.input !== undefined && spec.input !== null ? `<input class="col-input" type="text" placeholder="${esc(spec.input)}" value="${esc(spec.value ?? '')}">` : ''}
      ${optionsHtml}
      <div class="col-ask-btns">${spec.options ? '' : `<button type="button" class="col-btn ${spec.danger ? 'col-danger' : 'col-primary'}" data-act="ok">${esc(spec.ok ?? 'Готово')}</button>`}<button type="button" class="col-btn" data-act="cancel">${esc(spec.cancel ?? 'Отмена')}</button></div></div>`;
    host.append(shade);
    const input = shade.querySelector('input');
    const close = value => { shade.remove(); resolve(value); };
    shade.addEventListener('click', event => {
      if (event.target === shade) return close(spec.options ? null : false);
      const opt = event.target.closest('[data-v]');
      if (opt) return close(opt.dataset.v);
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'ok') return close(input ? input.value.trim() : true);
      if (act === 'cancel') close(spec.options || input ? null : false);
    });
    shade.addEventListener('keydown', event => {
      if (event.key === 'Enter' && input) close(input.value.trim());
      if (event.key === 'Escape') close(spec.options || input ? null : false);
    });
    (input ?? shade.querySelector('[data-act]'))?.focus();
  });
}

/** Скачивает JSON-файл. */
export function download(doc, filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url; link.download = filename;
  doc.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Лёгкая задержка для повторяющихся перерисовок. */
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
