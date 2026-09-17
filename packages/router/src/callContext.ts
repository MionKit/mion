/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRouteExecutionChain, getNotFoundExecutionChain, getRouterOptions} from './router.ts';
import type {CallContext, MionHeaders, MionRequest, MionResponse, RawRequestBody, ResolvedRequest} from './types/context.ts';
import type {RouterOptions} from './types/general.ts';
import type {MethodsExecutionChain} from './types/remoteMethods.ts';
import {StatusCodes, SerializerModes, SerializerCode, FatalError, MION_ROUTES, MION_BATCH_PATH, Mutable} from '@mionjs/core';
import {getBatchExecutionChain} from './batches.ts';

// ############# ALLOCATION SHAPE (TEMPORARY) #############

/**
 * SCAFFOLDING. Which per-request allocation shape the router builds, read ONCE at module load so
 * no request pays for the choice:
 *   split  - what ships: a small resolved object before the body, the CallContext after it
 *   merged - ONE object, created BEFORE the body, its request / response / shared filled after
 * The two differ only in whether the object that ends up holding the parsed body was alive while
 * the body streamed, which is the thing being measured. `bench servers gcprobe` sets it per arm,
 * so one build serves both and they interleave in one window. Removed with the investigation.
 */
const MERGED_SHAPE = process.env.MION_ALLOC_SHAPE === 'merged';
const ZERO_SHAPE = process.env.MION_ALLOC_SHAPE === 'zero';

// ############# CONTEXT CREATION #############

/**
 * Resolves a request to its execution chain and its request limit, with NO context allocated yet.
 * A streaming adapter calls this BEFORE the body so it can read against `maxBodySize` (the route's
 * own option, else the number its types derived at registration, else the platform adapter's), then
 * builds the context with `createContextFromResolved` once the body is in hand. Keeping the context
 * out of the read is what stops a large body from being written into an already-promoted object,
 * which costs the garbage collector real throughput on node. An unknown path or an unknown batch id
 * resolves to a not-found chain that never reads the body (`readsBody` false) and runs only the
 * global middleFns that declare `alwaysRun`.
 */
export function resolveRequest(path: string, urlQuery: string | undefined, rawRequest: unknown): ResolvedRequest {
  const opts = getRouterOptions();
  const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
  return getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts);
}

/** Builds the CallContext of an already-resolved request, with the body when there is one. */
export function createContextFromResolved(
  resolved: ResolvedRequest,
  path: string,
  urlQuery: string | undefined,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  reqRawBody?: RawRequestBody,
  reqBodyType?: SerializerCode
): CallContext {
  const request: MionRequest = {
    headers: reqHeaders,
    rawBody: reqRawBody,
    bodyType: reqBodyType ?? getRequestBodyType(reqRawBody),
    body: {},
    thrownErrors: undefined,
  } as MionRequest;
  const response: MionResponse = {
    statusCode: StatusCodes.OK,
    hasErrors: false,
    fatalError: undefined,
    headers: respHeaders,
    body: {},
    rawBody: '',
    serializer: SerializerModes.json,
  } as MionResponse;
  const shared = getRouterOptions().contextDataFactory?.() ?? {};

  // SCAFFOLDING: the merged shape fills the slots of the object resolve already returned, rather
  // than allocating a second one. Removed with MERGED_SHAPE.
  if (MERGED_SHAPE) {
    const merged = resolved as unknown as Mutable<CallContext>;
    merged.request = request;
    merged.response = response;
    merged.shared = shared;
    return merged as CallContext;
  }

  // SCAFFOLDING: under the zero shape `resolved` IS the registered chain, so what is constant per
  // chain is read off it and the rest comes from the request. Removed with MERGED_SHAPE.
  if (ZERO_SHAPE) {
    const chain = resolved as unknown as MethodsExecutionChain;
    return {
      path: chain.path ?? path,
      request,
      response,
      executionChain: chain,
      maxBodySize: chain.maxBodySize,
      readsBody: chain.readsBody,
      shared,
      urlQuery,
      batchId: chain.batchId,
      batchRouteIds: chain.batchRouteIds,
    } as CallContext;
  }

  return {
    path: resolved.path,
    request,
    response,
    executionChain: resolved.executionChain,
    maxBodySize: resolved.maxBodySize,
    readsBody: resolved.readsBody,
    shared,
    urlQuery: resolved.urlQuery,
    batchId: resolved.batchId,
    batchRouteIds: resolved.batchRouteIds,
  } as CallContext;
}

/** The one-call form: resolve and build the context together, for a caller that already has the
 *  body (a host that parsed it, `dispatchRoute`, a test). */
export function createCallContext(
  path: string,
  urlQuery: string | undefined,
  rawRequest: unknown,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  reqRawBody?: RawRequestBody,
  reqBodyType?: SerializerCode
): CallContext {
  const resolved = resolveRequest(path, urlQuery, rawRequest);
  return createContextFromResolved(resolved, path, urlQuery, reqHeaders, respHeaders, reqRawBody, reqBodyType);
}

// ############# HELPER FUNCTIONS #############

/** The wire form of a body: a string is stringified JSON, anything else a parsed object. A body
 *  not yet read (a context built before it) reads as an object until the body arrives. */
export function getRequestBodyType(rawBody: RawRequestBody | undefined): SerializerCode {
  if (typeof rawBody === 'string') return SerializerModes.stringifyJson;
  if (rawBody instanceof ArrayBuffer || rawBody instanceof Uint8Array)
    throw new Error('mion: a byte request body has no encoder; send the body as a JSON string or a parsed object.');
  return SerializerModes.json;
}

/** Gets the execution chain (and its request limit) for a path, handling the batch endpoint specially */
function getExecutionChain(
  originalPath: string,
  transformedPath: string,
  urlQuery: string | undefined,
  rawRequest: unknown,
  opts: RouterOptions
): ResolvedRequest {
  const hasPrefix = !!opts.basePath;
  // Batch endpoint: the original path ends with the batch key, under any prefix
  // (/mion-batch, /api/v1/mion-batch). The chain is resolved by the id in the query string.
  const isBatchPath = hasPrefix ? originalPath.endsWith(MION_BATCH_PATH) : originalPath === MION_BATCH_PATH;
  if (isBatchPath) {
    const batchChain = getBatchExecutionChain(rawRequest, opts, urlQuery);
    if (!batchChain) return notFoundChain(MION_ROUTES.batchNotFound, transformedPath, urlQuery);
    return resolvedRequest(batchChain, transformedPath, urlQuery);
  }

  // Normal path - get execution chain from router using transformed path
  const executionChain = getRouteExecutionChain(transformedPath);
  if (!executionChain) return notFoundChain(MION_ROUTES.notFound, transformedPath, urlQuery);
  return resolvedRequest(executionChain, transformedPath, urlQuery);
}

/** The object a resolve hands the adapter to carry across the body read. SCAFFOLDING: under the
 *  merged shape it is born with the context's own slots, so filling them after the read costs no
 *  second object; under the split shape it is the small object that ships. */
function resolvedRequest(executionChain: MethodsExecutionChain, path: string, urlQuery: string | undefined): ResolvedRequest {
  // SCAFFOLDING: the zero shape hands back the REGISTERED chain, so a request allocates nothing at
  // all before its body. Everything the adapter needs to carry across the read (the limit, whether
  // there is a body to read) already rides on it. Removed with MERGED_SHAPE.
  if (ZERO_SHAPE) return executionChain as unknown as ResolvedRequest;
  const {maxBodySize, readsBody, batchId, batchRouteIds} = executionChain;
  if (!MERGED_SHAPE) return {path, urlQuery, executionChain, maxBodySize, readsBody, batchId, batchRouteIds};
  return {
    path,
    urlQuery,
    executionChain,
    maxBodySize,
    readsBody,
    batchId,
    batchRouteIds,
    request: undefined,
    response: undefined,
    shared: undefined,
  } as unknown as ResolvedRequest;
}

/** One of mion's own not-found chains (an unknown path, an unknown batch id): built by
 *  initRouter, so its absence is a bug rather than a request error. */
function notFoundChain(chainId: string, path: string, urlQuery: string | undefined): ResolvedRequest {
  const executionChain = getNotFoundExecutionChain(chainId);
  if (!executionChain) {
    throw new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'not-found',
      publicMessage: 'Not-found chain is not registered. This should never happen.',
    });
  }
  return resolvedRequest(executionChain, path, urlQuery);
}
