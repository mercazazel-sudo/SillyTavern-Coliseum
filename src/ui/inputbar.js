/**
 * Панель ввода по макету: табличка с ушками (tabula ansata) вокруг родного поля, кнопка разворота и счётчик знаков,
 * колонна вместо «≡», кнопка активной маски (открывает окно «Маски»), конверт вместо самолётика отправки.
 * Родное поле Таверны остаётся тем же элементом (его id и события не меняются): оно только переезжает в контейнер .col-cta,
 * потому что у соседей в панели свои порядки (order), и без контейнера ушки уезжали бы в начало строки.
 */
import { report } from '../core/guard.js';
import { esc, maskSvg } from './kit.js';
import { thumbStyle } from '../core/thumbs.js';
import { KEY } from '../core/settings.js';

export function startInputBar(doc, { shared } = {}) {
  const view = doc.defaultView;
  const undo = [];
  const area = doc.getElementById('send_textarea');
  if (!area?.parentElement) { report('панель ввода', new Error('нет #send_textarea')); return () => {}; }
  const ctx = () => globalThis.SillyTavern?.getContext?.() ?? {};

  /* Драконы Камелота стоят снаружи панели и включаются CSS только у этого оформления. */
  const form = doc.getElementById('send_form');
  if (form) {
    const leftDragon = doc.createElement('i');
    const rightDragon = doc.createElement('i');
    leftDragon.className = 'col-cdrag col-cdrag-l'; rightDragon.className = 'col-cdrag col-cdrag-r';
    leftDragon.setAttribute('aria-hidden', 'true'); rightDragon.setAttribute('aria-hidden', 'true');
    doc.body.append(leftDragon, rightDragon);   // у Таверны #sheld с overflow: hidden, внутри панели драконы обрезались бы
    // положение: рог выше панели на 15.9% роста, лапы на её краю; рост пропорционален высоте панели (не больше 215 px)
    const place = () => {
      const r = form.getBoundingClientRect();
      const atrium = doc.getElementById('col-atrium');
      const home = atrium && getComputedStyle(atrium).display !== 'none';   // на главной драконов панели нет
      const show = !home && r.width > 0 && r.height > 0 && getComputedStyle(form).visibility !== 'hidden';
      for (const dragon of [leftDragon, rightDragon]) dragon.style.visibility = show ? '' : 'hidden';
      if (!show) return;
      const h = Math.min(r.height * 1.26, 215), w = h * 0.5547, top = r.top - 0.1587 * h;
      for (const dragon of [leftDragon, rightDragon]) { dragon.style.height = `${h}px`; dragon.style.top = `${top}px`; }
      leftDragon.style.left = `${r.left - w + 3}px`; rightDragon.style.left = `${r.right - 3}px`;
    };
    const timer = view.setInterval(place, 250);
    view.addEventListener('resize', place);
    place();
    undo.push(() => { view.clearInterval(timer); view.removeEventListener('resize', place); leftDragon.remove(); rightDragon.remove(); });
  }

  /* ───────── контейнер: ушко, поле, ушко, разворот, счётчик ───────── */
  const home = { parent: area.parentElement, next: area.nextSibling };
  const wrap = doc.createElement('div');
  wrap.className = 'col-cta';
  const ear = side => { const el = doc.createElement('span'); el.className = `col-ear col-ear-${side}`; el.setAttribute('aria-hidden', 'true'); return el; };
  const big = doc.createElement('button');
  big.type = 'button'; big.className = 'col-ctabig'; big.title = 'Развернуть поле';
  big.innerHTML = '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8.5 1.5h4v4M5.5 12.5h-4v-4M12.5 1.5 8 6M1.5 12.5 6 8"/></svg>';
  const counter = doc.createElement('span');
  counter.className = 'col-ctacnt';
  area.before(wrap);
  wrap.append(ear('l'), area, ear('r'), big, counter);
  undo.push(() => {
    home.parent.insertBefore(area, home.next?.parentNode === home.parent ? home.next : null);
    wrap.remove();
  });
  const count = () => { counter.textContent = area.value.length ? `${area.value.length} зн.` : ''; };
  area.addEventListener('input', count);
  undo.push(() => area.removeEventListener('input', count));
  big.addEventListener('click', () => {
    const on = wrap.classList.toggle('col-big');
    big.title = on ? 'Свернуть поле' : 'Развернуть поле';
    area.focus();
  });
  count();

  /* ───────── колонна вместо «≡», конверт вместо самолётика ───────── */
  const options = doc.getElementById('options_button');
  if (options) {
    options.classList.add('col-menubtn');
    // крупный детальный свиток вместо значка-колонны; цвета берутся из палитры через классы в style.css
    const scroll = doc.createElement('span');
    scroll.className = 'col-scrollbox'; scroll.innerHTML = '<svg class="col-scroll" viewBox="4.5 4 39 39" aria-hidden="true"><path class="sp" d="M11 12.5H37V35.5H11Z"/><path class="sh" d="M12 13H15V35H12Z"/><path class="sl" d="M17 19.5H31M17 23.5H33M17 27.5H29.5M17 31.5H32"/><path class="sd" d="M13.5 16.5Q14.5 15.5 15.5 16.5M32.5 16.5Q33.5 15.5 34.5 16.5"/><rect class="sr" x="6.5" y="5.5" width="35" height="8" rx="4"/><rect class="sr" x="6.5" y="34.5" width="35" height="8" rx="4"/><circle class="sk" cx="9.5" cy="9.5" r="1.8"/><circle class="sk" cx="38.5" cy="9.5" r="1.8"/><circle class="sk" cx="9.5" cy="38.5" r="1.8"/><circle class="sk" cx="38.5" cy="38.5" r="1.8"/><path class="sk" d="M15 8.5H33M15 39.5H33"/><path class="sr" d="M41.200 22.200C42.600 28.200 40.200 34 34.200 36.200 31.800 31.200 34.600 24.400 41.200 22.200Z"/><path class="sl" d="M40.400 24 33.600 37 31.600 40.600"/><path class="sd" d="M38.200 27.200 35.600 28.800M38.800 30.600 35.200 32.200M37.200 33.600 34.600 34.600"/></svg>';
    options.append(scroll);
    const old = options.getAttribute('title');
    options.setAttribute('title', 'Меню чата');
    undo.push(() => { scroll.remove(); options.classList.remove('col-menubtn'); if (old === null) options.removeAttribute('title'); else options.setAttribute('title', old); });
  }
  const send = doc.getElementById('send_but');
  if (send) {
    const old = send.getAttribute('title');
    send.setAttribute('title', 'Отправить');
    send.classList.add('col-envelope');
    undo.push(() => { send.classList.remove('col-envelope'); if (old === null) send.removeAttribute('title'); else send.setAttribute('title', old); });
  }

  /* ───────── активная маска рядом с меню ───────── */
  const left = doc.getElementById('leftSendForm');
  if (left) {
    const persona = doc.createElement('button');
    persona.type = 'button'; persona.id = 'col-persona'; persona.title = 'Активная маска: нажми, чтобы сменить';
    left.append(persona);
    undo.push(() => persona.remove());
    const activeId = () => doc.querySelector('#user_avatar_block .avatar-container.selected')?.dataset.avatarId ?? '';
    const paint = () => {
      try {
        const c = ctx(), id = activeId();
        let url = '';
        if (id && id !== 'user-default.png') { try { url = c.getThumbnailUrl?.('persona', id) ?? ''; } catch { url = ''; } }
        // масштаб и сдвиг фото в кружке задаются в окне «Маски» (кнопка «Миниатюра») отдельно для каждой маски
        const thumb = c.extensionSettings?.[KEY]?.thumbs?.[id];
        persona.innerHTML = url ? `<span class="col-pimg" style="${esc(thumbStyle(url, thumb))}"></span>` : maskSvg(c.name1 ?? 'маска');
        persona.title = `Маска: ${c.name1 ?? ''}. Нажми, чтобы сменить`;
      } catch (error) { report('кнопка маски', error); }
    };
    persona.addEventListener('click', () => shared?.windows?.open('masks'));
    if (shared) { shared.paintPersona = paint; undo.push(() => { if (shared.paintPersona === paint) delete shared.paintPersona; }); }
    paint();
    const types = ctx().eventTypes ?? {};
    for (const name of ['PERSONA_CHANGED', 'PERSONA_UPDATED', 'PERSONA_DELETED', 'SETTINGS_UPDATED', 'CHAT_CHANGED', 'APP_READY']) {
      const type = types[name];
      if (!type || !ctx().eventSource?.on) continue;
      ctx().eventSource.on(type, paint);
      undo.push(() => ctx().eventSource.removeListener?.(type, paint));
    }
    // список персон Таверна достраивает уже после старта
    view.setTimeout(paint, 2500);
    view.setTimeout(paint, 8000);
  }
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат панели ввода', error); } } };
}
