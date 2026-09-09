/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What the cache does around the store: it hydrates once per server, it makes room for new data
// rather than losing it, it refuses a method whose compiled functions are gone, and it never lets a
// storage failure pass unnoticed.

import 'fake-indexeddb/auto';
import {describe, beforeEach, afterEach, it, expect, vi} from 'vitest';
import {DEFAULT_ENCODER, MION_ROUTES, getJitFnHashes, routesCache} from '@mionjs/core';
import {
  extractAndProcessMetadata,
  flushMetadataCache,
  hydrateMetadataCache,
  takeMetadataCacheError,
} from './clientMethodsMetadata.ts';
import {
  MemoryMetadataStore,
  getMetadataStore,
  resetMetadataStore,
  setMetadataStoreForTesting,
  type MetadataRecord,
  type MetadataStore,
} from './metadataStore.ts';
import {resetClientCaches} from './testUtils.ts';
import type {ClientOptions} from '../types.ts';

const baseURL = 'http://localhost:2';

const options: ClientOptions = {
  baseURL,
  fetchOptions: {},
  basePath: '',
  suffix: '',
  validateParams: true,
  sanitizeParams: true,
  autoGenerateErrorId: false,
  serializer: 'stringifyJson',
  storageEngine: 'indexeddb',
};

/** A metadata payload shaped like the server's, with one method and the functions it names.
 *  The function ids come from core's own derivation, never from a guess about how they are spelled. */
function payload(methodId: string, jitHash: string) {
  const method = {
    id: methodId,
    paramsJitHash: jitHash,
    returnJitHash: '',
    paramsCount: 0,
    paramNames: [],
    options: {},
  };
  const hashes = getJitFnHashes(jitHash, DEFAULT_ENCODER.params);
  const deps: Record<string, unknown> = {};
  for (const rtFnHash of [hashes.isType, hashes.typeErrors, hashes.encode, hashes.decode]) {
    deps[rtFnHash] = {code: 'return () => true', typeName: 'x', fnID: 'x', rtFnHash};
  }
  return {methods: {[methodId]: method}, deps, purFnDeps: {}};
}

/** The hash the params validator of this method is stored under. */
function paramsIsTypeHash(jitHash: string): string {
  return getJitFnHashes(jitHash, DEFAULT_ENCODER.params).isType;
}

/** Wraps a store, so a test can watch or break one method without losing the others.
 *  A spread would not do: the real stores keep their methods on the prototype. */
function wrapStore(inner: MetadataStore, overrides: Partial<MetadataStore>): MetadataStore {
  return {
    kind: inner.kind,
    readAll: (url) => inner.readAll(url),
    write: (records) => inner.write(records),
    remove: (url, keys) => inner.remove(url, keys),
    clear: (url) => inner.clear(url),
    ...overrides,
  };
}

function receiveFromServer(data: unknown): void {
  extractAndProcessMetadata(MION_ROUTES.methodsMetadata, {[MION_ROUTES.methodsMetadata]: data}, options);
}

/** A store that refuses the first `failures` writes with the error a full browser raises. */
function failingStore(failures: number, inner: MetadataStore = new MemoryMetadataStore()) {
  let attempts = 0;
  const store = wrapStore(inner, {
    write: (records) => {
      attempts += 1;
      if (attempts <= failures) return Promise.reject(new DOMException('quota', 'QuotaExceededError'));
      return inner.write(records);
    },
  });
  return {store, inner, attempts: () => attempts};
}

describe('the metadata cache around its store', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
    takeMetadataCacheError();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetClientCaches();
    await resetMetadataStore();
  });

  it('reads the store once however many callers ask at the same time', async () => {
    const inner = new MemoryMetadataStore();
    const readAll = vi.fn((url: string) => inner.readAll(url));
    setMetadataStoreForTesting(wrapStore(inner, {readAll}));

    await Promise.all([hydrateMetadataCache(options), hydrateMetadataCache(options), hydrateMetadataCache(options)]);
    await hydrateMetadataCache(options);

    expect(readAll).toHaveBeenCalledTimes(1);
  });

  it('restores a method and its compiled functions on a cold page', async () => {
    receiveFromServer(payload('sayHi', 'h1'));
    await flushMetadataCache();

    resetClientCaches();
    expect(routesCache.hasMetadata('sayHi')).toBe(false);

    await hydrateMetadataCache(options);
    expect(routesCache.hasMetadata('sayHi')).toBe(true);
    expect(routesCache.getMethodJitFns('sayHi')).toBeDefined();
  });

  it('refuses a stored method whose compiled functions are gone, rather than throwing at call time', async () => {
    receiveFromServer(payload('sayHi', 'h1'));
    await flushMetadataCache();

    // drop the functions and keep the method, which is what an eviction or a half-written response leaves
    const store = await getMetadataStore();
    const functionKeys = (await store.readAll(baseURL))
      .filter((record) => record.kind === 'j')
      .map((record) => ['j', record.id] as [MetadataRecord['kind'], string]);
    expect(functionKeys.length).toBeGreaterThan(0);
    await store.remove(baseURL, functionKeys);

    resetClientCaches();
    await hydrateMetadataCache(options);

    expect(routesCache.hasMetadata('sayHi')).toBe(false);
    // and the unusable row is gone, so it never costs another read
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await store.readAll(baseURL)).some((record) => record.kind === 'm')).toBe(false);
  });

  it('makes room and writes again when the browser refuses', async () => {
    const {store, inner, attempts} = failingStore(1);
    setMetadataStoreForTesting(store);

    // something already down, so there is something to give up
    await inner.write([{baseURL, kind: 'j', id: 'ancient', json: '{}', ts: 1}]);
    await hydrateMetadataCache(options);

    receiveFromServer(payload('sayHi', 'h1'));
    await flushMetadataCache();

    expect(attempts()).toBe(2);
    const stored = await inner.readAll(baseURL);
    // the new data won, and the oldest entry paid for it
    expect(stored.some((record) => record.kind === 'm' && record.id === 'sayHi')).toBe(true);
    expect(stored.some((record) => record.id === 'ancient')).toBe(false);
    expect(takeMetadataCacheError()).toBeUndefined();
  });

  it('keeps giving up its oldest until the new data fits', async () => {
    const {store, inner, attempts} = failingStore(2);
    setMetadataStoreForTesting(store);

    // four old entries, so eviction has more than one round to give
    await inner.write(
      [1, 2, 3, 4].map((n) => ({
        baseURL,
        kind: 'j' as const,
        id: `old${n}`,
        json: '{"padding":"' + 'x'.repeat(200) + '"}',
        ts: n,
      }))
    );
    await hydrateMetadataCache(options);

    receiveFromServer(payload('sayHi', 'h1'));
    await flushMetadataCache();

    // refused twice, so it gave up a batch of the oldest twice before the third write landed
    expect(attempts()).toBe(3);
    const stored = await inner.readAll(baseURL);
    expect(stored.some((record) => record.kind === 'm' && record.id === 'sayHi')).toBe(true);
    expect(stored.filter((record) => record.id.startsWith('old'))).toEqual([]);
    expect(takeMetadataCacheError()).toBeUndefined();
  });

  it('reports the failure once there is nothing left to give up', async () => {
    const {store} = failingStore(Number.POSITIVE_INFINITY);
    setMetadataStoreForTesting(store);
    await hydrateMetadataCache(options);

    receiveFromServer(payload('sayHi', 'h1'));
    await flushMetadataCache();

    expect(errorSpy).toHaveBeenCalled();
    const error = takeMetadataCacheError();
    expect(error?.type).toBe('metadata-cache-error');
    // taken once, so it never rides two results
    expect(takeMetadataCacheError()).toBeUndefined();
  });

  it('keeps serving a response whose write failed', async () => {
    const {store} = failingStore(Number.POSITIVE_INFINITY);
    setMetadataStoreForTesting(store);
    await hydrateMetadataCache(options);

    // the response path fills the in-memory caches first and never waits on the store
    receiveFromServer(payload('sayHi', 'h1'));
    expect(routesCache.hasMetadata('sayHi')).toBe(true);

    await flushMetadataCache();
    expect(routesCache.hasMetadata('sayHi')).toBe(true);
    expect(takeMetadataCacheError()).toBeDefined();
  });

  it('writes a compiled function once, however many responses carry it', async () => {
    const inner = new MemoryMetadataStore();
    const written: string[] = [];
    setMetadataStoreForTesting(
      wrapStore(inner, {
        write: (records: MetadataRecord[]) => {
          written.push(...records.map((record) => `${record.kind}:${record.id}`));
          return inner.write(records);
        },
      })
    );

    await hydrateMetadataCache(options);
    receiveFromServer(payload('sayHi', 'h1'));
    await flushMetadataCache();
    receiveFromServer(payload('sayBye', 'h1'));
    await flushMetadataCache();

    // hashes are content addresses: the second response's functions are already down
    expect(written.filter((id) => id === `j:${paramsIsTypeHash('h1')}`)).toHaveLength(1);
    expect(written).toContain('m:sayHi');
    expect(written).toContain('m:sayBye');
  });
});
