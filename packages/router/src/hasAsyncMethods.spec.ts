/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The dispatcher skips its awaits when the router has nothing async in it. That is decided by this
// flag, so what counts as async has to be exactly right: a single async member anywhere, including a
// middleFn or a plain function that returns a promise, must turn it on for the whole router.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getHasAsyncMethods} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {Routes} from './types/general.ts';

const mion = createMionRouter({});

const syncOnly = {
  hello: mion.route((): string => 'hello'),
  plainMiddleFn: mion.middleFn((): void => undefined),
} satisfies Routes;

const withAsyncRoute = {
  hello: syncOnly.hello,
  slow: mion.route(async (): Promise<string> => 'slow'),
} satisfies Routes;

const withAsyncMiddleFn = {
  hello: syncOnly.hello,
  gate: mion.middleFn(async (): Promise<void> => undefined),
} satisfies Routes;

const withPromiseArrow = {
  hello: syncOnly.hello,
  // not an AsyncFunction: only the build-time answer knows this one is async
  forward: mion.route((): Promise<string> => Promise.resolve('forwarded')),
} satisfies Routes;

describe('the router should know whether anything in it is async', () => {
  beforeEach(() => resetRouter());

  it('say no when every method is synchronous', () => {
    mion.initRoutes(syncOnly);
    expect(getHasAsyncMethods()).toBe(false);
  });

  it('say yes for a single async route', () => {
    mion.initRoutes(withAsyncRoute);
    expect(getHasAsyncMethods()).toBe(true);
  });

  it('say yes for a single async middleFn', () => {
    mion.initRoutes(withAsyncMiddleFn);
    expect(getHasAsyncMethods()).toBe(true);
  });

  it('say yes for a plain function that returns a promise', () => {
    mion.initRoutes(withPromiseArrow);
    expect(getHasAsyncMethods()).toBe(true);
  });

  it('forget it again on reset', () => {
    mion.initRoutes(withAsyncRoute);
    expect(getHasAsyncMethods()).toBe(true);
    resetRouter();
    expect(getHasAsyncMethods()).toBe(false);
  });

  it('answer correctly either way, sync router', async () => {
    mion.initRoutes(syncOnly);
    const response = await dispatchRoute('/hello', '{}', headersFromRecord({}), headersFromRecord({}), {}, {});
    expect(response.body.hello).toBe('hello');
  });

  it('answer correctly either way, mixed router', async () => {
    mion.initRoutes(withPromiseArrow);
    const sync = await dispatchRoute('/hello', '{}', headersFromRecord({}), headersFromRecord({}), {}, {});
    const asyncish = await dispatchRoute('/forward', '{}', headersFromRecord({}), headersFromRecord({}), {}, {});
    expect(sync.body.hello).toBe('hello');
    expect(asyncish.body.forward).toBe('forwarded');
  });
});
