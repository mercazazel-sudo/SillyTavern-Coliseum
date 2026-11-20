/** Колизей: точка входа. Каждый модуль стартует отдельно, и ошибка одного не мешает остальным. */
import { TAG, report } from './src/core/guard.js';
import { getSettings, saver } from './src/core/settings.js';
import { createStore, createServerIo } from './src/core/store.js';
import { startTheme } from './src/ui/theme.js';
import { startWall } from './src/ui/wall.js';
import { startSettingsPanel } from './src/ui/settings-panel.js';
import { startSidebar } from './src/ui/sidebar.js';
import { startWindows } from './src/ui/windows.js';
import { startAtrium } from './src/ui/atrium.js';
import { startInputBar } from './src/ui/inputbar.js';
import { startChatMenu } from './src/ui/chatmenu.js';
import { startRegenNote } from './src/ui/regen-note.js';
import { startLockPersona } from './src/ui/lock-persona.js';
import { startExtensionsLib } from './src/ui/extensions-lib.js';
import { startLoreLib } from './src/ui/lore-lib.js';
import { startLoreEditor } from './src/ui/lore-editor.js';
import { startPersonaLib } from './src/ui/persona-lib.js';
import { startCharactersLib } from './src/ui/characters-lib.js';
import { startHand } from './src/ui/hand.js';
import { startLoreTrace } from './src/ui/lore-trace.js';
import { startHelpers } from './src/helpers/index.js';
import { startTabGuard } from './src/ui/tabguard.js';
import { startCrenel } from './src/ui/crenel.js';
import { startPromptDock } from './src/ui/promptdock.js';

/** start(deps) может вернуть функцию отката: она снимает всё, что модуль добавил. Порядок важен: фон и панель читают тему. */
const MODULES = [
  { name: 'тема', start: deps => startTheme(document, deps) },
  { name: 'фон', start: deps => startWall(document, deps) },
  { name: 'окна', start: deps => startWindows(document, deps) },
  { name: 'атриум', start: deps => startAtrium(document, deps) },
  { name: 'мастерская', start: deps => startExtensionsLib(document, deps) },
  { name: 'александрия', start: deps => startLoreLib(document, deps) },
  { name: 'свиток лорбука', start: deps => startLoreEditor(document, deps) },
  { name: 'пантеон', start: deps => startCharactersLib(document, deps) },
  { name: 'маски', start: deps => startPersonaLib(document, deps) },
  { name: 'панель ввода', start: deps => startInputBar(document, deps) },
  { name: 'меню чата', start: deps => startChatMenu(document, deps) },
  { name: 'перегенерация с правкой', start: deps => startRegenNote(document, deps) },
  { name: 'закрепление маски за чатом', start: () => startLockPersona(document) },
  { name: 'колонна', start: deps => startSidebar(document, deps) },
  { name: 'разбор лорбуков', start: deps => startLoreTrace(document, deps) },
  { name: 'под рукой', start: deps => startHand(document, deps) },
  { name: 'помощники', start: deps => startHelpers(document, deps) },
  { name: 'панель настроек', start: deps => startSettingsPanel(document, deps) },
  { name: 'защита вкладок', start: deps => startTabGuard(document, deps) },
  { name: 'зубцы', start: () => startCrenel(document) },
  { name: 'редактор промптов сбоку', start: deps => startPromptDock(document, deps) },
];

let controller = null;

/**
 * Две темы одновременно воюют за одни элементы. Пудреница ставит на body класс pud-on:
 * если он есть, Колизей уступает и просит выключить одну из них.
 */
const FORCE = new URLSearchParams(globalThis.location?.search ?? '').has('col_force'); // отладка: ?col_force=1 обходит проверку
const rivalActive = () => !FORCE && document.body.classList.contains('pud-on');
const RIVAL_NOTE = 'Включена Пудреница: две темы вместе не работают. Выключите одну из них в Extensions → Manage extensions.';

function yieldToRival() {
  if (!controller || !rivalActive()) return;
  controller.stop();
  controller.yielded = true;
  console.warn(`${TAG} ${RIVAL_NOTE}`);
  globalThis.toastr?.warning?.(RIVAL_NOTE, 'Колизей');
}

/** Вызывается Таверной при активации расширения (manifest.json → hooks.activate). */
export async function init() {
  if (controller) return controller;
  const context = globalThis.SillyTavern?.getContext?.();
  if (!context) {
    report('запуск', new Error('нет SillyTavern.getContext()'));
    return null;
  }
  const settings = getSettings(context);
  const running = [];
  const failed = [];
  const shared = {};
  const stopAll = () => controller?.stop();
  // отдельное хранилище на сервере со слиянием по ключам; если оно недоступно, работаем через настройки Таверны, как раньше
  let save = saver(context);
  try {
    const script = await import('/script.js');
    const store = await createStore({
      settings,
      io: createServerIo(script),
      mirror: save,
      onError: error => { report('хранилище на сервере недоступно, настройки идут через Таверну', error); },
      onRemote: paths => globalThis.toastr?.info?.('Настройки изменились в другой вкладке. Обнови эту, чтобы увидеть новое.', 'Колизей', { timeOut: 8000 }),
    });
    if (store.isHealthy()) { getSettings(context); save = store.save; shared.store = store; }
  } catch (error) { report('запуск хранилища', error); }
  if (settings.enabled && !rivalActive()) {
    const deps = { context, settings, save, shared, stopAll };
    for (const module of MODULES) {
      try {
        const undo = await module.start(deps);
        if (typeof undo === 'function') running.push({ name: module.name, undo });
      } catch (error) {
        failed.push(module.name);
        report(`модуль «${module.name}»`, error);
      }
    }
  }
  controller = {
    settings,
    failed,
    modules: () => running.map(item => item.name),
    stop() {
      for (const { name, undo } of running.splice(0).reverse()) {
        try { undo(); } catch (error) { report(`откат «${name}»`, error); }
      }
    },
  };
  if (failed.length) console.warn(`${TAG} не запустились: ${failed.join(', ')}`);
  else if (controller.modules().length) console.info(`${TAG} запущен: ${controller.modules().join(', ')}`);
  // Пудреница может подняться позже нас (расширения стартуют параллельно): проверяем ещё раз
  if (settings.enabled && rivalActive()) yieldToRival();
  else setTimeout(yieldToRival, 2500);
  return controller;
}
