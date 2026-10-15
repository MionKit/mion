/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// dispatchMaybeSync answers without a promise only when nothing in the chain is awaited, and must give the
// same response dispatchWithContext gives. These pin when it is sync and that the answers match.

import {describe, it, expect, beforeEach, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter, getAlwaysAwait, getRouteExecutable} from '../src/router.ts';
import {dispatchMaybeSync, dispatchWithContext} from '../src/dispatch.ts';
import {createCallContext} from '../src/callContext.ts';
import {headersFromRecord} from '../src/lib/headers.ts';
import {Routes} from '../src/types/general.ts';
import type {MionResponse} from '../src/types/context.ts';

const mion = createMionRouter({});

// declared sync, answers with a promise anyway
const liar = () => Promise.resolve('answered late') as unknown as string;

const calls: string[] = [];
const syncOnly = {
  hello: mion.route((): string => 'hello'),
  thrower: mion.route((): string => {
    throw new Error('boom');
  }),
  liar: mion.route((): string => liar()),
  chain: {
    first: mion.middleware((): void => {
      calls.push('first');
    }),
    order: mion.route((): string[] => calls),
  },
} satisfies Routes;

const withAsyncRoute = {
  hello: syncOnly.hello,
  slow: mion.route(async (): Promise<string> => 'slow'),
} satisfies Routes;

const newContext = (path: string) => createCallContext(path, undefined, {}, headersFromRecord({}), headersFromRecord({}), '{}');
const summary = (response: MionResponse) => ({
  statusCode: response.statusCode,
  hasErrors: response.hasErrors,
  body: response.body,
});

describe('dispatchMaybeSync on an all-sync router should', () => {
  beforeEach(() => {
    resetRouter();
    mion.initRoutes(syncOnly);
    calls.length = 0;
  });

  it('answer without a promise', () => {
    expect(getAlwaysAwait()).toBe(false);
    const response = dispatchMaybeSync(newContext('/hello'), {});
    expect(response).not.toBeInstanceOf(Promise);
    expect((response as MionResponse).body.hello).toBe('hello');
  });

  it('give the same response as dispatchWithContext', async () => {
    const sync = dispatchMaybeSync(newContext('/hello'), {}) as MionResponse;
    const async = await dispatchWithContext(newContext('/hello'), {});
    expect(summary(sync)).toEqual(summary(async));
  });

  it('record a thrown error the same way dispatchWithContext does', async () => {
    const sync = dispatchMaybeSync(newContext('/thrower'), {}) as MionResponse;
    expect(sync).not.toBeInstanceOf(Promise);
    expect(sync.hasErrors).toBe(true);
    const async = await dispatchWithContext(newContext('/thrower'), {});
    expect(summary(sync)).toEqual(summary(async));
  });

  it('run a middleware chain in order without a promise', () => {
    const response = dispatchMaybeSync(newContext('/chain/order'), {}) as MionResponse;
    expect(response).not.toBeInstanceOf(Promise);
    expect(calls).toEqual(['first']);
  });

  it('wait for a sync-typed handler that answers with a promise, then stay async for it', async () => {
    const first = dispatchMaybeSync(newContext('/liar'), {});
    expect(first).toBeInstanceOf(Promise);
    const firstResponse = await first;
    expect(firstResponse.hasErrors).toBe(false);
    // a promise here would mean it was serialized into the body as the answer
    expect(firstResponse.body.liar).toBe('answered late');
    expect(getRouteExecutable('liar')?.isAsync).toBe(true);

    const second = dispatchMaybeSync(newContext('/liar'), {});
    expect(second).toBeInstanceOf(Promise);
    expect((await second).body.liar).toBe('answered late');
  });
});

describe('dispatchMaybeSync with alwaysAwait in effect should', () => {
  beforeEach(() => {
    resetRouter();
    mion.initRoutes(withAsyncRoute);
  });

  it('keep the promise even for a sync route', async () => {
    expect(getAlwaysAwait()).toBe(true);
    const response = dispatchMaybeSync(newContext('/hello'), {});
    expect(response).toBeInstanceOf(Promise);
    expect((await response).body.hello).toBe('hello');
  });

  it('answer an async route', async () => {
    const response = await dispatchMaybeSync(newContext('/slow'), {});
    expect(response.body.slow).toBe('slow');
  });
});

describe('dispatchMaybeSync with alwaysAwait off should', () => {
  beforeAll(() => {
    resetRouter();
    const lean = createMionRouter({alwaysAwait: false});
    lean.initRoutes({
      hello: lean.route((): string => 'hello'),
      slow: lean.route(async (): Promise<string> => 'slow'),
    });
  });

  afterAll(() => resetRouter());

  it('answer a sync route without a promise, even in a router with async routes', () => {
    expect(getAlwaysAwait()).toBe(false);
    const response = dispatchMaybeSync(newContext('/hello'), {});
    expect(response).not.toBeInstanceOf(Promise);
    expect((response as MionResponse).body.hello).toBe('hello');
  });

  it('answer an async route with a promise', async () => {
    const response = dispatchMaybeSync(newContext('/slow'), {});
    expect(response).toBeInstanceOf(Promise);
    expect((await response).body.slow).toBe('slow');
  });
});
