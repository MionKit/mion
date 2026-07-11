/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {routesFlow} from '@mionjs/client';
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

    it('pure function route should execute server-side pure function', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        middleFns.auth(authHeaders).prefill();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const [result, error] = await routes.getGreetingsPureFnResult().call();

        expect(error).toBeUndefined();
        expect(result).toBe('Hello from pure fn!');

        middleFns.auth(authHeaders).removePrefill();
    });
});
