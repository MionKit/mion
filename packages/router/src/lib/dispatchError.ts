import {RpcError, MION_ROUTES, Mutable, StatusCodes, SerializerModes} from '@mionjs/core';
import type {CallContext, MionHeaders, MionRequest, MionResponse, ResponseBody} from '../types/context.ts';
import type {RemoteMethod} from '../types/remoteMethods.ts';

/**
 * Return a Response mion response for any error that happens before or outside the router.
 * to be used by any adapter layer. ie: node/http, aws/lambda, bun, etc.
 * Uses thrownErrors with a special platformError key to maintain consistency with route errors.
 * @param returnErr
 * @param respHeaders
 * @returns
 */

export function getRouterFatalErrorResponse(returnErr: RpcError<string>, respHeaders: MionHeaders): MionResponse {
  // Store platform error in thrownErrors with special platformError key
  const body: ResponseBody = {
    '@thrownErrors': {[MION_ROUTES.platformError]: returnErr},
  };
  respHeaders.set('content-type', 'application/json; charset=utf-8');
  respHeaders.set('x-rpc-error', errorHeaderValue(returnErr.type));
  const response: Mutable<MionResponse> = {
    statusCode: returnErr.statusCode || StatusCodes.SERVER_ERROR, // Global errors are always unexpected
    hasErrors: true,
    headers: respHeaders,
    body,
    rawBody: JSON.stringify(body),
    serializer: SerializerModes.json, // global errors are always json
  };
  return response;
}

/** Header-safe error types only: an app-thrown RpcError may carry any string as its `type`, and a CR
 *  or LF there is header injection on adapters that write headers unchecked (or an ERR_INVALID_CHAR
 *  throw from inside the error handler on node). Anything outside the token alphabet is reported as
 *  `unknown-error` on the header; the body still carries the full type. */
const HEADER_SAFE_TYPE = /^[A-Za-z0-9_.:@-]{1,128}$/;
export function errorHeaderValue(type: string): string {
  return HEADER_SAFE_TYPE.test(type) ? type : 'unknown-error';
}

/**
 * Handles errors during route dispatch.
 * All errors passed to this function are unexpected (thrown errors).
 * Expected errors are returned from handlers and added directly to response.body.
 * @param context
 * @param executable
 * @param err
 * @returns
 */
// `err` is whatever was thrown: an RpcError, an Error, or any other value.
export function onExecutableError(context: CallContext, executable: RemoteMethod, err: any) {
  const response = context.response as Mutable<MionResponse>;
  const path = executable.id;
  const rpcError: RpcError<string> =
    err instanceof RpcError
      ? err
      : new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          publicMessage: `Unknown error in handler "${path}" of route ExecutionChain.`,
          originalError: err,
          type: 'unknown-error',
        });
  // only first error sets the error header
  if (!response.hasErrors) response.headers.set('x-rpc-error', errorHeaderValue(rpcError.type));
  response.statusCode = rpcError.statusCode ?? StatusCodes.UNEXPECTED_ERROR;
  response.hasErrors = true;
  // Store unexpected errors for serialization
  const thrownErrors = context.request.thrownErrors || ({} as Record<string, RpcError<string>>);
  thrownErrors[path] = rpcError;
  (context.request as Mutable<MionRequest>).thrownErrors = thrownErrors;
}
