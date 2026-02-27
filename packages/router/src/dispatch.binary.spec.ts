/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {registerRoutes, resetRouter, initRouter, getRouteExecutionChain} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {serializeBinaryBody, deserializeBinaryBody, isRpcError, SerializerModes} from '@mionkit/core';
import {binaryTestRoutes, ComplexUser, NestedData} from '@mionkit/test-server';

// THIS TESTS ARE INTENDED TO TEST BINARY SERIALIZATION AT ROUTER LEVEL USING DISPATCH

describe('Binary Serialization at Router Level', () => {
    const getSharedData = () => ({user: null});

    beforeEach(async () => {
        resetRouter();
        await initRouter({contextDataFactory: getSharedData, serializer: 'binary'});
        await registerRoutes(binaryTestRoutes);
    });

    /** Helper to dispatch a binary request and get the deserialized response */
    async function dispatchBinaryRequest(routeId: string, params: any[]) {
        const path = `/${routeId}`;
        const executionChain = getRouteExecutionChain(path)!.methods;

        // Serialize request body to binary
        const requestBody = {[routeId]: params};
        const {buffer: requestBuffer} = serializeBinaryBody(path, executionChain, requestBody, false);

        // Dispatch the request
        const response = await dispatchRoute(
            path,
            requestBuffer,
            headersFromRecord({'content-type': 'application/octet-stream'}),
            headersFromRecord({}),
            {headers: headersFromRecord({}), body: requestBuffer},
            {},
            SerializerModes.binary
        );

        // Deserialize binary response
        const {body: responseBody} = deserializeBinaryBody(path, response.rawBody as ArrayBuffer, true);

        return {response, responseBody};
    }

    describe('Simple Types', () => {
        it('should serialize and deserialize string echo', async () => {
            const {responseBody} = await dispatchBinaryRequest('echo', ['Hello Binary World!']);
            expect(responseBody.echo).toBe('Hello Binary World!');
        });

        it('should serialize and deserialize number addition', async () => {
            const {responseBody} = await dispatchBinaryRequest('addNumbers', [10, 25]);
            expect(responseBody.addNumbers).toBe(35);
        });

        it('should serialize and deserialize simple object', async () => {
            const {responseBody} = await dispatchBinaryRequest('getSimpleUser', ['Alice', 28]);
            expect(responseBody.getSimpleUser).toEqual({name: 'Alice', age: 28});
        });

        it('should serialize object as parameter and deserialize string result', async () => {
            const {responseBody} = await dispatchBinaryRequest('processSimpleUser', [{name: 'Bob', age: 35}]);
            expect(responseBody.processSimpleUser).toBe('User: Bob, Age: 35');
        });

        it('should handle boolean values', async () => {
            const {responseBody} = await dispatchBinaryRequest('negate', [true]);
            expect(responseBody.negate).toBe(false);
        });

        it('should handle void return', async () => {
            const {responseBody} = await dispatchBinaryRequest('logMessage', ['Test message']);
            expect(responseBody.logMessage).toBeUndefined();
        });
    });

    describe('Array Types', () => {
        it('should serialize and deserialize number array sum', async () => {
            const {responseBody} = await dispatchBinaryRequest('sumArray', [[1, 2, 3, 4, 5]]);
            expect(responseBody.sumArray).toBe(15);
        });

        it('should serialize and deserialize number array transformation', async () => {
            const {responseBody} = await dispatchBinaryRequest('doubleArray', [[1, 2, 3, 4, 5]]);
            expect(responseBody.doubleArray).toEqual([2, 4, 6, 8, 10]);
        });

        it('should serialize and deserialize string array', async () => {
            const {responseBody} = await dispatchBinaryRequest('reverseStrings', [['a', 'b', 'c']]);
            expect(responseBody.reverseStrings).toEqual(['c', 'b', 'a']);
        });

        it('should serialize and deserialize boolean array', async () => {
            const {responseBody} = await dispatchBinaryRequest('allTrue', [[true, true, true]]);
            expect(responseBody.allTrue).toBe(true);
        });

        it('should handle boolean array with false values', async () => {
            const {responseBody} = await dispatchBinaryRequest('allTrue', [[true, false, true]]);
            expect(responseBody.allTrue).toBe(false);
        });
    });

    describe('Date Types', () => {
        it('should serialize and deserialize Date return value', async () => {
            const {responseBody} = await dispatchBinaryRequest('getCurrentDate', []);
            expect(responseBody.getCurrentDate).toBeInstanceOf(Date);
        });

        it('should serialize Date parameter and deserialize Date result', async () => {
            const inputDate = new Date('2025-01-15T00:00:00Z');
            const {responseBody} = await dispatchBinaryRequest('addDays', [inputDate, 5]);
            expect(responseBody.addDays).toBeInstanceOf(Date);
            expect(responseBody.addDays.getTime()).toBe(new Date('2025-01-20T00:00:00Z').getTime());
        });
    });

    describe('Complex Object Types', () => {
        it('should serialize and deserialize complex object with nested data', async () => {
            const {responseBody} = await dispatchBinaryRequest('createComplexUser', ['user-1', 'John Doe', 'john@example.com']);
            expect(responseBody.createComplexUser).toMatchObject({
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
            expect(responseBody.createComplexUser.createdAt).toBeInstanceOf(Date);
        });

        it('should serialize complex object as parameter and deserialize modified result', async () => {
            const inputUser: ComplexUser = {
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

            const {responseBody} = await dispatchBinaryRequest('updateComplexUser', [inputUser]);
            expect(responseBody.updateComplexUser.isActive).toBe(false); // Should be toggled
            expect(responseBody.updateComplexUser.tags).toEqual(['premium', 'updated']); // Should have 'updated' added
            expect(responseBody.updateComplexUser.createdAt).toBeInstanceOf(Date);
        });
    });

    describe('Deeply Nested Data', () => {
        it('should serialize and deserialize deeply nested object', async () => {
            const {responseBody} = await dispatchBinaryRequest('createNestedData', ['deep value', [1, 2, 3]]);
            expect(responseBody.createNestedData).toEqual({
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
            const nestedData: NestedData = {
                level1: {
                    level2: {
                        level3: {
                            value: 'extracted value',
                            numbers: [10, 20, 30],
                        },
                    },
                },
            };

            const {responseBody} = await dispatchBinaryRequest('processNestedData', [nestedData]);
            expect(responseBody.processNestedData).toBe('extracted value');
        });
    });

    describe('Optional and Nullable Types', () => {
        it('should handle optional parameters (with value)', async () => {
            const {responseBody} = await dispatchBinaryRequest('greet', ['World', 'Hi']);
            expect(responseBody.greet).toBe('Hi, World!');
        });

        it('should handle optional parameters (without value)', async () => {
            const {responseBody} = await dispatchBinaryRequest('greet', ['World']);
            expect(responseBody.greet).toBe('Hello, World!');
        });

        it('should handle nullable return (with value)', async () => {
            const {responseBody} = await dispatchBinaryRequest('findUser', ['user-123']);
            expect(responseBody.findUser).toEqual({name: 'Found User', age: 30});
        });

        it('should handle nullable return (null)', async () => {
            const {responseBody} = await dispatchBinaryRequest('findUser', ['not-found']);
            expect(responseBody.findUser).toEqual(null);
        });
    });

    describe('Error Handling', () => {
        it('should handle RpcError return type (success case)', async () => {
            const {responseBody} = await dispatchBinaryRequest('mayFail', [false]);
            expect(responseBody.mayFail).toBe('Success!');
        });

        it('should handle RpcError return type (error case)', async () => {
            const {responseBody} = await dispatchBinaryRequest('mayFail', [true]);

            expect(responseBody.mayFail).toBeDefined();
            expect(isRpcError(responseBody.mayFail)).toBe(true);
            expect(responseBody.mayFail.type).toBe('intentional-error');
        });
    });

    describe('MiddleFns with Binary Serialization', () => {
        it('should handle middleFn with optional parameter (with value)', async () => {
            const path = '/echo';
            const executionChain = getRouteExecutionChain(path)!.methods;

            // Serialize request body with middleFn params
            const requestBody = {
                echo: ['test'],
                session: ['valid-token'],
            };
            const {buffer: requestBuffer} = serializeBinaryBody(path, executionChain, requestBody, false);

            // Dispatch the request
            const response = await dispatchRoute(
                path,
                requestBuffer,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {headers: headersFromRecord({}), body: requestBuffer},
                {},
                SerializerModes.binary
            );

            // Deserialize binary response
            const {body: responseBody} = deserializeBinaryBody(path, response.rawBody as ArrayBuffer, true);

            expect(responseBody.echo).toBe('test');
            expect(responseBody.session).toEqual({valid: true, userId: 'user-123'});
        });

        it('should handle middleFn with optional parameter (without value)', async () => {
            const path = '/echo';
            const executionChain = getRouteExecutionChain(path)!.methods;

            // Serialize request body with middleFn params (no token)
            const requestBody = {
                echo: ['test'],
                session: [],
            };
            const {buffer: requestBuffer} = serializeBinaryBody(path, executionChain, requestBody, false);

            // Dispatch the request
            const response = await dispatchRoute(
                path,
                requestBuffer,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {headers: headersFromRecord({}), body: requestBuffer},
                {},
                SerializerModes.binary
            );

            // Deserialize binary response
            const {body: responseBody} = deserializeBinaryBody(path, response.rawBody as ArrayBuffer, true);

            expect(responseBody.echo).toBe('test');
            expect(responseBody.session).toBeNull();
        });

        it('should handle middleFn returning error-like object', async () => {
            const path = '/echo';
            const executionChain = getRouteExecutionChain(path)!.methods;

            // Serialize request body with invalid token
            const requestBody = {
                echo: ['test'],
                session: ['invalid'],
            };
            const {buffer: requestBuffer} = serializeBinaryBody(path, executionChain, requestBody, false);

            // Dispatch the request
            const response = await dispatchRoute(
                path,
                requestBuffer,
                headersFromRecord({'content-type': 'application/octet-stream'}),
                headersFromRecord({}),
                {headers: headersFromRecord({}), body: requestBuffer},
                {},
                SerializerModes.binary
            );

            // Deserialize binary response
            const {body: responseBody} = deserializeBinaryBody(path, response.rawBody as ArrayBuffer, true);

            expect(responseBody.echo).toBe('test');
            expect(responseBody.session).toEqual({valid: false});
        });
    });

    describe('Multiple Calls', () => {
        it('should handle multiple sequential calls correctly', async () => {
            const {responseBody: result1} = await dispatchBinaryRequest('addNumbers', [1, 2]);
            const {responseBody: result2} = await dispatchBinaryRequest('addNumbers', [3, 4]);
            const {responseBody: result3} = await dispatchBinaryRequest('addNumbers', [5, 6]);

            expect(result1.addNumbers).toBe(3);
            expect(result2.addNumbers).toBe(7);
            expect(result3.addNumbers).toBe(11);
        });

        it('should handle different types in sequential calls', async () => {
            const {responseBody: stringResult} = await dispatchBinaryRequest('echo', ['hello']);
            const {responseBody: numberResult} = await dispatchBinaryRequest('addNumbers', [10, 20]);
            const {responseBody: objectResult} = await dispatchBinaryRequest('getSimpleUser', ['Test', 25]);
            const {responseBody: arrayResult} = await dispatchBinaryRequest('doubleArray', [[1, 2, 3]]);

            expect(stringResult.echo).toBe('hello');
            expect(numberResult.addNumbers).toBe(30);
            expect(objectResult.getSimpleUser).toEqual({name: 'Test', age: 25});
            expect(arrayResult.doubleArray).toEqual([2, 4, 6]);
        });
    });
});
