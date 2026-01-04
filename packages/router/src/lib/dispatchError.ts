import {RpcError, MION_ROUTES, Mutable, StatusCodes} from '@mionkit/core';
import type {CallContext, MionHeaders, MionRequest, MionResponse} from '../types/context';
import type {RemoteMethod} from '../types/remoteMethods';

/**
 * Return a Response mion response for any error that happens before the route execution.
 * to be used by any transport layer. ie: node/http, aws/lambda, bun, etc.
 * basically is a global error response when when anything fails outside the router.
 * Uses unexpectedErrors with a special globalError key to maintain consistency with route errors.
 * @param returnErr
 * @param respHeaders
 * @returns
 */

export function getGlobalErrorResponse(returnErr: RpcError<string>, respHeaders: MionHeaders): MionResponse {
    // Store global error in unexpectedErrors with special globalError key
    const unexpectedErrors = {[MION_ROUTES.globalError]: returnErr};
    const body = {[MION_ROUTES.unexpectedErrors]: unexpectedErrors};
    respHeaders.set('content-type', 'application/json; charset=utf-8');
    const response: Mutable<MionResponse> = {
        statusCode: StatusCodes.UNEXPECTED_ERROR, // Global errors are always unexpected
        hasErrors: true,
        headers: respHeaders,
        body,
        rawBody: JSON.stringify(body),
        bodyType: 'J', // global errors are always json
    };
    return response;
}

/**
 * Handles errors during route dispatch
 * @param context
 * @param executable
 * @param err
 * @param isExpected
 * @returns
 */
export function onExecutableError(
    context: CallContext,
    executable: RemoteMethod,
    err: any | RpcError<string> | Error,
    isExpected: boolean
) {
    const response = context.response as Mutable<MionResponse>;
    const path = executable.id;
    const rpcError =
        err instanceof RpcError
            ? err
            : new RpcError({
                  publicMessage: `Unknown error in handler "${path}" of route execution path.`,
                  originalError: err,
                  type: 'unknown-error',
              });

    // Set response status code based on whether error is expected or unexpected
    response.statusCode = rpcError.statusCode ?? (isExpected ? StatusCodes.APPLICATION_ERROR : StatusCodes.UNEXPECTED_ERROR);
    response.hasErrors = true;

    // Expected errors (returned from handler) are added to response.body at line 130
    // Unexpected errors (thrown or validation/serialization errors) are stored in unexpectedErrors
    if (isExpected) return;

    // Unexpected errors are stored in unexpectedErrors for serialization
    const unexpectedErrors = context.request.unexpectedErrors || ({} as Record<string, RpcError<string>>);
    unexpectedErrors[path] = rpcError;
    (context.request as Mutable<MionRequest>).unexpectedErrors = unexpectedErrors;
}
