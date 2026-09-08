/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// With alwaysAwait off the chain stops awaiting steps the build proved synchronous. These pin the
// two things that would break if the proof were wrong: a promise-returning handler that is not an
// AsyncFunction must still resolve, and a returned object that merely has a `then` property must be
// written to the body untouched rather than treated as a promise.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {Routes} from './types/general.ts';

interface Thenable {
  then: string;
  id: number;
}

const mion = createMionRouter({alwaysAwait: false});

const routes = {
  syncRoute: mion.route((): string => 'sync'),
  asyncRoute: mion.route(async (): Promise<string> => 'async'),
  // NOT an AsyncFunction: only the injected build-time answer knows this one answers with a promise
  promiseArrow: mion.route((): Promise<string> => Promise.resolve('from a promise')),
  // data that happens to have a `then` key, which a duck-typed promise check would have unwrapped
  thenableData: mion.route((): Thenable => ({then: 'not a method', id: 7})),
  order: mion.route((): string[] => calls),
} satisfies Routes;

const calls: string[] = [];
const chain = {
  firstSync: mion.middleFn((): void => {
    calls.push('first');
  }),
  secondAsync: mion.middleFn(async (): Promise<void> => {
    calls.push('second');
  }),
  thirdSync: mion.middleFn((): void => {
    calls.push('third');
  }),
  order: routes.order,
} satisfies Routes;

resetRouter();
mion.initRoutes({...routes, ...chain});

const call = (path: string, body = '{}') => dispatchRoute(path, body, headersFromRecord({}), headersFromRecord({}), {}, {});

describe('with alwaysAwait off the chain should', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('still resolve a plain function that returns a promise', async () => {
    const response = await call('/promiseArrow');
    expect(response.hasErrors).toBe(false);
    expect(response.body.promiseArrow).toBe('from a promise');
  });

  it('still resolve an async function', async () => {
    const response = await call('/asyncRoute');
    expect(response.body.asyncRoute).toBe('async');
  });

  it('leave a value that merely has a then property untouched', async () => {
    const response = await call('/thenableData');
    expect(response.body.thenableData).toEqual({then: 'not a method', id: 7});
  });

  it('run a mixed sync and async chain in declaration order', async () => {
    const response = await call('/order');
    expect(response.hasErrors).toBe(false);
    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('answer a plain sync route', async () => {
    const response = await call('/syncRoute');
    expect(response.body.syncRoute).toBe('sync');
  });
});
