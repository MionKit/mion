/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, HeadersSubset} from '@mionjs/core';
import {PublicApi, Routes, initMionRouter, route, headersFn, middleFn, query, mutation, rawMiddleFn} from '@mionjs/router';
import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';
// Import format types (regular import to ensure JIT functions are created)
import {FormatString, FormatEmail, FormatUUIDv4} from '@mionjs/type-formats/StringFormats';
import {FormatNumber} from '@mionjs/type-formats/NumberFormats';
// Import server pure functions extracted from client source at build time.
// for this specific scenario server function are defined in packages/client/src/vitePlugin.e2e.spec.ts
import {serverPureFnsCache} from 'virtual:mion-server-pure-fns';

// ============ JSON test types ============
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
    name: FormatString<{minLength: 2; maxLength: 50}>;
    age: FormatNumber<{min: 13; max: 120; integer: true}>;
    email: FormatEmail;
};

// Session info returned by session middleFn
type SessionInfo = {userId: string; role: 'admin' | 'user'; expiresAt: number};

// ============ Binary test types ============
export type SimpleUser = {name: string; age: number};

export type Address = {
    street: string;
    city: string;
    zip: string;
    country: string;
};

export type ComplexUser = {
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

export type NestedData = {
    level1: {
        level2: {
            level3: {
                value: string;
                numbers: number[];
            };
        };
    };
};

// ============ Binary routes (defined separately so they can be exported for router-level tests) ============
const binaryRoutesDef = {
    // Simple routes for basic binary serialization testing
    echo: route((_ctx, message: string): string => message, {serializer: 'binary'}),
    addNumbers: route((_ctx, a: number, b: number): number => a + b, {serializer: 'binary'}),
    getSimpleUser: route((_ctx, name: string, age: number): SimpleUser => ({name, age}), {serializer: 'binary'}),
    processSimpleUser: route((_ctx, user: SimpleUser): string => `User: ${user.name}, Age: ${user.age}`, {serializer: 'binary'}),

    // Array operations
    sumArray: route((_ctx, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0), {serializer: 'binary'}),
    doubleArray: route((_ctx, numbers: number[]): number[] => numbers.map((n) => n * 2), {serializer: 'binary'}),
    reverseStrings: route((_ctx, strings: string[]): string[] => strings.reverse(), {serializer: 'binary'}),

    // Boolean operations
    negate: route((_ctx, value: boolean): boolean => !value, {serializer: 'binary'}),
    allTrue: route((_ctx, values: boolean[]): boolean => values.every((v) => v), {serializer: 'binary'}),

    // Date operations
    getCurrentDate: route((_ctx): Date => new Date(), {serializer: 'binary'}),
    addDays: route(
        (_ctx, date: Date, days: number): Date => {
            const result = new Date(date);
            result.setDate(result.getDate() + days);
            return result;
        },
        {serializer: 'binary'}
    ),

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
        }),
        {serializer: 'binary'}
    ),
    updateComplexUser: route(
        (_ctx, user: ComplexUser): ComplexUser => ({
            ...user,
            isActive: !user.isActive,
            tags: [...user.tags, 'updated'],
        }),
        {serializer: 'binary'}
    ),

    // Deeply nested data
    processNestedData: route((_ctx, data: NestedData): string => data.level1.level2.level3.value, {serializer: 'binary'}),
    createNestedData: route(
        (_ctx, value: string, numbers: number[]): NestedData => ({
            level1: {level2: {level3: {value, numbers}}},
        }),
        {serializer: 'binary'}
    ),

    // Void return
    logMessage: route(
        (_ctx, message: string): void => {
            console.log(`[Binary Server] ${message}`);
        },
        {serializer: 'binary'}
    ),

    // Error handling
    mayFail: route(
        (_ctx, shouldFail: boolean): string | RpcError<'intentional-error'> => {
            if (shouldFail) return new RpcError({publicMessage: 'Intentional failure', type: 'intentional-error'});
            return 'Success!';
        },
        {serializer: 'binary'}
    ),

    // Optional parameters
    greet: route((_ctx, name: string, greeting?: string): string => `${greeting || 'Hello'}, ${name}!`, {serializer: 'binary'}),

    // Nullable values
    findUser: route(
        (_ctx, id: string): SimpleUser | null => {
            if (id === 'not-found') return null;
            return {name: 'Found User', age: 30};
        },
        {serializer: 'binary'}
    ),
} satisfies Routes;

/** Binary session middleFn, shared between binaryTestRoutes export and the merged server routes */
const binarySessionDef = middleFn((_ctx, token?: string): {valid: boolean; userId?: string} | null => {
    if (!token) return null;
    if (token === 'invalid') return {valid: false};
    return {valid: true, userId: 'user-123'};
});

/** Binary routes exported separately for router-level tests (dispatch.binary.spec.ts) */
export const binaryTestRoutes = {
    ...binaryRoutesDef,
    session: binarySessionDef,
} satisfies Routes;

const routes = {
    // ============ Shared middleware ============
    auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void => {
        ctx.shared.user = {name: 'John', surname: 'Doe'};
    }),
    // MiddleFn that returns session info on every request (optional param for flexibility in tests)
    session: middleFn((ctx, sessionToken?: string): SessionInfo | RpcError<'session-expired'> | null => {
        if (!sessionToken) return null;
        if (sessionToken === 'expired') {
            return new RpcError({publicMessage: 'Session expired', type: 'session-expired'});
        }
        return {
            userId: 'user-123',
            role: 'admin',
            expiresAt: Date.now() + 3600000, // 1 hour from now
        };
    }),

    // ============ JSON routes (default serializer) ============
    sayHello: route((_ctx, user: User): string | RpcError<'some-error'> => `Hello ${user.name} ${user.surname}`),
    alwaysFails: route((ctx, user: User): User | RpcError<'unknown-error'> => {
        return new RpcError({publicMessage: 'Something fails', type: 'unknown-error'});
    }),
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
    validateName: route((_ctx, name: FormatString<{minLength: 2; maxLength: 20}>): string => `Name: ${name}`),
    validateAge: route((_ctx, age: FormatNumber<{min: 0; max: 150; integer: true}>): string => `Age: ${age}`),

    log: middleFn((ctx): void => undefined, {runOnError: true}),

    // Routes for testing pure functions with UUID validation
    validateUUID: route((_ctx, uuid: FormatUUIDv4): string => `Valid UUID: ${uuid}`),
    getUserById: route((_ctx, userId: FormatUUIDv4): {id: FormatUUIDv4; name: string} => ({id: userId, name: 'Test User'})),

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

    // Routes for testing routesFlow mapFrom (output→input mapping between routes)
    getCustomerById: route((_ctx, customerId: number): {id: number; name: string; preferenceId: number} => ({
        id: customerId,
        name: 'Test Customer',
        preferenceId: customerId + 100,
    })),
    getPreferencesById: route((_ctx, prefId: number): {id: number; userId: number; theme: string; lang: string} => ({
        id: prefId,
        userId: prefId - 100,
        theme: prefId % 2 === 0 ? 'dark' : 'light',
        lang: 'en',
    })),

    // Route that invokes a server pure function extracted from client source at build time
    getGreetingsPureFnResult: route((): string => {
        const pureFn = serverPureFnsCache.pureServerFn?.greeting;
        if (!pureFn?.fn) throw new RpcError({publicMessage: 'Pure function greeting not found', type: 'pure-fn-not-found'});
        return pureFn.fn();
    }),

    // Route that looks up and invokes any server pure function by name, with an optional argument
    callPureFnByName: route((_ctx, fnName: string, arg?: number): any => {
        const pureFn = serverPureFnsCache.pureServerFn?.[fnName];
        if (!pureFn?.fn) throw new RpcError({publicMessage: `Pure function "${fnName}" not found`, type: 'pure-fn-not-found'});
        return arg !== undefined ? pureFn.fn(arg) : pureFn.fn();
    }),

    // rawMiddleFn to capture HTTP method from the raw IncomingMessage into ctx.shared
    captureHttpMethod: rawMiddleFn((ctx, rawReq: any): void => {
        ctx.shared.httpMethod = rawReq?.method || 'UNKNOWN';
    }),

    // query() route — client should use GET with ?data= for small payloads
    getRequestInfo: query((ctx, message: string): {message: string; httpMethod: string; urlQuery: string | undefined} => ({
        message,
        httpMethod: ctx.shared.httpMethod || 'UNKNOWN',
        urlQuery: ctx.urlQuery,
    })),

    // mutation() route — client should always use POST
    mutateRequestInfo: mutation((ctx, message: string): {message: string; httpMethod: string; urlQuery: string | undefined} => ({
        message,
        httpMethod: ctx.shared.httpMethod || 'UNKNOWN',
        urlQuery: ctx.urlQuery,
    })),

    // ============ Binary routes (per-route binary serializer) ============
    binary: binaryTestRoutes,
} satisfies Routes;

// Get port from env var, command line args, or use default
const port = process.env.MION_TEST_PORT
    ? parseInt(process.env.MION_TEST_PORT, 10)
    : process.argv[2]
      ? parseInt(process.argv[2], 10)
      : 8076;

async function startServer() {
    try {
        // Initialize router with routes using initMionRouter
        // This automatically registers internal mion routes (methodsMetadataById, etc.)
        await initMionRouter(routes, {contextDataFactory: () => ({user: null, httpMethod: null}), skipClientRoutes: false});

        // Set HTTP options
        setNodeHttpOpts({port});

        // Start server
        await startNodeServer();

        console.log(`Test server started on port ${port}`);

        // Note: Graceful shutdown is already handled by @mionjs/platform-node package
        // It automatically listens for SIGINT and closes the server gracefully
    } catch (error) {
        console.error('Failed to start test server:', error);
        process.exit(1);
    }
}

// Export the combined API type for the client tests (includes both JSON and binary routes)
export type TestServerApi = PublicApi<typeof routes>;

// Start the server if this file is run directly
// In ESM, we can't easily detect if the file is run directly vs imported,
// so we use an environment variable to control whether to start the server.
// The test-server-utils.ts sets this variable when spawning the server process.
if (process.env.MION_TEST_SERVER_AUTO_START !== 'false') startServer();
