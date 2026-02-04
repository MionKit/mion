import {RpcError, MION_ROUTES, Mutable, StatusCodes, SerializerModes} from '@mionkit/core';
import type {
    CallContext,
    MionHeaders,
    MionRequest,
    MionResponse,
    ResponseBody,
    PlatformResponse,
    InternalPlatformResponse,
} from '../types/context';
import type {RemoteMethod} from '../types/remoteMethods';

/**
 * Return a PlatformResponse for any error that happens before or outside the router.
 * to be used by any adapter layer. ie: node/http, aws/lambda, bun, etc.
 * Uses thrownErrors with a special platformError key to maintain consistency with route errors.
 */
export function getRouterFatalErrorResponse(returnErr: RpcError<string>, respHeaders: MionHeaders): PlatformResponse {
    // Store platform error in thrownErrors with special platformError key
    const body: ResponseBody = {
        '@thrownErrors': {[MION_ROUTES.platformError]: returnErr},
    };
    respHeaders.set('content-type', 'application/json; charset=utf-8');
    const response: PlatformResponse = {
        statusCode: returnErr.statusCode || StatusCodes.SERVER_ERROR, // Global errors are always unexpected
        bodyType: SerializerModes.json, // body is an object, platform wrapper will stringify
        body,
    };
    return response;
}

/**
 * Handles errors during route dispatch.
 * All errors passed to this function are unexpected (thrown errors).
 * Expected errors are returned from handlers and added directly to response.body.
 */
export function onExecutableError(context: CallContext, executable: RemoteMethod, err: any | RpcError<string> | Error) {
    const response = context.response as Mutable<MionResponse>;
    const platformResponse = context.platformResponse as Mutable<InternalPlatformResponse>;
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
    if (!response.hasErrors) response.headers.set('x-rpc-error', rpcError.type);
    platformResponse.statusCode = rpcError.statusCode ?? StatusCodes.UNEXPECTED_ERROR;
    response.hasErrors = true;
    // Store unexpected errors for serialization
    const thrownErrors = context.request.thrownErrors || ({} as Record<string, RpcError<string>>);
    thrownErrors[path] = rpcError;
    (context.request as Mutable<MionRequest>).thrownErrors = thrownErrors;
}
