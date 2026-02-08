/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from './client';
import {workflow} from './workflow';
import {HSubRequest, RSubRequest} from './types';
import {HeadersSubset} from '@mionkit/core';
import {TestServerApi, createTestServerLinkedFns, JEST_TIMEOUT_CONSTANTS, TEST_PORT_MAPPING} from '@mionkit/test-server';

// Mock localStorage for method metadata storage
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

describe('workflow', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    const port = TEST_PORT_MAPPING.workflow;

    // Create server linkedFns using the utility
    const serverLinkedFns = createTestServerLinkedFns({port});
    const baseURL = serverLinkedFns.getBaseURL();

    beforeAll(serverLinkedFns.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
    afterAll(serverLinkedFns.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

    describe('workflow() function', () => {
        it('should execute a single route in a workflow', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so it's included automatically
            linkedFns.auth(authHeaders).prefill();

            const [results, errors] = await workflow([routes.sayHello(someUser)]);

            expect(results).toBeDefined();
            expect(results?.[0]).toEqual('Hello John Doe');
            expect(errors).toBeUndefined();

            // Clean up
            linkedFns.auth(authHeaders).removePrefill();
        });

        it('should execute multiple routes in a workflow', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so it's included automatically
            linkedFns.auth(authHeaders).prefill();

            const [results, errors] = await workflow([
                routes.sayHello(someUser),
                routes.calculateAge(1990),
                routes.utils.sumTwo(5),
            ]);

            expect(results).toBeDefined();
            expect(results?.[0]).toEqual('Hello John Doe');
            expect(results?.[1]).toEqual(new Date().getFullYear() - 1990);
            expect(results?.[2]).toEqual(7);
            expect(errors).toBeUndefined();

            // Clean up
            linkedFns.auth(authHeaders).removePrefill();
        });

        it('should execute workflow with explicit linkedFns', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [results, errors, linkedFnResults, linkedFnErrors] = await workflow([routes.sayHello(someUser)], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(results).toBeDefined();
            expect(results?.[0]).toEqual('Hello John Doe');
            expect(errors).toBeUndefined();
            expect(linkedFnErrors?.auth).toBeUndefined();
        });

        it('should handle route errors in workflow', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [results, errors] = await workflow([routes.alwaysFails(someUser)], {
                auth: linkedFns.auth(authHeaders),
            });

            // The failing route should have an error
            expect(errors).toBeDefined();
            expect(errors?.[0]).toBeDefined();
            expect(errors?.[0]?.type).toBe('unknown-error');
            expect(results?.[0]).toBeUndefined();
        });

        it('should throw error when called with empty routes array', async () => {
            await expect(workflow([])).rejects.toThrow('Workflow requires at least one route subrequest.');
        });
    });

    describe('callWithWorkflow() method', () => {
        it('should execute workflow via callWithWorkflow on a subrequest', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so it's included automatically
            linkedFns.auth(authHeaders).prefill();

            const [results, errors] = await routes.sayHello(someUser).callWithWorkflow([routes.calculateAge(1990)]);

            expect(results).toBeDefined();
            expect(results?.[0]).toEqual('Hello John Doe');
            expect(results?.[1]).toEqual(new Date().getFullYear() - 1990);
            expect(errors).toBeUndefined();

            // Clean up
            linkedFns.auth(authHeaders).removePrefill();
        });

        it('should execute callWithWorkflow with explicit linkedFns', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [results, errors, linkedFnResults, linkedFnErrors] = await routes
                .sayHello(someUser)
                .callWithWorkflow([routes.calculateAge(1990)], {auth: linkedFns.auth(authHeaders)});

            expect(results).toBeDefined();
            expect(results?.[0]).toEqual('Hello John Doe');
            expect(results?.[1]).toEqual(new Date().getFullYear() - 1990);
            expect(errors).toBeUndefined();
            expect(linkedFnErrors?.auth).toBeUndefined();
        });
    });

    describe('serialization/deserialization in workflows', () => {
        it('should serialize and deserialize Date params and results', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testDate = new Date('2024-06-15T12:30:00.000Z');

            const [results, errors] = await workflow([routes.getSameDate(testDate)], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();
            expect(results?.[0]).toBeInstanceOf(Date);
            expect(results?.[0]?.toISOString()).toEqual('2024-06-15T12:30:00.000Z');
        });

        it('should serialize Date params and return computed Date result', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testDate = new Date('2024-01-01T00:00:00.000Z');

            const [results, errors] = await workflow([routes.getDatePlusDays(testDate, 10)], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();
            expect(results?.[0]).toBeInstanceOf(Date);
            expect(results?.[0]?.toISOString()).toEqual('2024-01-11T00:00:00.000Z');
        });

        it('should serialize and deserialize Map params and results', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testMap = new Map<string, number>([
                ['a', 1],
                ['b', 2],
            ]);

            const [results, errors] = await workflow([routes.getSameMap(testMap)], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();
            expect(results?.[0]).toBeInstanceOf(Map);
            expect(results?.[0]?.get('a')).toEqual(1);
            expect(results?.[0]?.get('b')).toEqual(2);
        });

        it('should serialize Map params and return modified Map result', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testMap = new Map<string, number>([['x', 10]]);

            const [results, errors] = await workflow([routes.mergeMap(testMap, 'y', 20)], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();
            expect(results?.[0]).toBeInstanceOf(Map);
            expect(results?.[0]?.get('x')).toEqual(10);
            expect(results?.[0]?.get('y')).toEqual(20);
        });

        it('should serialize and deserialize Set params and results', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testSet = new Set(['hello', 'world']);

            const [results, errors] = await workflow([routes.getSameSet(testSet)], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();
            expect(results?.[0]).toBeInstanceOf(Set);
            expect(results?.[0]?.has('hello')).toBe(true);
            expect(results?.[0]?.has('world')).toBe(true);
        });

        it('should serialize Set params and return modified Set result', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testSet = new Set(['a', 'b']);

            const [results, errors] = await workflow([routes.addToSet(testSet, 'c')], {
                auth: linkedFns.auth(authHeaders),
            });

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();
            expect(results?.[0]).toBeInstanceOf(Set);
            expect(results?.[0]?.has('a')).toBe(true);
            expect(results?.[0]?.has('b')).toBe(true);
            expect(results?.[0]?.has('c')).toBe(true);
        });

        it('should handle multiple routes mixing serializable and plain types in a workflow', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            const testDate = new Date('2024-06-15T12:30:00.000Z');

            const [results, errors] = await workflow(
                [routes.getSameDate(testDate), routes.sayHello(someUser), routes.calculateAge(1990)],
                {auth: linkedFns.auth(authHeaders)}
            );

            expect(errors).toBeUndefined();
            expect(results).toBeDefined();

            // Date result
            expect(results?.[0]).toBeInstanceOf(Date);
            expect(results?.[0]?.toISOString()).toEqual('2024-06-15T12:30:00.000Z');

            // String result
            expect(results?.[1]).toEqual('Hello John Doe');

            // Number result
            expect(results?.[2]).toEqual(new Date().getFullYear() - 1990);
        });
    });

    describe('proxy returns callWithWorkflow method', () => {
        it('proxy should include callWithWorkflow method on subrequests', () => {
            const {routes} = initClient<MyApi>({baseURL});
            const subRequest = routes.sayHello(someUser) as RSubRequest<any> & HSubRequest<any>;

            expect(subRequest.callWithWorkflow).toBeDefined();
            expect(typeof subRequest.callWithWorkflow).toBe('function');
        });
    });
});
