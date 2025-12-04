/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initMionRouter, route, hook, headersHook, HeadersList, Routes} from '@mionkit/router';

// Simple type for testing
interface User {
    id: string;
    name: string;
    age: number;
}

// Define routes for AOT compilation testing
const routes = {
    auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): HeadersList<['x-user-id']> => [`user-123`]),
    users: {
        getUser: route((ctx, id: string): User => ({id, name: 'Test User', age: 30})),
        createUser: route((ctx, user: User): string => `Created user ${user.name}`),
    },
    utils: {
        sum: route((ctx, a: number, b: number): number => a + b),
        echo: route((ctx, message: string): string => message),
    },
    log: hook((ctx): void => {
        // Log hook - runs after routes
    }),
} satisfies Routes;

// Initialize the router
export const testApi = initMionRouter(routes, {prefix: 'api/v1'});

// Export routes for testing
export {routes};
