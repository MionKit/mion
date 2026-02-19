/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersSubset} from '@mionkit/core';
import {initMionRouter, route, linkedFn, headersFn, Routes, PublicApi} from '@mionkit/router';

// Simple type for testing - different from test-router.ts
interface Product {
    id: string;
    name: string;
    price: number;
}

// Define routes for AOT compilation testing - DIFFERENT from test-router.ts
// This file is used to test cache eviction: routes that exist in test-router.ts
// but NOT here should be evicted from the cache after a second compilation run
const routes = {
    // Keep auth route (same as test-router.ts)
    auth: headersFn(
        (ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'x-user-id'> => new HeadersSubset({'x-user-id': 'user-123'})
    ),
    // NEW: products routes (replaces users routes)
    products: {
        getProduct: route((ctx, id: string): Product => ({id, name: 'Test Product', price: 99.99})),
        createProduct: route((ctx, product: Product): string => `Created product ${product.name}`),
    },
    // Keep utils routes (same as test-router.ts)
    utils: {
        sum: route((ctx, a: number, b: number): number => a + b),
        echo: route((ctx, message: string): string => message),
    },
    // Keep log linkedFn (same as test-router.ts)
    log: linkedFn((ctx): void => {
        // Log linkedFn - runs after routes
    }),
} satisfies Routes;

// Initialize the router (async) - export as a promise
export const testApiPromise: Promise<PublicApi<typeof routes>> = initMionRouter(routes, {prefix: 'api/v1'});

// Export routes for testing
export {routes};
