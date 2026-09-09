/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Both stores answer the same questions the same way. The browser one is the interesting arm: its
// whole point is that one range read returns every entry of one server and nothing else, which rests
// on how IndexedDB orders a compound key. fake-indexeddb runs the W3C suite, so it holds that line.

import 'fake-indexeddb/auto';
import {describe, beforeEach, afterEach, it, expect} from 'vitest';
import {getMetadataStore, MemoryMetadataStore, resetMetadataStore} from './metadataStore.ts';
import type {MetadataRecord, MetadataStore, MetadataStoreFactory} from './storage.ts';

const A = 'http://x';
/** the classic bound-range bug: one baseURL is a prefix of the other */
const B = 'http://x/api';

function record(baseURL: string, kind: MetadataRecord['kind'], id: string, json = '{}'): MetadataRecord {
  return {baseURL, kind, id, json, ts: 1};
}

const idsOfRecords = (records: MetadataRecord[]) => records.map((entry) => `${entry.kind}:${entry.id}`).sort();

const arms: [string, () => Promise<MetadataStore>][] = [
  ['memory', async () => new MemoryMetadataStore()],
  ['indexeddb', async () => getMetadataStore()],
];

describe.each(arms)('metadata store (%s)', (name, makeStore) => {
  let store: MetadataStore;

  beforeEach(async () => {
    await resetMetadataStore();
    store = await makeStore();
    if (name === 'indexeddb') expect(store.kind).toBe('indexeddb');
  });

  const idsOf = idsOfRecords;

  it('one read returns every kind of one server, and nothing from another', async () => {
    await store.write([
      record(A, 'm', 'sayHello'),
      record(A, 'j', 'hash1'),
      record(A, 'p', 'ns::fn'),
      record(B, 'm', 'other'),
      record(B, 'j', 'hash2'),
    ]);

    expect(idsOf(await store.readAll(A))).toEqual(['j:hash1', 'm:sayHello', 'p:ns::fn']);
    expect(idsOf(await store.readAll(B))).toEqual(['j:hash2', 'm:other']);
    expect(await store.readAll('http://nothing')).toEqual([]);
  });

  it('a record round-trips its text unchanged', async () => {
    const json = JSON.stringify({code: 'return 1', nested: {list: [1, 2, 3]}});
    await store.write([record(A, 'j', 'hash1', json)]);
    const [stored] = await store.readAll(A);
    expect(stored.json).toBe(json);
    expect(stored.ts).toBe(1);
  });

  it('writing the same id again replaces it rather than duplicating it', async () => {
    await store.write([record(A, 'm', 'sayHello', '{"v":1}')]);
    await store.write([record(A, 'm', 'sayHello', '{"v":2}')]);
    const stored = await store.readAll(A);
    expect(stored).toHaveLength(1);
    expect(stored[0].json).toBe('{"v":2}');
  });

  it('remove deletes only the records it names', async () => {
    await store.write([record(A, 'j', 'keep'), record(A, 'j', 'drop'), record(A, 'p', 'ns::drop'), record(B, 'j', 'drop')]);
    await store.remove(A, [
      ['j', 'drop'],
      ['p', 'ns::drop'],
    ]);
    expect(idsOf(await store.readAll(A))).toEqual(['j:keep']);
    expect(idsOf(await store.readAll(B))).toEqual(['j:drop']);
  });

  it('clear takes one server without touching the other', async () => {
    await store.write([record(A, 'm', 'one'), record(B, 'm', 'two')]);
    await store.clear(A);
    expect(await store.readAll(A)).toEqual([]);
    expect(idsOf(await store.readAll(B))).toEqual(['m:two']);
  });
});

describe('metadata store selection', () => {
  beforeEach(async () => {
    await resetMetadataStore();
  });

  it('falls back to memory where the browser has no database', async () => {
    const real = globalThis.indexedDB;
    delete (globalThis as any).indexedDB;
    try {
      const store = await getMetadataStore();
      expect(store.kind).toBe('memory');
      await store.write([record(A, 'm', 'sayHello')]);
      expect(await store.readAll(A)).toHaveLength(1);
    } finally {
      (globalThis as any).indexedDB = real;
      await resetMetadataStore();
    }
  });

  it('a failed write leaves none of its records behind', async () => {
    const store = await getMetadataStore();
    expect(store.kind).toBe('indexeddb');
    // a value the structured clone algorithm refuses aborts the whole transaction
    const poison = {...record(A, 'm', 'poison'), json: '{}', bad: () => 1} as unknown as MetadataRecord;
    await expect(store.write([record(A, 'm', 'good'), poison])).rejects.toBeTruthy();
    expect(await store.readAll(A)).toEqual([]);
  });
});

describe('an engine of the app', () => {
  beforeEach(async () => {
    await resetMetadataStore();
  });

  afterEach(async () => {
    await resetMetadataStore();
  });

  /** The smallest thing that satisfies the contract, written from the outside like an app would. */
  function countingEngine() {
    const inner = new MemoryMetadataStore();
    let opened = 0;
    const factory: MetadataStoreFactory = () => {
      opened += 1;
      const store: MetadataStore = {
        kind: 'app-store',
        readAll: (baseURL) => inner.readAll(baseURL),
        write: (records) => inner.write(records),
        remove: (baseURL, keys) => inner.remove(baseURL, keys),
        clear: (baseURL) => inner.clear(baseURL),
      };
      return store;
    };
    return {factory, opened: () => opened};
  }

  it('is used instead of the browser database, and opened once', async () => {
    const engine = countingEngine();

    const store = await getMetadataStore(engine.factory);
    expect(store.kind).toBe('app-store');
    await store.write([record(A, 'm', 'sayHello')]);
    expect(idsOfRecords(await (await getMetadataStore(engine.factory)).readAll(A))).toEqual(['m:sayHello']);
    expect(engine.opened()).toBe(1);
  });

  it('keeps each engine apart, so one app never reads another engine cache', async () => {
    const engine = countingEngine();
    await (await getMetadataStore(engine.factory)).write([record(A, 'm', 'sayHello')]);

    expect(await (await getMetadataStore('memory')).readAll(A)).toEqual([]);
  });

  it('falls back to memory when the engine cannot open a store', async () => {
    const missing = await getMetadataStore(() => undefined);
    expect(missing.kind).toBe('memory');

    const broken = await getMetadataStore(() => Promise.reject(new Error('no room')));
    expect(broken.kind).toBe('memory');
  });

  it('the memory engine is the in-memory store, whatever the browser offers', async () => {
    const store = await getMetadataStore('memory');
    expect(store.kind).toBe('memory');
  });
});
