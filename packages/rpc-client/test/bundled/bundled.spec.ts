/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The bundled lane: this project is built with `bundleApi: true`, so every route these specs call came in
// with its call site and evaluates no code string; only a route the build never saw reaches the server.

import {describe, it, expect, beforeEach, afterEach, inject, vi} from 'vitest';
import {HeadersSubset, routesCache} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import {useFetchMetadata} from '../../src/middlewares/fetchMetadata.ts';
import {batch} from '../../src/batch.ts';
import {resetClientCaches} from '../lib/testUtils.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {getMethod, isBundledMethod, useMethodFns} from '../../src/lib/methods.ts';
import {loadedMetadataFromServer} from '../../src/lib/metadataFromServerLoader.ts';
import type {InjectedApiMetadata, RouteSubRequest} from '../../src/types.ts';
import {flushMetadataCache, installMethodRows} from '../../src/lib/clientMethodsMetadata.ts';
import {MemoryMetadataStore, resetMetadataStore, setMetadataStoreForTesting} from '../../src/lib/metadataStore.ts';
import {expectEveryMethodMatchesTheServer} from '../lib/parity.ts';

// this lane's own test server, started by test/lib/laneServer.ts
const baseURL = inject('laneServerBaseURL');
const user = {name: 'John', surname: 'Doe'};

/** Every route of the test server runs behind the root-level `auth` headers middleware. */
function useAuth(middlewares: ReturnType<typeof initClient<TestServerApi>>['middlewares']): void {
  middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
}

/** A helper typed with the wide subrequest: the build reports the widened id (MET004, a warning since this
 *  program sets up `useFetchMetadata`) and bundles nothing for the call inside, which the client then fetches. */
function callThroughWideHelper(sub: RouteSubRequest<any>) {
  return sub.call();
}

/** Records every request the client sends, and says which of them asked for metadata. */
function watchFetch() {
  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async (url: any, init?: any) => {
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    return realFetch(url, init);
  });
  globalThis.fetch = spy as any;
  return {
    calls: () => spy.mock.calls.length,
    askedForMetadata: () => bodies.some((body) => body.includes('mionFetchMetadata')),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

describe('a client built with bundleApi: true', () => {
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

  it('knows from the build that its API is bundled', () => {
    const {client} = initClient<TestServerApi>({baseURL});
    expect(client.isApiBundled).toBe(true);
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

  it('checks answers with the return validator the build bundled', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL, validateServerResponses: true});
    useAuth(middlewares);
    const [result, , undeclared] = await routes.wrongAnswers.wrongAnswer(user).call();
    expect(isBundledMethod('wrongAnswers/wrongAnswer')).toBe(true);
    expect(result).toBeUndefined();
    expect(undeclared?.type).toBe('response-validation-error');
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
    expect(loadedMetadataFromServer()).toBeUndefined();
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
      expect(undeclared?.publicMessage).toContain('useFetchMetadata');
      expect(watch.calls()).toBe(0);
    } finally {
      watch.restore();
    }
    expect(loadedMetadataFromServer()).toBeUndefined();
  });

  it('fetches a route the bundle lacks once metadata fetching is set up, loading the lane only then', async () => {
    const {client, middlewares} = initClient<TestServerApi>({baseURL});
    useAuth(middlewares);
    useFetchMetadata(middlewares.mionFetchMetadata);
    expect(loadedMetadataFromServer()).toBeUndefined();
    const [result, , undeclared] = await client.execute({
      pointer: ['flow', 'getOrgLabel'],
      id: 'flow/getOrgLabel',
      isResolved: false,
      params: ['acme'],
    } as never);
    expect(undeclared).toBeUndefined();
    expect(result).toBeDefined();
    expect(loadedMetadataFromServer()).toBeDefined();
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

  it('gives a middleware with no params its answer from the bundled chain, with no onRequest hook', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      useAuth(middlewares);
      const [items, error, fatal, middlewareResults] = await routes.paramless.list(2).call();
      expect(fatal).toBeUndefined();
      expect(error).toBeUndefined();
      expect(items).toEqual([20, 21]);
      expect(middlewareResults?.['paramless/pageInfo']).toEqual({page: 2, total: 100});
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
    useFetchMetadata(middlewares.mionFetchMetadata);
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

  describe('that sets up metadata fetching', () => {
    it('uses the bundle for a route called through its own dispatch point', async () => {
      const {routes, middlewares} = initClient<TestServerApi>({baseURL});
      useAuth(middlewares);
      useFetchMetadata(middlewares.mionFetchMetadata);
      const watch = watchFetch();
      try {
        const [result] = await routes.utils.sumTwo(1).call();
        expect(result).toBe(3);
        expect(watch.calls()).toBe(1);
        expect(watch.askedForMetadata()).toBe(false);
      } finally {
        watch.restore();
      }
      expect(isBundledMethod('utils/sumTwo')).toBe(true);
    });

    it('fetches a route the bundle lacks, and stores only what it fetched', async () => {
      const {routes, middlewares} = initClient<TestServerApi>({baseURL});
      useAuth(middlewares);
      useFetchMetadata(middlewares.mionFetchMetadata);
      const watch = watchFetch();
      try {
        const [result] = await callThroughWideHelper(routes.flow.getOrgLabel('acme'));
        expect(result).toBe('[acme]');
        expect(watch.askedForMetadata()).toBe(true);
      } finally {
        watch.restore();
      }
      expect(isBundledMethod('flow/getOrgLabel')).toBe(false);
      expect(routesCache.hasMetadata('flow/getOrgLabel')).toBe(true);
      await flushMetadataCache();
      const stored = (await store.readAll(baseURL)).map((record) => record.id);
      expect(stored).toContain('flow/getOrgLabel');
      expect(stored).not.toContain('utils/sumTwo');
    });

    it("keeps a bundled middleware out of the store when it rides a fetched route's chain", async () => {
      const {routes, middlewares} = initClient<TestServerApi>({baseURL});
      useAuth(middlewares);
      useFetchMetadata(middlewares.mionFetchMetadata);
      // a bundled dispatch point first, so the chain's auth middleware comes from the build
      await routes.utils.sumTwo(1).call();
      expect(isBundledMethod('auth')).toBe(true);
      // then a route the bundle lacks; the server answers for its WHOLE chain, auth included
      await callThroughWideHelper(routes.flow.getOrgLabel('acme'));
      await flushMetadataCache();
      const stored = (await store.readAll(baseURL)).map((record) => record.id);
      expect(stored).toContain('flow/getOrgLabel');
      expect(stored).not.toContain('auth');
      // and the build's own entry is still the one a call reads
      expect(isBundledMethod('auth')).toBe(true);
    });

    it('never lets a fetched answer replace a bundled entry', async () => {
      const {routes, middlewares} = initClient<TestServerApi>({baseURL});
      useAuth(middlewares);
      useFetchMetadata(middlewares.mionFetchMetadata);
      await routes.utils.sumTwo(1).call();
      const bundled = getMethod('utils/sumTwo');
      expect(bundled).toBeDefined();
      const options = {baseURL, basePath: '', suffix: '', storageEngine: 'memory'} as never;
      const stale = {...bundled, paramsJitHash: 'stale', returnJitHash: 'stale'} as never;
      installMethodRows({methods: {'utils/sumTwo': stale}, deps: {}, purFnDeps: {}}, options);
      expect(getMethod('utils/sumTwo')?.paramsJitHash).toBe(bundled?.paramsJitHash);
    });
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
