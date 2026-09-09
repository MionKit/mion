/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {STORAGE_KEY} from '../constants.ts';

const STORE_GLOBAL_KEY = '__mion_metadata_store__';
const OBJECT_STORE = 'metadata';
const DB_VERSION = 1;
/** A store that never answers (private mode has historically hung on open) must not hang the client */
const OPEN_TIMEOUT_MS = 3000;

/** What a record holds: a route's metadata, a compiled function, or a pure function */
export type MetadataKind = 'm' | 'j' | 'p';

/** One cache entry. `id` is the entry's own identity, never what its payload claims:
 *  'm' a methodId, 'j' a compiled function hash, 'p' a `${namespace}::${fnName}` pair. */
export interface MetadataRecord {
  baseURL: string;
  kind: MetadataKind;
  id: string;
  /** the entry as text, so a read costs one structured clone of a string instead of a deep object */
  json: string;
  /** write time, the only recency signal the size cap needs */
  ts: number;
}

/** Address of a single record within one baseURL */
export type MetadataRecordKey = [MetadataKind, string];

/** The async seam every cache read and write goes through. */
export interface MetadataStore {
  readonly kind: 'indexeddb' | 'memory';
  /** Every record of one baseURL in a SINGLE indexed read, never a scan of the whole store */
  readAll(baseURL: string): Promise<MetadataRecord[]>;
  /** One transaction for a whole response; rejects on quota or abort so the caller can react */
  write(records: MetadataRecord[]): Promise<void>;
  remove(baseURL: string, keys: MetadataRecordKey[]): Promise<void>;
  clear(baseURL?: string): Promise<void>;
}

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

/** Returns the process-wide store, opening it on first use.
 *  Memoized on globalThis so every module instance shares one connection. */
export function getMetadataStore(): Promise<MetadataStore> {
  const existing = (globalThis as any)[STORE_GLOBAL_KEY] as Promise<MetadataStore> | undefined;
  if (existing) return existing;
  const pending = openDatabase()
    .then((db) => (db ? new IdbMetadataStore(db) : new MemoryMetadataStore()))
    .catch(() => new MemoryMetadataStore());
  (globalThis as any)[STORE_GLOBAL_KEY] = pending;
  return pending;
}

/** Puts a stand-in behind getMetadataStore(). Only for testing — the browser's own limits (a full
 *  disk, a refused write) cannot be produced any other way. */
export function setMetadataStoreForTesting(store: MetadataStore): void {
  (globalThis as any)[STORE_GLOBAL_KEY] = Promise.resolve(store);
}

/** Drops the cached store instance and everything it holds. Only for testing — simulates a new page. */
export async function resetMetadataStore(): Promise<void> {
  const existing = (globalThis as any)[STORE_GLOBAL_KEY] as Promise<MetadataStore> | undefined;
  delete (globalThis as any)[STORE_GLOBAL_KEY];
  if (!existing) return;
  const store = await existing.catch(() => undefined);
  await store?.clear().catch(() => undefined);
}
