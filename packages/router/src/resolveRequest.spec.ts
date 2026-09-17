/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A streaming adapter needs the route's request limit BEFORE it reads the body, and nothing else.
// resolveRequest answers exactly that and allocates no context: a context created before the read
// outlives it, is promoted to the old heap, and takes the body assigned into it along, which the
// node lane pays for in throughput and memory on a large body.

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter, resetRouter} from './router.ts';
import {resolveRequest, createContextFromResolved} from './callContext.ts';
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

// SCAFFOLDING guard: this file asserts on the internals of the object resolve hands back, so it
// pins the SHIPPING shape. The probe's other arms change exactly those internals, and their
// correctness is covered by the rest of this suite plus the benchmark harness's own gate (a lane
// must answer correctly and reject an invalid payload before it is measured). Removed when the
// investigation settles on one shape.
describe.skipIf(process.env.MION_ALLOC_SHAPE)('resolveRequest', () => {
  beforeAll(() => {
    resetRouter();
    mion.initRoutes({hello});
    sharedCalls = 0;
  });

  it('answers the chain and the request limit without building a context', () => {
    const resolved = resolveRequest('/hello', undefined, {});
    expect(resolved.path).toEqual('/hello');
    expect(resolved.readsBody).toBe(true);
    expect(typeof resolved.maxBodySize).toEqual('number');
    expect(resolved.executionChain.methods.length).toBeGreaterThan(0);
    // the shared data factory is the context's own cost: it must not run until the body is in hand
    expect(sharedCalls).toEqual(0);
  });

  it('builds the context from the resolved request, with the body already in hand', () => {
    const resolved = resolveRequest('/hello', undefined, {});
    const context = createContextFromResolved(
      resolved,
      '/hello',
      undefined,
      headersFromRecord({}),
      headersFromRecord({}),
      '{"hello":["John"]}'
    );
    expect(sharedCalls).toEqual(1);
    expect(context.request.rawBody).toEqual('{"hello":["John"]}');
    expect(context.maxBodySize).toEqual(resolved.maxBodySize);
    expect(context.readsBody).toBe(true);
    expect(context.executionChain).toBe(resolved.executionChain);
  });

  it('resolves an unknown path to the not-found chain, which reads no body', () => {
    const resolved = resolveRequest('/nope', undefined, {});
    const chain = resolved.executionChain;
    expect(resolved.readsBody).toBe(false);
    expect(chain.routeIndex).toEqual(-1); // the chain has no route, it only answers
    expect(chain.methods[0].id).toEqual(MION_ROUTES.notFound);
  });
});
