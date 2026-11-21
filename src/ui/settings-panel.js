/**
 * Вкладки Акрополя «Фон» и «Палитра» (по макету): выбор мозаики и своей картинки с масштабом и сдвигом,
 * готовые палитры карточками, свои темы (окно-редактор с названием и сохранением), оформление окон.
 * Если окон нет (запуск без модуля окон), панель не создаётся.
 */
import { CUSTOM_KEYS } from '../core/palettes.js';
import { WINDOW_STYLES } from '../core/settings.js';
import { report } from '../core/guard.js';
import { ask } from './kit.js';
import { THEME_PREVIEWS } from './theme-previews.js';

const COLOR_TITLES = {
  page: 'Фон страницы', card: 'Карточки и окна', ink: 'Текст', gold: 'Золото: рамки и линии',
  accent: 'Акцент: кнопки', narr: 'Повествование', speech: 'Речь', think: 'Мысли',
};
const WS_CARDS = [
  { id: 'ctx', title: 'По умолчанию', hint: 'портик, камень, свиток по разделам', preview: '<i class="col-m-home"></i><i class="col-m-lib"></i><i class="col-m-pop"></i>' },
  { id: 'portico', title: 'Везде портик', hint: 'двойная золотая рамка', preview: '<i class="col-m-home"></i>' },
  { id: 'stone', title: 'Везде камень', hint: 'плиты с фаской', preview: '<i class="col-m-lib"></i>' },
  { id: 'scroll', title: 'Везде свиток', hint: 'бумага с валиками', preview: '<i class="col-m-pop"></i>' },
];
const SLIDERS = [
  { key: 'bgCell', label: 'Размер тессеры', min: 4, max: 16, unit: ' px', only: 'imgmosaic' },
  { key: 'bgScale', label: 'Масштаб картинки', min: 30, max: 300, unit: '%' },
  { key: 'bgPx', label: 'Положение: влево — вправо', min: 0, max: 100, unit: '%' },
  { key: 'bgPy', label: 'Положение: вверх — вниз', min: 0, max: 100, unit: '%' },
  { key: 'bgVeil', label: 'Затемнение', min: 0, max: 90, unit: '%' },
];

const escapeHtml = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function startSettingsPanel(doc, { settings, save, shared }) {
  if (!shared.hubTab) { report('панель настроек', new Error('нет окна Акрополя')); return () => {}; }
  const undo = [];
  const bus = shared.bus;
  const appearancePane = shared.hubTab('col-appearance', 'Темы', 'themes');
  const palPane = shared.hubTab('col-pal', 'Палитра', 'theme');
  undo.push(() => {
    appearancePane.remove(); palPane.remove();
    doc.querySelectorAll('.col-vtabs [data-tab="col-appearance"], .col-vtabs [data-tab="col-pal"]').forEach(el => el.remove());
  });

  appearancePane.classList.add('col-set');
  const syncAppearance = () => {
    const profiles = Object.values(shared.appearance.profiles);
    appearancePane.innerHTML = `<h3>Темы</h3><p class="col-note">Тема меняет всё оформление. Палитра и фон запоминаются отдельно для каждой.</p>
      <div class="col-appearance-cards">${profiles.map(profile => `<button type="button" class="col-appearance-card${profile.id === settings.appearance ? ' on' : ''}" data-appearance="${profile.id}"><i class="col-appearance-preview col-appearance-preview-${profile.id}">${THEME_PREVIEWS[profile.id] ?? ''}</i><b>${escapeHtml(profile.title)}</b><small>${escapeHtml(profile.description)}</small></button>`).join('')}</div>
      <h4>Картинки</h4>
      <label class="col-frow col-sharp"><input type="checkbox" data-sharp${settings.sharpImages ? ' checked' : ''}><span>Чёткие аватарки и фоны</span></label>
      <p class="col-note">Таверна показывает аватарки, маски и фоны сжатыми копиями, из-за этого они бывают размытыми. Параметр подставляет оригиналы. Файлы не меняются, выключается так же, без перезагрузки. Страница с очень большим числом персонажей может грузиться дольше.</p>`;
  };
  appearancePane.addEventListener('change', event => {
    const box = event.target.closest('[data-sharp]');
    if (box) shared.sharp?.set(box.checked);
  });
  appearancePane.addEventListener('click', event => {
    const card = event.target.closest('[data-appearance]');
    if (!card) return;
    shared.appearance.set(card.dataset.appearance);
  });

  // ───────── вкладка «Фон»: наши настройки над родной галереей фонов Таверны ─────────
  const galleryPane = doc.querySelector('.col-panes [data-pane="bg"]');
  const bgPane = doc.createElement('div');
  bgPane.className = 'col-set col-bgwrap';
  if (galleryPane) galleryPane.prepend(bgPane);
  undo.push(() => bgPane.remove());
  bgPane.innerHTML = `
    <h3>Фон</h3>
    <select class="col-select" data-col="bg"></select>
    <div class="col-custom" data-col="custom" hidden>
      <p class="col-note">Картинка берётся из галереи Таверны ниже: выбери её там, а загрузить свою можно кнопкой «Добавить фон».</p>
      ${SLIDERS.map(s => `<div class="col-frow" data-row="${s.key}"><label>${escapeHtml(s.label)}</label><span class="col-ctrl"><input type="range" min="${s.min}" max="${s.max}" data-slider="${s.key}"><b data-val="${s.key}"></b></span></div>`).join('')}
      <div class="col-frow"><span></span><button type="button" class="col-btn" data-col="reset">Сбросить масштаб и положение</button></div>
    </div>
    <p class="col-note" data-col="galnote" hidden>Сейчас на странице мозаика. Выбери картинку в галерее ниже, и включится «Свой фон».</p>
    <h4 class="col-bg-gal">Галерея фонов</h4>`;

  const bgSelect = bgPane.querySelector('[data-col="bg"]');
  const customBox = bgPane.querySelector('[data-col="custom"]');
  const sliders = Object.fromEntries(SLIDERS.map(s => [s.key, bgPane.querySelector(`[data-slider="${s.key}"]`)]));
  const isImageMode = () => settings.bg === 'img' || settings.bg === 'imgmosaic';

  const syncBg = () => {
    const list = shared.appearance.current().backgrounds;
    bgSelect.innerHTML = list.map(([id, title]) => `<option value="${id}">${escapeHtml(title)}</option>`).join('');
    bgSelect.value = settings.bg;
    customBox.hidden = !isImageMode();
    bgPane.querySelector('[data-col="galnote"]').hidden = isImageMode();
    bgPane.querySelector('[data-row="bgCell"]').hidden = settings.bg !== 'imgmosaic';
    for (const s of SLIDERS) {
      sliders[s.key].value = settings[s.key];
      bgPane.querySelector(`[data-val="${s.key}"]`).textContent = `${settings[s.key]}${s.unit}`;
    }
  };
  bgSelect.addEventListener('change', () => { settings.bg = bgSelect.value; save(); bus.dispatchEvent(new Event('bg')); syncBg(); });
  // выбор картинки в галерее при включённой мозаике сразу включает «Свой фон»
  const onGallery = event => {
    if (!event.target.closest?.('.bg_example') || isImageMode()) return;
    settings.bg = 'img'; save(); bus.dispatchEvent(new Event('bg')); syncBg();
  };
  galleryPane?.addEventListener('click', onGallery);
  undo.push(() => galleryPane?.removeEventListener('click', onGallery));
  let timer = null;
  for (const s of SLIDERS) {
    sliders[s.key].addEventListener('input', () => {
      settings[s.key] = Number(sliders[s.key].value);
      save();
      bgPane.querySelector(`[data-val="${s.key}"]`).textContent = `${settings[s.key]}${s.unit}`;
      if (s.key === 'bgCell') { clearTimeout(timer); timer = setTimeout(() => bus.dispatchEvent(new Event('bg')), 150); }
      else if (s.key === 'bgVeil') shared.wall?.veilNow();
      else shared.wall?.relayout();
    });
  }
  bgPane.querySelector('[data-col="reset"]').addEventListener('click', () => {
    Object.assign(settings, { bgScale: 100, bgPx: 50, bgPy: 50 });
    save(); syncBg(); shared.wall?.relayout();
  });

  // ───────── вкладка «Палитра» ─────────
  palPane.classList.add('col-set');
  const swatch = (a, b) => `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;
  palPane.innerHTML = `
    <h3>Палитра</h3>
    <h4>Готовые палитры</h4>
    <div class="col-pcards" data-col="built-in"></div>
    <h4>Мои темы</h4>
    <div class="col-pcards" data-col="mine"></div>
    <h4>Оформление окон</h4>
    <div class="col-wscards">${WS_CARDS.map(c => `<button type="button" class="col-wscard" data-ws="${c.id}"><div class="col-msw">${c.preview}</div><b>${escapeHtml(c.title)}</b><small>${escapeHtml(c.hint)}</small></button>`).join('')}</div>`;

  // ───────── режим «Для слабовидящих»: тумблер, при включении выбор «Тёмная» или «Светлая» и размер ─────────
  const lvBox = doc.createElement('div');
  lvBox.className = 'col-lvbox';
  lvBox.innerHTML = `<h4>Режим для слабовидящих</h4>
    <p class="col-note">Крупный текст, высокий контраст (основной текст не ниже 12:1), однотонный фон вместо мозаики, толстые рамки и яркий фокус. Выбранная палитра сохраняется и вернётся после выключения.</p>
    <label class="col-frow col-sharp"><input type="checkbox" data-lv><span>Включить режим для слабовидящих</span></label>
    <div data-lv-more hidden>
      <div class="col-lvtones" role="radiogroup" aria-label="Палитра режима">
        <button type="button" class="col-lvtone" data-lv-tone="dark" role="radio">Тёмная</button>
        <button type="button" class="col-lvtone" data-lv-tone="light" role="radio">Светлая</button>
      </div>
      <div class="col-frow"><label>Размер</label><span class="col-ctrl"><input type="range" min="100" max="160" step="5" data-lv-scale><b data-lv-val></b></span></div>
    </div>`;
  palPane.append(lvBox);
  const syncLv = () => {
    const on = !!settings.lowVision;
    lvBox.querySelector('[data-lv]').checked = on;
    lvBox.querySelector('[data-lv-more]').hidden = !on;
    lvBox.querySelectorAll('[data-lv-tone]').forEach(b => { const sel = b.dataset.lvTone === settings.lowVisionTone; b.classList.toggle('on', sel); b.setAttribute('aria-checked', String(sel)); });
    lvBox.querySelector('[data-lv-scale]').value = settings.lowVisionScale;
    lvBox.querySelector('[data-lv-val]').textContent = `${settings.lowVisionScale}%`;
  };
  lvBox.addEventListener('change', event => {
    if (event.target.closest('[data-lv]')) { shared.lowVision?.set(event.target.checked); syncLv(); }
  });
  lvBox.addEventListener('click', event => {
    const tone = event.target.closest('[data-lv-tone]');
    if (tone) { shared.lowVision?.setTone(tone.dataset.lvTone); syncLv(); }
  });
  lvBox.addEventListener('input', event => {
    const range = event.target.closest('[data-lv-scale]');
    if (range) { shared.lowVision?.setScale(Number(range.value)); lvBox.querySelector('[data-lv-val]').textContent = `${settings.lowVisionScale}%`; }
  });
  undo.push(() => lvBox.remove());
  syncLv();

  // ───────── фильтр аватарок для цветовой слепоты: два тумблера (взаимоисключающие) и ползунок силы ─────────
  const cvdBox = doc.createElement('div');
  cvdBox.className = 'col-cvdbox';
  cvdBox.innerHTML = `<h4>Фильтр аватарок</h4>
    <p class="col-note">Для людей с цветовой слепотой: цвета, которые не различаются, сдвигаются в различимые. Картинки меняются только на экране, файлы остаются прежними. Включён может быть один режим.</p>
    <label class="col-frow col-sharp"><input type="checkbox" data-cvd="rg"><span>Красно-зелёный: протан и дейтан (самый частый)</span></label>
    <label class="col-frow col-sharp"><input type="checkbox" data-cvd="by"><span>Сине-жёлтый: тритан</span></label>
    <div class="col-frow" data-row="cvdStrength"><label>Сила фильтра</label><span class="col-ctrl"><input type="range" min="0" max="100" data-cvd-strength><b data-cvd-val></b></span></div>`;
  palPane.append(cvdBox);
  const help = doc.createElement('details');
  help.className = 'col-info';
  help.innerHTML = `<summary>Справка: цветовая слепота и что для неё сделано</summary>
    <div class="col-info-body">
      <h5>Типы</h5>
      <ul>
        <li><b>Протанопия, протаномалия.</b> Не работают или ослаблены «красные» колбочки. Красный темнее обычного и путается с зелёным.</li>
        <li><b>Дейтеранопия, дейтераномалия.</b> Не работают или ослаблены «зелёные» колбочки. Самый частый тип. Вместе с протаном даёт красно-зелёный дальтонизм.</li>
        <li><b>Тританопия, тританомалия.</b> Не работают или ослаблены «синие» колбочки. Путаются синий с зелёным и жёлтый с розовым. Редкий тип.</li>
        <li>Окончание «-опия» значит, что цветовой канал не работает совсем, «-омалия» что работает слабее. Людей с «-омалией» больше.</li>
      </ul>
      <h5>Что сделано</h5>
      <ul>
        <li><b>Палитра «Ясная · красно-зелёный»</b> для протана и дейтана: без пары красный и зелёный, акценты синие, оранжевые и жёлтые, повествование, речь и мысли различаются ещё и яркостью.</li>
        <li><b>Палитра «Ясная · сине-жёлтый»</b> для тритана: смысл несут красный, зелёный и яркость, фон нейтрально-графитовый без синевы.</li>
        <li><b>Фильтр аватарок</b> сдвигает цвета, которые не различаются, в различимые. Режим «красно-зелёный» работает по модели дейтеранопии и помогает и при протане. При «-омалии» ставьте силу поменьше.</li>
        <li>Контраст текста у обеих палитр не ниже 6:1.</li>
        <li><b>Режим для слабовидящих:</b> крупный текст (100–160%), тёмная или светлая палитра с контрастом основного текста не ниже 12:1, однотонный фон, толстые рамки, яркий фокус при управлении с клавиатуры.</li>      </ul>
    </div>`;
  palPane.append(help);
  undo.push(() => help.remove());
  const syncCvd = () => {
    const mode = settings.cvdMode;
    cvdBox.querySelectorAll('[data-cvd]').forEach(box => { box.checked = box.dataset.cvd === mode; });
    const strength = Number.isFinite(settings.cvdStrength) ? settings.cvdStrength : 60;
    cvdBox.querySelector('[data-cvd-strength]').value = strength;
    cvdBox.querySelector('[data-cvd-val]').textContent = `${strength}%`;
    cvdBox.querySelector('[data-row="cvdStrength"]').hidden = mode === 'off';
  };
  cvdBox.addEventListener('change', event => {
    const box = event.target.closest('[data-cvd]');
    if (box) { shared.cvd?.set(box.checked ? box.dataset.cvd : 'off'); syncCvd(); }
  });
  cvdBox.addEventListener('input', event => {
    const range = event.target.closest('[data-cvd-strength]');
    if (range) { shared.cvd?.set(undefined, Number(range.value)); cvdBox.querySelector('[data-cvd-val]').textContent = `${range.value}%`; }
  });
  undo.push(() => cvdBox.remove());
  syncCvd();

  const mine = palPane.querySelector('[data-col="mine"]');
  const syncPal = () => {
    const builtIn = shared.theme.list.map(p => ({ id: p.id, title: p.title, a: p.tokens.page, b: p.tokens.gold }));
    palPane.querySelector('[data-col="built-in"]').innerHTML = builtIn.map(c => `<button type="button" class="col-pcard" data-theme="${c.id}"><i style="background:${swatch(c.a, c.b)}"></i>${escapeHtml(c.title)}</button>`).join('');
    mine.innerHTML = settings.themes.map(t => `<div class="col-ucard"><button type="button" class="col-pcard" data-theme="${escapeHtml(t.id)}"><i style="background:${swatch(t.colors.page, t.colors.gold)}"></i>${escapeHtml(t.name)}</button>
        <span class="col-ucard-acts"><button type="button" class="col-ucard-b" data-te-edit="${escapeHtml(t.id)}" title="Изменить" aria-label="Изменить тему">✎</button><button type="button" class="col-ucard-b" data-te-del="${escapeHtml(t.id)}" title="Удалить" aria-label="Удалить тему">×</button></span></div>`).join('')
      + '<button type="button" class="col-pcard col-pnew" data-te-new><i>+</i>Создать свою тему</button>';
    for (const card of palPane.querySelectorAll('[data-theme]')) card.classList.toggle('on', card.dataset.theme === settings.theme);
    for (const card of palPane.querySelectorAll('[data-ws]')) card.classList.toggle('on', card.dataset.ws === settings.ws);
  };

  /** Окно редактора: цвета меняются на странице сразу, но сохраняются только кнопкой «Сохранить». */
  let editor = null;
  const closeEditor = () => { if (!editor) return; editor.remove(); editor = null; shared.theme.endPreview(); syncPal(); };
  undo.push(() => { closeEditor(); });
  const openEditor = editId => {
    closeEditor();
    const own = editId ? settings.themes.find(t => t.id === editId) : null;
    const colors = { ...(own ? own.colors : Object.fromEntries(CUSTOM_KEYS.map(k => [k, shared.theme.current().tokens[k]]))) };
    const host = palPane.closest('.col-win') ?? palPane;
    const shade = doc.createElement('div');
    shade.className = 'col-ask col-te-shade';
    shade.innerHTML = `<div class="col-ask-box col-te" role="dialog" aria-label="${own ? 'Изменить тему' : 'Новая тема'}">
      <h4>${own ? 'Изменить тему' : 'Новая тема'}</h4>
      <label class="col-te-name"><span>Название</span><input class="col-input" type="text" maxlength="40" placeholder="например: Закат над Делосом" value="${escapeHtml(own?.name ?? '')}"></label>
      <div class="col-te-grid">${CUSTOM_KEYS.map(key => `<label class="col-te-row"><input type="color" data-key="${key}" value="${colors[key]}"><span>${escapeHtml(COLOR_TITLES[key])}</span><input type="text" class="col-input col-te-hex" data-hex="${key}" value="${colors[key]}" maxlength="7" spellcheck="false"></label>`).join('')}</div>
      <p class="col-note">Остальные оттенки подбираются сами. Страница меняется сразу, сохранится только по кнопке.</p>
      <div class="col-ask-btns"><button type="button" class="col-btn col-primary" data-te="save">Сохранить</button><button type="button" class="col-btn" data-te="cancel">Отмена</button></div></div>`;
    host.append(shade);
    editor = shade;
    const nameInput = shade.querySelector('.col-te-name input');
    const push = () => { try { shared.theme.preview(colors); } catch (error) { report('предпросмотр темы', error); } };
    shade.addEventListener('input', event => {
      const el = event.target;
      if (el.dataset?.key) {
        colors[el.dataset.key] = el.value;
        shade.querySelector(`[data-hex="${el.dataset.key}"]`).value = el.value;
        push();
      } else if (el.dataset?.hex) {
        const v = el.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(v)) { colors[el.dataset.hex] = v.toLowerCase(); shade.querySelector(`[data-key="${el.dataset.hex}"]`).value = v.toLowerCase(); push(); }
      }
    });
    const save1 = () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); nameInput.classList.add('col-bad'); return; }
      try {
        if (own) shared.theme.updateUser(own.id, name, colors); else shared.theme.addUser(name, colors);
      } catch (error) { report('сохранение темы', error); }
      closeEditor();
    };
    shade.addEventListener('click', event => {
      if (event.target === shade) return closeEditor();
      const act = event.target.closest('[data-te]')?.dataset.te;
      if (act === 'save') save1(); else if (act === 'cancel') closeEditor();
    });
    shade.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); closeEditor(); }
      else if (event.key === 'Enter' && event.target === nameInput) save1();
    });
    nameInput.addEventListener('input', () => nameInput.classList.remove('col-bad'));
    push();
    nameInput.focus();
  };

  palPane.addEventListener('click', async event => {
    if (event.target.closest('[data-te-new]')) { openEditor(null); return; }
    const edit = event.target.closest('[data-te-edit]');
    if (edit) { openEditor(edit.dataset.teEdit); return; }
    const del = event.target.closest('[data-te-del]');
    if (del) {
      const own = settings.themes.find(t => t.id === del.dataset.teDel);
      if (own && await ask(palPane.closest('.col-win') ?? palPane, { title: 'Удалить тему?', text: `«${own.name}» будет удалена без возможности вернуть.`, ok: 'Удалить', danger: true })) { shared.theme.removeUser(own.id); syncPal(); }
      return;
    }
    const theme = event.target.closest('[data-theme]');
    if (theme) { shared.theme.set(theme.dataset.theme); syncPal(); return; }
    const ws = event.target.closest('[data-ws]');
    if (ws && WINDOW_STYLES.includes(ws.dataset.ws)) { settings.ws = ws.dataset.ws; save(); bus.dispatchEvent(new Event('ws')); syncPal(); }
  });

  const onPalette = () => { if (!editor) syncPal(); };
  const onBg = () => syncBg();
  const onAppearance = () => { closeEditor(); syncAppearance(); syncBg(); syncPal(); };
  bus.addEventListener('palette', onPalette);
  bus.addEventListener('bg', onBg);
  bus.addEventListener('appearance', onAppearance);
  undo.push(() => { bus.removeEventListener('palette', onPalette); bus.removeEventListener('bg', onBg); bus.removeEventListener('appearance', onAppearance); });

  syncAppearance();
  syncBg();
  syncPal();
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат панели настроек', error); } } };
}
