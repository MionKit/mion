/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {HeadersSubset, routesCache} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from './lib/fetchingClient.ts';
import {batch} from '../src/batch.ts';
import {purgeHydratedMetadata} from '../src/lib/clientMethodsMetadata.ts';
import {getMetadataStore} from '../src/lib/metadataStore.ts';
import type {ClientOptions} from '../src/types.ts';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

const baseURL = TEST_SERVER_BASE_URL;
const authHeaders = new HeadersSubset({Authorization: 'XWYZ-TOKEN'});

/** Makes the next call to these methods an optimistic first call */
async function forgetMetadata(...ids: string[]): Promise<void> {
  const cache = routesCache.getCache();
  ids.forEach((id) => delete cache[id]);
  await purgeHydratedMetadata(ids, {baseURL} as ClientOptions);
  const store = await getMetadataStore();
  await store.remove(
    baseURL,
    ids.map((id) => ['m', id] as ['m', string])
  );
}

describe('middleware with no params', () => {
  let destroy: (() => void) | undefined;
  afterEach(() => destroy?.());

  function newClient() {
    const initialized = initClient<TestServerApi>({baseURL});
    destroy = () => initialized.client.destroy();
    return initialized;
  }

  it('its answer reaches the tuple and onResponse with no onRequest hook', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    const pageInfos: unknown[] = [];
    middlewares.paramless.pageInfo.onResponse((info) => {
      pageInfos.push(info);
    });

    const [items, error, undeclared, middlewareResults] = await routes.paramless.list(2).call();

    expect(error).toBeUndefined();
    expect(undeclared).toBeUndefined();
    expect(items).toEqual([20, 21]);
    expect(middlewareResults?.['paramless/pageInfo']).toEqual({page: 2, total: 100});
    expect(pageInfos).toEqual([{page: 2, total: 100}]);
  });

  it('works on an optimistic first call, before the client has the route metadata', async () => {
    await forgetMetadata('paramless/list', 'paramless/pageInfo', 'paramless/gate');
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));

    const [items, , undeclared, middlewareResults] = await routes.paramless.list(3).call();

    expect(undeclared).toBeUndefined();
    expect(items).toEqual([30, 31]);
    expect(middlewareResults?.['paramless/pageInfo']).toEqual({page: 3, total: 100});
  });

  it('its declared errors stay typed in middlewareErrors and onError, never undeclared', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    const errorTypes: string[] = [];
    middlewares.paramless.pageInfo.onError('page-out-of-range', (error) => {
      errorTypes.push(error.type);
    });

    const [items, error, undeclared, , middlewareErrors] = await routes.paramless.list(12).call();

    // a plain RpcError from a middleware after the route keeps the route's answer
    expect(items).toEqual([120, 121]);
    expect(error).toBeUndefined();
    expect(undeclared).toBeUndefined();
    expect(middlewareErrors?.['paramless/pageInfo']?.type).toBe('page-out-of-range');
    expect(errorTypes).toEqual(['page-out-of-range']);
  });

  it('a declared FatalError from a gate with no params ends the call and stays typed', async () => {
    const {routes, middlewares, client} = initClient<TestServerApi>({baseURL, fetchOptions: {headers: {'x-gate': 'closed'}}});
    destroy = () => client.destroy();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    const errorTypes: string[] = [];
    middlewares.paramless.gate.onError('gate-closed', (error) => {
      errorTypes.push(error.type);
    });

    const [items, , undeclared, , middlewareErrors] = await routes.paramless.list(1).call();

    expect(items).toBeUndefined();
    expect(undeclared).toBeUndefined();
    expect(middlewareErrors?.['paramless/gate']?.type).toBe('gate-closed');
    expect(errorTypes).toEqual(['gate-closed']);
  });

  it('never writes the middleware into the request body', async () => {
    const {routes, middlewares} = newClient();
    middlewares.auth.onRequest((auth) => auth(authHeaders));
    await routes.paramless.list(1).call();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await routes.paramless.list(4).call();
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(Object.keys(body)).toEqual(['paramless/list']);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('answers once per batch', async () => {
    // inline: the build reads a batch's routes only from the proxy initClient returns in this file
    const {client, routes, middlewares} = initClient<TestServerApi>({baseURL});
    destroy = () => client.destroy();
    middlewares.auth.onRequest((auth) => auth(authHeaders));

    const [[greeting, items], , undeclared, middlewareResults] = await batch([
      routes.sayHello({name: 'John', surname: 'Doe'}),
      routes.paramless.list(5),
    ]).call();

    expect(undeclared).toBeUndefined();
    expect(greeting).toBe('Hello John Doe');
    expect(items).toEqual([50, 51]);
    expect(middlewareResults?.['paramless/pageInfo']).toEqual({page: 5, total: 100});
  });
});
