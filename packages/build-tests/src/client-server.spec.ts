/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Client-Server integration tests.
 * These tests verify that the full mion stack works correctly with built packages.
 * Tests client-server communication with JSON serialization.
 */

import {initClient} from '@mionkit/client';
import {isRpcError} from '@mionkit/core';
import {createTestServerHooks, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS, TestServerApi} from '@mionkit/test-server';

// Mock localStorage for method metadata storage
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

describe('Client-Server Integration Tests', () => {
    type MyApi = TestServerApi;

    const port = TEST_PORT_MAPPING.buildTestsJson;
    const serverHooks = createTestServerHooks({
        port,
        serverType: 'json',
        useBuiltServer: true,
        logOutput: false,
    });
    const baseURL = serverHooks.getBaseURL();

    beforeAll(serverHooks.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
    afterAll(serverHooks.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

    describe('Basic Route Calls', () => {
        it('should call sayHello route and get response', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.sayHello({name: 'John', surname: 'Doe'}).call();

            expect(error).toBeUndefined();
            expect(result).toBe('Hello John Doe');
        });

        it('should handle route that returns RpcError', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.alwaysFails({name: 'Test', surname: 'User'}).call();

            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(isRpcError(error)).toBe(true);
            expect(error?.type).toBe('unknown-error');
        });

        it('should call calculateAge route with number parameter', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const currentYear = new Date().getFullYear();
            const [result, error] = await routes.calculateAge(1990).call();

            expect(error).toBeUndefined();
            expect(result).toBe(currentYear - 1990);
        });

        it('should call sumNumbers route with array parameter', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.sumNumbers([1, 2, 3, 4, 5]).call();

            expect(error).toBeUndefined();
            expect(result).toBe(15);
        });
    });

    describe('Object Parameters and Returns', () => {
        it('should call createProduct with object parameter', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const product = {id: 'prod-123', name: 'Test Product', price: 99.99};
            const [result, error] = await routes.createProduct(product).call();

            expect(error).toBeUndefined();
            expect(result).toEqual(product);
        });

        it('should call createProduct without id and get generated id', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const product = {id: '', name: 'New Product', price: 49.99};
            const [result, error] = await routes.createProduct(product).call();

            expect(error).toBeUndefined();
            expect(result?.id).toBe('generated-id');
            expect(result?.name).toBe('New Product');
        });
    });

    describe('Optional Parameters', () => {
        it('should call greetUser with required parameter only', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.greetUser('Alice').call();

            expect(error).toBeUndefined();
            expect(result).toBe('Hello Alice');
        });

        it('should call greetUser with optional greeting', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.greetUser('Bob', 'Hi').call();

            expect(error).toBeUndefined();
            expect(result).toBe('Hi Bob');
        });
    });

    describe('Nested Routes', () => {
        it('should call nested route utils.sumTwo', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.utils.sumTwo(5).call();

            expect(error).toBeUndefined();
            expect(result).toBe(7);
        });

        it('should call nested route utils.multiply', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.utils.multiply(3, 4).call();

            expect(error).toBeUndefined();
            expect(result).toBe(12);
        });

        it('should call nested route utils.processUser', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.utils.processUser({name: 'Jane', surname: 'Smith'}).call();

            expect(error).toBeUndefined();
            expect(result).toBe('Processed: Jane Smith');
        });
    });

    describe('Complex Types with Native JS Classes', () => {
        it('should handle Date serialization/deserialization', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const testDate = new Date('2025-01-15T10:30:00Z');
            const [result, error] = await routes.processDate(testDate).call();

            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
            // The server adds 1 day
            const expectedDate = new Date('2025-01-16T10:30:00Z');
            expect(result?.getTime()).toBe(expectedDate.getTime());
        });

        it('should handle Set serialization/deserialization', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const testSet = new Set(['a', 'b', 'c']);
            const [result, error] = await routes.processSet(testSet).call();

            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Set);
            expect(result?.has('a')).toBe(true);
            expect(result?.has('b')).toBe(true);
            expect(result?.has('c')).toBe(true);
            expect(result?.has('added-by-server')).toBe(true);
        });

        it('should handle Map serialization/deserialization', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const testMap = new Map([
                ['key1', 100],
                ['key2', 200],
            ]);
            const [result, error] = await routes.processMap(testMap).call();

            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Map);
            expect(result?.get('key1')).toBe(100);
            expect(result?.get('key2')).toBe(200);
            expect(result?.get('server-key')).toBe(999);
        });
    });

    describe('User Profile with Nested Objects', () => {
        it('should handle user profile with address', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const profile = {
                name: 'John Doe',
                email: 'john@example.com',
                age: 30,
                address: {
                    street: '123 Main St',
                    city: 'Test City',
                    zip: '12345',
                },
            };
            const [result, error] = await routes.createUserProfile(profile).call();

            expect(error).toBeUndefined();
            expect(result).toEqual(profile);
        });

        it('should handle user profile without optional address', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const profile = {
                name: 'Jane Doe',
                email: 'jane@example.com',
                age: 25,
            };
            const [result, error] = await routes.createUserProfile(profile).call();

            expect(error).toBeUndefined();
            expect(result).toEqual(profile);
        });
    });
});
