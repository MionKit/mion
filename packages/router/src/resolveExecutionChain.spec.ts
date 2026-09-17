/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A streaming adapter needs the route's request limit BEFORE it reads the body, and nothing else.
// resolveExecutionChain answers exactly that by handing back the chain registration already built,
// so a request carries nothing of its own across the read: an object that outlives the read is
// promoted to the old heap and takes the body assigned into it along, which the node lane pays for
// in throughput and memory on a large body.

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain} from './router.ts';
import {resolveExecutionChain, createContextFromChain} from './callContext.ts';
import {headersFromRecord} from './lib/headers.ts';
import {MION_ROUTES} from '@mionjs/core';
import type {CallContext} from './types/context.ts';

let sharedCalls = 0;
const mion = createMionRouter({
  contextDataFactory: () => {
    sharedCalls++;
    return {user: null};
  },
});

const hello = mion.route((ctx: CallContext, name: string): string => `hello ${name}`);

describe('resolveExecutionChain', () => {
  beforeAll(() => {
    resetRouter();
    mion.initRoutes({hello});
    sharedCalls = 0;
  });

  it('answers the registered chain itself, allocating nothing per request', () => {
    const chain = resolveExecutionChain('/hello', undefined, {});
    // the identity IS the claim: resolving twice hands back the one object built at registration,
    // so a request carries nothing of its own across the body read
    expect(chain).toBe(getRouteExecutionChain('/hello'));
    expect(resolveExecutionChain('/hello', undefined, {})).toBe(chain);
  });

  it('answers the request limit and whether there is a body, without building a context', () => {
    const chain = resolveExecutionChain('/hello', undefined, {});
    expect(chain.path).toEqual('/hello');
    expect(chain.readsBody).toBe(true);
    expect(typeof chain.maxBodySize).toEqual('number');
    expect(chain.methods.length).toBeGreaterThan(0);
    // the shared data factory is the context's own cost: it must not run until the body is in hand
    expect(sharedCalls).toEqual(0);
  });

  it('builds the context from the chain, with the body already in hand', () => {
    const chain = resolveExecutionChain('/hello', undefined, {});
    const context = createContextFromChain(
      chain,
      '/hello',
      undefined,
      headersFromRecord({}),
      headersFromRecord({}),
      '{"hello":["John"]}'
    );
    expect(sharedCalls).toEqual(1);
    expect(context.request.rawBody).toEqual('{"hello":["John"]}');
    expect(context.maxBodySize).toEqual(chain.maxBodySize);
    expect(context.readsBody).toBe(true);
    expect(context.executionChain).toBe(chain);
  });

  it('resolves an unknown path to the not-found chain, which reads no body', () => {
    const chain = resolveExecutionChain('/nope', undefined, {});
    expect(chain.readsBody).toBe(false);
    expect(chain.routeIndex).toEqual(-1); // the chain has no route, it only answers
    expect(chain.methods[0].id).toEqual(MION_ROUTES.notFound);
    // a shared chain answers for many paths, so it carries none of its own
    expect(chain.path).toBeUndefined();
  });

  it('a shared not-found chain takes the path the request brought', () => {
    const chain = resolveExecutionChain('/nope', undefined, {});
    const context = createContextFromChain(chain, '/nope', undefined, headersFromRecord({}), headersFromRecord({}));
    expect(context.path).toEqual('/nope');
  });
});
