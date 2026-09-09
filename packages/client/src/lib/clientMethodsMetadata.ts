/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, addRoutesToCache, isUnsafePropertyName, hasJitFnsForMethod, RpcError} from '@mionjs/core';
import {MION_ROUTES} from '@mionjs/core';
import {ClientOptions, SubRequest} from '../types.ts';
import type {
  CompiledFnData,
  MethodsCache,
  MethodWithOptions,
  PureFunctionData,
  SerializablePureFunction,
  SerializableMethodsData,
  PureFnsDataCache,
} from '@mionjs/core';
import {addSerializedJitCaches, routesCache} from '@mionjs/core';
import {METADATA_CACHE_EVICTION_ROUNDS, METADATA_CACHE_MAX_BYTES} from '../constants.ts';
import {getMetadataStore, type MetadataKind, type MetadataRecord, type MetadataRecordKey} from './metadataStore.ts';
import {findOrphans, type CacheGraph} from './metadataEviction.ts';
import {requestPersistenceWhenSilent} from './persistentStorage.ts';

const PURE_FN_SEPARATOR = '::';

type MetadataRouteKey = typeof MION_ROUTES.methodsMetadata | typeof MION_ROUTES.methodsMetadataById;

/** What the cache knows about one stored record, without holding its text. Enough to pick the
 *  oldest rows when room is needed, and to skip re-writing an entry that is already down. */
interface StoredEntry {
  kind: MetadataKind;
  id: string;
  ts: number;
  bytes: number;
}

/** Everything the cache tracks for one server. One instance per baseURL, for the page's lifetime. */
interface CacheState {
  baseURL: string;
  hydration?: Promise<void>;
  /** method ids this page restored from the store rather than from the server */
  hydratedIds: Set<string>;
  /** what is on disk, keyed `${kind} ${id}` */
  stored: Map<string, StoredEntry>;
  bytes: number;
  graph: CacheGraph;
  sweepScheduled: boolean;
}

const states = new Map<string, CacheState>();
/** Payloads waiting to be written; the response path only pushes here and returns */
let writeQueue: {data: SerializableMethodsData; options: ClientOptions}[] = [];
let flushHandle: ReturnType<typeof setTimeout> | number | undefined;
let flushChain: Promise<void> = Promise.resolve();
let persistenceAsked = false;
let pendingCacheError: RpcError<string> | undefined;

function getState(baseURL: string): CacheState {
  let state = states.get(baseURL);
  if (!state) {
    state = {
      baseURL,
      hydratedIds: new Set(),
      stored: new Map(),
      bytes: 0,
      // Null-prototype maps: every key comes off the store, which any script on the page can write,
      // so a plain object would let a `__proto__` key reach Object.prototype.
      graph: {methods: Object.create(null), deps: Object.create(null), pureFns: Object.create(null)},
      sweepScheduled: false,
    };
    states.set(baseURL, state);
  }
  return state;
}

function storedKey(kind: MetadataKind, id: string): string {
  return `${kind} ${id}`;
}

/** Extracts raw metadata from a parsed response body, unwraps the JIT union discriminator, and processes it. */
export function extractAndProcessMetadata(routeKey: MetadataRouteKey, parsedBody: any, options: ClientOptions): void {
  if (typeof parsedBody !== 'object' || !(routeKey in parsedBody)) return;
  const rawMetadata = parsedBody[routeKey];
  delete parsedBody[routeKey];
  if (!rawMetadata) return;
  const metadataValue = Array.isArray(rawMetadata) ? rawMetadata[1] : rawMetadata;
  if (metadataValue && !isRpcError(metadataValue) && metadataValue.methods) {
    processMethodsMetadata(metadataValue as SerializableMethodsData, options);
  }
}

/** Processes metadata from an optimistic response and caches it.
 *  Runs on the response path, so it fills the in-memory caches now and leaves the store for later:
 *  the caller is a sync deserializer whose every throw becomes a parse error. */
function processMethodsMetadata(serializableMethodsData: SerializableMethodsData, options: ClientOptions): void {
  addToCaches(serializableMethodsData);
  queuePersist(serializableMethodsData, options);
}

/** The server is the trusted party (its code runs here by design), but a name that reaches an object
 *  key on restore is checked all the same: `__proto__` as a namespace would land the next write on
 *  Object.prototype, page-wide. A refused entry is skipped with a warning, never stored. */
function isStorableName(name: string): boolean {
  return !isUnsafePropertyName(name) && !name.includes(':');
}

// ############# WRITE PATH #############

function queuePersist(data: SerializableMethodsData, options: ClientOptions): void {
  writeQueue.push({data, options});
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushHandle !== undefined) return;
  const run = () => {
    flushHandle = undefined;
    flushChain = flushChain.then(flushQueue);
  };
  // idle time is exactly right for this: nothing waits on the write, and a big metadata payload
  // costs a real JSON.stringify per entry
  const idle = (globalThis as any).requestIdleCallback;
  flushHandle = typeof idle === 'function' ? idle(run, {timeout: 200}) : setTimeout(run, 0);
}

/** Resolves once every queued write has reached the store. The write path is deferred on purpose,
 *  so a test that wants to read back what a response cached must await this first. */
export function flushMetadataCache(): Promise<void> {
  if (flushHandle !== undefined) {
    const cancelIdle = (globalThis as any).cancelIdleCallback;
    if (typeof cancelIdle === 'function') cancelIdle(flushHandle);
    else clearTimeout(flushHandle as ReturnType<typeof setTimeout>);
    flushHandle = undefined;
  }
  flushChain = flushChain.then(flushQueue);
  return flushChain;
}

async function flushQueue(): Promise<void> {
  if (!writeQueue.length) return;
  const batch = writeQueue;
  writeQueue = [];
  const byBaseURL = new Map<string, SerializableMethodsData[]>();
  for (const item of batch) {
    const list = byBaseURL.get(item.options.baseURL);
    if (list) list.push(item.data);
    else byBaseURL.set(item.options.baseURL, [item.data]);
  }
  for (const [baseURL, payloads] of byBaseURL) await persistPayloads(baseURL, payloads);
}

/** Turns the payloads into records, dropping anything already down, then writes them as one unit. */
async function persistPayloads(baseURL: string, payloads: SerializableMethodsData[]): Promise<void> {
  const state = getState(baseURL);
  const ts = Date.now();
  const records = new Map<string, MetadataRecord>();
  const add = (kind: MetadataKind, id: string, value: unknown) => {
    const key = storedKey(kind, id);
    // hashes are content addresses, so a compiled function already down is byte for byte this one.
    // A method row is keyed by its id instead, so it is always rewritten.
    if (kind !== 'm' && state.stored.has(key)) return;
    try {
      records.set(key, {baseURL, kind, id, json: JSON.stringify(value), ts});
    } catch (error) {
      console.warn(`Failed to serialize metadata cache entry ${id}:`, error);
    }
  };

  for (const payload of payloads) {
    for (const [hash, jitFnData] of Object.entries<CompiledFnData>(payload.deps ?? {})) {
      if (!isStorableName(hash)) {
        console.warn(`Refused to store JIT function dependency under '${hash}'`);
        continue;
      }
      add('j', hash, jitFnData);
    }
    for (const [namespace, nsPureFns] of Object.entries<Record<string, PureFunctionData>>(payload.purFnDeps ?? {})) {
      if (!isStorableName(namespace)) {
        console.warn(`Refused to store pure functions under namespace '${namespace}'`);
        continue;
      }
      for (const [fnName, pureFnData] of Object.entries(nsPureFns)) {
        if (!isStorableName(fnName)) {
          console.warn(`Refused to store pure function '${namespace}${PURE_FN_SEPARATOR}${fnName}'`);
          continue;
        }
        add('p', `${namespace}${PURE_FN_SEPARATOR}${fnName}`, pureFnData);
      }
    }
    for (const [methodId, methodData] of Object.entries<MethodWithOptions>(payload.methods ?? {})) {
      if (!isStorableName(methodId)) {
        console.warn(`Refused to store metadata for method '${methodId}'`);
        continue;
      }
      add('m', methodId, methodData);
    }
  }

  if (!records.size) return;
  await writeRecords(state, [...records.values()]);
}

function recordBytes(record: MetadataRecord): number {
  return record.json.length + record.id.length;
}

/** Writes the records, making room for them as many times as it takes.
 *
 *  The new data always wins: the size cap trims before the write, and a browser that refuses anyway
 *  (its own limit is tighter than ours) gets another batch of the oldest rows dropped and the write
 *  tried again. Only an empty store that still cannot take the write is reported. */
async function writeRecords(state: CacheState, records: MetadataRecord[]): Promise<void> {
  const store = await getMetadataStore();
  const incoming = records.reduce((total, record) => total + recordBytes(record), 0);
  await evictOldest(state, store, state.bytes + incoming - METADATA_CACHE_MAX_BYTES);

  for (let round = 0; ; round++) {
    try {
      await store.write(records);
      for (const record of records) {
        const key = storedKey(record.kind, record.id);
        const previous = state.stored.get(key);
        if (previous) state.bytes -= previous.bytes;
        const bytes = recordBytes(record);
        state.stored.set(key, {kind: record.kind, id: record.id, ts: record.ts, bytes});
        state.bytes += bytes;
      }
      askForPersistenceOnce();
      return;
    } catch (error) {
      if (round >= METADATA_CACHE_EVICTION_ROUNDS) return reportCacheError(error);
      // give up a chunk of the oldest and go again. Nothing freed means there is nothing left to
      // give up, so the store simply cannot take this write: tell the app rather than degrade quietly.
      const freed = await evictOldest(state, store, Math.max(state.bytes / 4, incoming));
      if (!freed) return reportCacheError(error);
    }
  }
}

/** Drops the oldest rows until at least `targetBytes` have been freed. Returns the bytes freed.
 *  Safe at any granularity: a method whose compiled functions went with it is refused on the next
 *  hydration and simply refetched. */
async function evictOldest(
  state: CacheState,
  store: Awaited<ReturnType<typeof getMetadataStore>>,
  targetBytes: number
): Promise<number> {
  if (targetBytes <= 0 || !state.stored.size) return 0;
  const oldestFirst = [...state.stored.values()].sort((a, b) => a.ts - b.ts);
  const keys: MetadataRecordKey[] = [];
  let freed = 0;
  for (const entry of oldestFirst) {
    keys.push([entry.kind, entry.id]);
    freed += entry.bytes;
    if (freed >= targetBytes) break;
  }
  try {
    await store.remove(state.baseURL, keys);
  } catch {
    // a store that cannot delete cannot be trimmed; the caller reports the write failure instead
    return 0;
  }
  for (const [kind, id] of keys) {
    const key = storedKey(kind, id);
    state.bytes -= state.stored.get(key)?.bytes ?? 0;
    state.stored.delete(key);
    if (kind === 'j') delete state.graph.deps[id];
    else if (kind === 'p') delete state.graph.pureFns[id];
    else delete state.graph.methods[id];
  }
  return freed;
}

function reportCacheError(error: unknown): void {
  const rpcError = new RpcError({
    type: 'metadata-cache-error',
    publicMessage: 'Could not store the remote method metadata cache',
    originalError: error instanceof Error ? error : undefined,
  });
  // loud now for whoever is watching the console, and again on the next call for the app itself
  console.error('[mion] metadata cache write failed:', error);
  pendingCacheError = rpcError;
}

/** Takes the last unrecoverable cache error, if any, so a call can report it once. */
export function takeMetadataCacheError(): RpcError<string> | undefined {
  const error = pendingCacheError;
  pendingCacheError = undefined;
  return error;
}

function askForPersistenceOnce(): void {
  if (persistenceAsked) return;
  persistenceAsked = true;
  // never awaited, and never in a browser where it could prompt (see persistentStorage.ts)
  void requestPersistenceWhenSilent();
}

// ############# READ PATH #############

/** Restores everything this server cached, once per page. One indexed read, never a scan.
 *  Never rejects: a missing or blocked store is a cache miss, not an error. */
export function hydrateMetadataCache(options: ClientOptions): Promise<void> {
  const state = getState(options.baseURL);
  if (!state.hydration) {
    state.hydration = hydrate(state).catch((error) => {
      console.warn('Failed to restore the remote method metadata cache:', error);
    });
  }
  return state.hydration;
}

async function hydrate(state: CacheState): Promise<void> {
  const store = await getMetadataStore();
  const records = await store.readAll(state.baseURL);
  if (!records.length) return;

  const deps: Record<string, CompiledFnData> = Object.create(null);
  const pureFnDeps: PureFnsDataCache = Object.create(null);
  const methods: MethodsCache = Object.create(null);

  for (const record of records) {
    // the entry is keyed by the id in ITS OWN record, never by what the payload claims
    if (!isRecordIdSafe(record.kind, record.id)) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(record.json);
    } catch (error) {
      console.warn(`Failed to restore metadata cache entry ${record.id}:`, error);
      continue;
    }
    const key = storedKey(record.kind, record.id);
    state.stored.set(key, {kind: record.kind, id: record.id, ts: record.ts, bytes: recordBytes(record)});
    state.bytes += recordBytes(record);
    if (record.kind === 'j') {
      deps[record.id] = parsed;
      state.graph.deps[record.id] = parsed;
    } else if (record.kind === 'p') {
      const separator = record.id.indexOf(PURE_FN_SEPARATOR);
      const namespace = record.id.slice(0, separator);
      const fnName = record.id.slice(separator + PURE_FN_SEPARATOR.length);
      // the factory is rebuilt from `code`, so an entry without one restores to nothing callable.
      // Refuse it here rather than let it into the cache; the server will be asked for it again.
      if (typeof parsed?.code !== 'string') {
        console.warn(`Ignoring cached pure function ${record.id}: it carries no code`);
        continue;
      }
      if (!pureFnDeps[namespace]) pureFnDeps[namespace] = Object.create(null);
      pureFnDeps[namespace][fnName] = parsed as SerializablePureFunction;
      state.graph.pureFns[record.id] = parsed;
    } else {
      methods[record.id] = parsed as MethodWithOptions;
      state.graph.methods[record.id] = parsed;
    }
  }

  addSerializedJitCaches(deps, pureFnDeps);

  // A method whose compiled functions are gone would throw at call time, not here: an eviction, a
  // write the browser aborted, or a server build that moved on can leave one behind. Refuse it and
  // let the server be asked again.
  const restorable: MethodsCache = {};
  const unusable: MetadataRecordKey[] = [];
  for (const [id, metadata] of Object.entries(methods)) {
    if (hasJitFnsForMethod(metadata)) {
      restorable[id] = metadata;
      state.hydratedIds.add(id);
    } else {
      unusable.push(['m', id]);
      delete state.graph.methods[id];
    }
  }
  addRoutesToCache(restorable);
  scheduleSweep(state, unusable);
}

function isRecordIdSafe(kind: MetadataKind, id: string): boolean {
  if (kind !== 'p') return isStorableName(id);
  const separator = id.indexOf(PURE_FN_SEPARATOR);
  if (separator <= 0) return false;
  return isStorableName(id.slice(0, separator)) && isStorableName(id.slice(separator + PURE_FN_SEPARATOR.length));
}

/** True when this page took the method's metadata off the store rather than from the server. */
export function wasHydratedFromCache(id: string, options: ClientOptions): boolean {
  return states.get(options.baseURL)?.hydratedIds.has(id) === true;
}

/** Drops restored metadata that turned out not to match the server any more, from memory and from
 *  the store, so the next call relearns it. */
export async function purgeHydratedMetadata(ids: string[], options: ClientOptions): Promise<void> {
  const state = states.get(options.baseURL);
  if (!state) return;
  const keys: MetadataRecordKey[] = [];
  for (const id of ids) {
    if (!state.hydratedIds.delete(id)) continue;
    routesCache.removeMetadata(id);
    delete state.graph.methods[id];
    keys.push(['m', id]);
  }
  if (!keys.length) return;
  const store = await getMetadataStore();
  await store.remove(state.baseURL, keys).catch(() => undefined);
  for (const [kind, id] of keys) {
    const key = storedKey(kind, id);
    state.bytes -= state.stored.get(key)?.bytes ?? 0;
    state.stored.delete(key);
  }
  // the compiled functions those methods pointed at have nothing left pointing at them
  await sweepOrphans(state);
}

/** Deletes rows nothing can reach any more. Costs no extra reads: it walks the records hydration
 *  already parsed. Once per server per page, on idle. */
function scheduleSweep(state: CacheState, alsoDelete: MetadataRecordKey[]): void {
  if (state.sweepScheduled) return;
  state.sweepScheduled = true;
  const run = () => void sweepOrphans(state, alsoDelete);
  const idle = (globalThis as any).requestIdleCallback;
  if (typeof idle === 'function') idle(run, {timeout: 2000});
  else setTimeout(run, 0);
}

async function sweepOrphans(state: CacheState, alsoDelete: MetadataRecordKey[] = []): Promise<void> {
  const keys = [...alsoDelete, ...findOrphans(state.graph)];
  if (!keys.length) return;
  const store = await getMetadataStore();
  await store.remove(state.baseURL, keys).catch(() => undefined);
  for (const [kind, id] of keys) {
    const key = storedKey(kind, id);
    state.bytes -= state.stored.get(key)?.bytes ?? 0;
    state.stored.delete(key);
    if (kind === 'j') delete state.graph.deps[id];
    else if (kind === 'p') delete state.graph.pureFns[id];
    else delete state.graph.methods[id];
  }
}

/** Forgets everything this page learned about the store. Only for testing — simulates a new page. */
export function resetMetadataCacheState(): void {
  states.clear();
  writeQueue = [];
  persistenceAsked = false;
  pendingCacheError = undefined;
}

/** Creates a SubRequest for the metadata middleware to piggyback on an optimistic request */
export function createMetadataSubRequest(methodIds: string[]): SubRequest<any> {
  return {
    pointer: [MION_ROUTES.methodsMetadata],
    id: MION_ROUTES.methodsMetadata,
    isResolved: false,
    params: [methodIds],
  };
}

function addToCaches(serializableMethodsData: SerializableMethodsData) {
  addSerializedJitCaches(serializableMethodsData.deps, serializableMethodsData.purFnDeps);
  addRoutesToCache(serializableMethodsData.methods);
}
