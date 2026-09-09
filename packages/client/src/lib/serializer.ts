/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionjs/router';
import {
  type MethodWithJitFns,
  RpcError,
  isRpcError,
  routesCache,
  MION_ROUTES,
  HandlerType,
  type SerializerMode,
} from '@mionjs/core';
import type {MionClientRequest} from '../request.ts';
import {extractAndProcessMetadata} from './clientMethodsMetadata.ts';
import {hasHeadersSubsetParam} from './headers.ts';
import {ClientOptions} from '../types.ts';

/** Result of serializing a request body */
export type SerializedBody = string;

/** Content-type header value for the serialized body */
export type ContentType = 'application/json; charset=utf-8';

/** Result of serializing a request body with its content type */
export interface SerializedRequest {
  body: SerializedBody;
  contentType: ContentType;
}

// ################################## SERIALIZE ##################################

/** Serializes the request body and returns it with the appropriate content type */
export function serializeRequestBody(req: MionClientRequest<any, any>): SerializedRequest {
  const serializerMode = getSerializerMode(req);
  switch (serializerMode) {
    case 'json':
    case 'stringifyJson':
      return {
        body: serializeJsonBody(req),
        contentType: 'application/json; charset=utf-8',
      };
    case 'optimistic':
      return {
        body: serializeJSonBodyOptimistic(req),
        contentType: 'application/json; charset=utf-8',
      };
    default:
      throw new Error(`Invalid serializer mode ${String(serializerMode)}`);
  }
}

function serializeJsonBody(req: MionClientRequest<any, any>): string {
  const props: string[] = [];
  const subRequestIds = Object.keys(req.subRequestList);

  for (let i = 0; i < subRequestIds.length; i++) {
    const id = subRequestIds[i];
    const subRequest = req.subRequestList[id];
    if (!subRequest) continue;
    let params = subRequest.params;
    const method = routesCache.useMethodJitFns(id);
    if (method.type === HandlerType.headersMiddleFn && method.headersParam) {
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
 * accepts. A headers middleFn's HeadersSubset goes out as HTTP headers, never in the body. */
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

/** Writes the params with the strategy the server compiled: `direct` writes the string itself. */
function stringifyHandlerParams(method: MethodWithJitFns, params: any[], validated: boolean): string {
  if (!method.paramsCount) return '';
  const {json, isType} = method.paramsJitFns;
  if (json.encode.isNoop) return JSON.stringify(params);
  // with local validation off a wrong-typed value must still reach the server's validation, and the
  // compiled encoders assume the type, so it rides the plain wire form instead
  if (!validated && !isType.isNoop && !isType.fn(params)) return JSON.stringify(params, wireFormReplacer);
  const write = (): string => {
    const encoded = json.encode.fn(params);
    return json.strategy === 'direct' ? (encoded as string) : JSON.stringify(encoded);
  };
  // the compiled encoder rejects anything but the real params (a batch mapping's `null` placeholder,
  // a wrong-typed value), so those fall back to the plain wire forms the server decoders accept
  try {
    return write();
  } catch {
    return JSON.stringify(params, wireFormReplacer);
  }
}

/** The plain wire forms the server's JSON decoders accept, applied recursively (JSON.stringify calls
 *  a replacer again on whatever it returned). Date and Temporal need no arm, their own toJSON writes
 *  the text their decoders rebuild from. A union member's `[index, value]` envelope is deliberately
 *  not written: the index needs the metadata, and every transforming decoder guards its wire shape,
 *  so the server refuses the bare value instead of misreading it and the client retries. */
export function wireFormReplacer(this: unknown, key: string, value: unknown): unknown {
  if (value instanceof Map) return [...value];
  if (value instanceof Set) return [...value];
  if (typeof value === 'bigint') return value.toString();
  return value;
}

// ################################## DE-SERIALIZE ##################################

/** Deserializes the response body from a fetch Response object. Handles routes metadata if present in json responses. */
export async function deserializeResponseBody(response: Response, options: ClientOptions): Promise<ResponseBody> {
  let parsedBody: any;
  const contentType = response.headers.get('content-type')?.toLowerCase();
  switch (true) {
    case !!contentType?.includes('application/json'):
      parsedBody = await deserializeJsonResponseBody(response, options);
      break;
    default:
      throw new RpcError({
        type: 'unsupported-content-type',
        publicMessage: `Unsupported response content-type: '${contentType || 'none'}'`,
      });
  }
  return parsedBody;
}

/** Deserializes JSON response body, Also handles routes metadata if present */
async function deserializeJsonResponseBody(response: Response, options: ClientOptions) {
  try {
    const parsedBody = await response.json();
    // Extract & process metadata if present and delete entries after processing (does not use jit functions)
    extractAndProcessMetadata(MION_ROUTES.methodsMetadata, parsedBody, options);
    extractAndProcessMetadata(MION_ROUTES.methodsMetadataById, parsedBody, options);
    // Extract thrown (unexpected) errors, preserving the wire's returned-vs-thrown split
    const {platformError, thrownErrors} = extractThrownErrors(parsedBody);
    if (platformError) return {[MION_ROUTES.platformError]: platformError};
    // Deserialize the body using jit functions
    const deserializedBody: ResponseBody = {};
    Object.entries(parsedBody).forEach(([methodId, returnValue]) => {
      const method = routesCache.useMethodJitFns(methodId);
      deserializedBody[methodId] = parseHandlerJsonReturnValue(method, returnValue);
    });
    if (thrownErrors) deserializedBody[MION_ROUTES.thrownErrors] = thrownErrors as any;
    return deserializedBody;
  } catch (err: any) {
    throw new RpcError({
      type: 'parsing-json-response-error',
      publicMessage: `Invalid json response body: ${err?.message || 'unknown parsing error.'}`,
    });
  }
}

/** Extracts thrown (unexpected) errors from [MION_ROUTES.thrownErrors] WITHOUT flattening them into the
 * body, so the wire's returned-vs-thrown split survives for error classification. Thrown errors are not
 * strongly typed and deserialize as RpcError<string>. Returns a platformError as a special case. */
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

/** The request wire, decided by the server's resolved `encoder` and never by a client option:
 *  `optimistic` until the metadata is known, then the JSON string the encoders write. */
function getSerializerMode(req: MionClientRequest<any, any>): SerializerMode {
  if (req.options.serializer === 'optimistic') {
    // When metadata is cached (e.g. after retry), use JIT serialization
    const subRequestIds = Object.keys(req.subRequestList);
    const allCached = subRequestIds.every((id) => routesCache.hasMetadata(id));
    if (allCached) return 'stringifyJson';
    return 'optimistic';
  }
  return 'stringifyJson';
}

/** Returns params array without the HeadersSubset (first param) */
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
      publicMessage: `Invalid response from Route or MiddleFn '${method.id}', can not deserialize return value: ${e.message}`,
      errorData: e?.errors,
    });
  }
}
