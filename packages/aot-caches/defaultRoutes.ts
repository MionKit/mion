/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MION_ROUTES, RpcError} from '@mionkit/core';
import {initMionRouter, route, Routes} from '@mionkit/router';

const routes = {
    [MION_ROUTES.globalError]: route((error: RpcError<string>): RpcError<string> => error),
} satisfies Routes;

// Initialize the router
export const testApi = initMionRouter(routes);

// Export routes for testing
export {routes};
