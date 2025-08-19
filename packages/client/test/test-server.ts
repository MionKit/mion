/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicApi, Routes, initRouter, registerRoutes, route, headersHook, hook} from '@mionkit/router';
import {setNodeHttpOpts, startNodeServer} from '@mionkit/http';
import {RpcError} from '@mionkit/core';

// Define the same routes as in the test
type User = {name: string; surname: string};

const routes = {
    auth: headersHook(['Authorization'], (ctx, token: string): void => {
        ctx.shared.user = {name: 'John', surname: 'Doe'};
    }),
    sayHello: route((ctx, user: User): string | RpcError => `Hello ${user.name} ${user.surname}`),
    alwaysFails: route((ctx, user: User): User | RpcError => {
        return new RpcError({statusCode: 500, publicMessage: 'Something fails', name: 'UnknownError'});
    }),
    utils: {
        sumTwo: route((ctx, a: number): number => a + 2),
    },
    log: hook((ctx): void => undefined, {runOnError: true}),
} satisfies Routes;

// Get port from command line args or use default
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 8076;

async function startServer() {
    try {
        // Initialize router
        initRouter({sharedDataFactory: () => ({user: null}), skipClientRoutes: false});

        // Register routes
        const myApi = registerRoutes(routes);

        // Set HTTP options
        setNodeHttpOpts({port});

        // Start server
        const server = await startNodeServer();

        console.log(`Test server started on port ${port}`);

        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down gracefully');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('Received SIGINT, shutting down gracefully');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });

        // Keep the process alive
        process.on('exit', () => {
            console.log('Test server process exiting');
        });
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
