/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionResponse, MionRequest, CallContext, ResponseBody, RawRequestBody} from '../types/context.ts';
import {RouterOptions} from '../types/general.ts';
import {MiddleFnsCollection, MayReturnError} from '../types/publicMethods.ts';
import {AnyObject, Mutable, MION_ROUTES, StatusCodes, SerializerModes} from '@mionjs/core';
import {rawMiddleFn} from '../lib/handlers.ts';
import {getRouteExecutable} from '../router.ts';
import {RpcError, FatalError, isRpcError} from '@mionjs/core';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {onExecutableError} from '../lib/dispatchError.ts';

// ############# PUBLIC METHODS #############

/**
 * Deserializes the request body and stores it in the request body property.
 * This method is called before any other middleFn or route handler.
 * Registered through `rawMiddleFn`: it runs before the response contract exists,
 * so it throws rather than answering with a declared error.
 * @mion:rawMiddleFn
 */
export function deserializeRequestBody(context: CallContext): MayReturnError {
  // a not-found chain never parses: the adapter skipped the read, and a caller that handed a body
  // anyway (aws, gcloud, a direct dispatchRoute) gets the same answer
  if (!context.readsBody || !context.request.rawBody) return;
  rejectOversizedBody(context.request.rawBody, context.maxBodySize);
  let parsedBody: any;
  switch (context.request.bodyType) {
    case SerializerModes.stringifyJson: // jit stringify json
      try {
        parsedBody = JSON.parse(context.request.rawBody as string);
      } catch (err: any) {
        // Fixed text: the engine's parse message (which quotes the offending input) stays on originalError
        throw new FatalError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: 'parsing-json-request-error',
          publicMessage: 'Invalid json request body.',
          originalError: err,
        });
      }
      break;
    case SerializerModes.json: // Object (pre-parsed body from platforms like Google Cloud Functions where Express auto-parses JSON)
      parsedBody = context.request.rawBody;
      break;
    default:
      throw new Error(`Invalid body type ${context.request.bodyType}`);
  }
  if (Array.isArray(parsedBody)) {
    // when the body is an array we assume it's a single route call and we have to reconstruct the body
    // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
    // the chain already knows which member is the route, so this costs no second router lookup
    const {methods, routeIndex} = context.executionChain;
    parsedBody = {[methods[routeIndex].id]: parsedBody};
  }
  // `null`, `0`, `false` and `""` are valid JSON documents but not a request body
  if (parsedBody === null || typeof parsedBody !== 'object')
    throw new FatalError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: 'invalid-request-body',
      publicMessage: 'Wrong request body. Expecting a body containing the route name and parameters.',
    });
  (context.request as Mutable<MionRequest>).body = parsedBody;
}

/** The router-level check of the request limit the context carries for this request (the
 *  chain's own number, capped by the platform's). The node / uws adapters already stopped the
 *  read at the same number; this is what holds on a platform that hands the body over whole. A
 *  string body is measured in UTF-16 code units, which is never more than its byte length, so the
 *  byte-exact adapter limit always fires first. */
function rejectOversizedBody(rawBody: RawRequestBody, maxBodySize: number): void {
  // a pre-parsed object body has no wire size here: the host that parsed it applied its own limit
  if (typeof rawBody !== 'string' || rawBody.length <= maxBodySize) return;
  throw new FatalError({
    statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
    type: 'request-payload-too-large',
    publicMessage: 'Payload Too Large',
  });
}

/**
 * Serializes the response body and stores it in the response rawBody property.
 * This method is called after any other middleFn or route handler.
 * Registered through `rawMiddleFn`: it IS the layer that writes the answer, so it
 * has no declared error to return and throws instead.
 * @mion:rawMiddleFn
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
    default:
      throw new Error(`Invalid body type ${context.request.bodyType}`);
  }
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
      props.push(`${method.quotedId}:${jsonValue}`);
    } catch (e: any) {
      onStringifyExecutableError(context, method, e);
    }
  }

  // Serialize thrownErrors if they exist. Read off the REQUEST after the loop: a failure raised
  // inside it (a stringify error) creates the map when it is the
  // first error, and the body's slot was assigned before the loop ran.
  const thrownErrors = context.request.thrownErrors;
  if (thrownErrors) {
    (respBody as Mutable<ResponseBody>)['@thrownErrors'] = thrownErrors;
    const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
    try {
      const jsonValue = stringifyHandlerReturnValue(method, thrownErrors);
      if (jsonValue) props.push(`${method.quotedId}:${jsonValue}`);
    } catch (e: any) {
      onStringifyExecutableError(context, method, e);
    }
  }
  return `{${props.join(',')}}`;
}

function onStringifyExecutableError(context: CallContext, method: RemoteMethod, e: any) {
  const err = new FatalError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'json-stringify-response-error',
    publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.json.encode.typeName}`,
    originalError: e,
    errorData: {methodId: method.id},
  });
  onExecutableError(context, method, err);
}

/** True when a slot holds an error the route's return type does not declare (a batch mapping step
 *  answers the target's slot with its own typed error). The route's encoder is built for its success
 *  value and would turn such an error into nonsense, so it rides as native JSON, which is what the
 *  client looks for: it reads the error brand off the raw value before decoding. A DECLARED error is
 *  part of the return union, so its own encoder keeps it. */
function isUndeclaredError(method: RemoteMethod, value: unknown): boolean {
  return isRpcError(value) && !method.returnJitFns.isType.fn(value);
}

function stringifyHandlerReturnValue(method: RemoteMethod, returnValue: any): string {
  if (!method.hasReturnData) return '';
  const {json} = method.returnJitFns;
  // data that needs no custom encoding rides native json
  if (json.encode.isNoop || isUndeclaredError(method, returnValue)) return JSON.stringify(returnValue);
  const encoded = json.encode.fn(returnValue);
  // `direct` writes the string itself; every other strategy hands back a JSON-safe value
  return json.strategy === 'direct' ? (encoded as string) : JSON.stringify(encoded);
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
  // Prepare thrownErrors if they exist, read off the request after the loop (see stringifyBody)
  const thrownErrors = context.request.thrownErrors;
  if (thrownErrors) {
    (respBody as Mutable<ResponseBody>)['@thrownErrors'] = thrownErrors;
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
  const err = new FatalError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'prepare-for-json-response-error',
    publicMessage: `Failed to prepare return value for JSON for handler ${method.id}, expected response type: ${method.returnJitFns.json.encode.typeName}`,
    originalError: e,
    errorData: {methodId: method.id},
  });
  onExecutableError(context, method, err);
}

function prepareHandlerReturnValue(method: RemoteMethod, returnValue: any): any {
  if (!method.hasReturnData) return undefined;
  const {json} = method.returnJitFns;
  // an undeclared error is left as it is: the platform's JSON.stringify writes its own fields
  if (json.encode.isNoop || isUndeclaredError(method, returnValue)) return returnValue;
  const encoded = json.encode.fn(returnValue);
  // a `direct` member never lands in a json-framed chain, the parse only covers one appended outside it
  return json.strategy === 'direct' ? JSON.parse(encoded as string) : encoded;
}

const SERIALIZE_RESPONSE_ID = 'mionSerializeResponse';

export const serializerMiddleFns = {
  mionDeserializeRequest: rawMiddleFn(deserializeRequestBody, {alwaysRun: true}),
  [SERIALIZE_RESPONSE_ID]: rawMiddleFn(serializeResponseBody, {alwaysRun: true}),
} satisfies MiddleFnsCollection;
