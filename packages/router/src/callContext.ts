/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRouteExecutionChain, getNotFoundExecutionChain, getRouterOptions} from './router.ts';
import type {CallContext, MionHeaders, MionRequest, MionResponse, RawRequestBody} from './types/context.ts';
import type {RouterOptions} from './types/general.ts';
import type {MethodsExecutionChain} from './types/remoteMethods.ts';
import {StatusCodes, SerializerModes, SerializerCode, FatalError, MION_ROUTES, MION_BATCH_PATH} from '@mionjs/core';
import type {AnyObject} from '@mionjs/core';
import {getBatchExecutionChain} from './batches.ts';

// ############# CONTEXT CREATION #############

/**
 * Resolves a request to the REGISTERED execution chain that answers it, allocating NOTHING: the
 * chain is the object built at registration, and everything constant per chain rides on it (its
 * path, the request limit its types settled, its batch id). A streaming adapter calls this BEFORE
 * the body so it can read against `chain.maxBodySize`, then builds the context with
 * `createContextFromChain` once the body is in hand.
 *
 * Nothing of the request's own being alive during the read is the point, not merely allocating
 * less. A per-request object that survives the read is promoted to the old heap, and the parsed
 * body later attached to it is then promoted with it instead of dying young, which on a 4 MB body
 * costs real garbage-collector throughput.
 *
 * The chain is SHARED and long-lived: mutating what this returns damages the route for the rest of
 * the process, not one request. An unknown path or an unknown batch id resolves to a not-found
 * chain that never reads the body (`readsBody` false) and runs only the global middleFns that
 * declare `alwaysRun`.
 */
export function resolveExecutionChain(path: string, urlQuery: string | undefined, rawRequest: unknown): MethodsExecutionChain {
  const opts = getRouterOptions();
  const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
  return getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts);
}

/** Builds the CallContext of an already-resolved request, with the body when there is one.
 *  `path` and `urlQuery` are the REQUEST's own: a registered route chain carries its own path and
 *  that one wins, but mion's not-found chains and a merged batch chain each answer for many paths,
 *  so those take what the request brought. */
export function createContextFromChain(
  chain: MethodsExecutionChain,
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
    // The parse replaces this wholesale, so the fresh object every request allocated here was
    // thrown away unread. Shared, and FROZEN: a write before the parse would have been a silent
    // cross-request leak, and is now a throw.
    body: EMPTY_BODY,
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
  const contextDataFactory = getRouterOptions().contextDataFactory;

  return {
    path: chain.path ?? path,
    request,
    response,
    executionChain: chain,
    maxBodySize: chain.maxBodySize,
    readsBody: chain.readsBody,
    // Eager, and deliberately so: building it lazily through an accessor measured 2x the heap and
    // 6% less throughput at 1 KB, because defineProperty pushes every context into V8's dictionary
    // mode. One empty object per request is far cheaper than a context that is slow to touch.
    shared: contextDataFactory ? contextDataFactory() : {},
    urlQuery,
    batchId: chain.batchId,
    batchRouteIds: chain.batchRouteIds,
  } as CallContext;
}

/** One frozen object stands in for every unparsed request body. */
const EMPTY_BODY: Readonly<AnyObject> = Object.freeze({});

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
  const chain = resolveExecutionChain(path, urlQuery, rawRequest);
  return createContextFromChain(chain, path, urlQuery, reqHeaders, respHeaders, reqRawBody, reqBodyType);
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
): MethodsExecutionChain {
  const hasPrefix = !!opts.basePath;
  // Batch endpoint: the original path ends with the batch key, under any prefix
  // (/mion-batch, /api/v1/mion-batch). The chain is resolved by the id in the query string.
  const isBatchPath = hasPrefix ? originalPath.endsWith(MION_BATCH_PATH) : originalPath === MION_BATCH_PATH;
  if (isBatchPath) {
    return getBatchExecutionChain(rawRequest, opts, urlQuery) ?? notFoundChain(MION_ROUTES.batchNotFound);
  }

  // Normal path - get execution chain from router using transformed path
  return getRouteExecutionChain(transformedPath) ?? notFoundChain(MION_ROUTES.notFound);
}

/** One of mion's own not-found chains (an unknown path, an unknown batch id): built by
 *  initRouter, so its absence is a bug rather than a request error. */
function notFoundChain(chainId: string): MethodsExecutionChain {
  const executionChain = getNotFoundExecutionChain(chainId);
  if (!executionChain) {
    throw new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'not-found',
      publicMessage: 'Not-found chain is not registered. This should never happen.',
    });
  }
  return executionChain;
}
