/**
 * Помощники: кругляшок с аватаром в углу, по клику чат с моделью Таверны, наборы персонажей
 * и вкладка «Помощники» в Акрополе (выбор набора, кругляшок, очистка переписок).
 * Старт возвращает функцию отката: снимает кругляшок, стили, журнал ошибок и вкладку.
 */
import { report } from '../core/guard.js';
import { SETS, resolveAvatars } from './presets.js';
import { prepare, migrateFromSputniki, clearAllHistories, currentSet, bindSetProvider } from './store.js';
import { startErrorLog } from './attach.js';
import { startUi, fillAvatar } from './ui.js';
import { createEditor } from './editor.js';
import { esc as escapeHtml } from '../ui/kit.js';


export async function startHelpers(doc, { context, settings: root, save, shared }) {
  const undo = [];
  const stopAll = () => { for (const fn of undo.splice(0).reverse()) { try { fn(); } catch (error) { report('откат помощников', error); } } };

  try {
    // данные: при самом первом запуске забираем чаты и свои помощники из отдельной расширки «Спутники»
    const firstRun = !root.helpers || typeof root.helpers !== 'object';
    if (firstRun) root.helpers = {};
    const settings = prepare(root.helpers);
    // набор помощников привязан к активной теме и меняется вместе с ней (ручного выбора нет)
    bindSetProvider(() => shared.appearance?.current?.().helperSet ?? null);
    undo.push(() => bindSetProvider(null));
    if (firstRun && migrateFromSputniki(context.extensionSettings, settings)) {
      prepare(settings);
      console.info('[Колизей] помощники: данные перенесены из «Спутников»');
    }
    save();

    // стили отдельным файлом: style.css Колизея не трогаем
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./helpers.css', import.meta.url).href;
    doc.head.append(link);
    undo.push(() => link.remove());

    await resolveAvatars();

    const errors = startErrorLog(doc.defaultView, () => doc.dispatchEvent(new Event('sputniki:errors')));
    undo.push(errors.stop);

    undo.push(startUi(doc, { context, settings, save, errors, shared }));
    undo.push(buildTab(doc, { settings, save, shared }));
  } catch (error) {
    report('помощники', error);
    stopAll();
    return () => {};
  }
  return stopAll;
}

/** Вкладка «Помощники» в Акрополе. */
function buildTab(doc, { settings, save, shared }) {
  if (!shared.hubTab) { report('вкладка помощников', new Error('нет окна Акрополя')); return () => {}; }
  const pane = shared.hubTab('col-helpers', 'Помощники', 'user');
  pane.classList.add('col-set');
  pane.innerHTML = `
    <div data-h="main">
    <h3>Помощники</h3>
    <p class="col-note">Работа у всех помощников одна: вопросы к модели, разбор ошибок, помощь с промптами и карточками. Набор задаёт только характер и внешность.</p>
    <details class="spt-help">
      <summary>Справка: кто это и что они умеют</summary>
      <div class="spt-help-body">
        <h5>Кто они</h5>
        <p>Помощники это персонажи-собеседники в маленьком окне. Окно открывается кругляшком с аватаром в углу экрана. Они отвечают через ту же модель, к которой подключена Таверна, но отдельно от твоего ролевого чата: игровые чаты они не меняют.</p>
        <p>Работа у всех одна, различается только характер. Выбирай по настроению: строгая Афина, лукавый Гермес или ворчливый Гефест (в Колизее), чудаковатый Мерлин, эльф Эльвэн или добряк Бильбо (в Камелоте).</p>
        <h5>Зачем они нужны</h5>
        <ul>
          <li>Спросить у модели, понимает ли она сленг и мемы, как отвечает и где её пределы.</li>
          <li>Разобрать ошибку отправки сообщения: в меню нажми «Приложить ошибку», и помощник увидит текст последней ошибки.</li>
          <li>Разобраться с промптом, карточкой персонажа или лорбуком, спросить, как что-то устроено в Таверне.</li>
          <li>Собрать простого персонажа и лорбук для игры (раздел ниже).</li>
        </ul>
        <h5>Как пользоваться</h5>
        <ul>
          <li>Клик по кругляшку открывает окно, повторный клик сворачивает. Кругляшок можно перетащить.</li>
          <li>Аватары в шапке переключают помощника. История у каждого своя.</li>
          <li>Enter отправляет, Shift+Enter переводит строку. Текст в *звёздочках* показывается жирным.</li>
          <li>Меню из трёх полосок слева от поля: «Приложить чат» (последние реплики текущего чата), «Приложить ошибку», «Очистить» (стереть переписку с этим помощником). Вложения уходят модели только по твоей кнопке и только с одним следующим сообщением.</li>
        </ul>
        <h5>Собрать персонажа</h5>
        <p>Расскажи помощнику, во что хочешь поиграть, например: «мне грустно, хочу флафф с кото-парнем, который прилетает на балкон с розой после супергеройских дел». Он задаст до двух уточняющих вопросов или сразу предложит набросок: персонаж, первая реплика, сценарий и простой лорбук из нескольких записей с мини-сюжетом.</p>
        <ul>
          <li>Под ответом появится карточка-набросок. «Показать текст» открывает всё написанное, «Загрузить в Таверну» создаёт персонажа и лорбук.</li>
          <li>Без твоего нажатия ничего не создаётся. Существующих персонажей и лорбуки это не перезаписывает: при совпадении имени добавляется номер.</li>
          <li>Персонаж всегда взрослый (18+): набросок с меньшим возрастом не загружается.</li>
          <li>Картинки у персонажа нет, аватар поставь сам в его карточке. Текст проверь и поправь: помощник набрасывает основу, а не готовую карточку.</li>
        </ul>
        <h5>Что можно настроить</h5>
        <ul>
          <li><b>Набор</b>: готовые помощники берутся из темы (Колизей: античные, Камелот: фантастические), выбрать вручную нельзя.</li>
          <li><b>Кругляшок</b>: показывать или спрятать, вернуть на место, если потерялся.</li>
          <li><b>Свои помощники</b>: создать с нуля или сделать копию готового. Имя, подпись, характер, свои правила, приветствие, цвет кольца, свой аватар, экспорт и импорт в файл. Свои помощники доступны в обеих темах.</li>
          <li><b>Очистить все переписки</b> разом.</li>
        </ul>
        <h5>Важно знать</h5>
        <ul>
          <li>Ответы идут от твоей модели: расходуются её токены и лимиты, без подключённой модели ответа не будет.</li>
          <li>Помощник может ошибаться, как любая модель.</li>
          <li>Переписки лежат локально в настройках Таверны (до 200 сообщений у каждого помощника). Из окна наружу уходят только запросы к твоей модели.</li>
        </ul>
      </div>
    </details>
    <h4>Набор</h4>
    <p class="col-note">Набор привязан к теме: в Колизее античные помощники, в Камелоте фантастические. Меняется вместе с темой, выбрать другой нельзя.</p>
    <div class="col-wscards" data-h="sets"></div>
    <h4>Свои помощники</h4>
    <p class="col-note">Создай своего или сделай копию готового и измени её. Свои помощники доступны в обеих темах.</p>
    <div class="col-btnrow"><button type="button" class="col-btn col-primary" data-h="new">Создать помощника</button></div>
    <div class="spt-hlist" data-h="list"></div>
    <h4>Кругляшок</h4>
    <div class="col-frow"><label>Показывать в углу экрана</label><span class="col-ctrl"><input type="checkbox" data-h="bubble"></span></div>
    <div class="col-btnrow">
      <button type="button" class="col-btn" data-h="pos">Вернуть на место</button>
      <button type="button" class="col-btn col-danger" data-h="wipe">Очистить все переписки</button>
    </div>
    <p class="col-note" data-h="msg" hidden></p>
    </div>`;

  const main = pane.querySelector('[data-h="main"]');
  const listBox = pane.querySelector('[data-h="list"]');
  const setsBox = pane.querySelector('[data-h="sets"]');
  const bubbleBox = pane.querySelector('[data-h="bubble"]');
  const wipeBtn = pane.querySelector('[data-h="wipe"]');
  const msg = pane.querySelector('[data-h="msg"]');

  const renderSets = () => {
    setsBox.textContent = '';
    for (const set of [currentSet(settings)]) {
      const card = doc.createElement('div');
      card.type = 'button';
      card.className = 'col-wscard spt-setcard on';
      card.dataset.set = set.id;
      const faces = doc.createElement('div');
      faces.className = 'spt-setfaces';
      for (const helper of set.helpers) {
        const face = doc.createElement('span');
        face.className = 'spt-avatar';
        fillAvatar(face, helper);
        face.title = helper.name;
        faces.append(face);
      }
      const title = doc.createElement('b');
      title.textContent = set.title;
      const hint = doc.createElement('small');
      hint.textContent = set.helpers.map(h => h.name).join(', ');
      card.append(faces, title, hint);
      card.classList.toggle('on', set.id === currentSet(settings).id);
      setsBox.append(card);
    }
  };
  const flash = text => { msg.textContent = text; msg.hidden = !text; };

  // форма создания, копии и правки живёт здесь, в настройках; пока она открыта, остальная вкладка скрыта
  const editor = createEditor(doc, {
    settings, save,
    onDone: id => {
      if (id) settings.activeId = id;
      editor.node.hidden = true;
      main.hidden = false;
      renderList();
      sync();
      shared.helpers?.refresh();
    },
  });
  pane.append(editor.node);
  const openEditor = (helper, mode) => { main.hidden = true; editor.open(helper, mode); };

  // готовые из всех наборов (с пометкой набора) и свои
  const renderList = () => {
    listBox.textContent = '';
    const rows = [
      ...SETS.flatMap(set => set.helpers.map(helper => ({ helper: { ...helper, preset: true }, note: set.title }))),
      ...settings.custom.map(helper => ({ helper: { ...helper, preset: false }, note: 'свой' })),
    ];
    for (const { helper, note } of rows) {
      const row = doc.createElement('div');
      row.className = 'spt-hrow';
      const face = doc.createElement('span');
      face.className = 'spt-avatar';
      fillAvatar(face, helper);
      const name = doc.createElement('div');
      name.className = 'spt-hname';
      const title = doc.createElement('b');
      title.textContent = helper.name;
      const small = doc.createElement('small');
      small.textContent = [note, helper.tagline].filter(Boolean).join(' · ');
      name.append(title, small);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'col-btn';
      button.textContent = helper.preset ? 'Копия' : 'Изменить';
      button.title = helper.preset ? 'Сделать свою копию этого помощника и изменить её' : 'Изменить этого помощника';
      button.addEventListener('click', () => openEditor(helper, helper.preset ? 'copy' : 'edit'));
      row.append(face, name, button);
      listBox.append(row);
    }
  };
  pane.querySelector('[data-h="new"]').addEventListener('click', () => openEditor(null, 'new'));
  const sync = () => {
    for (const card of setsBox.children) card.classList.toggle('on', card.dataset.set === currentSet(settings).id);
    bubbleBox.checked = settings.bubble !== false;
  };

  // смена темы меняет набор: перерисовываем карточку набора и кругляшок
  const onAppearance = () => { renderSets(); sync(); shared.helpers?.refresh(); };
  shared.bus?.addEventListener('appearance', onAppearance);
  bubbleBox.addEventListener('change', () => { shared.helpers?.setVisible(bubbleBox.checked); flash(''); });
  pane.querySelector('[data-h="pos"]').addEventListener('click', () => { shared.helpers?.resetPosition(); flash('Кругляшок вернулся на место.'); });

  let confirmTimer = null;
  const resetWipe = () => { clearTimeout(confirmTimer); confirmTimer = null; wipeBtn.textContent = 'Очистить все переписки'; };
  wipeBtn.addEventListener('click', () => {
    if (!confirmTimer) {
      wipeBtn.textContent = 'Точно очистить?';
      confirmTimer = setTimeout(resetWipe, 3500);
      return;
    }
    resetWipe();
    clearAllHistories(settings);
    save();
    shared.helpers?.rerender();
    flash('Все переписки с помощниками очищены.');
  });

  renderSets();
  renderList();
  sync();
  return () => {
    shared.bus?.removeEventListener('appearance', onAppearance);
    resetWipe();
    pane.remove();
    doc.querySelectorAll('.col-vtabs [data-tab="col-helpers"]').forEach(el => el.remove());
  };
}
