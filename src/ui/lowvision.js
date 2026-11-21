/**
 * Режим «Для слабовидящих»: крупный текст, высокий контраст, спокойный фон.
 * Включается во вкладке «Палитра». Пока режим включён:
 *   • палитра заменяется на «тёмную» или «светлую» контрастную (LV_DARK и LV_LIGHT; выбранная пользователем палитра не меняется);
 *   • размер текста умножается на выбранную долю 100..160% (переменная --col-fs для нашего оформления и родная --fontScale для чата и настроек Таверны);
 *   • на body стоит класс col-lv, под ним в style.css: однотонный фон вместо мозаики, толстые рамки, яркий фокус, без приглушённого текста.
 * При выключении прежний --fontScale Таверны возвращается.
 */
import { report } from '../core/guard.js';

export const LV_TONES = Object.freeze(['dark', 'light']);
export const LV_MIN = 100;
export const LV_MAX = 160;

export function startLowVision(doc, { settings, save, shared }) {
  const body = doc.body;
  const root = doc.documentElement;
  let savedScale = null;   // что стояло в --fontScale до включения режима

  const clamp = value => Math.max(LV_MIN, Math.min(LV_MAX, Number(value) || 125));
  const apply = () => {
    const on = !!settings.lowVision;
    body.classList.toggle('col-lv', on);
    if (on) {
      const scale = clamp(settings.lowVisionScale) / 100;
      if (savedScale === null) savedScale = root.style.getPropertyValue('--fontScale');
      body.style.setProperty('--col-fs', String(scale));
      root.style.setProperty('--fontScale', String(scale));
    } else {
      body.style.removeProperty('--col-fs');
      if (savedScale !== null) {
        if (savedScale) root.style.setProperty('--fontScale', savedScale); else root.style.removeProperty('--fontScale');
        savedScale = null;
      }
    }
    try { shared.theme?.refresh?.(); } catch (error) { report('режим для слабовидящих', error); }
    shared.bus?.dispatchEvent(new Event('lowvision'));
  };

  shared.lowVision = {
    isOn: () => !!settings.lowVision,
    set(on) { settings.lowVision = !!on; save(); apply(); },
    setTone(tone) { if (LV_TONES.includes(tone)) { settings.lowVisionTone = tone; save(); apply(); } },
    setScale(value) { settings.lowVisionScale = clamp(value); save(); apply(); },
  };
  if (!LV_TONES.includes(settings.lowVisionTone)) settings.lowVisionTone = 'dark';
  settings.lowVisionScale = clamp(settings.lowVisionScale);
  if (settings.lowVision) apply();

  return () => {
    const was = settings.lowVision;
    settings.lowVision = false;
    try { apply(); } finally { settings.lowVision = was; }
    delete shared.lowVision;
  };
}
