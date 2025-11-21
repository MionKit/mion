/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, MionRequest, MionResponse} from './types/context';
import {stringifyResponseBody} from './jsonBodyParser.routes';
import {getRouterOptions} from './router';
import {AnyObject, Mutable} from '@mionkit/core';
import {RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';
import {createCallContext} from './dispatch';

const defaultError = new RpcError({
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    publicMessage: 'Internal Error',
    type: 'unknown-error',
});

export function getResponseFromError(
    routePath: string,
    step: string,
    reqRawBody: string,
    rawRequest: unknown,
    rawResponse: any,
    error: RpcError<string> = defaultError,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    parsedBody?: any
): MionResponse {
    const routerOptions = getRouterOptions();
    const context = createCallContext(routePath, routerOptions, reqRawBody, rawRequest, reqHeaders, respHeaders, parsedBody);
    handleRpcErrors(routePath, context.request, context.response, error, step);
    // stringify does not uses rawRequest or raw response atm but that can change
    stringifyResponseBody(context, rawRequest, rawResponse, routerOptions);
    return context.response;
}
// ############# PUBLIC METHODS USED FOR ERRORS #############

export function handleRpcErrors(
    path: string,
    request: MionRequest,
    response: Mutable<MionResponse>,
    err: any | RpcError<string> | Error,
    step: number | string
) {
    const rpcError =
        err instanceof RpcError
            ? err
            : new RpcError({
                  statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                  publicMessage: `Unknown error in step ${step} of route execution path.`,
                  originalError: err,
                  type: 'unknown-error',
              });

    response.statusCode = rpcError.statusCode;
    response.hasErrors = true;
    (response.body as Mutable<AnyObject>)[path] = rpcError.toPublicError();
    (request.internalErrors as Mutable<any[]>).push(rpcError);
}
