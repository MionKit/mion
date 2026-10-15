/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// dispatchMaybeSync answers without a promise only when nothing in the chain is awaited, and must give the
// same response dispatchWithContext gives. These pin when it is sync and that the answers match.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getAlwaysAwait, getRouteExecutable} from '../src/router.ts';
import {dispatchMaybeSync, dispatchWithContext} from '../src/dispatch.ts';
import {createCallContext} from '../src/callContext.ts';
import {headersFromRecord} from '../src/lib/headers.ts';
import type {MionResponse} from '../src/types/context.ts';

// declared sync, answers with a promise anyway
const liar = () => Promise.resolve('answered late') as unknown as string;
const lateFailure = () => Promise.reject(new Error('late boom')) as unknown as string;

const calls: string[] = [];

const newContext = (path: string) => createCallContext(path, undefined, {}, headersFromRecord({}), headersFromRecord({}), '{}');
const summary = (response: MionResponse) => ({
  statusCode: response.statusCode,
  hasErrors: response.hasErrors,
  body: response.body,
});

describe('dispatchMaybeSync on an all-sync router should', () => {
  // a fresh router per test: finding a liar marks it async and turns alwaysAwait on for the whole router
  beforeEach(() => {
    resetRouter();
    calls.length = 0;
    const mion = createMionRouter({});
    mion.initRoutes({
      hello: mion.route((): string => 'hello'),
      thrower: mion.route((): string => {
        throw new Error('boom');
      }),
      liar: mion.route((): string => liar()),
      fallback: {
        before: mion.middleware((): void => {
          calls.push('before');
        }),
        liar: mion.route((): string => {
          calls.push('liar');
          return liar();
        }),
        after: mion.middleware((): void => {
          calls.push('after');
        }),
      },
      rejecting: {
        failing: mion.route((): string => lateFailure()),
        log: mion.middleware(
          (): void => {
            calls.push('log');
          },
          {alwaysRun: true}
        ),
      },
    });
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

  it('run the rest of the chain once after a sync-typed handler answers with a promise', async () => {
    const response = await dispatchMaybeSync(newContext('/fallback/liar'), {});
    expect(response.hasErrors).toBe(false);
    expect(response.body['fallback/liar']).toBe('answered late');
    expect(calls).toEqual(['before', 'liar', 'after']);
  });

  it('record a late rejection and still run the alwaysRun steps after it', async () => {
    const response = await dispatchMaybeSync(newContext('/rejecting/failing'), {});
    expect(response.hasErrors).toBe(true);
    expect(calls).toEqual(['log']);
  });

  it('turn alwaysAwait on once a sync-typed handler turns out async', async () => {
    await dispatchMaybeSync(newContext('/liar'), {});
    expect(getAlwaysAwait()).toBe(true);
    expect(dispatchMaybeSync(newContext('/hello'), {})).toBeInstanceOf(Promise);
  });
});

describe('dispatchMaybeSync with alwaysAwait in effect should', () => {
  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter({});
    mion.initRoutes({
      hello: mion.route((): string => 'hello'),
      slow: mion.route(async (): Promise<string> => 'slow'),
    });
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
  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter({alwaysAwait: false});
    mion.initRoutes({
      hello: mion.route((): string => 'hello'),
      liar: mion.route((): string => liar()),
      slow: mion.route(async (): Promise<string> => 'slow'),
      wrapped: {
        gate: mion.middleware(async (): Promise<void> => undefined),
        inner: mion.route((): string => 'inner'),
      },
    });
  });

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

  it('keep the promise for a sync route wrapped by an async middleware', async () => {
    const response = dispatchMaybeSync(newContext('/wrapped/inner'), {});
    expect(response).toBeInstanceOf(Promise);
    expect((await response).body['wrapped/inner']).toBe('inner');
  });

  it('leave alwaysAwait off after a sync-typed handler turns out async', async () => {
    await dispatchMaybeSync(newContext('/liar'), {});
    expect(getAlwaysAwait()).toBe(false);
  });
});
