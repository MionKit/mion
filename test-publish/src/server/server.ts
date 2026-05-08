/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, HeadersSubset} from '@mionjs/core';
import {aotCaches} from 'virtual:mion-aot/caches';
import {PublicApi, Routes, initMionRouter, route, headersFn, middleFn} from '@mionjs/router';
import {setNodeHttpOpts, startNodeServer} from '@mionjs/platform-node';
import {getServerPureFn} from '@mionjs/core/server-pure-fns';

// ============ Types ============
// NOTE: Regular imports only! Never use `import type` for types that need reflection.

type User = {name: string; surname: string};
type SimpleUser = {name: string; age: number};
type SessionInfo = {userId: string; role: 'admin' | 'user'; expiresAt: number};

// ============ Binary routes ============

const binaryRoutes = {
    echo: route((_ctx, message: string): string => message, {serializer: 'binary'}),
    addNumbers: route((_ctx, a: number, b: number): number => a + b, {serializer: 'binary'}),
    getSimpleUser: route((_ctx, name: string, age: number): SimpleUser => ({name, age}), {serializer: 'binary'}),
    greet: route((_ctx, name: string, greeting?: string): string => `${greeting || 'Hello'}, ${name}!`, {serializer: 'binary'}),
    findUser: route(
        (_ctx, id: string): SimpleUser | null => {
            if (id === 'not-found') return null;
            return {name: 'Found User', age: 30};
        },
        {serializer: 'binary'}
    ),
    mayFail: route(
        (_ctx, shouldFail: boolean): string | RpcError<'intentional-error'> => {
            if (shouldFail) return new RpcError({publicMessage: 'Intentional failure', type: 'intentional-error'});
            return 'Success!';
        },
        {serializer: 'binary'}
    ),
    session: middleFn((_ctx, token?: string): {valid: boolean; userId?: string} | null => {
        if (!token) return null;
        if (token === 'invalid') return {valid: false};
        return {valid: true, userId: 'user-123'};
    }),
} satisfies Routes;

// ============ All routes ============

const routes = {
    // Middleware
    auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void => {
        ctx.shared.user = {name: 'John', surname: 'Doe'};
    }),
    session: middleFn((ctx, sessionToken?: string): SessionInfo | RpcError<'session-expired'> | null => {
        if (!sessionToken) return null;
        if (sessionToken === 'expired') {
            return new RpcError({publicMessage: 'Session expired', type: 'session-expired'});
        }
        return {userId: 'user-123', role: 'admin', expiresAt: Date.now() + 3600000};
    }),

    // JSON routes
    sayHello: route((_ctx, user: User): string | RpcError<'some-error'> => `Hello ${user.name} ${user.surname}`),
    alwaysFails: route((_ctx, user: User): User | RpcError<'unknown-error'> => {
        return new RpcError({publicMessage: 'Something fails', type: 'unknown-error'});
    }),
    calculateAge: route((_ctx, birthYear: number): number => new Date().getFullYear() - birthYear),

    utils: {
        sumTwo: route((_ctx, a: number): number => a + 2),
    },

    // Pure function route
    getGreetingsPureFnResult: route((): string => {
        const pureFn = getServerPureFn('pureServerFn', 'greeting');
        if (!pureFn?.fn) throw new RpcError({publicMessage: 'Pure function greeting not found', type: 'pure-fn-not-found'});
        return pureFn.fn();
    }),

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
        await initMionRouter(routes, {contextDataFactory: () => ({user: null}), skipClientRoutes: false, aotCaches});
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
