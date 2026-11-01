/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A handler may keep its context past the response without reading nulls or another request's data.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {createCallContext} from '../src/callContext.ts';
import {headersFromRecord} from '../src/lib/headers.ts';
import {toHttpMethod} from '../src/lib/httpMethod.ts';
import type {CallContext, HttpMethod} from '../src/types/context.ts';

type User = {name: string; surname: string};

const call = (name: string): ReturnType<typeof dispatchRoute> =>
  dispatchRoute('/echo', JSON.stringify({echo: [{name, surname: 'b'}]}), headersFromRecord({}), headersFromRecord({}), {});

describe('call context per request', () => {
  beforeEach(() => resetRouter());

  /** Registers one echo route that records the context it ran with. */
  const setup = (seen: CallContext[]): void => {
    const mion = createMionRouter({sharedDataFactory: (): {tag: string} => ({tag: 'none'})});
    mion.initRoutes({
      echo: mion.route((ctx, user: User): User => {
        seen.push(ctx as CallContext);
        ctx.shared.tag = user.name;
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
});

describe('request.method', () => {
  const dispatch = (method?: HttpMethod) =>
    dispatchRoute('/readMethod', '{}', headersFromRecord({}), headersFromRecord({}), {}, {}, undefined, undefined, method);

  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter();
    mion.initRoutes({readMethod: mion.query((ctx: CallContext): string => ctx.request.method)});
  });

  it('is POST when the caller names none', async () => {
    expect((await dispatch()).body.readMethod).toBe('POST');
    expect(createCallContext('/readMethod', undefined, {}, headersFromRecord({}), headersFromRecord({})).request.method).toBe(
      'POST'
    );
  });

  it('is the method the caller passes, and the router refuses none of them', async () => {
    for (const method of ['GET', 'OPTIONS', 'PUT', 'OTHER'] as const)
      expect((await dispatch(method)).body.readMethod).toBe(method);
  });
});

describe('toHttpMethod', () => {
  it('keeps every standard method and QUERY, and maps anything else to OTHER', () => {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH', 'QUERY'])
      expect(toHttpMethod(method)).toBe(method);
    // HTTP methods are case sensitive; a prototype name must not read Object.prototype
    for (const method of ['get', 'Post', 'PROPFIND', 'constructor', '__proto__', '', undefined])
      expect(toHttpMethod(method)).toBe('OTHER');
  });
});
