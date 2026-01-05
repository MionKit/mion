/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Routes} from '../types/general';
import type {CallContext} from '../types/context';
import {RpcError, MION_ROUTES, StatusCodes} from '@mionkit/core';
import {route} from '../lib/handlers';

export const mionErrorsRoutes = {
    /**
     * !IMPORTANT!
     * This is declared as route mostly to reuse existing router serialization/deserialization functionality.
     * But "@thrownErrors" is expected to be a field in response body that contain all thrown errors from other executables.
     * thrown Errors are not strongly typed and are all serialized/deserialized as RpcError<string>.
     * this also prevents users to register a route with the same name.
     */
    [MION_ROUTES.thrownErrors]: route((ctx: CallContext): Record<string, RpcError<string>> => {
        return ctx.request.thrownErrors || {};
    }),
    /**
     * Route that handles not-found scenarios when a requested route doesn't exist.
     * This route is registered as an internal mion route.
     * The route is called by dispatch logic when no matching route is found.
     * Throws an RpcError that will be caught and stored in thrownErrors by the router.
     */
    [MION_ROUTES.notFound]: route((ctx: CallContext): RpcError<'route-not-found'> => {
        throw new RpcError({
            statusCode: StatusCodes.NOT_FOUND,
            publicMessage: `Route not found`,
            type: 'route-not-found',
        });
    }),
} satisfies Routes;
