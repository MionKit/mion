/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The router used to reuse CallContext objects between requests, from a pool sized by
// `maxContextPoolSize` (100 by default). Releasing a context wiped it, so a handler that kept the
// context past its response read nulls, and once the shell was handed to the next request it read
// that request's data instead. Pooling saved ~10 bytes of short-lived garbage per request and no
// measurable time, so it was removed. These tests pin what that restored: one context per request,
// still readable after the response.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import type {CallContext} from './types/context.ts';

type User = {name: string; surname: string};

const call = (name: string): ReturnType<typeof dispatchRoute> =>
  dispatchRoute('/echo', JSON.stringify({echo: [{name, surname: 'b'}]}), headersFromRecord({}), headersFromRecord({}), {});

describe('call context per request', () => {
  beforeEach(() => resetRouter());

  /** Registers one echo route that records the context it ran with. */
  const setup = (seen: CallContext[]): void => {
    const mion = createMionRouter({skipClientRoutes: true, contextDataFactory: () => ({tag: 'none'})});
    mion.initRoutes({
      echo: mion.route((ctx, user: User): User => {
        seen.push(ctx as CallContext);
        (ctx.shared as {tag: string}).tag = user.name;
        return user;
      }),
    });
  };

  it('gives every request its own context', async () => {
    const seen: CallContext[] = [];
    setup(seen);
    await call('first');
    await call('second');
    expect(seen.length).toBe(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0]!.request).not.toBe(seen[1]!.request);
    expect(seen[0]!.response).not.toBe(seen[1]!.response);
  });

  it('leaves the context readable after the response is returned', async () => {
    const seen: CallContext[] = [];
    setup(seen);
    const response = await call('first');
    const ctx = seen[0]!;
    // Under pooling all three of these read null / undefined the moment dispatch returned.
    expect(ctx.shared).toEqual({tag: 'first'});
    expect(ctx.request.body).toEqual({echo: [{name: 'first', surname: 'b'}]});
    expect(ctx.response).toBe(response);
  });

  it('keeps a held context untouched by later requests', async () => {
    const seen: CallContext[] = [];
    setup(seen);
    await call('first');
    await call('second');
    // The first handler's context still describes the first request, not the second.
    expect(seen[0]!.shared).toEqual({tag: 'first'});
    expect(seen[1]!.shared).toEqual({tag: 'second'});
  });

  it('keeps concurrent requests apart', async () => {
    const seen: CallContext[] = [];
    setup(seen);
    const names = Array.from({length: 50}, (unused, i) => `user${i}`);
    await Promise.all(names.map((name) => call(name)));
    expect(seen.length).toBe(50);
    expect(new Set(seen).size).toBe(50);
    expect(seen.map((ctx) => (ctx.shared as {tag: string}).tag).sort()).toEqual([...names].sort());
  });

  it('rejects the old pooling option at the type level', () => {
    // @ts-expect-error the option is gone, so the key is not one RouterOptions knows
    const old = (): unknown => createMionRouter({maxContextPoolSize: 100});
    expect(typeof old).toBe('function');
  });
});
