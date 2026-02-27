/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Test router script for AOT emitter tests.
 * This script is spawned as a child process with MION_COMPILE=true
 * to test that emitAOTCaches() correctly sends IPC messages.
 *
 * Uses initMionRouter which automatically calls emitAOTCaches() when MION_COMPILE=true.
 */

import {initMionRouter, route, middleFn, Routes, PublicApi} from '@mionkit/router';

interface User {
    id: string;
    name: string;
}

const routes = {
    users: {
        getUser: route((ctx, id: string): User => ({id, name: 'Test User'})),
        createUser: route((ctx, user: User): string => `Created user ${user.name}`),
    },
    utils: {
        sum: route((ctx, a: number, b: number): number => a + b),
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    log: middleFn((ctx): void => {
        // Log middleFn
    }),
} satisfies Routes;

// Initialize the router - this will call emitAOTCaches() automatically when MION_COMPILE=true
export const testApiPromise: Promise<PublicApi<typeof routes>> = initMionRouter(routes, {prefix: 'api/v1'});

export {routes};
