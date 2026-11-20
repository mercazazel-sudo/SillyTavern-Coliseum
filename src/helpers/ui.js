/** Кругляшок в углу и окно чата помощника. start() возвращает функцию отката. */
import { report } from '../core/guard.js';
import { allHelpers, getHelper, getHistory, pushMessage, clearHistory } from './store.js';
import { ask, stop } from './chat.js';
import { chatMessages, chatText, errorsText } from './attach.js';
import { extractCard, uploadCard } from './cardskill.js';

// статические значки (не из пользовательского текста), поэтому innerHTML безопасен
const SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const ICON_SEND = `${SVG}<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>`;
const ICON_STOP = `${SVG}<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>`;
const ICON_MENU = `${SVG}<path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

const DRAG_THRESHOLD = 5;
const BUBBLE_SIZE = 56;
const EDGE = 16;

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Аватар: своя картинка (data URL / путь) либо цветной кружок с буквой. */
export function fillAvatar(node, helper) {
  node.textContent = '';
  node.style.backgroundImage = '';
  node.style.background = '';
  node.style.setProperty('--spt-ring', helper.color || '#888');
  if (helper.avatar) {
    node.style.backgroundImage = `url("${String(helper.avatar).replace(/"/g, '%22')}")`;
    node.classList.add('spt-avatar-img');
    node.classList.toggle('spt-avatar-framed', !!helper.framed); // своя рамка уже на картинке, CSS-кольцо не нужно
  } else {
    node.classList.remove('spt-avatar-img', 'spt-avatar-framed');
    node.style.background = helper.color || '#777';
    node.textContent = helper.glyph || String(helper.name || '?').slice(0, 1).toUpperCase();
  }
}

export function startUi(doc, { context, settings, save, errors, shared = {} }) {
  const undo = [];
  const win = doc.defaultView;
  let busy = false;

  const root = el(doc, 'div', 'spt-root');
  const bubble = el(doc, 'button', 'spt-bubble');
  bubble.type = 'button';
  bubble.title = 'Помощник';
  const bubbleAvatar = el(doc, 'span', 'spt-avatar');
  bubble.append(bubbleAvatar);

  const panel = el(doc, 'section', 'spt-window');
  panel.hidden = true;

  const header = el(doc, 'header', 'spt-header');
  const vibes = el(doc, 'div', 'spt-vibes');
  // шапка: переключатель помощников, имя выбранного (без подписи), закрыть. Остальные кнопки внизу.
  const titleBox = el(doc, 'div', 'spt-title');
  const titleName = el(doc, 'strong', 'spt-title-name');
  titleBox.append(titleName);
  const clearBtn = el(doc, 'button', 'spt-menu-item', 'Очистить');
  clearBtn.type = 'button';
  clearBtn.title = 'Очистить историю этого помощника';
  const closeBtn = el(doc, 'button', 'spt-icon-btn', '✕');
  closeBtn.type = 'button';
  closeBtn.title = 'Свернуть';
  const headTools = el(doc, 'div', 'spt-head-tools');
  headTools.append(closeBtn);
  header.append(vibes, titleBox, headTools);

  const list = el(doc, 'div', 'spt-messages');
  const form = el(doc, 'form', 'spt-form');
  const input = el(doc, 'textarea', 'spt-input');
  input.rows = 1; // одна строка, растёт по мере набора (fitInput)
  input.placeholder = 'Напиши помощнику...';
  const INPUT_MAX = 140;
  const fitInput = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX)}px`;
  };
  input.addEventListener('input', fitInput);
  // слева от поля ввода меню из трёх полосок, справа квадратная кнопка отправки с самолётиком
  const menuBtn = el(doc, 'button', 'spt-menu-btn');
  menuBtn.type = 'button';
  menuBtn.innerHTML = ICON_MENU;
  menuBtn.title = 'Меню';
  menuBtn.setAttribute('aria-label', 'Меню помощника');
  menuBtn.setAttribute('aria-haspopup', 'true');
  const sendBtn = el(doc, 'button', 'spt-send');
  sendBtn.type = 'submit';
  sendBtn.innerHTML = ICON_SEND;
  sendBtn.title = 'Отправить';
  sendBtn.setAttribute('aria-label', 'Отправить');
  // три элемента сведены в одну рамку одной высоты: меню | поле | отправка
  const composer = el(doc, 'div', 'spt-composer');
  composer.append(menuBtn, input, sendBtn);
  form.append(composer);

  // Вложения «по кнопке» лежат в меню: действуют на одно следующее сообщение и потом сбрасываются.
  const menu = el(doc, 'div', 'spt-menu');
  menu.hidden = true;
  const attachChatBtn = el(doc, 'button', 'spt-menu-item');
  attachChatBtn.type = 'button';
  const attachErrBtn = el(doc, 'button', 'spt-menu-item');
  attachErrBtn.type = 'button';
  // «Собрать персонажа» запускает навык принудительно, не полагаясь на то, как модель поняла фразу
  const attachCardBtn = el(doc, 'button', 'spt-menu-item');
  attachCardBtn.type = 'button';
  menu.append(attachChatBtn, attachErrBtn, attachCardBtn);
  form.append(menu);
  const attach = { chat: false, error: false, card: false };

  function renderAttach() {
    const hasChat = chatMessages(context).length > 0;
    const hasErr = !!errors?.last();
    if (!hasChat) attach.chat = false;
    if (!hasErr) attach.error = false;
    attachChatBtn.disabled = !hasChat;
    attachErrBtn.disabled = !hasErr;
    attachChatBtn.textContent = `${attach.chat ? '✓ ' : ''}Приложить чат`;
    attachErrBtn.textContent = `${attach.error ? '✓ ' : ''}Приложить ошибку`;
    attachChatBtn.classList.toggle('spt-attach-on', attach.chat);
    attachErrBtn.classList.toggle('spt-attach-on', attach.error);
    attachChatBtn.title = hasChat ? 'Последние реплики текущего чата Таверны, на одно следующее сообщение' : 'В Таверне не открыт чат с сообщениями';
    attachErrBtn.title = hasErr ? 'Последние ошибки, на одно следующее сообщение' : 'Ошибок пока не было';
    attachCardBtn.textContent = `${attach.card ? '✓ ' : ''}Собрать персонажа`;
    attachCardBtn.classList.toggle('spt-attach-on', attach.card);
    attachCardBtn.title = 'Помощник соберёт по твоему сообщению набросок персонажа и лорбука; в Таверну он попадёт только по кнопке «Загрузить»';
    const any = attach.chat || attach.error || attach.card;
    menuBtn.classList.toggle('spt-attach-on', any);
    menuBtn.title = any ? `Включено: ${[attach.chat && 'чат', attach.error && 'ошибка', attach.card && 'собрать персонажа'].filter(Boolean).join(', ')}` : 'Меню';
  }
  attachChatBtn.addEventListener('click', () => { attach.chat = !attach.chat; renderAttach(); });
  attachErrBtn.addEventListener('click', () => { attach.error = !attach.error; renderAttach(); });
  attachCardBtn.addEventListener('click', () => { attach.card = !attach.card; renderAttach(); });
  menuBtn.addEventListener('click', event => { event.stopPropagation(); menu.hidden = !menu.hidden; });
  const closeMenu = event => { if (!menu.hidden && !menu.contains(event.target) && event.target !== menuBtn && !menuBtn.contains(event.target)) menu.hidden = true; };
  const onMenuKey = event => { if (event.key === 'Escape' && !menu.hidden) { menu.hidden = true; event.stopPropagation(); } };
  doc.addEventListener('click', closeMenu);
  doc.addEventListener('keydown', onMenuKey, true);
  undo.push(() => { doc.removeEventListener('click', closeMenu); doc.removeEventListener('keydown', onMenuKey, true); });
  // новая ошибка и смена чата меняют доступность кнопок
  const chatEvent = context.eventTypes?.CHAT_CHANGED;
  const onChatChanged = () => renderAttach();
  if (chatEvent) { context.eventSource.on(chatEvent, onChatChanged); undo.push(() => context.eventSource.removeListener(chatEvent, onChatChanged)); }
  const onErrorsChanged = () => renderAttach();
  doc.addEventListener('sputniki:errors', onErrorsChanged);
  undo.push(() => doc.removeEventListener('sputniki:errors', onErrorsChanged));

  // «Очистить» лежит в меню под вложениями, через разделитель.
  // Создание, копия и правка помощников живут во вкладке «Помощники» Акрополя (helpers/index.js).
  menu.append(el(doc, 'div', 'spt-menu-sep'), clearBtn);
  clearBtn.addEventListener('click', () => { menu.hidden = true; });

  panel.append(header, list, form);
  root.append(panel, bubble);
  doc.body.append(root);
  undo.push(() => root.remove());

  // ---------- позиция ----------
  const clampPos = (left, top) => ({
    left: Math.min(Math.max(EDGE, left), Math.max(EDGE, win.innerWidth - BUBBLE_SIZE - EDGE)),
    top: Math.min(Math.max(EDGE, top), Math.max(EDGE, win.innerHeight - BUBBLE_SIZE - EDGE)),
  });

  function applyPosition() {
    const base = settings.pos ?? { left: win.innerWidth - BUBBLE_SIZE - 24, top: Math.round(win.innerHeight * 0.45) };
    const pos = clampPos(base.left, base.top);
    bubble.style.left = `${pos.left}px`;
    bubble.style.top = `${pos.top}px`;
    placePanel(pos);
  }

  /** Окно рядом с кругляшком: выше или ниже и левее или правее, где больше места. */
  function placePanel(pos) {
    const w = Math.min(380, win.innerWidth - 16);
    const h = Math.min(520, win.innerHeight - 16);
    const toLeft = pos.left + BUBBLE_SIZE / 2 > win.innerWidth / 2;
    const toTop = pos.top + BUBBLE_SIZE / 2 > win.innerHeight / 2;
    let left = toLeft ? pos.left + BUBBLE_SIZE - w : pos.left;
    let top = toTop ? pos.top - h - 10 : pos.top + BUBBLE_SIZE + 10;
    // Если слева/справа от кругляшка хватает места, окно встаёт сбоку и не закрывает ни кнопку, ни её саму.
    const sideLeft = pos.left - w - 10;
    const sideRight = pos.left + BUBBLE_SIZE + 10;
    if (toLeft && sideLeft >= 8) { left = sideLeft; top = pos.top + BUBBLE_SIZE / 2 - h / 2; }
    else if (!toLeft && sideRight + w <= win.innerWidth - 8) { left = sideRight; top = pos.top + BUBBLE_SIZE / 2 - h / 2; }
    left = Math.min(Math.max(8, left), win.innerWidth - w - 8);
    top = Math.min(Math.max(8, top), win.innerHeight - h - 8);
    // окно, которое оттащили за шапку, остаётся там, куда его поставили (пока не сдвинут кругляшок или не нажмут на шапку дважды)
    if (settings.panelPos) { left = Math.min(Math.max(0, settings.panelPos.left), Math.max(0, win.innerWidth - w)); top = Math.min(Math.max(0, settings.panelPos.top), Math.max(0, win.innerHeight - h)); }
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  // ---------- перетаскивание и клик ----------
  let drag = null;
  const onDown = e => {
    if (e.button != null && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: bubble.offsetLeft, top: bubble.offsetTop, moved: false, id: e.pointerId };
    try { bubble.setPointerCapture(e.pointerId); } catch { /* не критично */ }
  };
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    delete settings.panelPos; // кругляшок сдвинули: окно снова встаёт рядом с ним
    settings.pos = clampPos(drag.left + dx, drag.top + dy);
    applyPosition();
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    try { bubble.releasePointerCapture(e.pointerId); } catch { /* не критично */ }
    if (moved) save(); else togglePanel();
  };
  // окно тоже можно переставить: тянем за шапку (кнопки и переключатель помощников не считаются)
  let pdrag = null;
  header.addEventListener('pointerdown', e => {
    if ((e.button != null && e.button !== 0) || e.target.closest('button, input, select, textarea, a')) return;
    pdrag = { x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop, id: e.pointerId, moved: false };
    try { header.setPointerCapture(e.pointerId); } catch { /* не критично */ }
  });
  header.addEventListener('pointermove', e => {
    if (!pdrag || e.pointerId !== pdrag.id) return;
    const dx = e.clientX - pdrag.x, dy = e.clientY - pdrag.y;
    if (!pdrag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    pdrag.moved = true;
    panel.classList.add('spt-dragging');
    const w = panel.offsetWidth, h = panel.offsetHeight;
    settings.panelPos = { left: Math.min(Math.max(0, pdrag.left + dx), Math.max(0, win.innerWidth - w)), top: Math.min(Math.max(0, pdrag.top + dy), Math.max(0, win.innerHeight - h)) };
    panel.style.left = `${settings.panelPos.left}px`;
    panel.style.top = `${settings.panelPos.top}px`;
  });
  const endPanelDrag = e => {
    if (!pdrag || e.pointerId !== pdrag.id) return;
    const moved = pdrag.moved;
    pdrag = null;
    panel.classList.remove('spt-dragging');
    try { header.releasePointerCapture(e.pointerId); } catch { /* не критично */ }
    if (moved) save();
  };
  header.addEventListener('pointerup', endPanelDrag);
  header.addEventListener('pointercancel', endPanelDrag);
  header.addEventListener('dblclick', e => {
    if (e.target.closest('button, input, select, textarea, a') || !settings.panelPos) return;
    delete settings.panelPos; save(); applyPosition();
  });
  bubble.addEventListener('pointerdown', onDown);
  bubble.addEventListener('pointermove', onMove);
  bubble.addEventListener('pointerup', onUp);
  bubble.addEventListener('pointercancel', () => { drag = null; });
  bubble.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); } });
  win.addEventListener('resize', applyPosition);
  undo.push(() => win.removeEventListener('resize', applyPosition));

  // ---------- окно ----------
  function togglePanel(force) {
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    settings.open = open;
    save();
    if (open) { renderAll(); input.focus(); }
  }
  closeBtn.addEventListener('click', () => togglePanel(false));

  function renderVibes() {
    vibes.textContent = '';
    for (const helper of allHelpers(settings)) {
      const btn = el(doc, 'button', 'spt-vibe');
      btn.type = 'button';
      btn.title = `${helper.name}: ${helper.tagline || ''}`.trim();
      if (helper.id === getHelper(settings, settings.activeId).id) btn.classList.add('spt-vibe-on');
      const av = el(doc, 'span', 'spt-avatar');
      fillAvatar(av, helper);
      btn.append(av);
      btn.addEventListener('click', () => {
        settings.activeId = helper.id;
        save();
        renderAll();
      });
      vibes.append(btn);
    }
  }

  function renderHeader() {
    const helper = getHelper(settings, settings.activeId);
    titleName.textContent = helper.name;
    titleBox.title = helper.tagline || '';
    fillAvatar(bubbleAvatar, helper);
  }

  /** Карточка-набросок под ответом помощника: что собрано и кнопка «Загрузить в Таверну». Текст модели только через textContent. */
  function buildCardBox(parsed, msg) {
    const box = el(doc, 'div', 'spt-card');
    if (!parsed.card) {
      box.classList.add('spt-card-bad');
      box.append(el(doc, 'div', 'spt-card-title', 'Набросок не загружается'), el(doc, 'div', 'spt-card-note', `Причина: ${parsed.problem}.`));
      return box;
    }
    const { character: c, lorebook: b } = parsed.card;
    box.append(el(doc, 'div', 'spt-card-title', `Набросок: ${c.name}`));
    box.append(el(doc, 'div', 'spt-card-note', [`возраст ${c.age}`, c.tags.length ? c.tags.join(', ') : '', b ? `лорбук «${b.name}», записей: ${b.entries.length}` : 'без лорбука'].filter(Boolean).join(' · ')));

    const more = el(doc, 'details', 'spt-card-more');
    more.append(el(doc, 'summary', null, 'Показать текст'));
    const section = (title, text) => { if (!text) return; more.append(el(doc, 'div', 'spt-card-h', title), el(doc, 'div', 'spt-card-t', text)); };
    section('Описание', c.description);
    section('Характер', c.personality);
    section('Сценарий', c.scenario);
    section('Первая реплика', c.first_mes);
    section('Пример диалога', c.mes_example);
    if (b) section('Записи лорбука', b.entries.map(e => `• ${e.title} (${e.keys.join(', ')}): ${e.content}`).join('\n'));
    box.append(more);

    const status = el(doc, 'div', 'spt-card-status');
    const action = el(doc, 'button', 'spt-card-btn', 'Загрузить в Таверну');
    action.type = 'button';
    const showDone = done => {
      action.hidden = true;
      status.classList.remove('spt-card-bad');
      status.textContent = `Загружено: персонаж «${c.name}» (файл ${done.avatar})${done.bookName ? `, лорбук «${done.bookName}», записей: ${done.entries}` : ''}. Смотри в списках персонажей и лорбуков.`;
    };
    if (msg.loaded) showDone(msg.loaded);
    action.addEventListener('click', async () => {
      if (action.disabled || msg.loaded) return;
      action.disabled = true;
      action.textContent = 'Загружаю...';
      status.textContent = '';
      status.classList.remove('spt-card-bad');
      try {
        const done = await uploadCard(context, parsed.card, getHelper(settings, settings.activeId).name);
        msg.loaded = done;
        save();
        showDone(done);
      } catch (error) {
        report('загрузка персонажа', error);
        status.classList.add('spt-card-bad');
        status.textContent = `Не получилось: ${error?.message ?? error}`;
        action.disabled = false;
        action.textContent = 'Попробовать ещё раз';
      }
    });
    box.append(action, status);
    return box;
  }

  function addMessageNode(role, text, extraClass, attached, msg) {
    const node = el(doc, 'div', `spt-msg spt-msg-${role}${extraClass ? ` ${extraClass}` : ''}`);
    const isError = !!(extraClass && extraClass.includes('spt-msg-error'));
    const parsed = role === 'assistant' && !isError && msg ? extractCard(text) : null;
    if (isError) node.textContent = text; else fillRich(doc, node, parsed ? parsed.text : text);
    if (parsed && (parsed.card || parsed.problem)) node.append(buildCardBox(parsed, msg));
    if (attached?.length) node.append(el(doc, 'div', 'spt-attached', `Приложено: ${attached.join(', ')}`));
    list.append(node);
    return node;
  }

  function renderMessages() {
    const helper = getHelper(settings, settings.activeId);
    list.textContent = '';
    if (helper.greeting) addMessageNode('assistant', helper.greeting, 'spt-greeting');
    for (const m of getHistory(settings, helper.id)) {
      addMessageNode(m.role, m.content, m.error ? 'spt-msg-error' : '', m.attached, m);
    }
    if (busy) { addMessageNode('assistant', '...', 'spt-pending'); updatePending(); }
    list.scrollTop = list.scrollHeight;
  }

  // Пока модель думает: счётчик секунд и подсказка, что запрос можно остановить кнопкой.
  let busySince = 0;
  let tick = null;
  function updatePending() {
    const node = list.querySelector('.spt-pending');
    if (!node || !busySince) return;
    const sec = Math.floor((Date.now() - busySince) / 1000);
    node.textContent = sec < 40 ? `Думает… ${sec} с` : `Думает… ${sec} с. Это долго: модель может быть перегружена, запрос можно остановить кнопкой ■.`;
  }
  function startTick() { busySince = Date.now(); clearInterval(tick); tick = setInterval(updatePending, 1000); }
  function stopTick() { clearInterval(tick); tick = null; busySince = 0; }
  undo.push(stopTick);

  function renderBusy() {
    sendBtn.innerHTML = busy ? ICON_STOP : ICON_SEND;
    sendBtn.title = busy ? 'Остановить' : 'Отправить';
    sendBtn.setAttribute('aria-label', sendBtn.title);
    sendBtn.classList.toggle('spt-send-stop', busy);
  }

  function renderAll() {
    renderVibes();
    renderHeader();
    renderMessages();
    renderBusy();
  }

  clearBtn.addEventListener('click', () => {
    if (busy) return;
    clearHistory(settings, getHelper(settings, settings.activeId).id);
    save();
    renderMessages();
  });

  // ---------- отправка ----------
  async function send() {
    // Вложение можно отправить и без текста: тогда подставляется стандартный вопрос.
    renderAttach();
    const typed = input.value.trim();
    if ((!typed && !attach.chat && !attach.error && !attach.card) || busy) return;
    const text = typed || defaultQuestion(attach);
    const helper = getHelper(settings, settings.activeId);
    const message = { role: 'user', content: text };
    const parts = [];
    const labels = [];
    try {
      if (attach.chat) { const t = chatText(context); if (t) { parts.push(`Фрагмент чата Таверны:\n${t}`); labels.push('чат'); } }
      if (attach.error && errors) { const t = errorsText(errors); if (t) { parts.push(`Последние ошибки:\n${t}`); labels.push('ошибка'); } }
    } catch (error) { report('сбор вложений', error); }
    if (attach.card) {
      parts.push('Просьба: собери по этому запросу набросок персонажа и лорбука и выдай блок st-card, как описано в инструкции. Не играй роль персонажа, ты помощник.');
      labels.push('собрать персонажа');
    }
    if (parts.length) {
      message.sent = `${text}\n\n---\nПриложено пользователем по кнопке:\n\n${parts.join('\n\n')}`;
      message.attached = labels;
      // Вложение держим только у самого свежего сообщения: старые не раздувают настройки и запрос.
      for (const old of getHistory(settings, helper.id)) { delete old.sent; }
    }
    attach.chat = false;
    attach.error = false;
    attach.card = false;
    renderAttach();
    pushMessage(settings, helper.id, message);
    input.value = '';
    fitInput();
    busy = true;
    startTick();
    save();
    renderMessages();
    renderBusy();
    try {
      const reply = await ask({ context, helper, history: getHistory(settings, helper.id) });
      pushMessage(settings, helper.id, { role: 'assistant', content: reply });
    } catch (error) {
      const stopped = /cancel|abort|stop/i.test(String(error?.message ?? error));
      const message = stopped ? 'Остановлено.' : `Ошибка: ${errorText(error)}${errorHint(errorText(error))}`;
      pushMessage(settings, helper.id, { role: 'assistant', content: message, error: true });
      if (!stopped) report('запрос к модели', error);
    } finally {
      busy = false;
      stopTick();
      save();
      renderMessages();
      renderBusy();
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (busy) { stop(context); return; }
    send().catch(error => report('отправка', error));
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  // ---------- старт ----------
  renderHeader();
  renderAttach();
  applyPosition();
  root.hidden = settings.bubble === false;
  if (settings.open && !root.hidden) togglePanel(true);

  // Управление из вкладки настроек Акрополя: смена набора, видимость и положение кругляшка.
  const api = {
    /** Набор или помощники изменились: сверяем выбранного и перерисовываем. */
    refresh() {
      settings.activeId = getHelper(settings, settings.activeId).id;
      renderAll();
    },
    setVisible(visible) {
      settings.bubble = !!visible;
      root.hidden = !visible;
      if (!visible && !panel.hidden) togglePanel(false);
      save();
    },
    resetPosition() {
      settings.pos = null;
      applyPosition();
      save();
    },
    /** Перерисовать окно (например, после очистки всех переписок из вкладки настроек). */
    rerender() { renderAll(); },
  };
  shared.helpers = api;
  undo.push(() => { if (shared.helpers === api) delete shared.helpers; });

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат интерфейса', error); } } };
}

/**
 * Текст в *звёздочках* (и в **двойных**) становится жирным. Строим узлы вручную,
 * innerHTML не используем: текст модели не должен превращаться в разметку.
 */
// Звезда открывает выделение, только если перед ней не буква/цифра/звезда, а внутри у края нет пробела;
// закрывает, если после неё не буква/цифра/звезда. Так «2*3=6» и одиночные звёзды остаются текстом.
const BOLD = /(?<![\p{L}\p{N}*])\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])/gu;
function fillRich(doc, node, text) {
  node.textContent = '';
  const source = String(text ?? '');
  let last = 0;
  for (const match of source.matchAll(BOLD)) {
    if (match.index > last) node.append(doc.createTextNode(source.slice(last, match.index)));
    node.append(el(doc, 'strong', null, match[1] ?? match[2]));
    last = match.index + match[0].length;
  }
  if (last < source.length) node.append(doc.createTextNode(source.slice(last)));
}

/** Вопрос по умолчанию, когда нажата кнопка вложения, а текста нет. */
function defaultQuestion({ chat, error, card }) {
  if (card && !chat && !error) return 'Помоги собрать персонажа и лорбук для игры: уточни, чего мне хочется.';
  if (chat && error) return 'Посмотри приложенные ошибки и фрагмент чата. Что тут не так и что делать?';
  if (error) return 'Что это за ошибка и что с ней делать?';
  return 'Посмотри приложенный фрагмент чата.';
}

/** Ошибки Таверны бывают строкой, Error или объектом ответа сервера. */
/** Короткая подсказка к типичным ответам сервиса модели: помощник тут ни при чём, но человеку нужно понять, что делать. */
function errorHint(text) {
  const t = String(text);
  if (/503|service unavailable|overload|перегруж/i.test(t)) return '\nЭто отвечает сервис модели, а не помощник: он сейчас недоступен или перегружен. Подожди и попробуй снова. Если не проходит и в обычном чате, проверь подключение (Акрополь, вкладка «Соединение»).';
  if (/429|rate.?limit|too many/i.test(t)) return '\nСлишком много запросов к модели: подожди минуту и повтори.';
  if (/401|403|unauthori[sz]ed|forbidden|api.?key|invalid.*key/i.test(t)) return '\nПохоже на проблему с ключом или доступом к модели: проверь подключение (Акрополь, вкладка «Соединение»).';
  if (/timeout|timed out|etimedout|network|fetch failed|econn/i.test(t)) return '\nНет связи с сервисом модели: проверь интернет и подключение.';
  return '';
}

function errorText(error) {
  if (!error) return 'неизвестная ошибка';
  if (typeof error === 'string') return error;
  const parts = [error.message, error.error?.message, error.response, error.statusText].filter(v => typeof v === 'string' && v);
  if (parts.length) return parts[0];
  try { return JSON.stringify(error).slice(0, 500); } catch { return String(error); }
}
