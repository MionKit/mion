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

/** Resolves a request to the REGISTERED chain that answers it, allocating NOTHING, so a streaming adapter
 *  calls it BEFORE the body to read against `chain.maxBodySize` and `createContextFromChain` after.
 *  Nothing of the request's own may survive the read: such an object is promoted to the old heap and the
 *  parsed body attached to it is promoted with it, which on a 4 MB body costs garbage-collector throughput.
 *  The chain is SHARED and long-lived: mutating what this returns damages the route for the whole process.
 *  An unknown path or batch id resolves to a not-found chain that never reads the body (`readsBody` false)
 *  and runs only the global middlewares that declare `alwaysRun`. */
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
    // The parse replaces this wholesale, so a fresh object per request was thrown away unread. Shared and
    // FROZEN: a write before the parse would be a silent cross-request leak, and is now a throw.
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
    // Eager: a lazy accessor measured 2x the heap and 6% less throughput at 1 KB, because defineProperty
    // pushes every context into V8's dictionary mode.
    shared: contextDataFactory ? contextDataFactory() : {},
    urlQuery,
    batchId: chain.batchId,
    batchRouteIds: chain.batchRouteIds,
  } as CallContext;
}

const EMPTY_BODY: Readonly<AnyObject> = Object.freeze({});

/** The one-call form, for a caller that already has the body (a host that parsed it, `dispatchRoute`, a test). */
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

function getExecutionChain(
  originalPath: string,
  transformedPath: string,
  urlQuery: string | undefined,
  rawRequest: unknown,
  opts: RouterOptions
): MethodsExecutionChain {
  const hasPrefix = !!opts.basePath;
  // the batch key ends the path under any prefix (/mion-batch, /api/v1/mion-batch); the query id picks the chain
  const isBatchPath = hasPrefix ? originalPath.endsWith(MION_BATCH_PATH) : originalPath === MION_BATCH_PATH;
  if (isBatchPath) {
    return getBatchExecutionChain(rawRequest, opts, urlQuery) ?? notFoundChain(MION_ROUTES.batchNotFound);
  }

  return getRouteExecutionChain(transformedPath) ?? notFoundChain(MION_ROUTES.notFound);
}

/** mion's own not-found chains are built by initRouter, so an absent one is a bug, not a request error. */
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
