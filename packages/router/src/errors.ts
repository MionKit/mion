/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, MionResponse} from './types/context';
import {stringifyResponseBody} from './jsonBodyParser';
import {getRouterOptions} from './router';
import {RpcError, StatusCodes} from '@mionkit/core';
import {getEmptyCallContext, handleRpcErrors} from './dispatch';

export function getResponseFromError(
    routePath: string,
    step: string,
    reqRawBody: string,
    rawRequest: unknown,
    rawResponse: any,
    error = new RpcError({statusCode: StatusCodes.INTERNAL_SERVER_ERROR, publicMessage: 'Internal Error'}),
    reqHeaders?: MionHeaders,
    respHeaders?: MionHeaders
): MionResponse {
    const routerOptions = getRouterOptions();
    const context = getEmptyCallContext(routePath, routerOptions, reqRawBody, rawRequest, reqHeaders, respHeaders);
    handleRpcErrors(routePath, context.request, context.response, error, step);
    // stringify does not uses rawRequest or raw response atm but that can change
    stringifyResponseBody(context, rawRequest, rawResponse, routerOptions);
    return context.response;
}
