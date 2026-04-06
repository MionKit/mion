/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {initClient} from './client.ts';
import {routesFlow} from './routesFlow.ts';
import {MiddlewareSubRequest, RouteSubRequest} from './types.ts';
import {HeadersSubset, PURE_SERVER_FN_NAMESPACE} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
// Alias to avoid vite plugin transformer injecting bodyHash into unit test calls
import {mapFrom as rawMapFrom} from './routesFlow.ts';
// vite plugin DOES inject bodyHash for e2e tests
import {mapFrom} from './routesFlow.ts';

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

describe('routesFlow', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    const baseURL = TEST_SERVER_BASE_URL;

    describe('routesFlow() function', () => {
        it('should execute a single route in a routesFlow', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so it's included automatically
            middleFns.auth(authHeaders).prefill();

            const [[greeting], [greetingError]] = await routesFlow([routes.sayHello(someUser)]).call();

            expect(greeting).toEqual('Hello John Doe');
            expect(greetingError).toBeUndefined();

            // Clean up
            middleFns.auth(authHeaders).removePrefill();
        });

        it('should execute multiple routes in a routesFlow', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so it's included automatically
            middleFns.auth(authHeaders).prefill();

            const [[greeting, age, sum], [greetingError, ageError, sumError]] = await routesFlow([
                routes.sayHello(someUser),
                routes.calculateAge(1990),
                routes.utils.sumTwo(5),
            ]).call();

            expect(greeting).toEqual('Hello John Doe');
            expect(age).toEqual(new Date().getFullYear() - 1990);
            expect(sum).toEqual(7);
            expect(greetingError).toBeUndefined();
            expect(ageError).toBeUndefined();
            expect(sumError).toBeUndefined();

            // Clean up
            middleFns.auth(authHeaders).removePrefill();
        });

        it('should execute routesFlow with explicit middleFns', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [[greeting], [greetingError], , middleFnErrors] = await routesFlow([routes.sayHello(someUser)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(greeting).toEqual('Hello John Doe');
            expect(greetingError).toBeUndefined();
            expect(middleFnErrors?.auth).toBeUndefined();
        });

        it('should handle route errors in routesFlow', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [[failResult], [failError]] = await routesFlow([routes.alwaysFails(someUser)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            // The failing route should have an error
            expect(failError).toBeDefined();
            expect(failError?.type).toBe('unknown-error');
            expect(failResult).toBeUndefined();
        });

        it('should throw error when called with empty routes array', () => {
            expect(() => routesFlow([])).toThrow('RoutesFlow requires at least one route subrequest.');
        });

        it('should throw error when subrequests have different client instances', () => {
            const {routes: routes1} = initClient<MyApi>({baseURL});
            const {routes: routes2} = initClient<MyApi>({baseURL});

            expect(() => routesFlow([routes1.sayHello(someUser), routes2.calculateAge(1990)])).toThrow(
                'All subrequests in a routesFlow must use the same client instance'
            );
        });
    });

    describe('call() with otherRoutes', () => {
        it('should execute routesFlow via call with otherRoutes on a subrequest', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so it's included automatically
            middleFns.auth(authHeaders).prefill();

            const [[greeting, age], [greetingError, ageError]] = await routes
                .sayHello(someUser)
                .call({otherRoutes: [routes.calculateAge(1990)]});

            expect(greeting).toEqual('Hello John Doe');
            expect(age).toEqual(new Date().getFullYear() - 1990);
            expect(greetingError).toBeUndefined();
            expect(ageError).toBeUndefined();

            // Clean up
            middleFns.auth(authHeaders).removePrefill();
        });

        it('should execute call with otherRoutes and explicit middleFns', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [[greeting, age], [greetingError, ageError], , middleFnErrors] = await routes
                .sayHello(someUser)
                .call({otherRoutes: [routes.calculateAge(1990)], middleFns: {auth: middleFns.auth(authHeaders)}});

            expect(greeting).toEqual('Hello John Doe');
            expect(age).toEqual(new Date().getFullYear() - 1990);
            expect(greetingError).toBeUndefined();
            expect(ageError).toBeUndefined();
            expect(middleFnErrors?.auth).toBeUndefined();
        });
    });

    describe('serialization/deserialization in routesFlows', () => {
        it('should serialize and deserialize Date params and results', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testDate = new Date('2024-06-15T12:30:00.000Z');

            const [[sameDate], [dateError]] = await routesFlow([routes.getSameDate(testDate)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(dateError).toBeUndefined();
            expect(sameDate).toBeInstanceOf(Date);
            expect(sameDate?.toISOString()).toEqual('2024-06-15T12:30:00.000Z');
        });

        it('should serialize Date params and return computed Date result', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testDate = new Date('2024-01-01T00:00:00.000Z');

            const [[datePlusDays], [dateError]] = await routesFlow([routes.getDatePlusDays(testDate, 10)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(dateError).toBeUndefined();
            expect(datePlusDays).toBeInstanceOf(Date);
            expect(datePlusDays?.toISOString()).toEqual('2024-01-11T00:00:00.000Z');
        });

        it('should serialize and deserialize Map params and results', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testMap = new Map<string, number>([
                ['a', 1],
                ['b', 2],
            ]);

            const [[sameMap], [mapError]] = await routesFlow([routes.getSameMap(testMap)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(mapError).toBeUndefined();
            expect(sameMap).toBeInstanceOf(Map);
            expect(sameMap?.get('a')).toEqual(1);
            expect(sameMap?.get('b')).toEqual(2);
        });

        it('should serialize Map params and return modified Map result', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testMap = new Map<string, number>([['x', 10]]);

            const [[mergedMap], [mapError]] = await routesFlow([routes.mergeMap(testMap, 'y', 20)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(mapError).toBeUndefined();
            expect(mergedMap).toBeInstanceOf(Map);
            expect(mergedMap?.get('x')).toEqual(10);
            expect(mergedMap?.get('y')).toEqual(20);
        });

        it('should serialize and deserialize Set params and results', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testSet = new Set(['hello', 'world']);

            const [[sameSet], [setError]] = await routesFlow([routes.getSameSet(testSet)]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(setError).toBeUndefined();
            expect(sameSet).toBeInstanceOf(Set);
            expect(sameSet?.has('hello')).toBe(true);
            expect(sameSet?.has('world')).toBe(true);
        });

        it('should serialize Set params and return modified Set result', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testSet = new Set(['a', 'b']);

            const [[modifiedSet], [setError]] = await routesFlow([routes.addToSet(testSet, 'c')]).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(setError).toBeUndefined();
            expect(modifiedSet).toBeInstanceOf(Set);
            expect(modifiedSet?.has('a')).toBe(true);
            expect(modifiedSet?.has('b')).toBe(true);
            expect(modifiedSet?.has('c')).toBe(true);
        });

        it('should handle multiple routes mixing serializable and plain types in a routesFlow', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testDate = new Date('2024-06-15T12:30:00.000Z');

            const [[sameDate, greeting, age], [dateError, greetingError, ageError]] = await routesFlow([
                routes.getSameDate(testDate),
                routes.sayHello(someUser),
                routes.calculateAge(1990),
            ]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

            expect(dateError).toBeUndefined();
            expect(greetingError).toBeUndefined();
            expect(ageError).toBeUndefined();

            // Date result
            expect(sameDate).toBeInstanceOf(Date);
            expect(sameDate?.toISOString()).toEqual('2024-06-15T12:30:00.000Z');

            // String result
            expect(greeting).toEqual('Hello John Doe');

            // Number result
            expect(age).toEqual(new Date().getFullYear() - 1990);
        });
    });

    describe('proxy returns call method', () => {
        it('proxy should include call method on subrequests', () => {
            const {routes} = initClient<MyApi>({baseURL});
            const subRequest = routes.sayHello(someUser) as RouteSubRequest<any> & MiddlewareSubRequest<any>;

            expect(subRequest.call).toBeDefined();
            expect(typeof subRequest.call).toBe('function');
        });
    });
});

describe('mapFrom()', () => {
    const fakeSubRequest = {pointer: ['test'], id: 'test', isResolved: false, params: []} as any;

    it('should return a MapFromServerFnRef with correct properties', () => {
        const mapper = (x: number) => x * 2;
        const ref = rawMapFrom(fakeSubRequest, mapper, 'testHash123456');
        expect(ref.namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(ref.fnName).toBe('testHash123456');
        expect(ref.bodyHash).toBe('testHash123456');
        expect(ref.pureFn).toBe(mapper);
        expect(ref.isFactory).toBe(false);
        expect(ref.fromRequestId).toBe('test');
        expect(ref.toRequestId).toBe(''); // toRequestId is set once the ref is passed to the target subRequest
    });

    it('should use bodyHash as fnName', () => {
        const ref = rawMapFrom(fakeSubRequest, (x: number) => x.toString(), 'abcdef12345678');
        expect(ref.fnName).toBe('abcdef12345678');
        expect(ref.bodyHash).toBe('abcdef12345678');
    });

    it('should throw when bodyHash is not provided', () => {
        expect(() => rawMapFrom(fakeSubRequest, (x: number) => x * 2)).toThrow(
            'mapFrom() requires mion vite plugin transform to inject bodyHash'
        );
    });

    it('fake() should return the ref itself', () => {
        const ref = rawMapFrom(fakeSubRequest, (x: number) => x * 2, 'testHash123456');
        const fakeResult = ref.type();
        // fake() returns the ref cast as ReturnType<F>
        expect(fakeResult).toBe(ref);
    });

    it('should preserve the mapper function as pureFn', () => {
        const mapper = (user: {name: string}) => user.name.toUpperCase();
        const ref = rawMapFrom(fakeSubRequest, mapper, 'testHash123456');
        expect(ref.pureFn).toBe(mapper);
        expect(ref.pureFn({name: 'alice'})).toBe('ALICE');
    });
});

describe('mapFrom e2e in routesFlow', () => {
    type MyApi = TestServerApi;
    const baseURL = TEST_SERVER_BASE_URL;

    it('should map output of one route to input of another', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const customer = routes.getCustomerById(42);
        const [[customerData, prefs], [customerError, prefsError]] = await routesFlow([
            customer,
            routes.getPreferencesById(mapFrom(customer, (c) => c!.preferenceId).type()),
        ]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

        expect(customerError).toBeUndefined();
        expect(prefsError).toBeUndefined();
        expect(customerData).toEqual({id: 42, name: 'Test Customer', preferenceId: 142});
        // 142 is even → 'dark', userId = prefId - 100 = 42 (original customer id)
        expect(prefs).toEqual({id: 142, userId: 42, theme: 'dark', lang: 'en'});
    });
});
