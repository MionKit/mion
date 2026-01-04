import {RpcError, MION_ROUTES, Mutable, StatusCodes} from '@mionkit/core';
import type {CallContext, MionHeaders, MionRequest, MionResponse} from '../types/context';
import type {RemoteMethod} from '../types/remoteMethods';

/**
 * Return a Response mion response for any error that happens before the route execution.
 * to be used by any transport layer. ie: node/http, aws/lambda, bun, etc.
 * basically is a global error response when when anything fails outside the router.
 * Uses thrownErrors with a special globalError key to maintain consistency with route errors.
 * @param returnErr
 * @param respHeaders
 * @returns
 */

export function getGlobalErrorResponse(returnErr: RpcError<string>, respHeaders: MionHeaders): MionResponse {
    // Store global error in thrownErrors with special globalError key
    const body = {
        [MION_ROUTES.thrownErrors]: {
            [MION_ROUTES.globalError]: returnErr,
        },
    };
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
 * Handles errors during route dispatch.
 * All errors passed to this function are unexpected (thrown errors).
 * Expected errors are returned from handlers and added directly to response.body.
 * @param context
 * @param executable
 * @param err
 * @returns
 */
export function onExecutableError(context: CallContext, executable: RemoteMethod, err: any | RpcError<string> | Error) {
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

    // All thrown errors are unexpected
    response.statusCode = rpcError.statusCode ?? StatusCodes.UNEXPECTED_ERROR;
    response.hasErrors = true;

    // Store unexpected errors for serialization
    const thrownErrors = context.request.thrownErrors || ({} as Record<string, RpcError<string>>);
    thrownErrors[path] = rpcError;
    (context.request as Mutable<MionRequest>).thrownErrors = thrownErrors;
}
