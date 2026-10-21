/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {batch, inputFrom} from '@mionjs/client';
import {initClient} from '@mionjs/client';
import {isRpcError, HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '../server/server.ts';
import {describe, it, expect} from 'vitest';


function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

const TEST_SERVER_PORT = 8086;
const baseURL = `http://localhost:${TEST_SERVER_PORT}`;

describe('JSON Serialization E2E', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    it('proxy should trap remote method calls and return SubRequest data', () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        // a middleware is hooks only
        expect(typeof middlewares.auth.onRequest).toBe('function');

        const helloReq = routes.sayHello(someUser);
        expect(helloReq.pointer).toEqual(['sayHello']);
        expect(helloReq.id).toBe('sayHello');

        const sumReq = routes.utils.sumTwo(2);
        expect(sumReq.pointer).toEqual(['utils', 'sumTwo']);
        expect(sumReq.id).toBe('utils/sumTwo');
    });

    it('call() with an onRequest middleware should return route data on success', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');
        middlewares.auth.onRequest((auth) => auth(authHeaders));

        const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

        expect(greeting).toBe('Hello John Doe');
        expect(routeError).toBeUndefined();
        expect(clientResponse['@thrownErrors']).toBeUndefined();
    });

    it('call() with middlewares should return error on route failure', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middlewares.auth.onRequest((auth) => auth(authHeaders));
        const [result, routeError] = await routes.alwaysFails(someUser).call();

        expect(result).toBeUndefined();
        expect(routeError).toBeDefined();
        expect(routeError?.type).toBe('unknown-error');
        expect(routeError?.publicMessage).toBe('Something fails');
    });

    it('call() with an async onRequest auth should succeed', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middlewares.auth.onRequest(async (auth) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            auth(authHeaders);
        });

        const [greeting, error] = await routes.sayHello(someUser).call();

        expect(greeting).toBe('Hello John Doe');
        expect(error).toBeUndefined();
    });

    it('call() should fail after offRequest', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('ABYWZ-TOKEN');

        middlewares.auth.onRequest((auth) => auth(authHeaders));

        const [response, callError] = await routes.sayHello(someUser).call();
        expect(callError).toBeUndefined();
        expect(response).toBe('Hello John Doe');

        middlewares.auth.offRequest();

        // No headers: the auth middleware's own validation error, at its path.
        const [, , clientResponse] = await routes.sayHello(someUser).call();
        expect(isRpcError(clientResponse.auth)).toBe(true);
        expect(clientResponse.auth).toMatchObject({type: 'validation-error'});
    });

    it('call() with onRequest middlewares should return session middleware data', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middlewares.auth.onRequest((auth) => auth(authHeaders));
        middlewares.session.onRequest((session) => session('valid-token'));
        const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

        expect(greeting).toBe('Hello John Doe');
        expect(routeError).toBeUndefined();
        expect(clientResponse['@thrownErrors']).toBeUndefined();
        expect(clientResponse.auth).toBeUndefined();
        expect(clientResponse.session).toBeDefined();
        expect((clientResponse.session as {userId?: string} | undefined)?.userId).toBe('user-123');
    });

    it('batch should execute multiple routes', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middlewares.auth.onRequest((auth) => auth(authHeaders));

        const [[greeting, greetingError], [age, ageError], [sum, sumError]] = await batch([
            routes.sayHello(someUser),
            routes.calculateAge(1990),
            routes.utils.sumTwo(5),
        ]).call();

        expect(greeting).toBe('Hello John Doe');
        expect(age).toBe(new Date().getFullYear() - 1990);
        expect(sum).toBe(7);
        expect(greetingError).toBeUndefined();
        expect(ageError).toBeUndefined();
        expect(sumError).toBeUndefined();
    });

    it('inputFrom should run a client-authored mapper on the server, mid-batch', async () => {
        const {routes, middlewares} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middlewares.auth.onRequest((auth) => auth(authHeaders));

        // The packaged vite plugin extracts this client-written mapper into the batch module the server runs.
        // So this asserts the build-time transport survives packing; the param resolves server-side, hence the `!`.
        const customer = routes.getCustomerById(7);
        const [[customerData, customerError], [prefs, prefsError]] = await batch([
            customer,
            routes.getPreferencesById(inputFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
        ]).call();

        expect(customerError).toBeUndefined();
        expect(prefsError).toBeUndefined();
        expect(customerData).toEqual({id: 7, name: 'Test Customer', preferenceId: 107});
        // 107 is odd -> 'light', userId = prefId - 100 = the original customer id
        expect(prefs).toEqual({id: 107, userId: 7, theme: 'light'});
    });
});
