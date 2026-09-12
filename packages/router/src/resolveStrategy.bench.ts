/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What a streaming adapter pays per request to know the route's request limit BEFORE the body, and
// to have a CallContext after it. Three shapes, same work done:
//   split    - resolveRequest() returns a small object, createContextFromResolved() builds the
//              context after the read (what ships)
//   merged   - ONE object: the resolved shape IS the context, its request / response / shared
//              slots filled in after the read
//   relookup - the resolve returns only the number, and the context is built by a SECOND route
//              lookup after the read (an extra Map lookup instead of the small object)
// The server benchmark cannot answer this: its run-to-run drift is a hundred times the effect.
// Run with:  pnpm exec vitest bench --project router resolveStrategy
//
// `control` is deliberately unrelated. A change that moves it moved the machine, not the code.

import {bench, describe} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain, getPlatformMaxBodySize, getRouterOptions} from './router.ts';
import {resolveRequest, createContextFromResolved, createCallContext} from './callContext.ts';
import {headersFromRecord} from './lib/headers.ts';
import {Routes} from './types/general.ts';
import type {CallContext, MionHeaders, RawRequestBody, ResolvedRequest} from './types/context.ts';
import {StatusCodes, SerializerModes, MION_BATCH_PATH} from '@mionjs/core';

const mion = createMionRouter({});

interface Item {
  id: string;
  name: string;
  tags: string[];
  score: number;
}

const routes = {
  echo: mion.route((_ctx, item: Item): Item => item),
} satisfies Routes;

resetRouter();
mion.initRoutes(routes);

const PATH = '/echo';
const BODY = JSON.stringify({echo: [{id: 'a1', name: 'John', tags: ['x', 'y'], score: 42}]});
const rawRequest = {};
const headers = headersFromRecord({});

/** The steps every shape performs before it can look a route up: the path transform and the batch
 *  check resolveRequest does. Factored out so the three shapes differ ONLY in what they allocate. */
function transformPath(path: string, rawReq: unknown): string {
  const opts = getRouterOptions();
  const transformed = opts.pathTransform?.(rawReq, path) || path;
  const isBatchPath = opts.basePath ? path.endsWith(MION_BATCH_PATH) : path === MION_BATCH_PATH;
  if (isBatchPath) throw new Error('unreachable in this bench');
  return transformed;
}

/** The number-only resolve of the `relookup` shape: one Map lookup, -1 for a path that names no
 *  route, so a streaming adapter can still stop the read at the route's own limit. */
function getRouteMaxBody(path: string, rawReq: unknown): number {
  const chain = getRouteExecutionChain(transformPath(path, rawReq));
  if (!chain) return -1;
  return chain.maxBodySize ?? getPlatformMaxBodySize();
}

/** The `merged` shape: one object carrying the context slots from the start, filled after the read. */
function resolveAsContext(path: string, rawReq: unknown): CallContext {
  const transformed = transformPath(path, rawReq);
  const chain = getRouteExecutionChain(transformed)!;
  return {
    path: transformed,
    urlQuery: undefined,
    executionChain: chain,
    maxBodySize: chain.maxBodySize ?? getPlatformMaxBodySize(),
    readsBody: chain.readsBody,
    batchId: undefined,
    batchRouteIds: undefined,
    request: undefined,
    response: undefined,
    shared: undefined,
  } as unknown as CallContext;
}

function fillContext(ctx: CallContext, reqHeaders: MionHeaders, respHeaders: MionHeaders, rawBody: RawRequestBody): CallContext {
  const mutable = ctx as any;
  mutable.request = {
    headers: reqHeaders,
    rawBody,
    bodyType: SerializerModes.stringifyJson,
    body: {},
    thrownErrors: undefined,
  };
  mutable.response = {
    statusCode: StatusCodes.OK,
    hasErrors: false,
    fatalError: undefined,
    headers: respHeaders,
    body: {},
    rawBody: '',
    serializer: SerializerModes.json,
  };
  mutable.shared = getRouterOptions().contextDataFactory?.() ?? {};
  return ctx;
}

describe('resolve before the body, build the context after', () => {
  bench('split (ships): small resolved object, then the context', () => {
    const resolved: ResolvedRequest = resolveRequest(PATH, undefined, rawRequest);
    const limit = resolved.maxBodySize; // what the read is checked against
    if (limit < 0) throw new Error('unreachable');
    createContextFromResolved(resolved, headers, headers, BODY, SerializerModes.stringifyJson);
  });

  bench('merged: one object, its context slots filled after the read', () => {
    const ctx = resolveAsContext(PATH, rawRequest);
    const limit = ctx.maxBodySize;
    if (limit < 0) throw new Error('unreachable');
    fillContext(ctx, headers, headers, BODY);
  });

  bench('relookup: the number only, then a second lookup builds the context', () => {
    const limit = getRouteMaxBody(PATH, rawRequest);
    if (limit < 0) throw new Error('unreachable');
    createCallContext(PATH, undefined, rawRequest, headers, headers, BODY, SerializerModes.stringifyJson);
  });

  // unrelated to all three: moves only when the machine moves
  bench('control', () => {
    let total = 0;
    for (let i = 0; i < 200; i++) total += Math.sqrt(i);
    if (total < 0) throw new Error('unreachable');
  });
});
