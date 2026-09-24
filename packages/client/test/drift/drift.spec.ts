/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One client built against A meets servers A, B, C, A on one port, its stored metadata kept across reloads.
// Under `syncRoutes` a route whose own or chain types changed is refused before any handler runs; the rest run.

import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import type {api} from './apiA.ts';
import {initClient} from '../../src/client.ts';
import type {RouteSubRequest} from '../../src/types.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {resetSyncRoutes} from '../../src/lib/syncRoutes.ts';
import {resetApiBuildVersion} from '../../src/lib/apiBuildVersion.ts';
import {resetApiVersionRecovery} from '../../src/lib/apiVersionRecovery.ts';
import {resetMetadataStore} from '../../src/lib/metadataStore.ts';
import {resetClientCaches} from '../lib/testUtils.ts';
import {freePort, startDriftServer, type DriftServerName} from './driftServer.ts';

type DriftApi = typeof api;

let port: number;
let stopServer: (() => Promise<void>) | undefined;
const realFetch = globalThis.fetch;
let fetches = 0;

/** A page reload: nothing in memory survives, the stored metadata does. */
function reloadClient() {
  resetClientCaches();
  resetBundledApi();
  resetApiBuildVersion();
  resetApiVersionRecovery();
  resetSyncRoutes();
  return initClient<DriftApi>({baseURL: `http://localhost:${port}`, storageEngine: 'memory'});
}

/** A call site the build cannot see, so its route is fetched rather than bundled. */
function callWide(subRequest: RouteSubRequest<any>) {
  return subRequest.call();
}

async function counted<T>(run: () => Promise<T>): Promise<{value: T; fetches: number}> {
  const before = fetches;
  const value = await run();
  return {value, fetches: fetches - before};
}

type Expect = 'runs' | 'refused';

async function phase(server: DriftServerName, expected: {changed: Expect; secured: Expect}) {
  await stopServer?.();
  stopServer = await startDriftServer(server, port);
  const {routes, middlewares} = reloadClient();

  const same = await counted(() => routes.same(1).call());
  expect(same.value[0]).toBe(2);
  expect(same.value[1]).toBeUndefined();
  // the build told the client the server checks ids, so a matching call costs one request
  expect(same.fetches).toBe(1);

  const optionsOnly = await routes.optionsOnly(2).call();
  expect(optionsOnly[0]).toBe(4);

  const fetched = await callWide(routes.fetched(3));
  expect(fetched[0]).toBe(2);

  const changed = await counted(() => routes.changed('Ana').call());
  const secured = await routes.secured.data().call({middlewares: {token: middlewares.secured.token('t')}});
  const [calls] = await routes.handlerCalls().call();

  if (expected.changed === 'runs') {
    expect(changed.value[0]).toBe('A Ana');
    expect(calls?.changed).toBe(1);
  } else {
    expect(changed.value[0]).toBeUndefined();
    expect(changed.value[2]).toMatchObject({type: 'route-types-mismatch', errorData: {routeIds: ['changed']}});
    // a different id is final: nothing is resent
    expect(changed.fetches).toBe(1);
    expect(calls?.changed).toBeUndefined();
  }
  if (expected.secured === 'runs') {
    expect(secured[0]).toBe('secret');
  } else {
    // the route did not change, the middleware in its chain did
    expect(secured[2]).toMatchObject({type: 'route-types-mismatch', errorData: {routeIds: ['secured/data']}});
    expect(calls?.['secured/data']).toBeUndefined();
  }
  expect(calls?.same).toBe(1);
  expect(calls?.optionsOnly).toBe(1);
  expect(calls?.fetched).toBe(1);
}

describe('a client built against server A while the server behind its address changes', () => {
  beforeAll(async () => {
    await resetMetadataStore();
    port = await freePort();
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      fetches++;
      return realFetch(...args);
    }) as typeof fetch;
  });

  afterEach(() => {
    fetches = 0;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await stopServer?.();
  });

  it('A: everything runs; a fetched route is refused once, learned from the refusal, and resent', async () => {
    await phase('a', {changed: 'runs', secured: 'runs'});
  });

  it('B: a route whose params changed is refused, an added route and an options change are not', async () => {
    await phase('b', {changed: 'refused', secured: 'runs'});
  });

  it('C: a changed return type and a changed middleware in a route chain are refused', async () => {
    await phase('c', {changed: 'refused', secured: 'refused'});
  });

  it('A again: everything runs', async () => {
    await phase('a', {changed: 'runs', secured: 'runs'});
  });

  it('the fetched route of a first visit costs one refused request, then runs', async () => {
    await stopServer?.();
    stopServer = await startDriftServer('a', port);
    await resetMetadataStore();
    const {routes} = reloadClient();
    const first = await counted(() => callWide(routes.fetched(3)));
    expect(first.value[0]).toBe(2);
    expect(first.fetches).toBe(2);
    const second = await counted(() => callWide(routes.fetched(3)));
    expect(second.fetches).toBe(1);
    const [calls] = await routes.handlerCalls().call();
    expect(calls?.fetched).toBe(2);
  });
});
