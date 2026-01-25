/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {hook, initMionRouter, Routes} from '@mionkit/router';

const routes = {
    // only required as initMionRouter needs at least one route/hook
    '@mionkit/mionEmptyHook': hook((): void => undefined),
} satisfies Routes;

// Initialize the router
export const defaultApi = initMionRouter(routes);
export type DefaultApi = typeof defaultApi;
