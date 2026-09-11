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

// ############# REQUEST RESOLUTION #############

/**
 * Resolves a request from what an adapter has BEFORE the body: the path, the query string and the
 * raw request (`pathTransform` may read it). One Map lookup gives the execution chain AND the
 * request limit: the route's own option, else the number its types derived at registration, else
 * the platform adapter's `maxBodySize`. The adapter reads the body against `maxBodySize` (node
 * stops the stream, uws stops the native read) and hands the same handle to `dispatchResolved`, so
 * nothing is looked up twice. An unknown path resolves to the not-found chain; an unknown batch id
 * throws a FatalError.
 */
export function resolveRequest(path: string, urlQuery: string | undefined, rawRequest: unknown): ResolvedRequest {
  const opts = getRouterOptions();
  const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
  const resolved = getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts) as ResolvedRequest;
  resolved.path = transformedPath;
  resolved.urlQuery = urlQuery;
  return resolved;
}

// ############# CONTEXT CREATION #############

/** Creates the CallContext for one request from its resolved handle */
export function createCallContext(
  resolved: ResolvedRequest,
  opts: RouterOptions,
  reqRawBody: RawRequestBody,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
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
    shared: opts.contextDataFactory ? opts.contextDataFactory() : {},
    urlQuery: resolved.urlQuery,
    batchId: resolved.batchId,
    batchRouteIds: resolved.batchRouteIds,
  } as CallContext;
}

// ############# HELPER FUNCTIONS #############

function getRequestBodyType(rawBody: RawRequestBody): SerializerCode {
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
  if (isBatchPath) return getBatchExecutionChain(rawRequest, opts, urlQuery);

  // Normal path - get execution chain from router using transformed path
  let executionChain = getRouteExecutionChain(transformedPath);
  if (!executionChain) {
    const notFoundPath = getRoutePath([MION_ROUTES.notFound], opts);
    executionChain = getRouteExecutionChain(notFoundPath);
    if (!executionChain) {
      throw new FatalError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'not-found',
        publicMessage: 'Not-found route is not registered. This should never happen.',
      });
    }
  }
  return {executionChain, maxBodySize: executionChain.maxBodySize ?? getPlatformMaxBodySize()};
}
