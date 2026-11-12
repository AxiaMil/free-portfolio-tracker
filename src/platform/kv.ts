// Tiny key-value store on IndexedDB (market-data cache and automatic snapshots). Falls back to memory when
// IndexedDB is unavailable, so the app still runs; it just forgets the cache on reload.
const DB_NAME = 'portfolio-tracker';
const STORE = 'kv';
const mem = new Map<string, unknown>();
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }));
}

/** false when IndexedDB is unavailable here and values only live in memory */
export async function kvPersistent(): Promise<boolean> {
  return !!(await db());
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!(await db())) return mem.get(key) as T | undefined;
  return run<T>('readonly', (s) => s.get(key));
}

/** value must be plain data (no Vue proxies) */
export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!(await db())) { mem.set(key, value); return; }
  await run('readwrite', (s) => s.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  if (!(await db())) { mem.delete(key); return; }
  await run('readwrite', (s) => s.delete(key));
}

/** keys starting with prefix, sorted */
export async function kvKeys(prefix: string): Promise<string[]> {
  if (!(await db())) return [...mem.keys()].filter((k) => k.startsWith(prefix)).sort();
  const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿')));
  return (keys ?? []).map(String).sort();
}
