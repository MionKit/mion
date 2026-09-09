/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The contract between the client's metadata cache and wherever that cache is kept. Everything the
// cache asks of its storage is here and nothing else, so anything that can answer these four calls
// can BE the storage: the browser's database, memory, or an app's own.
// The engines mion ships live in metadataStore.ts and implement this same interface.

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

/** Address of a single record within one baseURL. `[baseURL, kind, id]` identifies a record. */
export type MetadataRecordKey = [MetadataKind, string];

/** Everything the metadata cache asks of its storage.
 *
 *  Records are addressed by `[baseURL, kind, id]`, so a store only ever has to look one up and hand
 *  back every record of one baseURL. Nothing is asked of it beyond that: no indexes, no queries, no
 *  ordering, no eviction (the cache runs its own, by `ts`).
 *
 *  Four rules an implementation must hold, because the cache leans on each of them:
 *  1. `readAll` returns the records of THAT baseURL only, never a prefix match on it.
 *  2. `write` is all or nothing, and REJECTS when the records did not land. A write that quietly
 *     stores part of a batch would leave a method whose compiled functions are missing.
 *  3. Writing an id that is already there replaces it.
 *  4. `remove` and `clear` delete exactly what they name, and resolve even when it was not there. */
export interface MetadataStore {
  /** Names the engine behind this store, for logs and tests. Free text; mion ships 'indexeddb' and 'memory'. */
  readonly kind: string;
  /** Every record of one baseURL in a SINGLE read, never a scan of the whole store */
  readAll(baseURL: string): Promise<MetadataRecord[]>;
  /** One batch for a whole response; rejects on quota or abort so the cache can make room and retry */
  write(records: MetadataRecord[]): Promise<void>;
  /** Deletes the named records of one baseURL */
  remove(baseURL: string, keys: MetadataRecordKey[]): Promise<void>;
  /** Deletes one baseURL's records, or everything the store holds when no baseURL is given */
  clear(baseURL?: string): Promise<void>;
}

/** Opens an app's own store. Called once per engine for the life of the process, so a connection is
 *  opened once and shared. Returning nothing, or throwing, means this runtime cannot have that store
 *  and the client keeps the cache in memory instead. */
export type MetadataStoreFactory = () => MetadataStore | undefined | Promise<MetadataStore | undefined>;

/** Where the client keeps what it learned about the remote methods.
 *  Either an engine mion ships, or a function of your own that opens a store. */
export type StorageEngine = 'indexeddb' | 'memory' | MetadataStoreFactory;
