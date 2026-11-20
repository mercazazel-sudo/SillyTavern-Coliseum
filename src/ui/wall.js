/**
 * Фон страницы: слой за интерфейсом и вуаль цвета палитры над ним.
 * Режимы: три римские мозаики, «мозаика из своей картинки» и «свой фон» (картинка как есть) с масштабом и сдвигом.
 * Картинку для режимов «своя» берёт из родной галереи фонов Таверны (она рисует выбранную на #bg1); в настройках остаются только числа. // айла.
 */
import { buildTile, colorsFor, KINDS, mosaicify } from '../core/mosaic.js';
import { buildCamelotTile, isCamelotBackground } from '../core/camelot-backgrounds.js';
import { report } from '../core/guard.js';

export const WALL_ID = 'col-wall';
export const VEIL_ID = 'col-veil';
const MAX_SIDE = 1920;

export function startWall(doc, { settings, save, shared }) {
  const view = doc.defaultView;
  const wall = doc.createElement('div');
  wall.id = WALL_ID;
  const veil = doc.createElement('div');
  veil.id = VEIL_ID;
  const anchor = doc.getElementById('bg1');
  if (anchor) anchor.after(wall, veil); else doc.body.prepend(wall, veil);

  const cache = new Map();
  let ticket = 0;
  let image = null; // загруженная картинка (HTMLImageElement)
  const imageMode = () => settings.bg === 'img' || settings.bg === 'imgmosaic';

  const tileFor = (kindId, colors) => {
    const key = `${kindId}|${Object.values(colors).join(',')}`;
    if (!cache.has(key)) cache.set(key, buildTile(kindId, colors));
    return cache.get(key);
  };

  /** Масштаб и положение своей картинки; без пересборки мозаики. */
  const layout = () => {
    if (!image || !imageMode()) return;
    const iw = image.naturalWidth, ih = image.naturalHeight;
    const width = Math.max(view.innerWidth, view.innerHeight * iw / ih) * settings.bgScale / 100;
    wall.style.backgroundSize = `${width}px ${width * ih / iw}px`;
    wall.style.backgroundPosition = `${settings.bgPx}% ${settings.bgPy}%`;
    wall.style.backgroundRepeat = 'no-repeat';
  };

  const render = async () => {
    const mine = ++ticket;
    // свой рисунок (мозаика, кладка…) заменяет родной фон Таверны: родной прячем, иначе он просвечивает сквозь швы тессер
    doc.body.classList.toggle('col-own-bg', !(imageMode() && image));
    try {
      const palette = shared.theme.current();
      if (imageMode() && image) {
        let url = image.src;
        if (settings.bg === 'imgmosaic') {
          const w = Math.min(MAX_SIDE, image.naturalWidth);
          url = mosaicify(image, w, Math.round(w * image.naturalHeight / image.naturalWidth), settings.bgCell);
        }
        if (mine !== ticket) return;
        wall.style.backgroundImage = `url("${url}")`;
        layout();
        veil.style.opacity = String(settings.bgVeil / 100);
        return;
      }
      if (settings.appearance === 'camelot' && isCamelotBackground(settings.bg)) {
        const key = `camelot|${settings.bg}|${palette.id}|${Object.values(palette.mosaic.roman).join(',')}`;
        if (!cache.has(key)) cache.set(key, buildCamelotTile(settings.bg, palette));
        const result = await cache.get(key);
        if (mine !== ticket || !result) return;
        wall.style.backgroundImage = `url("${result.url}")`;
        wall.style.backgroundSize = `${result.size}px`;
        wall.style.backgroundPosition = '0 0'; wall.style.backgroundRepeat = 'repeat'; veil.style.opacity = String(result.veil);
        return;
      }
      // без картинки (или обычная мозаика): рисунок Колизея
      const kindId = KINDS[settings.bg] ? settings.bg : 'geo';
      const colors = colorsFor(kindId, palette.mosaic);
      const tile = await tileFor(kindId, colors);
      if (mine !== ticket || !tile) return;
      wall.style.backgroundImage = `url("${tile}")`;
      wall.style.backgroundSize = `${KINDS[kindId].N}px`;
      wall.style.backgroundPosition = '0 0';
      wall.style.backgroundRepeat = 'repeat';
      veil.style.opacity = String(colors.veil);
    } catch (error) { report('фон', error); }
  };

  const load = src => new Promise(resolve => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => resolve(null);
    next.src = src;
  });

  /** Адрес картинки, которую выбрали в родной галерее Таверны (она рисует её на #bg1). */
  const nativeUrl = () => {
    try {
      // читаем то, что Таверна записала в style: вычисленное значение при переходе отстаёт на одну смену
      const el = doc.getElementById('bg1');
      const bg = el.style.backgroundImage || view.getComputedStyle(el).backgroundImage;
      const m = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/.exec(bg); // в имени файла бывают скобки
      const raw = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
      return raw ? new URL(raw, doc.baseURI).href : '';
    } catch { return ''; }
  };
  let loadedFor = '';
  const syncImage = async () => {
    const url = nativeUrl();
    if (url === loadedFor && (image || !url)) return;
    loadedFor = url;
    const next = url ? await load(url) : null;
    if (url !== nativeUrl()) return; // пока грузили, выбрали другую
    image = next;
    render();
  };

  shared.wall = {
    hasImage: () => !!image,
    relayout: () => { layout(); },
    veilNow: () => { if (imageMode() && image) veil.style.opacity = String(settings.bgVeil / 100); },
  };

  const onChange = () => { syncImage(); render(); };
  shared.bus.addEventListener('palette', onChange);
  shared.bus.addEventListener('bg', onChange);
  view.addEventListener('resize', layout);
  const bg1 = doc.getElementById('bg1');
  const observer = bg1 ? new view.MutationObserver(() => { syncImage(); }) : null;
  observer?.observe(bg1, { attributes: true, attributeFilter: ['style'] });

  (async () => {
    await syncImage();
    render();
  })();

  return () => {
    shared.bus.removeEventListener('palette', onChange);
    shared.bus.removeEventListener('bg', onChange);
    view.removeEventListener('resize', layout);
    observer?.disconnect();
    delete shared.wall;
    doc.body.classList.remove('col-own-bg');
    wall.remove();
    veil.remove();
  };
}
