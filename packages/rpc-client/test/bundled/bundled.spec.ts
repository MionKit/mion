/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The bundled lane: this project is built with `bundleApi: 'bundled'`, so every route these specs call came
// in with its call site and evaluates no code string; only a route the build never saw reaches the server.

import {describe, it, expect, beforeEach, afterEach, inject, vi} from 'vitest';
import {HeadersSubset, MION_ROUTES} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import {useMethodsMetadata} from '../../src/middlewares/methodsMetadata.ts';
import {batch} from '../../src/batch.ts';
import {resetClientCaches} from '../lib/testUtils.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {getMethod, isBundledMethod, useMethodFns} from '../../src/lib/methods.ts';
import {isMetadataFromServerLoaded} from '../../src/lib/metadataFromServerLoader.ts';
import type {InjectedApiMetadata} from '../../src/types.ts';
import {MemoryMetadataStore, resetMetadataStore, setMetadataStoreForTesting} from '../../src/lib/metadataStore.ts';
import {expectEveryMethodMatchesTheServer} from '../lib/parity.ts';

// this lane's own test server, started by test/lib/laneServer.ts
const baseURL = inject('laneServerBaseURL');
const user = {name: 'John', surname: 'Doe'};

/** Every route of the test server runs behind the root-level `auth` headers middleware. */
function useAuth(middlewares: ReturnType<typeof initClient<TestServerApi>>['middlewares']): void {
  middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
}

/** Records every request the client sends, and says which of them asked for metadata. */
function watchFetch() {
  const bodies: string[] = [];
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async (url: any, init?: any) => {
    urls.push(String(url));
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    return realFetch(url, init);
  });
  globalThis.fetch = spy as any;
  return {
    calls: () => spy.mock.calls.length,
    askedForMetadata: () =>
      bodies.some((body) => body.includes('mionMethodsMetadata')) || urls.some((url) => url.includes('mionMethodsMetadataById')),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

describe('a client built with bundleApi: bundled', () => {
  let store: MemoryMetadataStore;

  beforeEach(async () => {
    resetClientCaches();
    resetBundledApi();
    await resetMetadataStore();
    store = new MemoryMetadataStore();
    vi.spyOn(store, 'readAll');
    vi.spyOn(store, 'write');
    setMetadataStoreForTesting(store);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetClientCaches();
    resetBundledApi();
    await resetMetadataStore();
  });

  it('knows its lane from the build', () => {
    const {client} = initClient<TestServerApi>({baseURL});
    expect(client.bundleApiMode).toBe('bundled');
  });

  it('calls a route through its middleware chain in ONE request, without asking for metadata', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
      const [result, error, fatal] = await routes.sayHello(user).call();
      expect(fatal).toBeUndefined();
      expect(error).toBeUndefined();
      expect(result).toBe('Hello John Doe');
      expect(watch.calls()).toBe(1);
      expect(watch.askedForMetadata()).toBe(false);
    } finally {
      watch.restore();
    }
    // the route, its chain and the middleware the hook fed all came from the bundle
    expect(isBundledMethod('sayHello')).toBe(true);
    expect(isBundledMethod('auth')).toBe(true);
    expect(getMethod('sayHello')?.middlewareIds).toContain('auth');
  });

  it('neither reads nor writes the metadata store', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    const [result] = await routes.utils.sumTwo(40).call();
    expect(result).toBe(42);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.readAll).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('never loads the code that asks the server how a route works', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    await routes.utils.sumTwo(40).call();
    await routes.compact.addNumbers(2, 3).typeErrors();
    expect(isMetadataFromServerLoaded()).toBe(false);
  });

  it('fails a route the bundle lacks with a clear error when it never set up metadata fetching', async () => {
    const {client, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    const watch = watchFetch();
    try {
      const [result, , undeclared] = await client.execute({
        pointer: ['flow', 'getOrgLabel'],
        id: 'flow/getOrgLabel',
        isResolved: false,
        params: ['acme'],
      } as never);
      expect(result).toBeUndefined();
      expect(undeclared?.type).toBe('route-metadata-not-found');
      expect(undeclared?.publicMessage).toContain('useMethodsMetadata');
      expect(watch.calls()).toBe(0);
    } finally {
      watch.restore();
    }
    expect(isMetadataFromServerLoaded()).toBe(false);
  });

  it('fetches a route the bundle lacks once metadata fetching is set up, loading the lane only then', async () => {
    const {client, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    useMethodsMetadata(middlewares.mionMethodsMetadata);
    expect(isMetadataFromServerLoaded()).toBe(false);
    const [result, , undeclared] = await client.execute({
      pointer: ['flow', 'getOrgLabel'],
      id: 'flow/getOrgLabel',
      isResolved: false,
      params: ['acme'],
    } as never);
    expect(undeclared).toBeUndefined();
    expect(result).toBeDefined();
    expect(isMetadataFromServerLoaded()).toBe(true);
    expect(isBundledMethod('flow/getOrgLabel')).toBe(false);
  });

  it('runs with dynamic code disabled: the bundle carries live functions, never code strings', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    const realFunction = globalThis.Function;
    const thrower = function () {
      throw new Error('new Function is disabled by the policy');
    } as unknown as FunctionConstructor;
    vi.stubGlobal('Function', thrower);
    try {
      const [result, error] = await routes.compact.addNumbers(2, 3).call();
      expect(error).toBeUndefined();
      expect(result).toBe(5);
      // local validation runs the bundled validator too
      const typeErrors = await routes.compact.addNumbers('x' as never, 3).typeErrors();
      expect(typeErrors.length).toBeGreaterThan(0);
    } finally {
      vi.stubGlobal('Function', realFunction);
    }
  });

  it('feeds a middleware from its onRequest hook and runs a batch from the bundle', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
      const [results, errors, fatal] = await batch([routes.sayHello(user), routes.utils.sumTwo(1)]).call();
      // the hook fed auth, unnamed by the call
      expect(fatal).toBeUndefined();
      expect(errors).toEqual([undefined, undefined]);
      expect(results).toEqual(['Hello John Doe', 3]);
      expect(watch.askedForMetadata()).toBe(false);
    } finally {
      watch.restore();
    }
  });

  it('sends a query route as GET, the bundled options say so', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    const [result, error] = await routes.getRequestInfo('hello').call();
    expect(error).toBeUndefined();
    expect(result?.httpMethod).toBe('GET');
    expect(getMethod('getRequestInfo')?.options.isMutation).toBe(false);
  });

  it('gives a returned HeadersSubset back', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    const [result, error] = await routes.respondHeaders('bundled').call();
    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(HeadersSubset);
    expect(result?.headers['x-mion-echo']).toBe('bundled');
  });

  it('reports a payload the build did not write in the undeclared slot, never by throwing', async () => {
    const {client, routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    // the cast stands in for the build, the only thing that fills this slot: the envelope is right and
    // the method row is not, as a `<genDir>/api/` tree from another @mionjs/devtools version would write it
    const stale = {methods: [{id: 'sayHello'}]} as unknown as InjectedApiMetadata;
    expect(() => client.useBundledApi(stale)).not.toThrow();

    const [result, error, undeclared] = await routes.sayHello(user).call();
    expect(result).toBe('Hello John Doe');
    expect(error).toBeUndefined();
    expect(undeclared?.type).toBe('bundle-api-invalid-payload');

    // reported once, so it never displaces a real error on every later call
    const [, , second] = await routes.sayHello(user).call();
    expect(second).toBeUndefined();
  });

  it('asks the server about a method the bundle does not carry, then validates against it', async () => {
    const {client, routes, middlewares} = initClient<TestServerApi>({baseURL});
    useMethodsMetadata(middlewares.mionMethodsMetadata);
    const watch = watchFetch();
    try {
      // client.typeErrors(...) takes already-built subrequests, so the build saw no dispatch point
      // for flow/getTags, which nothing else in this program calls
      expect(await client.typeErrors(routes.flow.getTags([1]))).toEqual([]);
      expect(watch.askedForMetadata()).toBe(true);
    } finally {
      watch.restore();
    }
  });
});

describe('parity: what the bundle registers equals what the server answers', () => {
  it('every method of the test server: rows, route sync ids and compiled code', async () => {
    await expectEveryMethodMatchesTheServer(baseURL);
  });

  it('a bundled entry carries no params byte ceiling: that is the server request limit', async () => {
    resetClientCaches();
    resetBundledApi();
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    await routes.utils.sumTwo(1).call();
    expect(useMethodFns('utils/sumTwo')).toBeDefined();
    expect(useMethodFns('utils/sumTwo')).not.toHaveProperty('paramsJsonMaxBytes');
  });
});
