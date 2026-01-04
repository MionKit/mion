/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, MION_ROUTES, StatusCodes} from '@mionkit/core';
import type {CallContext} from '../types/context';
import {route} from '../lib/handlers';
import type {Routes} from '../types/general';

export const mionErrorsRoutes = {
    /**
     * Route that returns unexpectedErrors if any exist in the request.
     * This route is registered as an internal mion route to generate JIT functions
     * for serialization/deserialization of Record<string, RpcError<string>>.
     * The route is added to the response body by the dispatch logic when unexpected errors occur.
     * Returns a Record (never undefined) to avoid union serialization with tuple encoding.
     */
    [MION_ROUTES.unexpectedErrors]: route((ctx: CallContext): Record<string, RpcError<string>> => {
        return ctx.request.unexpectedErrors || {};
    }),
    /**
     * Route that handles not-found scenarios when a requested route doesn't exist.
     * This route is registered as an internal mion route.
     * The route is called by dispatch logic when no matching route is found.
     * Throws an RpcError that will be caught and stored in unexpectedErrors by the router.
     */
    [MION_ROUTES.notFound]: route((ctx: CallContext): RpcError<'route-not-found'> => {
        return new RpcError({
            // forces result to be inside unexpected errors
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            publicMessage: `Route not found`,
            type: 'route-not-found',
        });
    }),
} satisfies Routes;
