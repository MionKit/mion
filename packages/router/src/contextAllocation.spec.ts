/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What a request is allowed to allocate, and what it is allowed to keep. These pin mechanisms, not
// byte counts: a test asserting a number of bytes would be flaky and would be skipped within a
// month, which is worse than no test. Each one fails if the allocation it describes comes back.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {createCallContext} from './callContext.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import type {Routes} from './types/general.ts';

const headers = () => headersFromRecord({});
const newContext = (path: string, rawBody?: string) => createCallContext(path, undefined, {}, headers(), headers(), rawBody);

describe('an unparsed request body is one shared object', () => {
  const mion = createMionRouter();
  const echo = mion.route((ctx, text: string): string => text);

  beforeEach(() => {
    resetRouter();
    mion.initRoutes({echo});
  });

  it('two requests share it, so building a context allocates no body object', () => {
    expect(newContext('/echo').request.body).toBe(newContext('/echo').request.body);
  });

  it('it is frozen, so a write before the parse throws instead of leaking across requests', () => {
    const {body} = newContext('/echo').request;
    expect(Object.isFrozen(body)).toBe(true);
    expect(() => ((body as Record<string, unknown>).echo = ['x'])).toThrow();
  });

  it('a not-found request keeps it, having nothing to parse', () => {
    expect(newContext('/nope').request.body).toBe(newContext('/echo').request.body);
  });

  it('the parse replaces it, so a real body is never the shared one', async () => {
    const shared = newContext('/echo').request.body;
    const context = newContext('/echo', JSON.stringify({echo: ['hi']}));
    await dispatchRoute('/echo', JSON.stringify({echo: ['hi']}), headers(), headers(), {}, {});
    expect(context.request.body).toBe(shared); // untouched: this context was never dispatched
  });
});

describe('shared data is built only when something reads it', () => {
  beforeEach(() => resetRouter());

  it('with no contextDataFactory it materialises on first read, then stays put', () => {
    const mion = createMionRouter();
    mion.initRoutes({echo: mion.route((ctx, text: string): string => text)} satisfies Routes);
    const context = newContext('/echo');
    const first = context.shared;
    expect(first).toEqual({});
    // the accessor replaces itself, so every read after the first is a plain property
    expect(context.shared).toBe(first);
  });

  it('two requests never share it', () => {
    const mion = createMionRouter();
    mion.initRoutes({echo: mion.route((ctx, text: string): string => text)} satisfies Routes);
    expect(newContext('/echo').shared).not.toBe(newContext('/echo').shared);
  });

  it('assigning to it works, without the getter having run first', () => {
    const mion = createMionRouter();
    mion.initRoutes({echo: mion.route((ctx, text: string): string => text)} satisfies Routes);
    const context = newContext('/echo');
    const mine = {user: 'me'};
    context.shared = mine;
    expect(context.shared).toBe(mine);
  });

  it('a configured contextDataFactory still runs exactly once per request', () => {
    let calls = 0;
    const mion = createMionRouter({
      contextDataFactory: () => {
        calls++;
        return {user: null};
      },
    });
    mion.initRoutes({echo: mion.route((ctx, text: string): string => text)} satisfies Routes);
    // registration calls it once of its own accord, so what matters is the delta per request
    const atStart = calls;
    const context = newContext('/echo');
    expect(calls - atStart).toBe(1);
    void context.shared;
    void context.shared;
    expect(calls - atStart).toBe(1);
  });
});

describe('the raw body is released once it is parsed', () => {
  const body = JSON.stringify({echo: ['some body worth releasing']});

  beforeEach(() => resetRouter());

  it('by default nothing holds it after the parse', async () => {
    const mion = createMionRouter();
    mion.initRoutes({echo: mion.route((ctx, text: string): string => text)} satisfies Routes);
    const context = newContext('/echo', body);
    await dispatchRoute('/echo', body, headers(), headers(), {}, {});
    // the dispatched one is the context the route ran against
    const ran = newContext('/echo', body);
    await (await import('./dispatch.ts')).dispatchWithContext(ran, {}, {});
    expect(ran.request.rawBody).toBe('');
    expect(ran.request.body).toEqual(JSON.parse(body));
    expect(context.request.rawBody).toBe(body); // never dispatched, so never released
  });

  it('releaseRawBody false keeps it, for a logger that reads it after the route', async () => {
    const mion = createMionRouter({releaseRawBody: false});
    mion.initRoutes({echo: mion.route((ctx, text: string): string => text)} satisfies Routes);
    const ran = newContext('/echo', body);
    await (await import('./dispatch.ts')).dispatchWithContext(ran, {}, {});
    expect(ran.request.rawBody).toBe(body);
  });
});
