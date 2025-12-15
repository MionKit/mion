/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, MION_ROUTES, Mutable} from '@mionkit/core';
import {route} from '../lib/handlers';
import type {MionHeaders, MionResponse} from '../types/context';
import {Routes} from '../types/general';

/**
 * Return a Response mion response for any error that happens before the route execution.
 * to be used by any transport layer. ie: node/http, aws/lambda, bun, etc.
 * basically is a global error response when when anything fails outside the router.
 * @param returnErr
 * @param respHeaders
 * @returns
 */
export function getGlobalErrorResponse(returnErr: RpcError<string>, respHeaders: MionHeaders): MionResponse {
    const body = {[MION_ROUTES.globalError]: returnErr.toPublicError()};
    respHeaders.set('content-type', 'application/json; charset=utf-8');
    const response: Mutable<MionResponse> = {
        statusCode: returnErr.statusCode,
        hasErrors: true,
        headers: respHeaders,
        body,
        rawBody: JSON.stringify(body),
        bodyType: 'J', // global errors are always json
    };
    return response;
}

export const mionGlobalErrorRoute = {
    [MION_ROUTES.globalError]: route(
        (): RpcError<string> => new RpcError({statusCode: 500, publicMessage: 'Unknown error', type: 'unknown-error'})
    ),
} satisfies Routes;
