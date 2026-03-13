/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {initClient} from './client.ts';
import {routesFlow} from './routesFlow.ts';
import {isRpcError, HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

// THIS TESTS ARE INTENDED TO E2E TESTING OF THE BINARY SERIALIZER

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

describe('Binary Serialization E2E', () => {
    type MyApi = TestServerApi;

    const baseURL = TEST_SERVER_BASE_URL;
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    let routes: ReturnType<typeof initClient<MyApi>>['routes'];
    let middleFns: ReturnType<typeof initClient<MyApi>>['middleFns'];

    beforeEach(() => {
        const client = initClient<MyApi>({baseURL});
        routes = client.routes;
        middleFns = client.middleFns;
        middleFns.auth(authHeaders).prefill();
    });

    afterEach(async () => {
        await middleFns.auth(authHeaders).removePrefill();
    });

    describe('Simple Types', () => {
        it('should serialize and deserialize string echo', async () => {
            const [result, error] = await routes.binary.echo('Hello Binary World!').call();
            expect(error).toBeUndefined();
            expect(result).toBe('Hello Binary World!');
        });

        it('should serialize and deserialize number addition', async () => {
            const [result, error] = await routes.binary.addNumbers(10, 25).call();
            expect(error).toBeUndefined();
            expect(result).toBe(35);
        });

        it('should serialize and deserialize simple object', async () => {
            const [result, error] = await routes.binary.getSimpleUser('Alice', 28).call();
            expect(error).toBeUndefined();
            expect(result).toEqual({name: 'Alice', age: 28});
        });

        it('should serialize object as parameter and deserialize string result', async () => {
            const [result, error] = await routes.binary.processSimpleUser({name: 'Bob', age: 35}).call();
            expect(error).toBeUndefined();
            expect(result).toBe('User: Bob, Age: 35');
        });

        it('should handle boolean values', async () => {
            const [result, error] = await routes.binary.negate(true).call();
            expect(error).toBeUndefined();
            expect(result).toBe(false);
        });

        it('should handle void return', async () => {
            const [result, error] = await routes.binary.logMessage('Test message').call();
            expect(error).toBeUndefined();
            expect(result).toBeUndefined();
        });
    });

    describe('Array Types', () => {
        it('should serialize and deserialize number array sum', async () => {
            const [result, error] = await routes.binary.sumArray([1, 2, 3, 4, 5]).call();
            expect(error).toBeUndefined();
            expect(result).toBe(15);
        });

        it('should serialize and deserialize number array transformation', async () => {
            const [result, error] = await routes.binary.doubleArray([1, 2, 3, 4, 5]).call();
            expect(error).toBeUndefined();
            expect(result).toEqual([2, 4, 6, 8, 10]);
        });

        it('should serialize and deserialize string array', async () => {
            const [result, error] = await routes.binary.reverseStrings(['a', 'b', 'c']).call();
            expect(error).toBeUndefined();
            expect(result).toEqual(['c', 'b', 'a']);
        });

        it('should serialize and deserialize boolean array', async () => {
            const [result, error] = await routes.binary.allTrue([true, true, true]).call();
            expect(error).toBeUndefined();
            expect(result).toBe(true);
        });

        it('should handle boolean array with false values', async () => {
            const [result, error] = await routes.binary.allTrue([true, false, true]).call();
            expect(error).toBeUndefined();
            expect(result).toBe(false);
        });
    });

    describe('Date Types', () => {
        it('should serialize and deserialize Date return value', async () => {
            const [result, error] = await routes.binary.getCurrentDate().call();
            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
        });

        it('should serialize Date parameter and deserialize Date result', async () => {
            const inputDate = new Date('2025-01-15T00:00:00Z');
            const [result, error] = await routes.binary.addDays(inputDate, 5).call();
            expect(error).toBeUndefined();
            expect(result).toBeInstanceOf(Date);
            expect(result?.getTime()).toBe(new Date('2025-01-20T00:00:00Z').getTime());
        });
    });

    describe('Complex Object Types', () => {
        it('should serialize and deserialize complex object with nested data', async () => {
            const [result, error] = await routes.binary.createComplexUser('user-1', 'John Doe', 'john@example.com').call();
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

            const [result, error] = await routes.binary.updateComplexUser(inputUser).call();
            expect(error).toBeUndefined();
            expect(result?.isActive).toBe(false); // Should be toggled
            expect(result?.tags).toEqual(['premium', 'updated']); // Should have 'updated' added
            expect(result?.createdAt).toBeInstanceOf(Date);
        });
    });

    describe('Deeply Nested Data', () => {
        it('should serialize and deserialize deeply nested object', async () => {
            const [result, error] = await routes.binary.createNestedData('deep value', [1, 2, 3]).call();
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

            const [result, error] = await routes.binary.processNestedData(nestedData).call();
            expect(error).toBeUndefined();
            expect(result).toBe('extracted value');
        });
    });

    describe('Optional and Nullable Types', () => {
        it('should handle optional parameters (with value)', async () => {
            const [result, error] = await routes.binary.greet('World', 'Hi').call();
            expect(error).toBeUndefined();
            expect(result).toBe('Hi, World!');
        });

        it('should handle optional parameters (without value)', async () => {
            const [result, error] = await routes.binary.greet('World').call();
            expect(error).toBeUndefined();
            expect(result).toBe('Hello, World!');
        });

        it('should handle nullable return (with value)', async () => {
            const [result, error] = await routes.binary.findUser('user-123').call();
            expect(error).toBeUndefined();
            expect(result).toEqual({name: 'Found User', age: 30});
        });

        it('should handle nullable return (null)', async () => {
            const [result, error] = await routes.binary.findUser('not-found').call();
            expect(error).toBeUndefined();
            expect(result).toEqual(null);
        });
    });

    describe('Error Handling', () => {
        it('should handle RpcError return type (success case)', async () => {
            const [result, error] = await routes.binary.mayFail(false).call();
            expect(error).toBeUndefined();
            expect(result).toBe('Success!');
        });

        it('should handle RpcError return type (error case)', async () => {
            const [result, error] = await routes.binary.mayFail(true).call();

            expect(result).toBeUndefined();
            expect(error).not.toBeUndefined();
            expect(isRpcError(error)).toBe(true);
            expect(error?.type).toBe('intentional-error');
        });
    });

    describe('MiddleFns with Binary Serialization', () => {
        it('should handle middleFn with optional parameter (with value)', async () => {
            const [result, error, middleFnsResults] = await routes.binary.echo('test').callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                binarySession: middleFns.binary.session('valid-token'),
            });

            expect(error).toBeUndefined();
            expect(result).toBe('test');
            expect(middleFnsResults?.binarySession).toEqual({valid: true, userId: 'user-123'});
        });

        it('should handle middleFn with optional parameter (without value)', async () => {
            const [result, error, middleFnsResults] = await routes.binary.echo('test').callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                binarySession: middleFns.binary.session(),
            });

            expect(error).toBeUndefined();
            expect(result).toBe('test');
            expect(middleFnsResults?.binarySession).toBeNull();
        });

        it('should handle middleFn returning error-like object', async () => {
            const [result, error, middleFnsResults] = await routes.binary.echo('test').callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                binarySession: middleFns.binary.session('invalid'),
            });

            expect(error).toBeUndefined();
            expect(result).toBe('test');
            expect(middleFnsResults?.binarySession).toEqual({valid: false});
        });
    });

    describe('Multiple Calls', () => {
        it('should handle multiple sequential calls correctly', async () => {
            const [result1] = await routes.binary.addNumbers(1, 2).call();
            const [result2] = await routes.binary.addNumbers(3, 4).call();
            const [result3] = await routes.binary.addNumbers(5, 6).call();

            expect(result1).toBe(3);
            expect(result2).toBe(7);
            expect(result3).toBe(11);
        });

        it('should handle different types in sequential calls', async () => {
            const [stringResult] = await routes.binary.echo('hello').call();
            const [numberResult] = await routes.binary.addNumbers(10, 20).call();
            const [objectResult] = await routes.binary.getSimpleUser('Test', 25).call();
            const [arrayResult] = await routes.binary.doubleArray([1, 2, 3]).call();

            expect(stringResult).toBe('hello');
            expect(numberResult).toBe(30);
            expect(objectResult).toEqual({name: 'Test', age: 25});
            expect(arrayResult).toEqual([2, 4, 6]);
        });
    });

    describe('RoutesFlow with Binary Serialization', () => {
        it('should serialize and deserialize simple types in a routesFlow', async () => {
            const [[result1, result2], [error1, error2]] = await routesFlow([
                routes.binary.echo('Hello Workflow!'),
                routes.binary.addNumbers(10, 20),
            ]);

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();
            expect(result1).toBe('Hello Workflow!');
            expect(result2).toBe(30);
        });

        it('should serialize and deserialize objects in a routesFlow', async () => {
            const [[result1, result2], [error1, error2]] = await routesFlow([
                routes.binary.getSimpleUser('Alice', 28),
                routes.binary.processSimpleUser({name: 'Bob', age: 35}),
            ]);

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();
            expect(result1).toEqual({name: 'Alice', age: 28});
            expect(result2).toBe('User: Bob, Age: 35');
        });

        it('should serialize and deserialize arrays in a routesFlow', async () => {
            const [[result1, result2, result3], [error1, error2, error3]] = await routesFlow([
                routes.binary.sumArray([1, 2, 3, 4, 5]),
                routes.binary.doubleArray([10, 20, 30]),
                routes.binary.reverseStrings(['a', 'b', 'c']),
            ]);

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();
            expect(error3).toBeUndefined();
            expect(result1).toBe(15);
            expect(result2).toEqual([20, 40, 60]);
            expect(result3).toEqual(['c', 'b', 'a']);
        });

        it('should serialize and deserialize Date types in a routesFlow', async () => {
            const inputDate = new Date('2025-01-15T00:00:00Z');

            const [[result1, result2], [error1, error2]] = await routesFlow([
                routes.binary.getCurrentDate(),
                routes.binary.addDays(inputDate, 5),
            ]);

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();
            expect(result1).toBeInstanceOf(Date);
            expect(result2).toBeInstanceOf(Date);
            expect(result2?.getTime()).toBe(new Date('2025-01-20T00:00:00Z').getTime());
        });

        it('should serialize and deserialize complex objects in a routesFlow', async () => {
            const [[result1, result2], [error1, error2]] = await routesFlow([
                routes.binary.createComplexUser('user-1', 'John Doe', 'john@example.com'),
                routes.binary.createNestedData('deep value', [1, 2, 3]),
            ]);

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();

            // Complex user
            expect(result1).toMatchObject({
                id: 'user-1',
                name: 'John Doe',
                email: 'john@example.com',
                age: 25,
                isActive: true,
                tags: ['user', 'active'],
                scores: [100, 95, 88],
            });
            expect(result1?.createdAt).toBeInstanceOf(Date);

            // Nested data
            expect(result2).toEqual({
                level1: {level2: {level3: {value: 'deep value', numbers: [1, 2, 3]}}},
            });
        });

        it('should handle mixed types in a single routesFlow', async () => {
            const inputDate = new Date('2025-06-01T12:00:00Z');

            const [[result1, result2, result3, result4, result5], [error1, error2, error3, error4, error5]] = await routesFlow([
                routes.binary.echo('test'),
                routes.binary.addNumbers(5, 10),
                routes.binary.getSimpleUser('Test', 25),
                routes.binary.addDays(inputDate, 3),
                routes.binary.negate(true),
            ]);

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();
            expect(error3).toBeUndefined();
            expect(error4).toBeUndefined();
            expect(error5).toBeUndefined();
            expect(result1).toBe('test');
            expect(result2).toBe(15);
            expect(result3).toEqual({name: 'Test', age: 25});
            expect(result4).toBeInstanceOf(Date);
            expect(result4?.getTime()).toBe(new Date('2025-06-04T12:00:00Z').getTime());
            expect(result5).toBe(false);
        });

        it('should handle routesFlow with middleFns in binary mode', async () => {
            const [[result1, result2], [error1, error2], middleFnResults] = await routesFlow(
                [routes.binary.echo('workflow test'), routes.binary.addNumbers(1, 2)],
                {
                    auth: middleFns.auth(authHeaders),
                    binarySession: middleFns.binary.session('valid-token'),
                }
            );

            expect(error1).toBeUndefined();
            expect(error2).toBeUndefined();
            expect(result1).toBe('workflow test');
            expect(result2).toBe(3);
            expect(middleFnResults?.binarySession).toEqual({valid: true, userId: 'user-123'});
        });

        it('should handle errors in binary routesFlow', async () => {
            const [results, errors] = await routesFlow([routes.binary.mayFail(true), routes.binary.echo('should not reach')]);

            expect(errors).toBeDefined();
            expect(errors?.[0]).toBeDefined();
            expect(isRpcError(errors?.[0])).toBe(true);
            expect(errors?.[0]?.type).toBe('intentional-error');
        });
    });
});
