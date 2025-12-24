/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, MION_ROUTES, Mutable, StatusCodes} from '@mionkit/core';
import type {MionHeaders, MionResponse, CallContext} from '../types/context';
import {route} from '../lib/handlers';
import type {Routes} from '../types/general';

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
    const body = {[MION_ROUTES.unexpectedError]: unexpectedErrors};
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

/**
 * Route that returns unexpectedErrors if any exist in the request.
 * This route is registered as an internal mion route to generate JIT functions
 * for serialization/deserialization of Record<string, RpcError<string>>.
 * The route is added to the response body by the dispatch logic when unexpected errors occur.
 * Returns a Record (never undefined) to avoid union serialization with tuple encoding.
 */
export const mionUnexpectedErrorRoute = {
    [MION_ROUTES.unexpectedError]: route((ctx: CallContext): Record<string, RpcError<string>> => {
        return ctx.request.unexpectedErrors || {};
    }),
} satisfies Routes;

/**
 * Route that handles not-found scenarios when a requested route doesn't exist.
 * This route is registered as an internal mion route.
 * The route is called by dispatch logic when no matching route is found.
 * Throws an RpcError that will be caught and stored in unexpectedErrors by the router.
 */
export const mionNotFoundRoute = {
    [MION_ROUTES.notFound]: route((ctx: CallContext): RpcError<'route-not-found'> => {
        return new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            publicMessage: `Route not found`,
            type: 'route-not-found',
        });
    }),
} satisfies Routes;
