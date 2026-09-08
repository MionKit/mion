/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// `isAsync` says whether a handler answers with a promise. It cannot be read off the return runtype:
// HandlerReturn awaits it, so an async route and a sync one share a return type id. The answer is
// decided by the type checker at the call site and injected as its own literal id, which is what
// these pin. A wrong answer here is what would let dispatch skip an await it needed.

import {describe, it, expect} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutable, getMiddleFnExecutable} from './router.ts';
import {Routes} from './types/general.ts';
import {HeadersSubset} from '@mionjs/core';

const mion = createMionRouter({});

const routes = {
  syncRoute: mion.route((): string => 'x'),
  asyncRoute: mion.route(async (): Promise<string> => 'x'),
  // NOT an AsyncFunction, so the runtime check calls it sync. The type says otherwise.
  promiseArrow: mion.route((): Promise<string> => Promise.resolve('x')),
  // a union with a promise arm still answers with a promise
  maybePromise: mion.route((_ctx, now: boolean): string | Promise<string> => (now ? 'x' : Promise.resolve('x'))),
  // an object that merely has a `then` method is NOT a promise
  // oxlint-disable-next-line unicorn/no-thenable -- the point of this test: data with a `then` key must NOT be mistaken for a promise
  thenableReturn: mion.route((): {then: string} => ({then: 'not a method'})),
  syncMiddleFn: mion.middleFn((): void => undefined),
  asyncMiddleFn: mion.middleFn(async (): Promise<void> => undefined),
  promiseHeadersFn: mion.headersFn((_ctx, _h: HeadersSubset<'authorization'>): Promise<void> => Promise.resolve()),
} satisfies Routes;

resetRouter();
mion.initRoutes(routes);

const isAsyncOf = (id: string): boolean | undefined => (getRouteExecutable(id) ?? getMiddleFnExecutable(id))?.isAsync;

describe('isAsync should', () => {
  it('be true for an async function', () => {
    expect(isAsyncOf('asyncRoute')).toBe(true);
    expect(isAsyncOf('asyncMiddleFn')).toBe(true);
  });

  it('be true for a plain function that returns a promise', () => {
    // the case handler.constructor.name cannot see
    expect(isAsyncOf('promiseArrow')).toBe(true);
    expect(isAsyncOf('promiseHeadersFn')).toBe(true);
  });

  it('be true when only one arm of the return union is a promise', () => {
    expect(isAsyncOf('maybePromise')).toBe(true);
  });

  it('be false for a sync handler', () => {
    expect(isAsyncOf('syncRoute')).toBe(false);
    expect(isAsyncOf('syncMiddleFn')).toBe(false);
  });

  it('be false for a handler returning an object that merely has a then property', () => {
    expect(isAsyncOf('thenableReturn')).toBe(false);
  });
});
