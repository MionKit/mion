/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicApi, Routes, initRouter, registerRoutes, route, headersHook, hook} from '@mionkit/router';
import {setNodeHttpOpts, startNodeServer} from '@mionkit/http';
import {RpcError} from '@mionkit/core';

// Define routes for testing different validation scenarios
type User = {name: string; surname: string};
type Product = {id: string; name: string; price: number};

const routes = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    auth: headersHook(['Authorization'], (ctx, token: string): void => {
        ctx.shared.user = {name: 'John', surname: 'Doe'};
    }),
    sayHello: route((_ctx, user: User): string | RpcError => `Hello ${user.name} ${user.surname}`),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    alwaysFails: route((ctx, user: User): User | RpcError => {
        return new RpcError({statusCode: 500, publicMessage: 'Something fails', type: 'UnknownError'});
    }),

    // Additional routes for testing different validation types
    calculateAge: route((_ctx, birthYear: number): number => new Date().getFullYear() - birthYear),

    createProduct: route(
        (_ctx, product: Product): Product => ({
            ...product,
            id: product.id || 'generated-id',
        })
    ),

    sumNumbers: route((_ctx, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0)),

    greetUser: route((_ctx, name: string, greeting?: string): string => `${greeting || 'Hello'} ${name}`),

    utils: {
        sumTwo: route((ctx, a: number): number => a + 2),
        multiply: route((ctx, a: number, b: number): number => a * b),
        processUser: route((ctx, user: User): string => `Processed: ${user.name} ${user.surname}`),
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    log: hook((ctx): void => undefined, {runOnError: true}),
} satisfies Routes;

// Get port from command line args or use default
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 8076;

async function startServer() {
    try {
        // Initialize router
        initRouter({contextDataFactory: () => ({user: null}), skipClientRoutes: false});

        // Register routes
        registerRoutes(routes);

        // Set HTTP options
        setNodeHttpOpts({port});

        // Start server
        await startNodeServer();

        console.log(`Test server started on port ${port}`);

        // Note: Graceful shutdown is already handled by @mionkit/http package
        // It automatically listens for SIGINT and closes the server gracefully
    } catch (error) {
        console.error('Failed to start test server:', error);
        process.exit(1);
    }
}

// Export the API type for the client tests
export type TestServerApi = PublicApi<typeof routes>;

// Start the server if this file is run directly
if (require.main === module) {
    startServer();
}
