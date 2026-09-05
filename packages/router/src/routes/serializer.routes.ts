/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionResponse, MionRequest, CallContext, ResponseBody, RawRequestBody} from '../types/context.ts';
import {RouterOptions} from '../types/general.ts';
import {MiddleFnsCollection, MayReturnError} from '../types/publicMethods.ts';
import {
  AnyObject,
  Mutable,
  MION_ROUTES,
  StatusCodes,
  serializeBinaryBody as coreSerializeBinaryBody,
  deserializeBinaryBody as coreDeserializeBinaryBody,
  SerializerModes,
} from '@mionjs/core';
import {rawMiddleFn} from '../lib/handlers.ts';
import {
  getRouteExecutableFromPath,
  getRouteExecutable,
  getAnyExecutable,
  getRouterOptions,
  getPlatformConfig,
} from '../router.ts';
import {getBatch, resolveBatchMaxBodySize} from '../batches.ts';
import {RpcError} from '@mionjs/core';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {onExecutableError} from '../lib/dispatchError.ts';

// ############# PUBLIC METHODS #############

/**
 * Deserializes the request body and stores it in the request body property.
 * This method is called before any other middleFn or route handler.
 * For binary requests, the body is parsed lazily per-method in dispatch.ts.
 * @mion:middleFn
 */
export function deserializeRequestBody(context: CallContext): MayReturnError {
  if (!context.request.rawBody) return; // empty body
  rejectOversizedBody(context.request.rawBody, effectiveMaxBodySize(context));
  let parsedBody: any;
  switch (context.request.bodyType) {
    case SerializerModes.stringifyJson: // jit stringify json
      try {
        parsedBody = JSON.parse(context.request.rawBody as string);
      } catch (err: any) {
        // Fixed text: the engine's parse message (which quotes the offending input) stays on originalError
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: 'parsing-json-request-error',
          publicMessage: 'Invalid json request body.',
          originalError: err,
        });
      }
      break;
    case SerializerModes.binary: {
      // binary
      const rawBody = context.request.rawBody as Uint8Array;
      const {body} = coreDeserializeBinaryBody(context.path, rawBody, false);
      parsedBody = body;
      break;
    }
    case SerializerModes.json: // Object (pre-parsed body from platforms like Google Cloud Functions where Express auto-parses JSON)
      parsedBody = context.request.rawBody;
      break;
    default:
      throw new Error(`Invalid body type ${context.request.bodyType}`);
  }
  if (Array.isArray(parsedBody)) {
    // when the body is an array we assume it's a single route call and we have to reconstruct the body
    // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
    parsedBody = {[getRouteExecutableFromPath(context.path).id]: parsedBody};
  }
  // `null`, `0`, `false` and `""` are valid JSON documents but not a request body
  if (parsedBody === null || typeof parsedBody !== 'object')
    throw new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'invalid-request-body',
      publicMessage: 'Wrong request body. Expecting a body containing the route name and parameters.',
    });
  (context.request as Mutable<MionRequest>).body = parsedBody;
}

/** ONE limit per deployment: a platform that has its own `maxBodySize` (node, uws, bun) publishes it
 *  in the platform config and the router honours that number, so the two never disagree; every
 *  other platform (cloudflare, aws, gcloud, vercel, or a router driven directly) gets the router
 *  option. */
function effectiveMaxBodySize(context: CallContext): number {
  // A batch request reads its limit from the batch's table entry (today the same number, fixed on
  // the entry at first use, so a per-batch limit has one place to land).
  if (context.batchId) {
    const entry = getBatch(context.batchId);
    if (entry) return resolveBatchMaxBodySize(entry);
  }
  const platformLimit = getPlatformConfig()?.maxBodySize;
  return typeof platformLimit === 'number' ? platformLimit : getRouterOptions().maxBodySize;
}

/** The router-level body limit every adapter inherits (the node / uws / bun adapters also stop the
 *  read early with their own copy of the option). A string body is measured in UTF-16 code units,
 *  which is never more than its byte length, so the byte-exact adapter limit always fires first. */
function rejectOversizedBody(rawBody: RawRequestBody, maxBodySize: number): void {
  const size = typeof rawBody === 'string' ? rawBody.length : (rawBody as ArrayBuffer).byteLength;
  if (typeof size !== 'number' || size <= maxBodySize) return;
  throw new RpcError({
    statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
    type: 'request-payload-too-large',
    publicMessage: 'Payload Too Large',
  });
}

/**
 * Serializes the response body and stores it in the response rawBody property.
 * This method is called after any other middleFn or route handler.
 * @mion:middleFn
 */
export function serializeResponseBody(context: CallContext, opts: RouterOptions): MayReturnError {
  const response = context.response as Mutable<MionResponse>;
  const respBody: AnyObject = response.body;
  const bodyType = context.response.serializer;
  const thrownErrors = context.request.thrownErrors as Record<string, RpcError<string>> | undefined;
  // Add thrownErrors to response body before the serializer runs
  if (thrownErrors) (response.body as Mutable<AnyObject>)['@thrownErrors'] = thrownErrors;
  switch (bodyType) {
    case SerializerModes.stringifyJson: {
      // json - use stringifyJson JIT function
      response.headers.set('content-type', 'application/json; charset=utf-8');
      const body = stringifyBody(context, context.executionChain.methods, respBody);
      response.rawBody = body;
      break;
    }
    case SerializerModes.json: {
      // pre-serialized object - only prepare for JSON, don't stringify
      // Platform adapters will handle the actual JSON stringification
      // prepareForJson mutates response.body in place, so we don't set rawBody
      response.headers.set('content-type', 'application/json; charset=utf-8');
      prepareBodyForJson(context, context.executionChain.methods, respBody);
      break;
    }
    case SerializerModes.binary: {
      // binary - use toBinary JIT function
      response.headers.set('content-type', 'application/octet-stream');
      if (serializeBinaryBody(context, context.executionChain.methods, respBody)) break;
      // The binary envelope could not be written (typically a handler returned a value that does
      // not match its declared type). Nothing binary is left to send, so the response falls back
      // to the JSON envelope: the client always gets an error it can read instead of a dead socket.
      response.serializer = SerializerModes.stringifyJson;
      response.headers.set('content-type', 'application/json; charset=utf-8');
      (response.body as Mutable<AnyObject>)['@thrownErrors'] = context.request.thrownErrors;
      response.rawBody = stringifyBody(context, context.executionChain.methods, respBody);
      break;
    }
    default:
      throw new Error(`Invalid body type ${context.request.bodyType}`);
  }
}

/** Serializes response body to binary format using the core serializeBinaryBody function.
 *  The payload is read from `binSerializer` (getBufferView/getLength) by every platform adapter;
 *  rawBody is deliberately NOT set for binary — it used to hold a full getBuffer() copy of the
 *  payload that nothing consumed. */
function serializeBinaryBody(context: CallContext, executionChain: RemoteMethod[], respBody: ResponseBody): boolean {
  const response = context.response as Mutable<MionResponse>;
  // a batch needs no special casing: the buffer is sized by summing the chain's own methods,
  // whatever route each of them came from
  const chain = withThrownErrors(executionChain, respBody);
  try {
    const {serializer, release} = coreSerializeBinaryBody(context.path, chain, respBody, true);
    response.binSerializer = serializer;
    response.releaseBinBuffer = release;
    return true;
  } catch (err: any) {
    onExecutableError(context, getAnyExecutable(SERIALIZE_RESPONSE_ID)!, err);
    return false;
  }
}

/** Appends the `@thrownErrors` executable to the chain when the body carries thrown errors.
 *
 *  Thrown errors are added to the response body by `serializeResponseBody`, but `@thrownErrors` is
 *  not a member of any execution chain — the JSON lanes therefore serialize it as an explicit extra
 *  entry, and the binary lane, which walks the chain and nothing else, used to drop it entirely: a
 *  binary client got an EMPTY envelope for a request that threw, while its deserializer was already
 *  looking for exactly this key. Allocating here is fine — it only happens on an error response. */
function withThrownErrors(executionChain: RemoteMethod[], respBody: ResponseBody): RemoteMethod[] {
  if (!respBody[MION_ROUTES.thrownErrors]) return executionChain;
  const method = getRouteExecutable(MION_ROUTES.thrownErrors);
  if (!method) return executionChain;
  return [...executionChain, method];
}

function stringifyBody(context: CallContext, executionChain: RemoteMethod[], respBody: ResponseBody): string {
  const props: string[] = [];
  for (let i = 0; i < executionChain.length; i++) {
    const method = executionChain[i];
    const returnValue = respBody[method.id];
    if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
    try {
      const jsonValue = stringifyHandlerReturnValue(method, returnValue);
      if (!jsonValue) continue;
      props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
    } catch (e: any) {
      onStringifyExecutableError(context, method, e);
    }
  }

  // Serialize thrownErrors if they exist
  const thrownErrors = respBody['@thrownErrors'];
  if (thrownErrors) {
    const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
    try {
      const jsonValue = stringifyHandlerReturnValue(method, thrownErrors);
      if (jsonValue) props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
    } catch (e: any) {
      onStringifyExecutableError(context, method, e);
    }
  }
  return `{${props.join(',')}}`;
}

function onStringifyExecutableError(context: CallContext, method: RemoteMethod, e: any) {
  const err = new RpcError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'json-stringify-response-error',
    publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.json.encode.typeName}`,
    originalError: e,
    errorData: {methodId: method.id},
  });
  onExecutableError(context, method, err);
}

/** The JSON text of one member's return value: a `direct` member wrote the string itself, every other strategy
 *  hands back a JSON-ready value that is stringified here; data that needs no encoding goes straight to native JSON. */
function stringifyHandlerReturnValue(method: RemoteMethod, returnValue: any): string {
  if (!method.hasReturnData) return '';
  const {strategy, encode} = method.returnJitFns.json;
  if (encode.isNoop) return JSON.stringify(returnValue);
  if (strategy === 'direct') return encode.fn(returnValue) as string;
  return JSON.stringify(encode.fn(returnValue));
}

function prepareBodyForJson(context: CallContext, executionChain: RemoteMethod[], respBody: ResponseBody): void {
  // prepareForJson mutates the response body in place
  for (let i = 0; i < executionChain.length; i++) {
    const method = executionChain[i];
    const returnValue = respBody[method.id];
    if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
    try {
      const preparedValue = prepareHandlerReturnValue(method, returnValue);
      if (preparedValue !== undefined) (respBody as Mutable<ResponseBody>)[method.id] = preparedValue;
    } catch (e: any) {
      onPrepareForJsonExecutableError(context, method, e);
    }
  }
  // Prepare thrownErrors if they exist
  const thrownErrors = respBody['@thrownErrors'];
  if (thrownErrors) {
    const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
    try {
      const preparedValue = prepareHandlerReturnValue(method, thrownErrors);
      if (preparedValue !== undefined) (respBody as Mutable<ResponseBody>)[method.id] = preparedValue;
    } catch (e: any) {
      onPrepareForJsonExecutableError(context, method, e);
    }
  }
}

function onPrepareForJsonExecutableError(context: CallContext, method: RemoteMethod, e: any) {
  const err = new RpcError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'prepare-for-json-response-error',
    publicMessage: `Failed to prepare return value for JSON for handler ${method.id}, expected response type: ${method.returnJitFns.json.encode.typeName}`,
    originalError: e,
    errorData: {methodId: method.id},
  });
  onExecutableError(context, method, err);
}

/** The JSON-ready value of one member's return value, for the platform to stringify. A chain with a `direct` member
 *  is framed as stringifyJson (see framingForChain), so a direct encoder is only met here when a runtime override
 *  forced the json framing; its string is parsed back rather than double-encoded. */
function prepareHandlerReturnValue(method: RemoteMethod, returnValue: any): any {
  if (!method.hasReturnData) return undefined;
  const {strategy, encode} = method.returnJitFns.json;
  if (encode.isNoop) return returnValue;
  if (strategy === 'direct') return JSON.parse(encode.fn(returnValue) as string);
  return encode.fn(returnValue);
}

const SERIALIZE_RESPONSE_ID = 'mionSerializeResponse';

export const serializerMiddleFns = {
  mionDeserializeRequest: rawMiddleFn(deserializeRequestBody, {runOnError: true}),
  [SERIALIZE_RESPONSE_ID]: rawMiddleFn(serializeResponseBody, {runOnError: true}),
} satisfies MiddleFnsCollection;
