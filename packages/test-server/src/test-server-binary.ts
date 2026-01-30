/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicApi, Routes, initRouter, registerRoutes, route, linkedFn} from '@mionkit/router';
import {setNodeHttpOpts, startNodeServer} from '@mionkit/http';
import {RpcError} from '@mionkit/core';

// ============ Simple Types ============
type SimpleUser = {name: string; age: number};

// ============ Complex Types ============
type Address = {
    street: string;
    city: string;
    zip: string;
    country: string;
};

type ComplexUser = {
    id: string;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    createdAt: Date;
    address: Address;
    tags: string[];
    scores: number[];
};

type NestedData = {
    level1: {
        level2: {
            level3: {
                value: string;
                numbers: number[];
            };
        };
    };
};

// ============ Routes ============
const routes = {
    // Health check route that uses JSON serialization (for test server startup detection)
    health: route((_ctx): {status: string} => ({status: 'ok'}), {serializer: 'json'}),

    // Simple routes for basic binary serialization testing
    echo: route((_ctx, message: string): string => message),
    addNumbers: route((_ctx, a: number, b: number): number => a + b),
    getSimpleUser: route(
        (_ctx, name: string, age: number): SimpleUser => ({
            name,
            age,
        })
    ),
    processSimpleUser: route((_ctx, user: SimpleUser): string => `User: ${user.name}, Age: ${user.age}`),

    // Array operations
    sumArray: route((_ctx, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0)),
    doubleArray: route((_ctx, numbers: number[]): number[] => numbers.map((n) => n * 2)),
    reverseStrings: route((_ctx, strings: string[]): string[] => strings.reverse()),

    // Boolean operations
    negate: route((_ctx, value: boolean): boolean => !value),
    allTrue: route((_ctx, values: boolean[]): boolean => values.every((v) => v)),

    // Date operations
    getCurrentDate: route((_ctx): Date => new Date()),
    addDays: route((_ctx, date: Date, days: number): Date => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }),

    // Complex object operations
    createComplexUser: route(
        (_ctx, id: string, name: string, email: string): ComplexUser => ({
            id,
            name,
            email,
            age: 25,
            isActive: true,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            address: {
                street: '123 Main St',
                city: 'Test City',
                zip: '12345',
                country: 'Test Country',
            },
            tags: ['user', 'active'],
            scores: [100, 95, 88],
        })
    ),
    updateComplexUser: route(
        (_ctx, user: ComplexUser): ComplexUser => ({
            ...user,
            isActive: !user.isActive,
            tags: [...user.tags, 'updated'],
        })
    ),

    // Deeply nested data
    processNestedData: route((_ctx, data: NestedData): string => data.level1.level2.level3.value),
    createNestedData: route(
        (_ctx, value: string, numbers: number[]): NestedData => ({
            level1: {
                level2: {
                    level3: {
                        value,
                        numbers,
                    },
                },
            },
        })
    ),

    // Void return
    logMessage: route((_ctx, message: string): void => {
        // Just log, no return
        console.log(`[Binary Server] ${message}`);
    }),

    // Error handling
    mayFail: route((_ctx, shouldFail: boolean): string | RpcError<'intentional-error'> => {
        if (shouldFail) {
            return new RpcError({publicMessage: 'Intentional failure', type: 'intentional-error'});
        }
        return 'Success!';
    }),

    // Optional parameters
    greet: route((_ctx, name: string, greeting?: string): string => `${greeting || 'Hello'}, ${name}!`),

    // Nullable values
    findUser: route((_ctx, id: string): SimpleUser | null => {
        if (id === 'not-found') return null;
        return {name: 'Found User', age: 30};
    }),

    // LinkedFn for testing
    session: linkedFn((_ctx, token?: string): {valid: boolean; userId?: string} | null => {
        if (!token) return null;
        if (token === 'invalid') return {valid: false};
        return {valid: true, userId: 'user-123'};
    }),
} satisfies Routes;

// Get port from command line args or use default
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 8089;

async function startServer() {
    try {
        // Initialize router with binary serialization
        initRouter({
            contextDataFactory: () => ({user: null}),
            skipClientRoutes: false,
            serializer: 'binary',
        });

        // Register routes
        registerRoutes(routes);

        // Set HTTP options
        setNodeHttpOpts({port});

        // Start server
        await startNodeServer();

        console.log(`Binary test server started on port ${port}`);
    } catch (error) {
        console.error('Failed to start binary test server:', error);
        process.exit(1);
    }
}

// Export the API type for the client tests
export type BinaryTestServerApi = PublicApi<typeof routes>;

// Start the server if this file is run directly
if (require.main === module) {
    startServer();
}
