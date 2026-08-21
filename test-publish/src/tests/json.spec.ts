/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {routesFlow, serverMapFrom} from '@mionjs/client';
import {initClient} from '@mionjs/client';
import {isRpcError, HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '../server/server.ts';
import Storage from 'dom-storage';
import {describe, it, expect, beforeAll} from 'vitest';

beforeAll(() => {
    global.localStorage = new Storage(null, {strict: true});
    global.sessionStorage = new Storage(null, {strict: true});
});

function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

const TEST_SERVER_PORT = 8086;
const baseURL = `http://localhost:${TEST_SERVER_PORT}`;

describe('JSON Serialization E2E', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    it('proxy should trap remote method calls and return SubRequest data', () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const authReq = middleFns.auth(authHeaders);
        expect(authReq.pointer).toEqual(['auth']);
        expect(authReq.id).toBe('auth');
        expect(authReq.isResolved).toBe(false);

        const helloReq = routes.sayHello(someUser);
        expect(helloReq.pointer).toEqual(['sayHello']);
        expect(helloReq.id).toBe('sayHello');

        const sumReq = routes.utils.sumTwo(2);
        expect(sumReq.pointer).toEqual(['utils', 'sumTwo']);
        expect(sumReq.id).toBe('utils/sumTwo');
    });

    it('call() with middleFns should return route data on success', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call({
            middleFns: {auth: middleFns.auth(authHeaders)},
        });

        expect(greeting).toBe('Hello John Doe');
        expect(routeError).toBeUndefined();
        expect(middleFnResults).toBeDefined();
        expect(middleFnErrors).toBeDefined();
    });

    it('call() with middleFns should return error on route failure', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [result, routeError] = await routes.alwaysFails(someUser).call({
            middleFns: {auth: middleFns.auth(authHeaders)},
        });

        expect(result).toBeUndefined();
        expect(routeError).toBeDefined();
        expect(routeError?.type).toBe('unknown-error');
        expect(routeError?.publicMessage).toBe('Something fails');
    });

    it('call() with prefilled auth should succeed', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middleFns.auth(authHeaders).prefill();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const [greeting, error] = await routes.sayHello(someUser).call();

        expect(greeting).toBe('Hello John Doe');
        expect(error).toBeUndefined();

        middleFns.auth(authHeaders).removePrefill();
    });

    it('call() should fail after removePrefill', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('ABYWZ-TOKEN');

        middleFns.auth(authHeaders).prefill();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const [response, callError] = await routes.sayHello(someUser).call();
        expect(callError).toBeUndefined();
        expect(response).toBe('Hello John Doe');

        middleFns.auth(authHeaders).removePrefill();

        const [, error] = await routes.sayHello(someUser).call();
        expect(error).toBeDefined();
        expect(isRpcError(error)).toBe(true);
    });

    it('call() with middleFns should return session middleFn data', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call({
            middleFns: {
                auth: middleFns.auth(authHeaders),
                session: middleFns.session('valid-token'),
            },
        });

        expect(greeting).toBe('Hello John Doe');
        expect(routeError).toBeUndefined();
        expect(middleFnErrors?.auth).toBeUndefined();
        expect(middleFnResults?.session).toBeDefined();
        expect(middleFnResults?.session?.userId).toBe('user-123');
    });

    it('routesFlow should execute multiple routes', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middleFns.auth(authHeaders).prefill();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const [[greeting, age, sum], [greetingError, ageError, sumError]] = await routesFlow([
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

        middleFns.auth(authHeaders).removePrefill();
    });

    // SKIPPED — this passes in the monorepo (packages/client routesFlow.spec.ts) but NOT against
    // packaged tarballs: the consumer's server process loads @mionjs/core twice (mion prints its own
    // "loaded 2 times" warning at boot), so the mapper registers into one core instance and the
    // router looks it up in the other. Root cause + evidence in
    // docs/todos/packaged-consumer-dual-core-load.md. Un-skip with that fix — the harvest half
    // already works here (.mion/server-mappers.json is written with the mapper body).
    it.skip('serverMapFrom should run a client-authored mapper on the server, mid-flow', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middleFns.auth(authHeaders).prefill();
        await new Promise((resolve) => setTimeout(resolve, 100));

        // The mapper body is authored HERE, in client flow code. The packaged mion vite plugin
        // extracts it at build time into the server-mappers manifest, and the server executes it
        // between the two calls — so this asserts the whole build-time transport survives packing.
        // The param resolves server-side, hence the `!` (same convention as the docs examples).
        const customer = routes.getCustomerById(7);
        const [[customerData, prefs], [customerError, prefsError]] = await routesFlow([
            customer,
            routes.getPreferencesById(serverMapFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
        ]).call();

        expect(customerError).toBeUndefined();
        expect(prefsError).toBeUndefined();
        expect(customerData).toEqual({id: 7, name: 'Test Customer', preferenceId: 107});
        // 107 is odd -> 'light', userId = prefId - 100 = the original customer id
        expect(prefs).toEqual({id: 107, userId: 7, theme: 'light'});

        middleFns.auth(authHeaders).removePrefill();
    });
});
