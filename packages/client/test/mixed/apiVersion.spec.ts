/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mixed lane bundles build-compiled routes too, so a server that moved on leaves them stale the same way.

import {describe, it, expect, beforeEach, afterEach, inject, vi} from 'vitest';
import {HeadersSubset, MION_ROUTES, BUILD_VERSION_HEADER} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import {resetClientCaches} from '../lib/testUtils.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {getApiBuildVersion, resetApiBuildVersion} from '../../src/lib/apiBuildVersion.ts';
import {isBundledMethod} from '../../src/lib/methods.ts';
import {resetMetadataStore} from '../../src/lib/metadataStore.ts';

const baseURL = inject('laneServerBaseURL');
const user = {name: 'John', surname: 'Doe'};

function withAuth(middleFns: ReturnType<typeof initClient<TestServerApi>>['middleFns']) {
  return {middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}))}};
}

/** Sets `version` in the build-version header of every response, `null` strips it, whatever the builds agreed on. */
function serveVersion(version: string | null) {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  const bodies: string[] = [];
  const spy = vi.fn(async (url: any, init?: any) => {
    urls.push(String(url));
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    const response = await realFetch(url, init);
    const headers = new Headers(response.headers);
    if (version === null) headers.delete(BUILD_VERSION_HEADER);
    else headers.set(BUILD_VERSION_HEADER, version);
    return new Response(await response.arrayBuffer(), {status: response.status, headers});
  });
  globalThis.fetch = spy as any;
  return {
    calls: () => spy.mock.calls.length,
    metadataCalls: () => urls.filter((url) => url.includes(MION_ROUTES.methodsMetadataById)).length,
    metadataBody: () => bodies[urls.findIndex((url) => url.includes(MION_ROUTES.methodsMetadataById))] ?? '',
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

describe('the api version a mixed client compares', () => {
  beforeEach(async () => {
    resetClientCaches();
    resetBundledApi();
    resetApiBuildVersion();
    await resetMetadataStore();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetClientCaches();
    resetBundledApi();
    resetApiBuildVersion();
    await resetMetadataStore();
  });

  it('is the one the server was built from', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const clientVersion = getApiBuildVersion();
    expect(clientVersion).toMatch(/^[A-Za-z0-9]{12}$/);
    const response = await fetch(new URL('/sayHello', baseURL), {
      method: 'POST',
      body: JSON.stringify({sayHello: [user], auth: ['XWYZ-TOKEN']}),
    });
    expect(response.headers.get(BUILD_VERSION_HEADER)).toBe(clientVersion);
    const [result] = await routes.sayHello(user).call(withAuth(middleFns));
    expect(result).toBe('Hello John Doe');
  });

  it('costs nothing when it matches: one request, and the fetch lane stays unloaded', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = serveVersion(getApiBuildVersion()!);
    try {
      const [result] = await routes.sayHello(user).call(withAuth(middleFns));
      expect(result).toBe('Hello John Doe');
      expect(watch.calls()).toBe(1);
      expect(watch.metadataCalls()).toBe(0);
    } finally {
      watch.restore();
    }
  });

  it('changes nothing when the server sends no version', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = serveVersion(null);
    try {
      const [result, , undeclared] = await routes.sayHello(user).call(withAuth(middleFns));
      expect(result).toBe('Hello John Doe');
      expect(undeclared).toBeUndefined();
      expect(watch.calls()).toBe(1);
    } finally {
      watch.restore();
    }
    expect(isBundledMethod('sayHello')).toBe(true);
  });

  it('replaces the stale routes in one extra request and reports the mismatch once', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    const watch = serveVersion('someOtherAp');
    try {
      const [result, , undeclared] = await routes.sayHello(user).call(withAuth(middleFns));
      // the call still answers: the replaced rows are the server's own
      expect(result).toBe('Hello John Doe');
      expect(undeclared?.type).toBe('api-version-mismatch');
      expect(watch.metadataCalls()).toBe(1);
      // the extra request carries the client's own compiled ids, so the server answers only with rows that moved (none here)
      const asked = JSON.parse(watch.metadataBody())[MION_ROUTES.methodsMetadataById];
      expect(asked[0]).toContain('sayHello');
      expect(asked[2]).toContainEqual({id: 'sayHello', paramsJitHash: expect.any(String), returnJitHash: expect.any(String)});

      // a second call is back to one request: the two versions never change, so one mismatch is the news
      const before = watch.calls();
      const [again, , stillUndeclared] = await routes.sayHello(user).call(withAuth(middleFns));
      expect(again).toBe('Hello John Doe');
      expect(stillUndeclared).toBeUndefined();
      expect(watch.calls() - before).toBe(1);
    } finally {
      watch.restore();
    }
  });
});
