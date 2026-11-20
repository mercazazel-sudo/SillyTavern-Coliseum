/**
 * Хранилище Колизея.
 *
 * Почему не просто extension_settings: Таверна записывает ВСЕ настройки одним файлом, и каждая вкладка хранит свою копию в памяти.
 * Вторая вкладка, старая страница или другое устройство при сохранении затирают чужие правки целиком (пропадали анкеты, темы, меню).
 *
 * Здесь данные расширения лежат отдельным файлом пользователя на сервере (user/files/coliseum-data.json) и сливаются по ключам:
 *  - у каждого ключа своя отметка времени, побеждает последняя правка именно этого ключа, а не последняя вкладка;
 *  - вкладка пишет только то, что сама изменила, и подтягивает то, что изменили другие;
 *  - удаление тоже ключ (надгробие), поэтому удалённое не воскресает из старой копии;
 *  - extension_settings остаётся зеркалом на случай, если файла нет или сервер его не отдаёт.
 * Объект settings остаётся тем же, что и раньше: модули правят его как привыкли и зовут save().
 */

export const FILE = 'coliseum-data.json';
const SEP = '\u0000';          // разделитель пути «ключ → вложенный ключ»
const VOLATILE = new Set(['stamp']);
const SAVE_DELAY = 300;

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Настройки → плоская карта «путь → значение». Объекты первого уровня раскладываются по вложенным ключам (анкеты по маскам, окна по именам). */
export function flatten(settings) {
  const out = new Map();
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (VOLATILE.has(key)) continue;
    if (isPlain(value)) for (const [sub, v] of Object.entries(value)) out.set(`${key}${SEP}${sub}`, v);
    else out.set(key, value);
  }
  return out;
}

/** Записывает значение по пути в объект настроек (или удаляет, если value === undefined). */
export function applyPath(settings, path, value) {
  const at = path.indexOf(SEP);
  if (at < 0) { if (value === undefined) delete settings[path]; else settings[path] = clone(value); return; }
  const key = path.slice(0, at), sub = path.slice(at + 1);
  if (value !== undefined && !isPlain(settings[key])) settings[key] = {};
  if (!isPlain(settings[key])) return;
  if (value === undefined) delete settings[key][sub]; else settings[key][sub] = clone(value);
}

/**
 * Слияние. local: текущие значения; remote: { path: { ts, val?, del? } } из файла; synced: что мы считали записанным
 * ({ path: { ts, hash } }). Возвращает новое содержимое файла, что взять у других и новую карту synced.
 * Чистая функция: вся логика слияния здесь, её проверяют тестами.
 */
export function merge({ local, remote, synced, now }) {
  const entries = {}, adopt = new Map(), nextSynced = {};
  const paths = new Set([...local.keys(), ...Object.keys(remote), ...Object.keys(synced)]);
  for (const path of paths) {
    const here = local.has(path) ? local.get(path) : undefined;
    const hereHash = here === undefined ? 'del' : JSON.stringify(here);
    const known = synced[path];
    const there = remote[path];
    const changedHere = hereHash !== (known?.hash ?? 'del');
    if (changedHere) {
      entries[path] = here === undefined ? { ts: now, del: true } : { ts: now, val: here };
      nextSynced[path] = { ts: now, hash: hereHash };
    } else if (there && there.ts > (known?.ts ?? 0)) {
      entries[path] = there;
      adopt.set(path, there.del ? undefined : there.val);
      nextSynced[path] = { ts: there.ts, hash: there.del ? 'del' : JSON.stringify(there.val) };
    } else if (there) {
      entries[path] = there;
      nextSynced[path] = { ts: there.ts, hash: there.del ? 'del' : JSON.stringify(there.val) };
    } else if (known) {
      entries[path] = known.hash === 'del' ? { ts: known.ts, del: true } : { ts: known.ts, val: here };
      nextSynced[path] = known;
    }
  }
  return { entries, adopt, nextSynced };
}

/** Ввод-вывод через родные маршруты Таверны. Возвращает null, если файла нет. */
export function createServerIo(script, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const toBase64 = text => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  return {
    async load() {
      const res = await fetchImpl(`/user/files/${FILE}?_=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`чтение хранилища: ${res.status}`);
      const data = await res.json();
      return isPlain(data?.keys) ? data : null;
    },
    async save(doc, { keepalive = false } = {}) {
      const res = await fetchImpl('/api/files/upload', { method: 'POST', headers: script.getRequestHeaders(), body: JSON.stringify({ name: FILE, data: toBase64(JSON.stringify(doc)) }), keepalive });
      if (!res.ok) throw new Error(`запись хранилища: ${res.status}`);
    },
  };
}

/**
 * Запуск хранилища. settings: объект extension_settings.coliseum (его правят модули).
 * onRemote(paths) вызывается, когда после старта подтянулись чужие правки. mirror() зовётся при каждой записи (зеркало в настройки Таверны).
 * Если файловое хранилище недоступно, всё продолжает работать через зеркало (прежнее поведение), об этом сообщает onError.
 */
export async function createStore({ settings, io, mirror = () => {}, onRemote = () => {}, onError = () => {}, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let synced = {};
  let healthy = true;
  let timer = null;
  let queue = Promise.resolve();

  const fail = error => { if (healthy) onError(error); healthy = false; };

  /** Один цикл: прочитать файл, слить, при необходимости записать. Возвращает пути, которые подтянулись от других. */
  const cycle = async () => {
    const remoteDoc = await io.load();
    const remote = remoteDoc?.keys ?? {};
    const { entries, adopt, nextSynced } = merge({ local: flatten(settings), remote, synced, now: now() });
    for (const [path, value] of adopt) applyPath(settings, path, value);
    const before = JSON.stringify(remote);
    const after = JSON.stringify(entries);
    if (before !== after) await io.save({ v: 1, keys: entries });
    synced = nextSynced;
    healthy = true;
    return [...adopt.keys()];
  };

  const run = () => {
    const job = queue.then(cycle);
    queue = job.catch(() => {});
    return job;
  };

  /** Записать сейчас и дождаться результата. Возвращает пути, подтянутые от других вкладок. */
  const flush = async () => {
    if (timer) { clearTimer(timer); timer = null; }
    try { return await run(); } catch (error) { fail(error); return []; }
  };

  /** Обычное сохранение: откладывается на треть секунды, объединяя серию правок. */
  const save = () => {
    mirror();
    if (!healthy) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; flush().then(paths => { if (paths.length) onRemote(paths); }); }, SAVE_DELAY);
  };

  /** Проверка: всё ли, что есть у нас, лежит в файле. Возвращает пути, которых там нет или у которых другое значение. */
  const verify = async () => {
    const paths = await flush();
    const doc = await io.load();
    const remote = doc?.keys ?? {};
    const bad = [];
    for (const [path, value] of flatten(settings)) {
      if (value === undefined) continue;
      const entry = remote[path];
      if (!entry || entry.del || !same(entry.val, value)) bad.push(path);
    }
    return { ok: !bad.length, bad, pulled: paths };
  };

  // старт: файл главнее зеркала; если файла нет, создаём его из текущих настроек (переезд)
  try {
    const first = await io.load();
    if (first) {
      // чужое побеждает: у нас пока ничего не записано, поэтому всё, что есть в файле, берём из файла
      const remote = first.keys;
      for (const [path, entry] of Object.entries(remote)) {
        applyPath(settings, path, entry.del ? undefined : entry.val);
        synced[path] = { ts: entry.ts, hash: entry.del ? 'del' : JSON.stringify(entry.val) };
      }
    }
    await flush();
  } catch (error) { fail(error); }

  return { save, flush, verify, isHealthy: () => healthy, paths: () => [...flatten(settings).keys()] };
}
