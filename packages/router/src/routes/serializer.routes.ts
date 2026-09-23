/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionResponse, MionRequest, CallContext, ResponseBody, RawRequestBody} from '../types/context.ts';
import {RouterOptions} from '../types/general.ts';
import {MiddlewaresCollection, MayReturnError} from '../types/publicMethods.ts';
import {AnyObject, Mutable, MION_ROUTES, StatusCodes, SerializerModes} from '@mionjs/core';
import {rawMiddleware} from '../lib/handlers.ts';
import {getRouteExecutable, getRouterOptions} from '../router.ts';
import {FatalError, isRpcError} from '@mionjs/core';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {recordUndeclaredError} from '../lib/dispatchError.ts';

// ############# PUBLIC METHODS #############

/** Runs before any other middleware or route handler. Registered through `rawMiddleware`: it runs before the
 * response contract exists, so it throws rather than answering with a declared error.
 * @mion:rawMiddleware
 */
export function deserializeRequestBody(context: CallContext): MayReturnError {
  // a request that already failed never parses: a not-found chain has no route to feed and the adapter
  // skipped the read; a caller that handed a body anyway (aws, gcloud, dispatchRoute) gets the same answer
  if (!context.readsBody || context.response.hasErrors || !context.request.rawBody) return;
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
    // an array body is a single route call, rebuilt as a body: /route1 [p1, p2] => {route1: [p1, p2]}
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
  // Nothing reads the raw body after this. An empty string rather than undefined, because `rawBody` is a
  // non-optional public field: it frees the body without making every consumer's read a maybe.
  if (getRouterOptions().releaseRawBody) (context.request as Mutable<MionRequest>).rawBody = '';
}

/** The router-level check of the limit the context carries (the chain's number, capped by the platform's).
 *  The node / uws adapters stopped the read at the same number; this is what holds on a platform that hands
 *  the body over whole. A string is measured in UTF-16 code units, never more than its byte length, so the
 *  byte-exact adapter limit always fires first. */
function rejectOversizedBody(rawBody: RawRequestBody, maxBodySize: number): void {
  // A pre-parsed object body has no wire size here and is never refused for being unmeasurable:
  // `dispatchRoute`, a batch and a test all pass bodies that never crossed a wire. The adapter handing a
  // parsed body over still has the wire size, so it owns the check (gcloud measures content-length first).
  if (typeof rawBody !== 'string' || rawBody.length <= maxBodySize) return;
  throw new FatalError({
    statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
    type: 'request-payload-too-large',
    publicMessage: 'Payload Too Large',
  });
}

/** Runs after any other middleware or route handler. Registered through `rawMiddleware`: it IS the layer that
 * writes the answer, so it has no declared error to return and throws instead.
 * @mion:rawMiddleware
 */
export function serializeResponseBody(context: CallContext, opts: RouterOptions): MayReturnError {
  const response = context.response as Mutable<MionResponse>;
  const respBody: AnyObject = response.body;
  const bodyType = context.response.serializer;
  if (bodyType !== SerializerModes.json) throw new Error(`Invalid body type ${context.request.bodyType}`);
  // prepareForJson mutates response.body in place, so rawBody stays unset and the adapter stringifies
  response.headers.set('content-type', 'application/json; charset=utf-8');
  prepareBodyForJson(context, context.executionChain.methods, respBody);
}

/** True when a slot holds an error the route's return type does not declare (a batch mapping step answers
 *  the target's slot with its own typed error). The route's encoder is built for the success value and would
 *  turn such an error into nonsense, so it rides as native JSON: the client reads the error brand off the raw
 *  value before decoding. A DECLARED error is part of the return union, so its own encoder keeps it. */
function isUndeclaredError(method: RemoteMethod, value: unknown): boolean {
  return isRpcError(value) && !method.returnJitFns.isType.fn(value);
}

function prepareBodyForJson(context: CallContext, executionChain: RemoteMethod[], respBody: ResponseBody): void {
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
  // read off the request after the loop: a failure inside it creates the map when it is the first error
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
  recordUndeclaredError(context, method.id, err);
}

function prepareHandlerReturnValue(method: RemoteMethod, returnValue: any): any {
  if (!method.hasReturnData) return undefined;
  const {json} = method.returnJitFns;
  // an undeclared error is left as it is: the platform's JSON.stringify writes its own fields
  if (json.encode.isNoop || isUndeclaredError(method, returnValue)) return returnValue;
  return json.encode.fn(returnValue);
}

const SERIALIZE_RESPONSE_ID = 'mionSerializeResponse';

export const serializerMiddlewares = {
  mionDeserializeRequest: rawMiddleware(deserializeRequestBody, {alwaysRun: true}),
  [SERIALIZE_RESPONSE_ID]: rawMiddleware(serializeResponseBody, {alwaysRun: true}),
} satisfies MiddlewaresCollection;
