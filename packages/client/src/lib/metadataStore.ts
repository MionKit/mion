/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The engines mion ships, and the one place an engine is chosen. The contract they implement, and
// that an app's own engine implements, is in storage.ts.

import {DEFAULT_STORAGE_ENGINE, STORAGE_KEY} from '../constants.ts';
import type {MetadataKind, MetadataRecord, MetadataRecordKey, MetadataStore, StorageEngine} from './storage.ts';

const STORE_GLOBAL_KEY = '__mion_metadata_store__';
const OBJECT_STORE = 'metadata';
const DB_VERSION = 1;
/** A store that never answers (private mode has historically hung on open) must not hang the client */
const OPEN_TIMEOUT_MS = 3000;

/** In-memory store for SSR, Node, and any browser where IndexedDB is missing or blocked. */
export class MemoryMetadataStore implements MetadataStore {
  readonly kind = 'memory' as const;
  private readonly records = new Map<string, MetadataRecord>();

  async readAll(baseURL: string): Promise<MetadataRecord[]> {
    const result: MetadataRecord[] = [];
    for (const record of this.records.values()) if (record.baseURL === baseURL) result.push(record);
    return result;
  }

  async write(records: MetadataRecord[]): Promise<void> {
    for (const record of records) this.records.set(recordMapKey(record.baseURL, record.kind, record.id), record);
  }

  async remove(baseURL: string, keys: MetadataRecordKey[]): Promise<void> {
    for (const [kind, id] of keys) this.records.delete(recordMapKey(baseURL, kind, id));
  }

  async clear(baseURL?: string): Promise<void> {
    if (baseURL === undefined) {
      this.records.clear();
      return;
    }
    for (const [key, record] of this.records) if (record.baseURL === baseURL) this.records.delete(key);
  }
}

function recordMapKey(baseURL: string, kind: MetadataKind, id: string): string {
  // \u0000 as the escape, never a raw NUL byte: a source file carrying one is a repo contract break
  return `${baseURL}\u0000${kind}\u0000${id}`;
}

/** IndexedDB store: one object store keyed by the compound `[baseURL, kind, id]`, so every entry of
 *  one server sits in one contiguous key range and a cold load is a single `getAll` over it. */
export class IdbMetadataStore implements MetadataStore {
  readonly kind = 'indexeddb' as const;
  constructor(private readonly db: IDBDatabase) {}

  readAll(baseURL: string): Promise<MetadataRecord[]> {
    return this.transact('readonly', (store) => {
      // IndexedDB orders keys by type and an array sorts after every string, so `[baseURL, []]` is a
      // valid open upper bound: strictly greater than every `[baseURL, kind, id]` and less than the
      // next baseURL. That is what keeps this ONE request instead of a cursor walk or a full scan.
      const range = IDBKeyRange.bound([baseURL], [baseURL, []], false, true);
      return store.getAll(range) as IDBRequest<MetadataRecord[]>;
    });
  }

  write(records: MetadataRecord[]): Promise<void> {
    if (!records.length) return Promise.resolve();
    return this.transact('readwrite', (store) => {
      let last: IDBRequest = store.put(records[0]);
      for (let i = 1; i < records.length; i++) last = store.put(records[i]);
      return last;
    }).then(() => undefined);
  }

  remove(baseURL: string, keys: MetadataRecordKey[]): Promise<void> {
    if (!keys.length) return Promise.resolve();
    return this.transact('readwrite', (store) => {
      let last: IDBRequest = store.delete([baseURL, keys[0][0], keys[0][1]]);
      for (let i = 1; i < keys.length; i++) last = store.delete([baseURL, keys[i][0], keys[i][1]]);
      return last;
    }).then(() => undefined);
  }

  clear(baseURL?: string): Promise<void> {
    return this.transact('readwrite', (store) => {
      if (baseURL === undefined) return store.clear();
      return store.delete(IDBKeyRange.bound([baseURL], [baseURL, []], false, true));
    }).then(() => undefined);
  }

  /** Resolves on transaction COMPLETE, not on request success: a put that succeeded inside a
   *  transaction the browser then aborts (quota) must reject, or a caller would count it as stored. */
  private transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = this.db.transaction(OBJECT_STORE, mode);
      } catch (error) {
        return reject(error);
      }
      let result: T;
      try {
        const request = run(transaction.objectStore(OBJECT_STORE));
        request.onsuccess = () => (result = request.result);
      } catch (error) {
        transaction.abort();
        return reject(error);
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error('mion metadata cache transaction aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('mion metadata cache transaction failed'));
    });
  }
}

/** Opens the database, or resolves undefined for every reason a browser can refuse one. */
function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined);
  return new Promise<IDBDatabase | undefined>((resolve) => {
    let settled = false;
    const settle = (db?: IDBDatabase) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    // an open that never answers falls back rather than hanging the first call behind it
    const timer = setTimeout(() => settle(undefined), OPEN_TIMEOUT_MS);
    const done = (db?: IDBDatabase) => {
      clearTimeout(timer);
      settle(db);
    };
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(STORAGE_KEY, DB_VERSION);
    } catch {
      clearTimeout(timer);
      return settle(undefined);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      // the cache holds nothing that is not refetchable, so a schema bump is the invalidation lever
      if (db.objectStoreNames.contains(OBJECT_STORE)) db.deleteObjectStore(OBJECT_STORE);
      db.createObjectStore(OBJECT_STORE, {keyPath: ['baseURL', 'kind', 'id']});
    };
    request.onsuccess = () => {
      const db = request.result;
      // another tab upgrading must not deadlock this one: close and let the next call fall back
      db.onversionchange = () => db.close();
      done(db);
    };
    request.onerror = () => done(undefined);
    request.onblocked = () => done(undefined);
  });
}

/** Opens one engine. Anything it cannot give us here is a cache miss, never a failed call, so every
 *  refusal lands on the same fallback: keep the cache in memory for the life of the process. */
async function openEngine(engine: StorageEngine): Promise<MetadataStore> {
  if (engine === 'memory') return new MemoryMetadataStore();
  if (engine === 'indexeddb') {
    const db = await openDatabase();
    return db ? new IdbMetadataStore(db) : new MemoryMetadataStore();
  }
  // an app's own engine
  return (await engine()) ?? new MemoryMetadataStore();
}

/** One resolved store per engine, plus a stand-in that wins over all of them while testing.
 *  Memoized on globalThis so every module instance shares one connection. */
interface StoreRegistry {
  override?: Promise<MetadataStore>;
  byEngine: Map<StorageEngine, Promise<MetadataStore>>;
}

function getRegistry(): StoreRegistry {
  let registry = (globalThis as any)[STORE_GLOBAL_KEY] as StoreRegistry | undefined;
  if (!registry) {
    registry = {byEngine: new Map()};
    (globalThis as any)[STORE_GLOBAL_KEY] = registry;
  }
  return registry;
}

/** Returns the store for one engine, opening it on first use. */
export function getMetadataStore(engine: StorageEngine = DEFAULT_STORAGE_ENGINE): Promise<MetadataStore> {
  const registry = getRegistry();
  if (registry.override) return registry.override;
  const existing = registry.byEngine.get(engine);
  if (existing) return existing;
  const pending = openEngine(engine).catch(() => new MemoryMetadataStore());
  registry.byEngine.set(engine, pending);
  return pending;
}

/** Puts a stand-in behind every engine. Only for testing — the browser's own limits (a full disk, a
 *  refused write) cannot be produced any other way. */
export function setMetadataStoreForTesting(store: MetadataStore): void {
  getRegistry().override = Promise.resolve(store);
}

/** Drops every store instance and everything they hold. Only for testing — simulates a new page. */
export async function resetMetadataStore(): Promise<void> {
  const registry = (globalThis as any)[STORE_GLOBAL_KEY] as StoreRegistry | undefined;
  delete (globalThis as any)[STORE_GLOBAL_KEY];
  if (!registry) return;
  const pending = [registry.override, ...registry.byEngine.values()].filter((entry) => entry !== undefined);
  for (const entry of pending) {
    const store = await entry.catch(() => undefined);
    await store?.clear().catch(() => undefined);
  }
}
