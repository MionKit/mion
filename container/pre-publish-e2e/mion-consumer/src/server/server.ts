/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, HeadersSubset} from '@mionjs/core';
import {PublicApi, Routes, createMionRouter} from '@mionjs/router';
import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';

// ============ Router ============
// The options are written once here; every handler below is declared through `mion.*`
// and `startServer` boots with `mion.initRoutes(routes)`. The factory's return type IS
// the type of `ctx.shared` in every handler, so spell out what `auth` will store in it.
const mion = createMionRouter({contextDataFactory: (): {user: User | null} => ({user: null}), skipClientRoutes: false});

// ============ Types ============
// NOTE: Regular imports only! Never use `import type` for types that need reflection.

type User = {name: string; surname: string};
type SimpleUser = {name: string; age: number};
type SessionInfo = {userId: string; role: 'admin' | 'user'; expiresAt: number};

// ============ Binary routes ============

const binaryRoutes = {
    echo: mion.route((_ctx, message: string): string => message, {serializer: 'binary'}),
    addNumbers: mion.route((_ctx, a: number, b: number): number => a + b, {serializer: 'binary'}),
    getSimpleUser: mion.route((_ctx, name: string, age: number): SimpleUser => ({name, age}), {serializer: 'binary'}),
    greet: mion.route((_ctx, name: string, greeting?: string): string => `${greeting || 'Hello'}, ${name}!`, {serializer: 'binary'}),
    findUser: mion.route(
        (_ctx, id: string): SimpleUser | null => {
            if (id === 'not-found') return null;
            return {name: 'Found User', age: 30};
        },
        {serializer: 'binary'}
    ),
    mayFail: mion.route(
        (_ctx, shouldFail: boolean): string | RpcError<'intentional-error'> => {
            if (shouldFail) return new RpcError({publicMessage: 'Intentional failure', type: 'intentional-error'});
            return 'Success!';
        },
        {serializer: 'binary'}
    ),
    session: mion.middleFn((_ctx, token?: string): {valid: boolean; userId?: string} | null => {
        if (!token) return null;
        if (token === 'invalid') return {valid: false};
        return {valid: true, userId: 'user-123'};
    }),
} satisfies Routes;

// ============ All routes ============

const routes = {
    // Middleware
    auth: mion.headersFn((ctx, h: HeadersSubset<'Authorization'>): void => {
        ctx.shared.user = {name: 'John', surname: 'Doe'};
    }),
    session: mion.middleFn((ctx, sessionToken?: string): SessionInfo | RpcError<'session-expired'> | null => {
        if (!sessionToken) return null;
        if (sessionToken === 'expired') {
            return new RpcError({publicMessage: 'Session expired', type: 'session-expired'});
        }
        return {userId: 'user-123', role: 'admin', expiresAt: Date.now() + 3600000};
    }),

    // JSON routes
    sayHello: mion.route((_ctx, user: User): string | RpcError<'some-error'> => `Hello ${user.name} ${user.surname}`),
    alwaysFails: mion.route((_ctx, user: User): User | RpcError<'unknown-error'> => {
        return new RpcError({publicMessage: 'Something fails', type: 'unknown-error'});
    }),
    calculateAge: mion.route((_ctx, birthYear: number): number => new Date().getFullYear() - birthYear),

    utils: {
        sumTwo: mion.route((_ctx, a: number): number => a + 2),
    },

    // batch inputFrom pair: the client maps this route's output into the next one's
    // input, with the mapper body executing HERE (see the flow test in src/tests/json.spec.ts).
    getCustomerById: mion.route((_ctx, customerId: number): {id: number; name: string; preferenceId: number} => ({
        id: customerId,
        name: 'Test Customer',
        preferenceId: customerId + 100,
    })),
    getPreferencesById: mion.route((_ctx, prefId: number): {id: number; userId: number; theme: string} => ({
        id: prefId,
        userId: prefId - 100,
        theme: prefId % 2 === 0 ? 'dark' : 'light',
    })),

    // Binary routes
    binary: binaryRoutes,
} satisfies Routes;

// ============ Server startup ============

const port = process.env.MION_TEST_PORT
    ? parseInt(process.env.MION_TEST_PORT, 10)
    : process.argv[2]
      ? parseInt(process.argv[2], 10)
      : 8086;

async function startServer() {
    try {
        mion.initRoutes(routes);
        setNodeHttpOpts({port});
        await startNodeServer();
        console.log(`Test server started on port ${port}`);
    } catch (error) {
        console.error('Failed to start test server:', error);
        process.exit(1);
    }
}

/** Export the API type for client tests */
export type TestServerApi = PublicApi<typeof routes>;

if (process.env.MION_TEST_SERVER_AUTO_START !== 'false') startServer();
