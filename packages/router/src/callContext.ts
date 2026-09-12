/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRouteExecutionChain, getRouterOptions, getPlatformMaxBodySize} from './router.ts';
import type {CallContext, MionHeaders, RawRequestBody, BatchExecutionResult, ResolvedRequest} from './types/context.ts';
import type {RouterOptions} from './types/general.ts';
import {StatusCodes, SerializerModes, SerializerCode, FatalError, MION_ROUTES, MION_BATCH_PATH, getRoutePath} from '@mionjs/core';
import {getBatchExecutionChain} from './batches.ts';

// ############# CONTEXT CREATION #############

/**
 * Resolves a request to its execution chain and its request limit, with NO context allocated yet.
 * A streaming adapter calls this BEFORE the body so it can read against `maxBodySize` (the route's
 * own option, else the number its types derived at registration, else the platform adapter's), then
 * builds the context with `createContextFromResolved` once the body is in hand. Keeping the context
 * out of the read is what stops a large body from being written into an already-promoted object,
 * which costs the garbage collector real throughput on node. An unknown path or an unknown batch id
 * resolves to a not-found chain that never reads the body (`readsBody` false) but still runs the
 * global middleFns.
 */
export function resolveRequest(path: string, urlQuery: string | undefined, rawRequest: unknown): ResolvedRequest {
  const opts = getRouterOptions();
  const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
  const {executionChain, maxBodySize, batchId, batchRouteIds} = getExecutionChain(
    path,
    transformedPath,
    urlQuery,
    rawRequest,
    opts
  );
  return {
    path: transformedPath,
    urlQuery,
    executionChain,
    maxBodySize,
    readsBody: executionChain.readsBody,
    batchId,
    batchRouteIds,
  };
}

/** Builds the CallContext of an already-resolved request, with the body when there is one. */
export function createContextFromResolved(
  resolved: ResolvedRequest,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  reqRawBody?: RawRequestBody,
  reqBodyType?: SerializerCode
): CallContext {
  return {
    path: resolved.path,
    request: {
      headers: reqHeaders,
      rawBody: reqRawBody,
      bodyType: reqBodyType ?? getRequestBodyType(reqRawBody),
      body: {},
      thrownErrors: undefined,
    },
    response: {
      statusCode: StatusCodes.OK,
      hasErrors: false,
      fatalError: undefined,
      headers: respHeaders,
      body: {},
      rawBody: '',
      serializer: SerializerModes.json,
    },
    executionChain: resolved.executionChain,
    maxBodySize: resolved.maxBodySize,
    readsBody: resolved.readsBody,
    shared: getRouterOptions().contextDataFactory?.() ?? {},
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
  return createContextFromResolved(resolved, reqHeaders, respHeaders, reqRawBody, reqBodyType);
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
): BatchExecutionResult {
  const hasPrefix = !!opts.basePath;
  // Batch endpoint: the original path ends with the batch key, under any prefix
  // (/mion-batch, /api/v1/mion-batch). The chain is resolved by the id in the query string.
  const isBatchPath = hasPrefix ? originalPath.endsWith(MION_BATCH_PATH) : originalPath === MION_BATCH_PATH;
  if (isBatchPath) return getBatchExecutionChain(rawRequest, opts, urlQuery) ?? notFoundChain(MION_ROUTES.batchNotFound, opts);

  // Normal path - get execution chain from router using transformed path
  const executionChain = getRouteExecutionChain(transformedPath);
  if (!executionChain) return notFoundChain(MION_ROUTES.notFound, opts);
  return {executionChain, maxBodySize: executionChain.maxBodySize ?? getPlatformMaxBodySize()};
}

/** One of mion's own not-found chains (an unknown path, an unknown batch id): registered by
 *  initRouter, so its absence is a bug rather than a request error. */
function notFoundChain(routeId: string, opts: RouterOptions): BatchExecutionResult {
  const executionChain = getRouteExecutionChain(getRoutePath([routeId], opts));
  if (!executionChain) {
    throw new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'not-found',
      publicMessage: 'Not-found route is not registered. This should never happen.',
    });
  }
  return {executionChain, maxBodySize: executionChain.maxBodySize ?? getPlatformMaxBodySize()};
}
