/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from '@mionkit/client';
import {isRpcError} from '@mionkit/core';
import {BinaryTestServerApi} from '@mionkit/test-server';

// THIS TESTS ARE INTENDED TO E2E TESTING OF THE BINARY SERIALIZER

// Mock localStorage for method metadata storage
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// Shared test server port (started by globalSetup)
const TEST_SERVER_PORT_BINARY = 8087;
const baseURL = `http://localhost:${TEST_SERVER_PORT_BINARY}`;

describe('Binary Serialization E2E', () => {
    type MyApi = BinaryTestServerApi;

    describe('Simple Types', () => {
        it('should serialize and deserialize string echo', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.echo('Hello Binary World!').call();
            expect(error).toBeUndefined();
            expect(result).toBe('Hello Binary World!');
        });

        it('should serialize and deserialize number addition', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.addNumbers(10, 25).call();
            expect(error).toBeUndefined();
            expect(result).toBe(35);
        });

        it('should serialize and deserialize simple object', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.getSimpleUser('Alice', 28).call();
            expect(error).toBeUndefined();
            expect(result).toEqual({name: 'Alice', age: 28});
        });

        it('should serialize object as parameter and deserialize string result', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.processSimpleUser({name: 'Bob', age: 35}).call();
            expect(error).toBeUndefined();
            expect(result).toBe('User: Bob, Age: 35');
        });

        it('should handle boolean values', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.negate(true).call();
            expect(error).toBeUndefined();
            expect(result).toBe(false);
        });

        it('should handle void return', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.logMessage('Test message').call();
            expect(error).toBeUndefined();
            expect(result).toBeUndefined();
        });
    });

    describe('Array Types', () => {
        it('should serialize and deserialize number array sum', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.sumArray([1, 2, 3, 4, 5]).call();
            expect(error).toBeUndefined();
            expect(result).toBe(15);
        });

        it('should serialize and deserialize number array transformation', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.doubleArray([1, 2, 3, 4, 5]).call();
            expect(error).toBeUndefined();
            expect(result).toEqual([2, 4, 6, 8, 10]);
        });

        it('should serialize and deserialize string array', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.reverseStrings(['a', 'b', 'c']).call();
            expect(error).toBeUndefined();
            expect(result).toEqual(['c', 'b', 'a']);
        });

        it('should serialize and deserialize boolean array', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.allTrue([true, true, true]).call();
            expect(error).toBeUndefined();
            expect(result).toBe(true);
        });

        it('should handle boolean array with false values', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.allTrue([true, false, true]).call();
            expect(error).toBeUndefined();
            expect(result).toBe(false);
        });
    });

    describe('Date Types', () => {
        it('should serialize and deserialize Date return value', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.getCurrentDate().call();
            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
        });

        it('should serialize Date parameter and deserialize Date result', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const inputDate = new Date('2025-01-15T00:00:00Z');
            const [result, error] = await routes.addDays(inputDate, 5).call();
            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
            expect(result?.getTime()).toBe(new Date('2025-01-20T00:00:00Z').getTime());
        });
    });

    describe('Complex Object Types', () => {
        it('should serialize and deserialize complex object with nested data', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.createComplexUser('user-1', 'John Doe', 'john@example.com').call();
            expect(error).toBeUndefined();
            expect(result).toMatchObject({
                id: 'user-1',
                name: 'John Doe',
                email: 'john@example.com',
                age: 25,
                isActive: true,
                address: {
                    street: '123 Main St',
                    city: 'Test City',
                    zip: '12345',
                    country: 'Test Country',
                },
                tags: ['user', 'active'],
                scores: [100, 95, 88],
            });
            expect(result?.createdAt).toBeInstanceOf(Date);
        });

        it('should serialize complex object as parameter and deserialize modified result', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const inputUser = {
                id: 'user-2',
                name: 'Jane Doe',
                email: 'jane@example.com',
                age: 30,
                isActive: true,
                createdAt: new Date('2025-01-01T00:00:00Z'),
                address: {
                    street: '456 Oak Ave',
                    city: 'Another City',
                    zip: '67890',
                    country: 'Another Country',
                },
                tags: ['premium'],
                scores: [90, 85],
            };

            const [result, error] = await routes.updateComplexUser(inputUser).call();
            expect(error).toBeUndefined();
            expect(result?.isActive).toBe(false); // Should be toggled
            expect(result?.tags).toEqual(['premium', 'updated']); // Should have 'updated' added
            expect(result?.createdAt).toBeInstanceOf(Date);
        });
    });

    describe('Deeply Nested Data', () => {
        it('should serialize and deserialize deeply nested object', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.createNestedData('deep value', [1, 2, 3]).call();
            expect(error).toBeUndefined();
            expect(result).toEqual({
                level1: {
                    level2: {
                        level3: {
                            value: 'deep value',
                            numbers: [1, 2, 3],
                        },
                    },
                },
            });
        });

        it('should serialize deeply nested object as parameter', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const nestedData = {
                level1: {
                    level2: {
                        level3: {
                            value: 'extracted value',
                            numbers: [10, 20, 30],
                        },
                    },
                },
            };

            const [result, error] = await routes.processNestedData(nestedData).call();
            expect(error).toBeUndefined();
            expect(result).toBe('extracted value');
        });
    });

    describe('Optional and Nullable Types', () => {
        it('should handle optional parameters (with value)', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.greet('World', 'Hi').call();
            expect(error).toBeUndefined();
            expect(result).toBe('Hi, World!');
        });

        it('should handle optional parameters (without value)', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.greet('World').call();
            expect(error).toBeUndefined();
            expect(result).toBe('Hello, World!');
        });

        it('should handle nullable return (with value)', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.findUser('user-123').call();
            expect(error).toBeUndefined();
            expect(result).toEqual({name: 'Found User', age: 30});
        });

        it('should handle nullable return (null)', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.findUser('not-found').call();
            expect(error).toBeUndefined();
            expect(result).toEqual(null);
        });
    });

    describe('Error Handling', () => {
        it('should handle RpcError return type (success case)', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.mayFail(false).call();
            expect(error).toBeUndefined();
            expect(result).toBe('Success!');
        });

        it('should handle RpcError return type (error case)', async () => {
            const {routes} = initClient<MyApi>({baseURL});
            const [result, error] = await routes.mayFail(true).call();

            expect(result).toBeUndefined();
            expect(error).not.toBeUndefined();
            expect(isRpcError(error)).toBe(true);
            expect(error?.type).toBe('intentional-error');
        });
    });

    describe('LinkedFns with Binary Serialization', () => {
        it('should handle linkedFn with optional parameter (with value)', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const [result, error, linkedFnsResults] = await routes.echo('test').callWithLinkedFns({
                session: linkedFns.session('valid-token'),
            });

            expect(error).toBeUndefined();
            expect(result).toBe('test');
            expect(linkedFnsResults?.session).toEqual({valid: true, userId: 'user-123'});
        });

        it('should handle linkedFn with optional parameter (without value)', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const [result, error, linkedFnsResults] = await routes.echo('test').callWithLinkedFns({
                session: linkedFns.session(),
            });

            expect(error).toBeUndefined();
            expect(result).toBe('test');
            expect(linkedFnsResults?.session).toBeNull();
        });

        it('should handle linkedFn returning error-like object', async () => {
            const {routes, linkedFns} = initClient<MyApi>({baseURL});
            const [result, error, linkedFnsResults] = await routes.echo('test').callWithLinkedFns({
                session: linkedFns.session('invalid'),
            });

            expect(error).toBeUndefined();
            expect(result).toBe('test');
            expect(linkedFnsResults?.session).toEqual({valid: false});
        });
    });

    describe('Multiple Calls', () => {
        it('should handle multiple sequential calls correctly', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            const [result1] = await routes.addNumbers(1, 2).call();
            const [result2] = await routes.addNumbers(3, 4).call();
            const [result3] = await routes.addNumbers(5, 6).call();

            expect(result1).toBe(3);
            expect(result2).toBe(7);
            expect(result3).toBe(11);
        });

        it('should handle different types in sequential calls', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            const [stringResult] = await routes.echo('hello').call();
            const [numberResult] = await routes.addNumbers(10, 20).call();
            const [objectResult] = await routes.getSimpleUser('Test', 25).call();
            const [arrayResult] = await routes.doubleArray([1, 2, 3]).call();

            expect(stringResult).toBe('hello');
            expect(numberResult).toBe(30);
            expect(objectResult).toEqual({name: 'Test', age: 25});
            expect(arrayResult).toEqual([2, 4, 6]);
        });
    });
});
