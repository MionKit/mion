/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, MionRequest, MionResponse} from './types/context';
import {stringifyResponseBody} from './jsonBodyParser.routes';
import {getRouterOptions} from './router';
import {AnyObject, Mutable, RpcError, StatusCodes} from '@mionkit/core';
import {getEmptyCallContext} from './dispatch';

export function getResponseFromError(
    routePath: string,
    step: string,
    reqRawBody: string,
    rawRequest: unknown,
    rawResponse: any,
    error = new RpcError({statusCode: StatusCodes.INTERNAL_SERVER_ERROR, publicMessage: 'Internal Error'}),
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders
): MionResponse {
    const routerOptions = getRouterOptions();
    const context = getEmptyCallContext(routePath, routerOptions, reqRawBody, rawRequest, reqHeaders, respHeaders);
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
    err: any | RpcError | Error,
    step: number | string
) {
    const rpcError =
        err instanceof RpcError
            ? err
            : new RpcError({
                  statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                  publicMessage: `Unknown error in step ${step} of route execution path.`,
                  originalError: err,
                  name: 'Unknown Error',
              });

    response.statusCode = rpcError.statusCode;
    response.hasErrors = true;
    (response.body as Mutable<AnyObject>)[path] = rpcError.toPublicError();
    (request.internalErrors as Mutable<any[]>).push(rpcError);
}
