/**
 * Шов между двумя приклеенными окнами: ручка со стрелками ◂▸ на общей границе. Тянешь вправо раскрывается левая сторона,
 * влево правая; общая ширина пары не меняется. Двойной щелчок делит поровну.
 * Модуль не знает про окна: ему дают функцию pair() с геометрией и обратные вызовы onSplit/onEnd.
 */
const ARROWS = '<svg viewBox="0 0 22 40" width="22" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8 3 14l5 6M14 20l5 6-5 6"/><path d="M11 3v34" stroke-width="1" opacity=".45"/></svg>';

/**
 * Вписывает пару ширин в доступное место: сначала сжимается правая сторона до своего минимума, потом левая до своего.
 * Ширины делят одну общую границу в 1 px. Возвращает null, если даже в минимумах не помещается.
 */
export function fitPair(leftW, rightW, room, minLeft, minRight) {
  let l = leftW, r = rightW;
  const over = l + r - 1 - room;
  if (over > 0) {
    const cutRight = Math.min(over, Math.max(0, r - minRight));
    r -= cutRight;
    l -= over - cutRight;
  }
  return l >= minLeft && r >= Math.min(minRight, rightW) ? [Math.round(l), Math.round(r)] : null;
}

export function createSeam(doc, { title, pair, onSplit, onEnd }) {
  const view = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'col-seam';
  el.hidden = true;
  el.setAttribute('role', 'separator');
  el.setAttribute('aria-orientation', 'vertical');
  el.title = title ?? 'Потяни: раскрыть одну из сторон. Двойной щелчок: поровну';
  el.innerHTML = ARROWS;
  doc.body.append(el);

  const update = () => {
    const p = pair();
    if (!p) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = `${Math.round(p.x - 11)}px`;
    el.style.top = `${Math.round(p.top + p.height / 2 - 20)}px`;
    el.style.zIndex = String(p.z + 1);
  };

  const split = (p, leftW) => {
    const total = p.leftW + p.rightW;
    const l = Math.min(Math.max(leftW, p.minLeft), Math.max(p.minLeft, total - p.minRight));
    return [Math.round(l), Math.round(total - l)];
  };

  el.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const p = pair();
    if (!p) return;
    event.preventDefault();
    try { el.setPointerCapture?.(event.pointerId); } catch { /* синтетические события без активного указателя */ }
    el.classList.add('col-seam-drag');
    doc.body.classList.add('col-seam-active');
    let last = [p.leftW, p.rightW];
    const move = ev => { last = split(p, ev.clientX - p.leftLeft + 1); onSplit(last[0], last[1]); update(); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('col-seam-drag');
      doc.body.classList.remove('col-seam-active');
      onEnd?.(last[0], last[1]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', () => {
    const p = pair();
    if (!p) return;
    const next = split(p, (p.leftW + p.rightW) / 2);
    onSplit(next[0], next[1]); update(); onEnd?.(next[0], next[1]);
  });

  view.addEventListener('resize', update);
  return { el, update, destroy() { view.removeEventListener('resize', update); el.remove(); } };
}
