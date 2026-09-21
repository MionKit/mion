/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What a streaming adapter pays per request to know the route's request limit BEFORE the body, and to
// have a CallContext after it. Four shapes, same work done: `zero` (what ships) resolves the registered
// chain and allocates nothing before the read, `split` allocated a small resolved object first, `merged`
// makes that object BE the context, `relookup` resolves only the number and looks the route up a SECOND
// time after the read. The server benchmark cannot answer this: its run-to-run drift is a hundred times
// the effect. Run with:  pnpm exec vitest bench --project router resolveStrategy
// `control` is deliberately unrelated: a change that moves it moved the machine, not the code.
// EVERY arm goes through the same local helpers and differs ONLY in what it allocates; letting one arm
// call the real exported API measured a 12% difference that was the module boundary, not the shape.

import {bench, describe} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutionChain, getPlatformMaxBodySize, getRouterOptions} from './router.ts';
import {createCallContext} from './callContext.ts';
import {headersFromRecord} from './lib/headers.ts';
import {Routes} from './types/general.ts';
import type {CallContext, MionHeaders, RawRequestBody} from './types/context.ts';
import type {MethodsExecutionChain} from './types/remoteMethods.ts';
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

/** The path transform and batch check resolveExecutionChain does, factored out so the shapes
 *  differ ONLY in what they allocate. */
function transformPath(path: string, rawReq: unknown): string {
  const opts = getRouterOptions();
  const transformed = opts.pathTransform?.(rawReq, path) || path;
  const isBatchPath = opts.basePath ? path.endsWith(MION_BATCH_PATH) : path === MION_BATCH_PATH;
  if (isBatchPath) throw new Error('unreachable in this bench');
  return transformed;
}

/** The `relookup` shape's resolve: -1 for a path that names no route, so a streaming adapter can
 *  still stop the read at the route's own limit. */
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

/** The `zero` shape's build step, written out rather than called through callContext so every arm reads directly. */
function buildContextFromChain(
  chain: MethodsExecutionChain,
  path: string,
  urlQuery: string | undefined,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  rawBody: RawRequestBody
): CallContext {
  return {
    path: chain.path ?? path,
    request: {headers: reqHeaders, rawBody, bodyType: SerializerModes.stringifyJson, body: {}, thrownErrors: undefined},
    response: {
      statusCode: StatusCodes.OK,
      hasErrors: false,
      fatalError: undefined,
      headers: respHeaders,
      body: {},
      rawBody: '',
      serializer: SerializerModes.json,
    },
    executionChain: chain,
    maxBodySize: chain.maxBodySize,
    readsBody: chain.readsBody,
    shared: getRouterOptions().contextDataFactory?.() ?? {},
    urlQuery,
    batchId: chain.batchId,
    batchRouteIds: chain.batchRouteIds,
  } as unknown as CallContext;
}

describe('resolve before the body, build the context after', () => {
  bench('split (was): a small resolved object before the read, the context after', () => {
    const chain = getRouteExecutionChain(transformPath(PATH, rawRequest))!;
    const resolved = {
      path: chain.path,
      urlQuery: undefined,
      executionChain: chain,
      maxBodySize: chain.maxBodySize,
      readsBody: chain.readsBody,
      batchId: undefined,
      batchRouteIds: undefined,
    };
    const limit = resolved.maxBodySize; // what the read is checked against
    if (limit < 0) throw new Error('unreachable');
    buildContextFromChain(resolved.executionChain, PATH, undefined, headers, headers, BODY);
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

  bench('zero (ships): the registered chain, nothing allocated before the read', () => {
    const chain = getRouteExecutionChain(transformPath(PATH, rawRequest))!;
    const limit = chain.maxBodySize; // what the read is checked against
    if (limit < 0) throw new Error('unreachable');
    buildContextFromChain(chain, PATH, undefined, headers, headers, BODY);
  });

  // unrelated to all four: moves only when the machine moves
  bench('control', () => {
    let total = 0;
    for (let i = 0; i < 200; i++) total += Math.sqrt(i);
    if (total < 0) throw new Error('unreachable');
  });
});
