/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Binary serialization tests.
 * These tests verify that binary serialization works correctly with built packages.
 */

import {initClient} from '@mionkit/client';
import {createTestServerHooks, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS, BinaryTestServerApi} from '@mionkit/test-server';

// Mock localStorage for method metadata storage
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

describe('Binary Serialization Build Tests', () => {
    type MyApi = BinaryTestServerApi;

    const port = TEST_PORT_MAPPING.buildTestsBinary;
    const serverHooks = createTestServerHooks({
        port,
        serverType: 'binary',
        useBuiltServer: true,
        logOutput: false,
    });
    const baseURL = serverHooks.getBaseURL();

    beforeAll(serverHooks.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
    afterAll(serverHooks.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

    describe('Simple Types', () => {
        it('should serialize and deserialize string echo', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.echo('Hello Binary World!').call();

            expect(error).toBeUndefined();
            expect(result).toBe('Hello Binary World!');
        });

        it('should serialize and deserialize number addition', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.addNumbers(10, 20).call();

            expect(error).toBeUndefined();
            expect(result).toBe(30);
        });

        it('should serialize and deserialize simple object', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.getSimpleUser('Alice', 25).call();

            expect(error).toBeUndefined();
            expect(result).toEqual({name: 'Alice', age: 25});
        });

        it('should serialize object as parameter and deserialize string result', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.processSimpleUser({name: 'Bob', age: 30}).call();

            expect(error).toBeUndefined();
            expect(result).toBe('User: Bob, Age: 30');
        });

        it('should handle boolean values', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.negate(true).call();

            expect(error).toBeUndefined();
            expect(result).toBe(false);
        });

        it('should handle void return', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.logMessage('Test message').call();

            expect(error).toBeUndefined();
            expect(result).toBeUndefined();
        });
    });

    describe('Array Operations', () => {
        it('should serialize and deserialize number array sum', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.sumArray([1, 2, 3, 4, 5]).call();

            expect(error).toBeUndefined();
            expect(result).toBe(15);
        });

        it('should serialize and deserialize number array transformation', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.doubleArray([1, 2, 3]).call();

            expect(error).toBeUndefined();
            expect(result).toEqual([2, 4, 6]);
        });

        it('should serialize and deserialize string array', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.reverseStrings(['a', 'b', 'c']).call();

            expect(error).toBeUndefined();
            expect(result).toEqual(['c', 'b', 'a']);
        });

        it('should handle boolean array', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.allTrue([true, true, true]).call();

            expect(error).toBeUndefined();
            expect(result).toBe(true);
        });
    });

    describe('Date Operations', () => {
        it('should serialize and deserialize Date', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.getCurrentDate().call();

            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
        });

        it('should handle Date parameter and return', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const testDate = new Date('2025-01-15T00:00:00Z');
            const [result, error] = await routes.addDays(testDate, 5).call();

            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
            expect(result?.getDate()).toBe(20);
        });
    });

    describe('Complex Objects', () => {
        it('should serialize and deserialize complex user object', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.createComplexUser('user-1', 'John Doe', 'john@example.com').call();

            expect(error).toBeUndefined();
            expect(result?.id).toBe('user-1');
            expect(result?.name).toBe('John Doe');
            expect(result?.email).toBe('john@example.com');
            expect(result?.age).toBe(25);
            expect(result?.isActive).toBe(true);
            expect(result?.createdAt).toBeInstanceOf(Date);
            expect(result?.address.city).toBe('Test City');
            expect(result?.tags).toContain('user');
            expect(result?.scores).toEqual([100, 95, 88]);
        });

        it('should handle complex user update', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const user = {
                id: 'user-2',
                name: 'Jane Doe',
                email: 'jane@example.com',
                age: 28,
                isActive: true,
                createdAt: new Date('2025-01-01T00:00:00Z'),
                address: {
                    street: '456 Oak Ave',
                    city: 'Another City',
                    zip: '67890',
                    country: 'Test Country',
                },
                tags: ['premium'],
                scores: [90, 85],
            };
            const [result, error] = await routes.updateComplexUser(user).call();

            expect(error).toBeUndefined();
            expect(result?.isActive).toBe(false); // Toggled
            expect(result?.tags).toContain('updated');
        });
    });

    describe('Nested Data Structures', () => {
        it('should handle deeply nested data extraction', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const nestedData = {
                level1: {
                    level2: {
                        level3: {
                            value: 'deep-value',
                            numbers: [1, 2, 3],
                        },
                    },
                },
            };
            const [result, error] = await routes.processNestedData(nestedData).call();

            expect(error).toBeUndefined();
            expect(result).toBe('deep-value');
        });

        it('should create nested data structure', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.createNestedData('test-value', [10, 20, 30]).call();

            expect(error).toBeUndefined();
            expect(result?.level1.level2.level3.value).toBe('test-value');
            expect(result?.level1.level2.level3.numbers).toEqual([10, 20, 30]);
        });
    });

    describe('Optional and Nullable', () => {
        it('should handle optional parameter', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.greet('World').call();

            expect(error).toBeUndefined();
            expect(result).toBe('Hello, World!');
        });

        it('should handle optional parameter with value', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.greet('World', 'Hi').call();

            expect(error).toBeUndefined();
            expect(result).toBe('Hi, World!');
        });

        it('should handle nullable return - found', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.findUser('user-123').call();

            expect(error).toBeUndefined();
            expect(result).toEqual({name: 'Found User', age: 30});
        });

        it('should handle nullable return - not found', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.findUser('not-found').call();

            expect(error).toBeUndefined();
            expect(result).toBeNull();
        });
    });

    describe('Error Handling', () => {
        it('should handle success case', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.mayFail(false).call();

            expect(error).toBeUndefined();
            expect(result).toBe('Success!');
        });

        it('should handle error case', async () => {
            const {routes} = initClient<MyApi>({baseURL, serialize: 'binary'});
            const [result, error] = await routes.mayFail(true).call();

            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(error?.type).toBe('intentional-error');
        });
    });
});
