/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicApi, Routes, initRouter, registerRoutes, route, headersFn, linkedFn} from '@mionkit/router';
import {setNodeHttpOpts, startNodeServer} from '@mionkit/node';
import {RpcError, HeadersSubset} from '@mionkit/core';
// Import format types (regular import to ensure JIT functions are created)
import {StrFormat, StrEmail} from '@mionkit/type-formats/FormatsString';
import {NumFormat} from '@mionkit/type-formats/FormatsNumber';

// Define routes for testing different validation scenarios
type User = {name: string; surname: string};
type Product = {id: string; name: string; price: number};

// Types for testing validation with nested objects (friendlyErrors testing)
type UserProfile = {
    name: string;
    email: string;
    age: number;
    address?: {
        street: string;
        city: string;
        zip: string;
    };
};

// Types with format validation for friendlyErrors testing
export type UserWithFormats = {
    name: StrFormat<{minLength: 2; maxLength: 50}>;
    age: NumFormat<{min: 13; max: 120; integer: true}>;
    email: StrEmail;
};

// Session info returned by session linkedFn
type SessionInfo = {userId: string; role: 'admin' | 'user'; expiresAt: number};

const routes = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void => {
        ctx.shared.user = {name: 'John', surname: 'Doe'};
    }),
    // LinkedFn that returns session info on every request (optional param for flexibility in tests)
    session: linkedFn(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (ctx, sessionToken?: string): SessionInfo | RpcError<'session-expired'> | null => {
            if (!sessionToken) return null;
            if (sessionToken === 'expired') {
                return new RpcError({publicMessage: 'Session expired', type: 'session-expired'});
            }
            return {
                userId: 'user-123',
                role: 'admin',
                expiresAt: Date.now() + 3600000, // 1 hour from now
            };
        }
    ),
    sayHello: route((_ctx, user: User): string | RpcError<'some-error'> => `Hello ${user.name} ${user.surname}`),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    alwaysFails: route((ctx, user: User): User | RpcError<'unknown-error'> => {
        return new RpcError({publicMessage: 'Something fails', type: 'unknown-error'});
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

    // Routes for testing validation and friendly errors
    createUserProfile: route((_ctx, user: UserProfile): UserProfile => user),
    validateUserData: route(
        (_ctx, name: string, age: number, email: string): string => `User: ${name}, Age: ${age}, Email: ${email}`
    ),

    // Routes with format types for friendlyErrors testing
    createUserWithFormats: route((_ctx, user: UserWithFormats): UserWithFormats => user),
    validateName: route((_ctx, name: StrFormat<{minLength: 2; maxLength: 20}>): string => `Name: ${name}`),
    validateAge: route((_ctx, age: NumFormat<{min: 0; max: 150; integer: true}>): string => `Age: ${age}`),

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    log: linkedFn((ctx): void => undefined, {runOnError: true}),

    // Routes for testing serialization/deserialization of complex types
    getSameDate: route((_ctx, date: Date): Date => date),
    getDatePlusDays: route((_ctx, date: Date, days: number): Date => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }),
    getSameMap: route((_ctx, map: Map<string, number>): Map<string, number> => map),
    mergeMap: route((_ctx, map: Map<string, number>, key: string, value: number): Map<string, number> => {
        map.set(key, value);
        return map;
    }),
    getSameSet: route((_ctx, set: Set<string>): Set<string> => set),
    addToSet: route((_ctx, set: Set<string>, item: string): Set<string> => {
        set.add(item);
        return set;
    }),
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

        // Note: Graceful shutdown is already handled by @mionkit/node package
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
