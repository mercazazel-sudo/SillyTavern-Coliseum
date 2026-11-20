/** Форма «Создать / изменить помощника»: поля, свой аватар, копия предустановки, импорт и экспорт JSON. */
import { report } from '../core/guard.js';

const LIMITS = { name: 40, tagline: 60, personality: 4000, prompt: 4000, greeting: 500 };
const AVATAR_SIZE = 256;
const AVATAR_FILE_MAX = 10 * 1024 * 1024;
const IMPORT_MAX = 2 * 1024 * 1024;
const COLORS = ['#7b5cd6', '#3fa56b', '#d6914a', '#c9534f', '#4a90d6', '#c9a227'];

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const str = (value, max) => String(value ?? '').trim().slice(0, max);

/** Чистит данные помощника из импорта или формы: только известные поля, ограничения длины. */
export function sanitizeHelper(raw) {
  const color = /^#[0-9a-f]{6}$/i.test(raw?.color ?? '') ? raw.color : COLORS[0];
  const avatar = typeof raw?.avatar === 'string' && /^data:image\/(png|webp|jpeg);base64,/i.test(raw.avatar) && raw.avatar.length < 400000 ? raw.avatar : '';
  return {
    name: str(raw?.name, LIMITS.name),
    tagline: str(raw?.tagline, LIMITS.tagline),
    personality: str(raw?.personality, LIMITS.personality),
    prompt: str(raw?.prompt, LIMITS.prompt),
    greeting: str(raw?.greeting, LIMITS.greeting),
    color,
    avatar,
  };
}

const newId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Читает картинку, обрезает по центру до квадрата и вырезает круг. Возвращает data URL. */
function avatarFromFile(doc, file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Это не картинка')); return; }
    if (file.size > AVATAR_FILE_MAX) { reject(new Error('Файл больше 10 МБ')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = doc.createElement('canvas');
        canvas.width = canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) { reject(error); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать картинку')); };
    img.src = url;
  });
}

/**
 * createEditor возвращает { node, open(helper, mode) }.
 * mode: 'new' (пустая форма), 'edit' (свой помощник), 'copy' (копия предустановки или своего).
 * onDone(id | null) вызывается после сохранения, удаления или отмены.
 */
export function createEditor(doc, { settings, save, onDone }) {
  const node = el(doc, 'form', 'spt-editor');
  node.hidden = true;
  node.noValidate = true;

  const title = el(doc, 'h3', 'spt-ed-title');
  const note = el(doc, 'p', 'spt-ed-note');
  const message = el(doc, 'p', 'spt-ed-message');
  message.setAttribute('role', 'status');

  const field = (label, control) => {
    const wrap = el(doc, 'label', 'spt-ed-field');
    wrap.append(el(doc, 'span', 'spt-ed-label', label), control);
    return wrap;
  };
  const text = (max, ph) => { const i = el(doc, 'input', 'text_pole spt-ed-input'); i.type = 'text'; i.maxLength = max; if (ph) i.placeholder = ph; return i; };
  const area = (max, rows, ph) => { const t = el(doc, 'textarea', 'text_pole spt-ed-area'); t.maxLength = max; t.rows = rows; if (ph) t.placeholder = ph; return t; };

  const nameIn = text(LIMITS.name, 'Имя помощника');
  const tagIn = text(LIMITS.tagline, 'Например: ворчливый механик');
  const persIn = area(LIMITS.personality, 5, 'Как он говорит и держится. Работа помощника уже задана общим промптом.');
  const promptIn = area(LIMITS.prompt, 4, 'Необязательно: свои дополнительные правила.');
  const greetIn = area(LIMITS.greeting, 2, 'Первая реплика в пустом чате.');
  const colorIn = el(doc, 'input', 'spt-ed-color');
  colorIn.type = 'color';

  // аватар
  const avatarPreview = el(doc, 'span', 'spt-avatar spt-ed-avatar');
  const fileIn = el(doc, 'input');
  fileIn.type = 'file';
  fileIn.accept = 'image/*';
  fileIn.hidden = true;
  const pickBtn = el(doc, 'button', 'spt-icon-btn', 'Выбрать картинку');
  pickBtn.type = 'button';
  const dropBtn = el(doc, 'button', 'spt-icon-btn', 'Убрать');
  dropBtn.type = 'button';
  const avatarRow = el(doc, 'div', 'spt-ed-avatar-row');
  avatarRow.append(avatarPreview, pickBtn, dropBtn, fileIn);

  // кнопки
  const saveBtn = el(doc, 'button', 'spt-send', 'Сохранить');
  saveBtn.type = 'submit';
  const cancelBtn = el(doc, 'button', 'spt-icon-btn', 'Отмена');
  cancelBtn.type = 'button';
  const exportBtn = el(doc, 'button', 'spt-icon-btn', 'Экспорт');
  exportBtn.type = 'button';
  const importBtn = el(doc, 'button', 'spt-icon-btn', 'Импорт');
  importBtn.type = 'button';
  const importIn = el(doc, 'input');
  importIn.type = 'file';
  importIn.accept = 'application/json,.json';
  importIn.hidden = true;
  const deleteBtn = el(doc, 'button', 'spt-icon-btn spt-ed-danger', 'Удалить');
  deleteBtn.type = 'button';
  const actions = el(doc, 'div', 'spt-ed-actions');
  actions.append(saveBtn, cancelBtn, exportBtn, importBtn, deleteBtn, importIn);

  node.append(title, note,
    field('Имя', nameIn), field('Подпись', tagIn), field('Характер', persIn),
    field('Свои правила', promptIn), field('Приветствие', greetIn),
    field('Цвет кольца', colorIn), el(doc, 'span', 'spt-ed-label', 'Аватар'), avatarRow,
    message, actions);

  let current = { id: null, avatar: '', mode: 'new', confirm: null };

  function showMessage(textValue, isError = false) {
    message.textContent = textValue;
    message.classList.toggle('spt-ed-bad', isError);
  }

  function paintAvatar() {
    avatarPreview.textContent = '';
    avatarPreview.style.background = '';
    avatarPreview.style.backgroundImage = '';
    avatarPreview.style.setProperty('--spt-ring', colorIn.value);
    if (current.avatar) {
      avatarPreview.style.backgroundImage = `url("${current.avatar}")`;
      avatarPreview.classList.add('spt-avatar-img');
    } else {
      avatarPreview.classList.remove('spt-avatar-img');
      avatarPreview.style.background = colorIn.value;
      avatarPreview.textContent = (nameIn.value.trim()[0] ?? '?').toUpperCase();
    }
    dropBtn.hidden = !current.avatar;
  }

  function fill(data) {
    nameIn.value = data.name ?? '';
    tagIn.value = data.tagline ?? '';
    persIn.value = data.personality ?? '';
    promptIn.value = data.prompt ?? '';
    greetIn.value = data.greeting ?? '';
    colorIn.value = /^#[0-9a-f]{6}$/i.test(data.color ?? '') ? data.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    current.avatar = data.avatar ?? '';
    paintAvatar();
  }

  function collect() {
    return sanitizeHelper({
      name: nameIn.value, tagline: tagIn.value, personality: persIn.value, prompt: promptIn.value,
      greeting: greetIn.value, color: colorIn.value, avatar: current.avatar,
    });
  }

  function resetConfirm() {
    if (current.confirm) { clearTimeout(current.confirm); current.confirm = null; }
    deleteBtn.textContent = 'Удалить';
  }

  function open(helper, mode) {
    resetConfirm();
    showMessage('');
    current = { id: mode === 'edit' ? helper.id : null, avatar: '', mode, confirm: null };
    if (mode === 'new') {
      title.textContent = 'Новый помощник';
      note.textContent = 'Работу помощника задаёт общий промпт, ты задаёшь характер и внешность.';
      fill({});
    } else if (mode === 'copy') {
      title.textContent = `Копия: ${helper.name}`;
      note.textContent = 'Предустановки менять нельзя, поэтому правится копия. Оригинал останется как был.';
      fill({ ...helper, name: `${helper.name} (копия)` });
    } else {
      title.textContent = 'Изменить помощника';
      note.textContent = '';
      fill(helper);
    }
    deleteBtn.hidden = mode !== 'edit';
    exportBtn.hidden = false;
    node.hidden = false;
    nameIn.focus();
  }

  const close = id => { resetConfirm(); node.hidden = true; onDone(id ?? null); };

  nameIn.addEventListener('input', () => { if (!current.avatar) paintAvatar(); });
  colorIn.addEventListener('input', paintAvatar);
  pickBtn.addEventListener('click', () => fileIn.click());
  dropBtn.addEventListener('click', () => { current.avatar = ''; paintAvatar(); });
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files?.[0];
    fileIn.value = '';
    if (!file) return;
    try { current.avatar = await avatarFromFile(doc, file); paintAvatar(); showMessage(''); }
    catch (error) { showMessage(`Аватар: ${error.message}`, true); }
  });

  node.addEventListener('submit', e => {
    e.preventDefault();
    try {
      const data = collect();
      if (!data.name) { showMessage('Нужно имя.', true); nameIn.focus(); return; }
      if (current.mode === 'edit') {
        const index = settings.custom.findIndex(c => c.id === current.id);
        if (index < 0) { showMessage('Этого помощника уже нет.', true); return; }
        settings.custom[index] = { ...data, id: current.id };
        save();
        close(current.id);
      } else {
        const id = newId();
        settings.custom.push({ ...data, id });
        save();
        close(id);
      }
    } catch (error) { report('сохранение помощника', error); showMessage(`Не удалось сохранить: ${error.message}`, true); }
  });

  cancelBtn.addEventListener('click', () => close(null));

  deleteBtn.addEventListener('click', () => {
    if (current.mode !== 'edit') return;
    if (!current.confirm) {
      deleteBtn.textContent = 'Точно удалить?';
      current.confirm = setTimeout(resetConfirm, 3500);
      return;
    }
    settings.custom = settings.custom.filter(c => c.id !== current.id);
    delete settings.histories[current.id];
    save();
    if (settings.activeId === current.id) settings.activeId = ''; // getHelper вернёт первого из списка
    close(null);
  });

  exportBtn.addEventListener('click', () => {
    try {
      const data = collect();
      const blob = new Blob([JSON.stringify({ sputniki: 1, helper: data }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el(doc, 'a');
      a.href = url;
      a.download = `${(data.name || 'helper').replace(/[^\p{L}\p{N}_-]+/gu, '_')}.helper.json`;
      doc.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showMessage('Файл отправлен в загрузки.');
    } catch (error) { showMessage(`Экспорт не удался: ${error.message}`, true); }
  });

  importBtn.addEventListener('click', () => importIn.click());
  importIn.addEventListener('change', async () => {
    const file = importIn.files?.[0];
    importIn.value = '';
    if (!file) return;
    try {
      if (file.size > IMPORT_MAX) throw new Error('файл больше 2 МБ');
      const parsed = JSON.parse(await file.text());
      const data = sanitizeHelper(parsed?.helper ?? parsed);
      if (!data.name) throw new Error('в файле нет имени помощника');
      fill(data);
      current = { ...current, id: null, mode: 'new' };
      title.textContent = 'Импорт: проверь и сохрани';
      deleteBtn.hidden = true;
      showMessage('Данные подставлены в форму. Они сохранятся как новый помощник.');
    } catch (error) { showMessage(`Импорт не удался: ${error.message}`, true); }
  });

  return { node, open, close };
}
