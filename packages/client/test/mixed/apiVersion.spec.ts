/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mixed lane bundles build-compiled routes too, so a server that moved on leaves them stale the same way.

import {describe, it, expect, beforeEach, afterEach, inject, vi} from 'vitest';
import {BUILD_VERSION_HEADER} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from '../../src/client.ts';
import {getApiBuildVersion} from '../../src/lib/apiBuildVersion.ts';
import {isBundledMethod} from '../../src/lib/methods.ts';
import {resetApiVersionState, serveVersion, withAuth} from '../lib/apiVersionUtils.ts';

const baseURL = inject('laneServerBaseURL');
const user = {name: 'John', surname: 'Doe'};

describe('the api version a mixed client compares', () => {
  beforeEach(resetApiVersionState);

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetApiVersionState();
  });

  it('is the one the server was built from', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const clientVersion = getApiBuildVersion();
    expect(clientVersion).toMatch(/^[A-Za-z0-9]{12}$/);
    const response = await fetch(new URL('/sayHello', baseURL), {
      method: 'POST',
      body: JSON.stringify({sayHello: [user], auth: ['XWYZ-TOKEN']}),
    });
    expect(response.headers.get(BUILD_VERSION_HEADER)).toBe(clientVersion);
    const [result] = await routes.sayHello(user).call(withAuth(middlewares));
    expect(result).toBe('Hello John Doe');
  });

  it('costs nothing when it matches: one request, and nothing is asked about', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const watch = serveVersion(getApiBuildVersion()!);
    try {
      const [result] = await routes.sayHello(user).call(withAuth(middlewares));
      expect(result).toBe('Hello John Doe');
      expect(watch.calls()).toBe(1);
      expect(watch.verifyAsks()).toEqual([]);
    } finally {
      watch.restore();
    }
  });

  it('changes nothing when the server sends no version', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const watch = serveVersion(null);
    try {
      const [result, , undeclared] = await routes.sayHello(user).call(withAuth(middlewares));
      expect(result).toBe('Hello John Doe');
      expect(undeclared).toBeUndefined();
      expect(watch.calls()).toBe(1);
      expect(watch.verifyAsks()).toEqual([]);
    } finally {
      watch.restore();
    }
    expect(isBundledMethod('sayHello')).toBe(true);
  });

  it('asks about a route once after a mismatch, riding a call it was making anyway', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    const watch = serveVersion('someOtherAp');
    try {
      // first call: the mismatch is only visible in its response, so it asks nothing
      const [first] = await routes.sayHello(user).call(withAuth(middlewares));
      expect(first).toBe('Hello John Doe');

      // second call: the question rides it, so there is still one request, not two
      const before = watch.calls();
      const [second, , undeclared] = await routes.sayHello(user).call(withAuth(middlewares));
      expect(second).toBe('Hello John Doe');
      expect(watch.calls() - before).toBe(1);
      expect(watch.verifyAsks()).toHaveLength(1);
      expect(watch.verifyAsks()[0]).toContain('sayHello');
      // the server's row for sayHello matches this build's, so nothing was replaced and nothing is reported
      expect(undeclared).toBeUndefined();
      expect(isBundledMethod('sayHello')).toBe(true);

      // third call: sayHello is confirmed, so it is not asked about again
      await routes.sayHello(user).call(withAuth(middlewares));
      expect(watch.verifyAsks()).toHaveLength(1);
    } finally {
      watch.restore();
    }
  });

  it('keeps a bundled row the server no longer agrees with, and reports it once', async () => {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    // The lane server IS this build's server, so forge the difference on the wire; only the sync id decides.
    const watch = serveVersion('someOtherAp', (methods) => {
      if (methods.sayHello) methods.sayHello.syncId = 'changed';
    });
    try {
      await routes.sayHello(user).call(withAuth(middlewares));
      const [result, , undeclared] = await routes.sayHello(user).call(withAuth(middlewares));
      expect(result).toBe('Hello John Doe');
      expect(undeclared?.type).toBe('api-version-mismatch');
      expect(undeclared?.publicMessage).toContain('sayHello');
      // the code calling it was built against it: nothing to swap in, only to report
      expect(isBundledMethod('sayHello')).toBe(true);

      // reported once: a later call carries no second copy of the same news
      const [, , stillUndeclared] = await routes.sayHello(user).call(withAuth(middlewares));
      expect(stillUndeclared).toBeUndefined();
    } finally {
      watch.restore();
    }
  });
});
