/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRouteExecutionChain} from './router.ts';
import type {CallContext, MionHeaders, RawRequestBody, BatchExecutionResult} from './types/context.ts';
import type {RouterOptions} from './types/general.ts';
import {StatusCodes, SerializerModes, SerializerCode, FatalError, MION_ROUTES, MION_BATCH_PATH, getRoutePath} from '@mionjs/core';
import {getBatchExecutionChain} from './batches.ts';

// ############# CONTEXT CREATION #############

/** Creates the CallContext for one request */
export function createCallContext(
  path: string,
  opts: RouterOptions,
  reqRawBody: RawRequestBody,
  rawRequest: unknown,
  reqHeaders: MionHeaders,
  respHeaders: MionHeaders,
  reqBodyType?: SerializerCode,
  urlQuery?: string
): CallContext {
  const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
  const {executionChain, batchId, batchRouteIds} = getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts);
  return {
    path: transformedPath,
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
    executionChain,
    shared: opts.contextDataFactory ? opts.contextDataFactory() : {},
    urlQuery,
    batchId,
    batchRouteIds,
  } as CallContext;
}

// ############# HELPER FUNCTIONS #############

function getRequestBodyType(rawBody: RawRequestBody): SerializerCode {
  if (typeof rawBody === 'string') return SerializerModes.stringifyJson;
  if (rawBody instanceof ArrayBuffer || rawBody instanceof Uint8Array)
    throw new Error('mion: a byte request body has no encoder; send the body as a JSON string or a parsed object.');
  return SerializerModes.json;
}

/** Gets the execution chain for a path, handling the batch endpoint specially */
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
  return {executionChain};
}
