/**
 * Зубцы Камелота. Рамки окон и главной рисуют зубцы CSS-маской, а их число считается здесь:
 * шаг подгоняется под ширину так, что первый и последний зубец стоят ровно по краям и одинаковы. Следит за размером
 * через ResizeObserver, новые окна подхватывает MutationObserver. У Колизея переменная просто не используется.
 */
const SELECTOR = '.col-win, .col-greet';

export function startCrenel(doc) {
  const view = doc.defaultView;
  const seen = new WeakSet();
  const apply = el => {
    const width = el.getBoundingClientRect().width + 2;
    if (width > 34) el.style.setProperty('--cn', String(Math.max(3, Math.round((width - 34) / 52) + 1)));
  };
  const ro = new view.ResizeObserver(entries => entries.forEach(entry => apply(entry.target)));
  const watch = el => { if (seen.has(el)) return; seen.add(el); ro.observe(el); apply(el); };
  const scan = root => {
    if (root.nodeType !== 1) return;
    if (root.matches?.(SELECTOR)) watch(root);
    root.querySelectorAll?.(SELECTOR).forEach(watch);
  };
  scan(doc.body);
  const mo = new view.MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)));
  mo.observe(doc.body, { childList: true, subtree: true });
  return () => { ro.disconnect(); mo.disconnect(); doc.querySelectorAll(SELECTOR).forEach(el => el.style.removeProperty('--cn')); };
}
