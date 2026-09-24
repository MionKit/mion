/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionjs/router';
import {type MethodWithJitFns, RpcError, isRpcError, MION_ROUTES, HandlerType} from '@mionjs/core';
import type {MionClientRequest} from '../request.ts';
import {metadataCacheHooks} from './metadataFromServerLoader.ts';
import {useMethodFns} from './methods.ts';
import {hasHeadersSubsetParam} from './headers.ts';
import {ClientOptions} from '../types.ts';

export type SerializedBody = string;

export type ContentType = 'application/json; charset=utf-8';

export interface SerializedRequest {
  body: SerializedBody;
  contentType: ContentType;
}

// ################################## SERIALIZE ##################################

/** `optimistic`: the route's metadata is still being fetched, so no compiled encoders exist yet. */
export function serializeRequestBody(req: MionClientRequest<any, any>, optimistic = false): SerializedRequest {
  const body = optimistic ? serializeJSonBodyOptimistic(req) : serializeJsonBody(req);
  return {body, contentType: 'application/json; charset=utf-8'};
}

function serializeJsonBody(req: MionClientRequest<any, any>): string {
  const props: string[] = [];
  const subRequestIds = Object.keys(req.subRequestList);

  for (let i = 0; i < subRequestIds.length; i++) {
    const id = subRequestIds[i];
    const subRequest = req.subRequestList[id];
    if (!subRequest) continue;
    let params = subRequest.params;
    // Plain JSON IS the wire form of mion's own middlewares (they parse their params as a clone), and a client compiles none.
    if (id === MION_ROUTES.methodsMetadata || id === MION_ROUTES.syncRoutes) {
      props.push(`${JSON.stringify(id)}:${JSON.stringify(params)}`);
      continue;
    }
    const method = useMethodFns(id);
    if (method.type === HandlerType.headersMiddleware && method.headersParam) {
      params = getParamsWithoutHeadersSubset(params);
    }
    try {
      const jsonValue = stringifyHandlerParams(method, params, req.options.validateParams);
      if (!jsonValue) continue;
      props.push(`${JSON.stringify(id)}:${jsonValue}`);
    } catch (e: any) {
      const err = new RpcError({
        type: 'json-stringify-request-error',
        publicMessage: `Failed to stringify params for handler ${id}`,
        originalError: e,
      });
      throw err;
    }
  }

  return `{${props.join(',')}}`;
}

/** Serializes the body without compiled functions, on the plain wire forms every server decoder
 * accepts. A headers middleware's HeadersSubset goes out as HTTP headers, never in the body. */
function serializeJSonBodyOptimistic(req: MionClientRequest<any, any>): string {
  const body: Record<string, any> = {};
  const subRequestIds = Object.keys(req.subRequestList);
  for (const id of subRequestIds) {
    const subRequest = req.subRequestList[id];
    if (!subRequest) continue;
    const params = hasHeadersSubsetParam(id, subRequest.params)
      ? getParamsWithoutHeadersSubset(subRequest.params)
      : subRequest.params;
    if (params?.length) body[id] = params;
  }
  return JSON.stringify(body, wireFormReplacer);
}

/** Writes the params with the strategy the server compiled. */
function stringifyHandlerParams(method: MethodWithJitFns, params: any[], validated: boolean): string {
  if (!method.paramsCount) return '';
  const {json, isType} = method.paramsJitFns;
  if (json.encode.isNoop) return JSON.stringify(params);
  // with local validation off a wrong-typed value must still reach the server's validation, and the
  // compiled encoders assume the type, so it rides the plain wire form instead
  if (!validated && !isType.isNoop && !isType.fn(params)) return JSON.stringify(params, wireFormReplacer);
  const write = (): string => JSON.stringify(json.encode.fn(params));
  // the compiled encoder rejects anything but the real params (a batch mapping's `null` placeholder,
  // a wrong-typed value), so those fall back to the plain wire forms the server decoders accept
  try {
    return write();
  } catch {
    return JSON.stringify(params, wireFormReplacer);
  }
}

/** The plain wire forms the server's JSON decoders accept, applied recursively. Date and Temporal need no
 *  arm, their own toJSON writes the text their decoders rebuild from. A union member's `[index, value]`
 *  envelope is deliberately not written: the index needs the metadata, and every transforming decoder guards
 *  its wire shape, so the server refuses the bare value instead of misreading it and the client retries. */
export function wireFormReplacer(this: unknown, key: string, value: unknown): unknown {
  if (value instanceof Map) return [...value];
  if (value instanceof Set) return [...value];
  if (typeof value === 'bigint') return value.toString();
  return value;
}

// ################################## DE-SERIALIZE ##################################

export async function deserializeResponseBody(
  response: Response,
  options: ClientOptions,
  liftMetadataRows = false
): Promise<ResponseBody> {
  let parsedBody: any;
  const contentType = response.headers.get('content-type')?.toLowerCase();
  switch (true) {
    case !!contentType?.includes('application/json'):
      parsedBody = await deserializeJsonResponseBody(response, options, liftMetadataRows);
      break;
    default:
      throw new RpcError({
        type: 'unsupported-content-type',
        publicMessage: `Unsupported response content-type: '${contentType || 'none'}'`,
      });
  }
  return parsedBody;
}

async function deserializeJsonResponseBody(response: Response, options: ClientOptions, liftMetadataRows: boolean) {
  try {
    const parsedBody = await response.json();
    // Lifted before the cache hook below, which consumes the same slot: these rows belong to this call, not the store.
    // Kept raw, or the loop further down would look for compiled functions under the metadata route's own id.
    let askedRows: unknown;
    if (liftMetadataRows) {
      askedRows = parsedBody[MION_ROUTES.methodsMetadata];
      if (askedRows !== undefined) delete parsedBody[MION_ROUTES.methodsMetadata];
    }
    // Runs without jit functions, and deletes the entries it processed. No lane means nothing to do:
    // a response only carries metadata when the client asked, and asking awaits the lane first.
    const cache = metadataCacheHooks();
    if (cache) {
      cache.extractAndProcessMetadata(MION_ROUTES.methodsMetadata, parsedBody, options);
      cache.extractAndProcessMetadata(MION_ROUTES.methodsMetadataById, parsedBody, options);
    }
    // raw like the asked rows: a client holds no compiled functions for mion's own middleware
    const syncAnswer = parsedBody[MION_ROUTES.syncRoutes];
    if (syncAnswer !== undefined) delete parsedBody[MION_ROUTES.syncRoutes];
    // kept out of the body, so the wire's returned-vs-thrown split survives
    const {platformError, thrownErrors} = extractThrownErrors(parsedBody);
    if (platformError) return {[MION_ROUTES.platformError]: platformError};
    const deserializedBody: ResponseBody = {};
    Object.entries(parsedBody).forEach(([methodId, returnValue]) => {
      const method = useMethodFns(methodId);
      deserializedBody[methodId] = parseHandlerJsonReturnValue(method, returnValue);
    });
    if (thrownErrors) deserializedBody[MION_ROUTES.thrownErrors] = thrownErrors as any;
    if (askedRows !== undefined) deserializedBody[MION_ROUTES.methodsMetadata] = askedRows as any;
    if (syncAnswer !== undefined) deserializedBody[MION_ROUTES.syncRoutes] = syncAnswer as any;
    return deserializedBody;
  } catch (err: any) {
    throw new RpcError({
      type: 'parsing-json-response-error',
      publicMessage: `Invalid json response body: ${err?.message || 'unknown parsing error.'}`,
    });
  }
}

/** Takes [MION_ROUTES.thrownErrors] out WITHOUT flattening it into the body, so the returned-vs-thrown split
 * survives for error classification. Thrown errors are not strongly typed and deserialize as RpcError<string>. */
function extractThrownErrors(parsedBody: any): {
  platformError?: RpcError<string>;
  thrownErrors?: Record<string, RpcError<string>>;
} {
  if (!(MION_ROUTES.thrownErrors in parsedBody)) return {};
  const rawThrownErrors = parsedBody[MION_ROUTES.thrownErrors];
  delete parsedBody[MION_ROUTES.thrownErrors];
  // if platform error is present that means the router never executed (just the platform wrapper)
  if (MION_ROUTES.platformError in rawThrownErrors) {
    const globalErrorValue = rawThrownErrors[MION_ROUTES.platformError];
    const platformError = isRpcError(globalErrorValue) ? new RpcError<string>(globalErrorValue) : globalErrorValue;
    return {platformError};
  }
  const thrownErrors: Record<string, RpcError<string>> = {};
  Object.entries(rawThrownErrors).forEach(([id, value]) => {
    thrownErrors[id] = isRpcError(value) ? new RpcError<string>(value) : (value as RpcError<string>);
  });
  return {thrownErrors};
}

function getParamsWithoutHeadersSubset(params: any[]): any[] {
  if (!params || params.length === 0) return [];
  return params.slice(1);
}

function parseHandlerJsonReturnValue(method: MethodWithJitFns, returnValue: any): any {
  if (!method.hasReturnData) return returnValue;
  const {decode} = method.returnJitFns.json;
  if (decode.isNoop || !returnValue) return returnValue;

  try {
    if (returnValue instanceof RpcError) return returnValue;
    if (isRpcError(returnValue)) return new RpcError(returnValue);
    return decode.fn(returnValue);
  } catch (e: any) {
    return new RpcError({
      type: 'deserialization-error',
      publicMessage: `Invalid response from Route or Middleware '${method.id}', can not deserialize return value: ${e.message}`,
      errorData: e?.errors,
    });
  }
}
