/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The point of storing the metadata at all: a page that already learned a route must not learn it
// again. Before this, the first call of a fresh page always guessed the wire and paid a round trip
// for the guess, because the decision only ever looked at memory.

import 'fake-indexeddb/auto';
import {describe, beforeEach, afterEach, it, expect, vi} from 'vitest';
import {HeadersSubset, MION_ROUTES, routesCache} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from './client.ts';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
import {resetClientCaches} from './lib/testUtils.ts';
import {
  flushMetadataCache,
  hydrateMetadataCache,
  takeMetadataCacheError,
  wasHydratedFromCache,
} from './lib/clientMethodsMetadata.ts';
import {MemoryMetadataStore, resetMetadataStore, setMetadataStoreForTesting, type MetadataStore} from './lib/metadataStore.ts';
import type {ClientOptions} from './types.ts';

const baseURL = TEST_SERVER_BASE_URL;
const user = {name: 'John', surname: 'Doe'};

/** sayHello runs behind the auth middleFn, so every call here carries it. */
function callSayHello(client: ReturnType<typeof initClient<TestServerApi>>) {
  const auth = client.middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}));
  return client.routes.sayHello(user).call({middleFns: {auth}});
}

/** Records every request the client sends, and says which of them guessed the wire. */
function watchFetch() {
  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async (url: any, init?: any) => {
    bodies.push(typeof init?.body === 'string' ? init.body : String(url));
    return realFetch(url, init);
  });
  globalThis.fetch = spy as any;
  return {
    bodies,
    calls: () => spy.mock.calls.length,
    guessedTheWire: () => bodies.some((body) => body.includes(MION_ROUTES.methodsMetadata)),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

/** A page reload: memory forgotten, whatever was stored kept. */
function reloadPage(): void {
  resetClientCaches();
}

describe('a cold page with a warm store', () => {
  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  afterEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  it('answers from the store, in one request, without guessing the wire', async () => {
    // a first visit that learned the route
    await callSayHello(initClient<TestServerApi>({baseURL}));
    await flushMetadataCache();

    reloadPage();
    expect(routesCache.hasMetadata('sayHello')).toBe(false);

    const watcher = watchFetch();
    try {
      const [result, error, undeclared] = await callSayHello(initClient<TestServerApi>({baseURL}));
      expect(error).toBeUndefined();
      expect(undeclared).toBeUndefined();
      expect(result).toContain('John');

      // one request, and it went out knowing the route rather than guessing at it
      expect(watcher.calls()).toBe(1);
      expect(watcher.guessedTheWire()).toBe(false);
      expect(wasHydratedFromCache('sayHello', {baseURL} as ClientOptions)).toBe(true);
    } finally {
      watcher.restore();
    }
  });

  it('still guesses the wire when the store has nothing to offer', async () => {
    const watcher = watchFetch();
    try {
      const [result] = await callSayHello(initClient<TestServerApi>({baseURL}));
      expect(result).toContain('John');
      expect(watcher.guessedTheWire()).toBe(true);
    } finally {
      watcher.restore();
    }
  });

  it('reads the store once, however many calls a cold page makes at the same time', async () => {
    const inner = new MemoryMetadataStore();
    const readAll = vi.fn((url: string) => inner.readAll(url));
    setMetadataStoreForTesting({
      kind: 'memory',
      readAll,
      write: (records) => inner.write(records),
      remove: (url, keys) => inner.remove(url, keys),
      clear: (url) => inner.clear(url),
    } as MetadataStore);

    const client = initClient<TestServerApi>({baseURL});
    await Promise.all([callSayHello(client), callSayHello(client)]);
    expect(readAll).toHaveBeenCalledTimes(1);
  });
});

describe('stored metadata the server has moved on from', () => {
  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  afterEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  it('drops it and relearns, instead of failing the call', async () => {
    // a first visit that learned the route and stored it
    await callSayHello(initClient<TestServerApi>({baseURL}));
    await flushMetadataCache();
    reloadPage();

    // The server has since moved on, so the stored encoders no longer match and it says so. Only the
    // FIRST answer is faked; the relearn that follows goes to the real server.
    const realFetch = globalThis.fetch;
    const bodies: string[] = [];
    let answered = false;
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      if (answered) return realFetch(url, init);
      answered = true;
      return new Response(
        JSON.stringify({
          [MION_ROUTES.thrownErrors]: {
            sayHello: {'mion@isΣrrθr': true, type: 'serialization-error', publicMessage: 'params could not be decoded'},
          },
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}}
      );
    }) as any;

    try {
      const [result, error] = await callSayHello(initClient<TestServerApi>({baseURL}));

      expect(error).toBeUndefined();
      expect(result).toContain('John');
      // the first went out trusting the store, the retry relearned from the server
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).not.toContain(MION_ROUTES.methodsMetadata);
      expect(bodies[1]).toContain(MION_ROUTES.methodsMetadata);
      expect(wasHydratedFromCache('sayHello', {baseURL} as ClientOptions)).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('a cache write that could not be stored', () => {
  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
    takeMetadataCacheError();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetClientCaches();
    await resetMetadataStore();
  });

  it('never fails the call, and rides the next result instead', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const inner = new MemoryMetadataStore();
    setMetadataStoreForTesting({
      kind: 'memory',
      readAll: (url) => inner.readAll(url),
      write: () => Promise.reject(new DOMException('quota', 'QuotaExceededError')),
      remove: (url, keys) => inner.remove(url, keys),
      clear: (url) => inner.clear(url),
    } as MetadataStore);

    const client = initClient<TestServerApi>({baseURL});

    // the call that could not be cached still succeeds
    const [firstResult, firstError] = await callSayHello(client);
    expect(firstError).toBeUndefined();
    expect(firstResult).toContain('John');
    await flushMetadataCache();
    expect(errorSpy).toHaveBeenCalled();

    // and the next call carries the failure where request-scoped errors live
    const [secondResult, secondError, undeclared] = await callSayHello(client);
    expect(secondResult).toContain('John');
    expect(secondError).toBeUndefined();
    expect(undeclared?.type).toBe('metadata-cache-error');

    // reported once, never on every call after
    const [, , stillThere] = await callSayHello(client);
    expect(stillThere).toBeUndefined();
  });
});

describe('hydration bookkeeping', () => {
  beforeEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  afterEach(async () => {
    resetClientCaches();
    await resetMetadataStore();
  });

  it('knows which methods came off the store and which came from the server', async () => {
    const options = {baseURL} as ClientOptions;
    await callSayHello(initClient<TestServerApi>({baseURL}));
    await flushMetadataCache();

    // learned from the server on this page, not restored
    expect(wasHydratedFromCache('sayHello', options)).toBe(false);

    reloadPage();
    await hydrateMetadataCache(options);
    expect(wasHydratedFromCache('sayHello', options)).toBe(true);
  });
});
