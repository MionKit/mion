/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mixed lane: this project is built with `bundleApi: 'mixed'`, so the routes these specs call
// through their own dispatch points come in with the call site, and a route reached another way is
// still fetched from the server as before.

import {describe, it, expect, beforeEach, afterEach, inject, vi} from 'vitest';
import {HeadersSubset, MION_ROUTES, routesCache} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import type {RouteSubRequest} from '../../src/types.ts';
import {resetClientCaches} from '../../src/lib/testUtils.ts';
import {isBundledMethod, resetBundledApi} from '../../src/lib/bundledApi.ts';
import {flushMetadataCache, extractAndProcessMetadata} from '../../src/lib/clientMethodsMetadata.ts';
import {MemoryMetadataStore, resetMetadataStore, setMetadataStoreForTesting} from '../../src/lib/metadataStore.ts';

// this lane's own test server, started by test/lib/laneServer.ts
const baseURL = inject('laneServerBaseURL');

/** Every route of the test server runs behind the root-level `auth` headers middleFn. */
function withAuth(middleFns: ReturnType<typeof initClient<TestServerApi>>['middleFns']) {
  return {middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}))}};
}

/** A helper typed with the wide subrequest: the build reports the widened id (MET004, a warning
 *  under mixed) and bundles nothing for the call inside, which the client then fetches. */
function callThroughWideHelper(sub: RouteSubRequest<any>, setup: Parameters<RouteSubRequest<any>['call']>[0]) {
  return sub.call(setup);
}

function watchFetch() {
  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  const spy = vi.fn(async (url: any, init?: any) => {
    bodies.push(typeof init?.body === 'string' ? init.body : String(url));
    return realFetch(url, init);
  });
  globalThis.fetch = spy as any;
  return {
    calls: () => spy.mock.calls.length,
    askedForMetadata: () => bodies.some((body) => body.includes(MION_ROUTES.methodsMetadata)),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

describe('a client built with bundleApi: mixed', () => {
  let store: MemoryMetadataStore;

  beforeEach(async () => {
    resetClientCaches();
    resetBundledApi();
    await resetMetadataStore();
    store = new MemoryMetadataStore();
    setMetadataStoreForTesting(store);
  });

  afterEach(async () => {
    resetClientCaches();
    resetBundledApi();
    await resetMetadataStore();
  });

  it('knows its lane from the build', () => {
    const {client} = initClient<TestServerApi>({baseURL});
    expect(client.bundleApiMode).toBe('mixed');
  });

  it('uses the bundle for a route called through its own dispatch point', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      const [result] = await routes.utils.sumTwo(1).call(withAuth(middleFns));
      expect(result).toBe(3);
      expect(watch.calls()).toBe(1);
      expect(watch.askedForMetadata()).toBe(false);
    } finally {
      watch.restore();
    }
    expect(isBundledMethod('utils/sumTwo')).toBe(true);
  });

  it('fetches a route the bundle lacks, and stores only what it fetched', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = watchFetch();
    try {
      const [result] = await callThroughWideHelper(routes.flow.getOrgLabel('acme'), withAuth(middleFns));
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

  it('never lets a fetched answer replace a bundled entry', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    await routes.utils.sumTwo(1).call(withAuth(middleFns));
    const bundled = routesCache.getMetadata('utils/sumTwo');
    expect(bundled).toBeDefined();
    const options = {baseURL, basePath: '', suffix: '', storageEngine: 'memory'} as never;
    extractAndProcessMetadata(
      MION_ROUTES.methodsMetadata,
      {
        [MION_ROUTES.methodsMetadata]: {
          methods: {'utils/sumTwo': {...bundled, paramsJitHash: 'stale', returnJitHash: 'stale'}},
          deps: {},
          purFnDeps: {},
        },
      },
      options
    );
    expect(routesCache.getMetadata('utils/sumTwo')?.paramsJitHash).toBe(bundled!.paramsJitHash);
  });
});
