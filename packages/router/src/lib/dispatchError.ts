import {RpcError, FatalError, MION_ROUTES, Mutable, StatusCodes, SerializerModes, markFatal} from '@mionjs/core';
import type {CallContext, MionHeaders, MionRequest, MionResponse, ResponseBody} from '../types/context.ts';

/** The mion response for an error raised before or outside the router, for any adapter layer (node/http,
 *  aws/lambda, bun). It travels in `@thrownErrors` under the platformError key, like a route error. */

export function getRouterFatalErrorResponse(returnErr: RpcError<string>, respHeaders: MionHeaders): MionResponse {
  // a platform error ends the request before any handler runs, so it is fatal by definition
  markFatal(returnErr);
  const body: ResponseBody = {
    '@thrownErrors': {[MION_ROUTES.platformError]: returnErr},
  };
  respHeaders.set('content-type', 'application/json; charset=utf-8');
  respHeaders.set('x-rpc-error', errorHeaderValue(returnErr.type));
  const response: Mutable<MionResponse> = {
    statusCode: returnErr.statusCode || StatusCodes.SERVER_ERROR, // Global errors are always unexpected
    hasErrors: true,
    fatalError: returnErr,
    headers: respHeaders,
    body,
    rawBody: '',
    serializer: SerializerModes.json,
  };
  return response;
}

/** An app-thrown RpcError may carry any string as its `type`, and a CR or LF there is header injection on
 *  adapters that write headers unchecked (or an ERR_INVALID_CHAR throw on node). Anything outside the token
 *  alphabet reports as `unknown-error` on the header; the body still carries the full type. */
const HEADER_SAFE_TYPE = /^[A-Za-z0-9_.:@-]{1,128}$/;
export function errorHeaderValue(type: string): string {
  return HEADER_SAFE_TYPE.test(type) ? type : 'unknown-error';
}

/** Marks the response as ended by `rpcError`: the error header (first error only), the status code,
 *  `hasErrors` (what the dispatcher's skip rule reads) and `fatalError` (first one wins). Shared by the
 *  thrown path and a returned FatalError; where the error itself lands is the caller's decision.
 *  `fallbackStatus` answers when the error carries no statusCode: a thrown one is unexpected (422), a
 *  returned FatalError a declared application error (400). */
export function markResponseFailed(context: CallContext, rpcError: RpcError<string>, fallbackStatus: number) {
  const response = context.response as Mutable<MionResponse>;
  if (!response.hasErrors) {
    response.headers.set('x-rpc-error', errorHeaderValue(rpcError.type));
    response.fatalError = rpcError;
  }
  response.statusCode = rpcError.statusCode ?? fallbackStatus;
  response.hasErrors = true;
}

/** Whatever an adapter caught, as the mion error the wire carries. */
export function toRpcError(err: unknown): RpcError<string> {
  return err instanceof RpcError
    ? err
    : new FatalError({publicMessage: 'Unknown Error', type: 'unknown-error', originalError: err as Error});
}

/** Records an undeclared error under `key` and ends the request: it lands in `@thrownErrors` untyped, sets
 *  the status and the error header, and stops every later member that does not declare `alwaysRun`.
 *  Undeclared means thrown, or returned by a raw middleFn, which cannot declare a return type; a declared
 *  error is returned from a handler and goes straight into `response.body`. The key is normally the member
 *  that failed; an adapter passes its own (`mion@platformError`) for a request no member could run. */
export function recordUndeclaredError(context: CallContext, key: string, err: any) {
  const rpcError: RpcError<string> = markFatal(
    err instanceof RpcError
      ? err
      : new FatalError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          publicMessage: `Unknown error in handler "${key}" of route ExecutionChain.`,
          originalError: err,
          type: 'unknown-error',
        })
  );
  markResponseFailed(context, rpcError, StatusCodes.UNEXPECTED_ERROR);
  const thrownErrors = context.request.thrownErrors || ({} as Record<string, RpcError<string>>);
  thrownErrors[key] = rpcError;
  (context.request as Mutable<MionRequest>).thrownErrors = thrownErrors;
}
