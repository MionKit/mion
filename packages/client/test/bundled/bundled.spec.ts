/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The bundled lane: this project is built with `bundleApi: 'bundled'`, so every route these specs
// call came in with its call site. A bundled client never asks the server for metadata, never
// touches the store, and evaluates no code string.

import {describe, it, expect, beforeEach, afterEach, inject, vi} from 'vitest';
import {HeadersSubset, MION_ROUTES, getRoutePath, routesCache, type MethodWithOptions} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import {batch} from '../../src/batch.ts';
import {resetClientCaches} from '../../src/lib/testUtils.ts';
import {isBundledMethod, resetBundledApi} from '../../src/lib/bundledApi.ts';
import {MemoryMetadataStore, resetMetadataStore, setMetadataStoreForTesting} from '../../src/lib/metadataStore.ts';

// this lane's own test server, started by test/lib/laneServer.ts
const baseURL = inject('laneServerBaseURL');
const user = {name: 'John', surname: 'Doe'};

/** Every route of the test server runs behind the root-level `auth` headers middleFn. */
function withAuth(middleFns: ReturnType<typeof initClient<TestServerApi>>['middleFns']) {
  return {middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}))}};
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
      bodies.some((body) => body.includes(MION_ROUTES.methodsMetadata)) ||
      urls.some((url) => url.includes(MION_ROUTES.methodsMetadataById)),
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

  it('calls a route through its middleFn chain in ONE request, without asking for metadata', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      const auth = middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}));
      const [result, error, fatal] = await routes.sayHello(user).call({middleFns: {auth}});
      expect(fatal).toBeUndefined();
      expect(error).toBeUndefined();
      expect(result).toBe('Hello John Doe');
      expect(watch.calls()).toBe(1);
      expect(watch.askedForMetadata()).toBe(false);
    } finally {
      watch.restore();
    }
    // the route, its chain and the middleFn the call named all came from the bundle
    expect(isBundledMethod('sayHello')).toBe(true);
    expect(isBundledMethod('auth')).toBe(true);
    expect(routesCache.getMetadata('sayHello')?.middleFnIds).toContain('auth');
  });

  it('neither reads nor writes the metadata store', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const [result] = await routes.utils.sumTwo(40).call(withAuth(middleFns));
    expect(result).toBe(42);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.readAll).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('runs with dynamic code disabled: the bundle carries live functions, never code strings', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const realFunction = globalThis.Function;
    const thrower = function () {
      throw new Error('new Function is disabled by the policy');
    } as unknown as FunctionConstructor;
    vi.stubGlobal('Function', thrower);
    try {
      const [result, error] = await routes.compact.addNumbers(2, 3).call(withAuth(middleFns));
      expect(error).toBeUndefined();
      expect(result).toBe(5);
      // local validation runs the bundled validator too
      const typeErrors = await routes.compact.addNumbers('x' as never, 3).typeErrors();
      expect(typeErrors.length).toBeGreaterThan(0);
    } finally {
      vi.stubGlobal('Function', realFunction);
    }
  });

  it('prefills a middleFn and runs a batch from the bundle', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})).prefill();
      const [results, errors, fatal] = await batch([routes.sayHello(user), routes.utils.sumTwo(1)]).call();
      // the prefilled auth rode along: no middleFns were named on the call
      expect(fatal).toBeUndefined();
      expect(errors).toEqual([undefined, undefined]);
      expect(results).toEqual(['Hello John Doe', 3]);
      expect(watch.askedForMetadata()).toBe(false);
    } finally {
      watch.restore();
    }
  });

  it('sends a query route as GET, the bundled options say so', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const [result, error] = await routes.getRequestInfo('hello').call(withAuth(middleFns));
    expect(error).toBeUndefined();
    expect(result?.httpMethod).toBe('GET');
    expect(routesCache.getMetadata('getRequestInfo')?.options.isMutation).toBe(false);
  });

  it('gives a returned HeadersSubset back', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const [result, error] = await routes.respondHeaders('bundled').call(withAuth(middleFns));
    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(HeadersSubset);
    expect(result?.headers['x-mion-echo']).toBe('bundled');
  });

  it('refuses a method the bundle does not carry, naming the option', async () => {
    const {client, routes} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      // client.typeErrors(...) takes already-built subrequests, so the build saw no dispatch point
      // for flow/getTags, which nothing else in this program calls
      await expect(client.typeErrors(routes.flow.getTags([1]))).rejects.toSatisfy((errors: Map<string, any>) => {
        const error = errors.get('mion-client-request');
        return error?.type === 'route-metadata-not-found' && String(error.publicMessage).includes("bundleApi: 'bundled'");
      });
      expect(watch.calls()).toBe(0);
    } finally {
      watch.restore();
    }
  });
});

/** The metadata fields the server answers with, in the shape `getSerializableMethod` writes. */
function serializable(method: MethodWithOptions | undefined): Record<string, unknown> | undefined {
  if (!method) return undefined;
  const {type, id, nestLevel, isAsync, hasReturnData, paramsJitHash, returnJitHash, pointer, paramsCount, paramNames, options} =
    method;
  const out: Record<string, unknown> = {
    type,
    id,
    nestLevel,
    isAsync,
    hasReturnData,
    paramsJitHash,
    returnJitHash,
    pointer,
    paramsCount,
    paramNames,
    options,
  };
  if (method.headersParam)
    out.headersParam = {headerNames: method.headersParam.headerNames, jitHash: method.headersParam.jitHash};
  if (method.headersReturn)
    out.headersReturn = {headerNames: method.headersReturn.headerNames, jitHash: method.headersReturn.jitHash};
  if (method.middleFnIds) out.middleFnIds = method.middleFnIds;
  return JSON.parse(JSON.stringify(out));
}

/** Drops the one field a bundle cannot know: the request limit the server settles for a chain that
 *  declares none (its types times the router factor, else the platform adapter's number) exists
 *  only at the server's registration. A limit a route declares itself stays and must match. */
function withoutSettledLimit(row: Record<string, unknown> | undefined, bundled: Record<string, unknown> | undefined) {
  if (!row || !bundled) return row;
  const options = {...(row.options as Record<string, unknown>)};
  const bundledOptions = bundled.options as Record<string, unknown>;
  if (bundledOptions.maxBodySize === undefined) delete options.maxBodySize;
  return {...row, options};
}

describe('parity: what the bundle registers equals what the server answers', () => {
  it('method by method, jit hashes included', async () => {
    resetClientCaches();
    resetBundledApi();
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    // touch every dispatch point this file has, so their bundles are registered
    const auth = middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}));
    await routes.sayHello(user).call({middleFns: {auth}});
    await routes.utils.sumTwo(1).call(withAuth(middleFns));
    await routes.compact.addNumbers(1, 2).call(withAuth(middleFns));
    await routes.getRequestInfo('x').call(withAuth(middleFns));
    await routes.respondHeaders('x').call(withAuth(middleFns));
    await batch([routes.sayHello(user), routes.utils.sumTwo(1)]).call(withAuth(middleFns));

    const url = new URL(getRoutePath([MION_ROUTES.methodsMetadataById], {basePath: '', suffix: ''} as never), baseURL);
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({[MION_ROUTES.methodsMetadataById]: [[], true]}),
    });
    expect(response.ok).toBe(true);
    const body = (await response.json()) as Record<string, unknown>;
    const envelope = body[MION_ROUTES.methodsMetadataById];
    const answer = (Array.isArray(envelope) ? envelope[1] : envelope) as {methods: Record<string, MethodWithOptions>};

    const bundledIds = Object.keys(routesCache.getCache()).filter((id) => isBundledMethod(id));
    expect(bundledIds).toEqual(
      expect.arrayContaining(['sayHello', 'auth', 'utils/sumTwo', 'compact/addNumbers', 'getRequestInfo', 'respondHeaders'])
    );
    for (const id of bundledIds) {
      const bundled = serializable(routesCache.getMetadata(id));
      expect(bundled, id).toEqual(withoutSettledLimit(serializable(answer.methods[id]), bundled));
    }
    // the params maximum the build computed rides the bundled entry as it rides the server's
    expect(typeof routesCache.getMetadata('utils/sumTwo')?.paramsJsonMaxBytes).toBe('number');
  });
});
