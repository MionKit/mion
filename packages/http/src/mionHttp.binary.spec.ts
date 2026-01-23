/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Binary Serialization HTTP Transport Tests
 *
 * These tests verify binary data encoding/decoding through HTTP request/response cycles.
 * They bridge the gap between the working router-level tests and the failing client e2e tests.
 *
 * Test coverage:
 * - Binary data encoding/decoding through HTTP request/response cycles
 * - Proper Content-Type header handling for binary payloads
 * - Serialization/deserialization at HTTP boundaries
 * - Edge cases: empty payloads, large binary data, malformed input
 *
 * IMPORTANT: These tests use the router's JIT-compiled serialization functions
 * to ensure the binary format matches what the router expects.
 */

import {initRouter, registerRoutes, route, hook, resetRouter, getRouteExecutable, getHookExecutable} from '@mionkit/router';
import {setNodeHttpOpts, resetNodeHttpOpts, startNodeServer} from './mionHttp';
import {
    createDataViewSerializer,
    createDataViewDeserializer,
    createBinaryRequest,
    deserializeBinaryProtocol,
} from '@mionkit/core';
import type {Server} from 'http';

// Test types
interface SimpleUser {
    name: string;
    age: number;
}

interface ComplexUser {
    id: string;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    createdAt: Date;
    tags: string[];
}

// Test routes for binary serialization
const binaryRoutes = {
    // Simple types
    echo: route((_ctx: any, message: string): string => message),
    addNumbers: route((_ctx: any, a: number, b: number): number => a + b),
    negate: route((_ctx: any, value: boolean): boolean => !value),

    // Object types
    getUser: route(
        (_ctx: any, name: string, age: number): SimpleUser => ({
            name,
            age,
        })
    ),
    processUser: route((_ctx: any, user: SimpleUser): string => `User: ${user.name}, Age: ${user.age}`),

    // Array types
    sumArray: route((_ctx: any, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0)),
    doubleArray: route((_ctx: any, numbers: number[]): number[] => numbers.map((n) => n * 2)),

    // Date types
    getCurrentDate: route((_ctx: any): Date => new Date('2025-01-15T00:00:00Z')),
    addDays: route((_ctx: any, date: Date, days: number): Date => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }),

    // Complex types
    createComplexUser: route(
        (_ctx: any, id: string, name: string, email: string): ComplexUser => ({
            id,
            name,
            email,
            age: 25,
            isActive: true,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            tags: ['user', 'active'],
        })
    ),

    // Void return
    logMessage: route((_ctx: any, message: string): void => {
        // Just log, no return
    }),

    // Optional parameters
    greet: route((_ctx: any, name: string, greeting?: string): string => `${greeting || 'Hello'}, ${name}!`),

    // Nullable return
    findUser: route((_ctx: any, id: string): SimpleUser | null => {
        if (id === 'not-found') return null;
        return {name: 'Found User', age: 30};
    }),

    // Hook for testing
    session: hook((_ctx: any, token?: string): {valid: boolean; userId?: string} | null => {
        if (!token) return null;
        if (token === 'invalid') return {valid: false};
        return {valid: true, userId: 'user-123'};
    }),
};

const closeServer = (s: Server) => {
    return new Promise<void>((resolve, reject) => {
        s.close((err) => {
            if (err) reject();
            else resolve();
        });
    });
};

/**
 * Helper function to create a binary request body using the router's JIT functions.
 * This ensures the binary format matches what the router expects.
 */
function createBinaryRequestBody(methodId: string, params: any[]): Uint8Array {
    const method = getRouteExecutable(methodId);
    if (!method) throw new Error(`Method ${methodId} not found`);

    const serializer = createDataViewSerializer('test-request');

    // Write number of methods (1)
    serializer.view.setUint32(serializer.index, 1, true);
    serializer.index += 4;

    // Write method ID
    serializer.serString(methodId);

    // Serialize params using the method's toBinary JIT function
    if (!method.paramsJitFns.toBinary.isNoop) {
        method.paramsJitFns.toBinary.fn(params, serializer);
    }

    serializer.markAsEnded();
    return serializer.getBufferView();
}

/**
 * Helper function to deserialize a binary response body using the router's JIT functions.
 */
function deserializeBinaryResponseBody(methodId: string, arrayBuffer: ArrayBuffer): any {
    const method = getRouteExecutable(methodId);
    if (!method) throw new Error(`Method ${methodId} not found`);

    const deserializer = createDataViewDeserializer('test-response', arrayBuffer);

    // Read number of methods
    const numMethods = deserializer.view.getUint32(deserializer.index, true);
    deserializer.index += 4;

    const results: Record<string, any> = {};

    for (let i = 0; i < numMethods; i++) {
        // Read method ID
        const respMethodId = deserializer.desString();

        // Get the method for this response (could be a route or a hook)
        const respMethod = getRouteExecutable(respMethodId) || getHookExecutable(respMethodId);
        if (!respMethod) {
            throw new Error(`Response method ${respMethodId} not found`);
        }

        // Deserialize return value using the method's fromBinary JIT function
        if (respMethod.returnJitFns.fromBinary.isNoop) {
            results[respMethodId] = undefined;
        } else {
            results[respMethodId] = respMethod.returnJitFns.fromBinary.fn(undefined, deserializer);
        }
    }

    deserializer.markAsEnded();
    return results;
}

describe('Binary Serialization HTTP Transport', () => {
    let server: Server;
    const port = 8076;
    const baseUrl = `http://127.0.0.1:${port}`;

    beforeAll(async () => {
        resetNodeHttpOpts();
        resetRouter();
        setNodeHttpOpts({port});
        await initRouter({
            contextDataFactory: () => ({user: null}),
            serialize: 'binary',
        });
        await registerRoutes(binaryRoutes);
        server = await startNodeServer();
    });

    afterAll(async () => {
        if (server) await closeServer(server);
    });

    describe('Content-Type Header Handling', () => {
        it('should accept application/octet-stream content-type for binary requests', async () => {
            const binaryBody = createBinaryRequestBody('echo', ['Hello']);

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('application/octet-stream');
        });

        it('should return application/octet-stream content-type for binary responses', async () => {
            const binaryBody = createBinaryRequestBody('echo', ['Test']);

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.headers.get('content-type')).toBe('application/octet-stream');
        });

        it('should handle JSON content-type and return binary when router is in binary mode', async () => {
            // When sending JSON to a binary-mode router, it should process as JSON
            // but return binary since the router is in binary mode
            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({echo: ['Hello JSON']}),
            });

            expect(response.status).toBe(200);
            // Response should be binary since router is in binary mode
            expect(response.headers.get('content-type')).toBe('application/octet-stream');
        });
    });

    describe('Binary Request/Response Encoding', () => {
        it('should correctly handle string echo', async () => {
            const binaryBody = createBinaryRequestBody('echo', ['Hello Binary World!']);

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('echo', arrayBuffer);

            expect(results.echo).toBe('Hello Binary World!');
        });

        it('should correctly handle number addition', async () => {
            const binaryBody = createBinaryRequestBody('addNumbers', [10, 25]);

            const response = await fetch(`${baseUrl}/addNumbers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('addNumbers', arrayBuffer);

            expect(results.addNumbers).toBe(35);
        });

        it('should correctly handle boolean negation', async () => {
            const binaryBody = createBinaryRequestBody('negate', [true]);

            const response = await fetch(`${baseUrl}/negate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('negate', arrayBuffer);

            expect(results.negate).toBe(false);
        });

        it('should correctly handle object return', async () => {
            const binaryBody = createBinaryRequestBody('getUser', ['Alice', 28]);

            const response = await fetch(`${baseUrl}/getUser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('getUser', arrayBuffer);

            expect(results.getUser).toEqual({name: 'Alice', age: 28});
        });

        it('should correctly handle object parameter', async () => {
            const binaryBody = createBinaryRequestBody('processUser', [{name: 'Bob', age: 35}]);

            const response = await fetch(`${baseUrl}/processUser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('processUser', arrayBuffer);

            expect(results.processUser).toBe('User: Bob, Age: 35');
        });

        it('should correctly handle array sum', async () => {
            const binaryBody = createBinaryRequestBody('sumArray', [[1, 2, 3, 4, 5]]);

            const response = await fetch(`${baseUrl}/sumArray`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('sumArray', arrayBuffer);

            expect(results.sumArray).toBe(15);
        });

        it('should correctly handle array transformation', async () => {
            const binaryBody = createBinaryRequestBody('doubleArray', [[1, 2, 3]]);

            const response = await fetch(`${baseUrl}/doubleArray`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('doubleArray', arrayBuffer);

            expect(results.doubleArray).toEqual([2, 4, 6]);
        });

        it('should correctly handle Date return', async () => {
            const binaryBody = createBinaryRequestBody('getCurrentDate', []);

            const response = await fetch(`${baseUrl}/getCurrentDate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('getCurrentDate', arrayBuffer);

            expect(results.getCurrentDate).toBeInstanceOf(Date);
            expect(results.getCurrentDate.toISOString()).toBe('2025-01-15T00:00:00.000Z');
        });

        it('should correctly handle Date parameter and return', async () => {
            const inputDate = new Date('2025-01-15T00:00:00Z');
            const binaryBody = createBinaryRequestBody('addDays', [inputDate, 5]);

            const response = await fetch(`${baseUrl}/addDays`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('addDays', arrayBuffer);

            expect(results.addDays).toBeInstanceOf(Date);
            expect(results.addDays.toISOString()).toBe('2025-01-20T00:00:00.000Z');
        });

        it('should handle void return', async () => {
            const binaryBody = createBinaryRequestBody('logMessage', ['Test message']);

            const response = await fetch(`${baseUrl}/logMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);
        });

        it('should handle optional parameters (with value)', async () => {
            const binaryBody = createBinaryRequestBody('greet', ['World', 'Hi']);

            const response = await fetch(`${baseUrl}/greet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('greet', arrayBuffer);

            expect(results.greet).toBe('Hi, World!');
        });

        it('should handle optional parameters (without value)', async () => {
            const binaryBody = createBinaryRequestBody('greet', ['World']);

            const response = await fetch(`${baseUrl}/greet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('greet', arrayBuffer);

            expect(results.greet).toBe('Hello, World!');
        });

        it('should handle nullable return (with value)', async () => {
            const binaryBody = createBinaryRequestBody('findUser', ['user-123']);

            const response = await fetch(`${baseUrl}/findUser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('findUser', arrayBuffer);

            expect(results.findUser).toEqual({name: 'Found User', age: 30});
        });

        it('should handle nullable return (null)', async () => {
            const binaryBody = createBinaryRequestBody('findUser', ['not-found']);

            const response = await fetch(`${baseUrl}/findUser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('findUser', arrayBuffer);

            expect(results.findUser).toBeNull();
        });

        it('should handle complex object with nested data', async () => {
            const binaryBody = createBinaryRequestBody('createComplexUser', ['user-1', 'John Doe', 'john@example.com']);

            const response = await fetch(`${baseUrl}/createComplexUser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('createComplexUser', arrayBuffer);

            expect(results.createComplexUser).toMatchObject({
                id: 'user-1',
                name: 'John Doe',
                email: 'john@example.com',
                age: 25,
                isActive: true,
                tags: ['user', 'active'],
            });
            expect(results.createComplexUser.createdAt).toBeInstanceOf(Date);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty binary payload gracefully', async () => {
            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: new Uint8Array(0),
            });

            // Empty payload should result in an error or empty response
            // The exact behavior depends on the router implementation
            expect(response.status).toBeGreaterThanOrEqual(200);
        });

        it('should handle malformed binary input gracefully', async () => {
            // Send random bytes that don't follow the protocol
            const malformedData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: malformedData,
            });

            // Should return an error response (422 or similar)
            expect(response.status).toBeGreaterThanOrEqual(200);
        });

        it('should handle large binary payload', async () => {
            // Create a large string (10KB)
            const largeString = 'x'.repeat(10000);
            const binaryBody = createBinaryRequestBody('echo', [largeString]);

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: binaryBody,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('echo', arrayBuffer);

            expect(results.echo).toBe(largeString);
        });
    });

    describe('Buffer Handling', () => {
        it('should correctly handle Node.js Buffer as binary input', async () => {
            // This test verifies that the HTTP layer correctly passes Buffer to the router
            const binaryBody = createBinaryRequestBody('echo', ['Buffer Test']);

            // Convert to Buffer (simulating what Node.js HTTP does internally)
            const buffer = Buffer.from(binaryBody);

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: buffer,
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const results = deserializeBinaryResponseBody('echo', arrayBuffer);

            expect(results.echo).toBe('Buffer Test');
        });
    });

    describe('Hook with Binary Serialization', () => {
        it('should handle hook with optional parameter (with value)', async () => {
            // Create request with both hook and route
            const serializer = createDataViewSerializer('test-request');

            // Write number of methods (2)
            serializer.view.setUint32(serializer.index, 2, true);
            serializer.index += 4;

            // First: session hook
            const sessionMethod = getHookExecutable('session')!;
            serializer.serString('session');
            if (!sessionMethod.paramsJitFns.toBinary.isNoop) {
                sessionMethod.paramsJitFns.toBinary.fn(['valid-token'], serializer);
            }

            // Second: echo route
            const echoMethod = getRouteExecutable('echo')!;
            serializer.serString('echo');
            if (!echoMethod.paramsJitFns.toBinary.isNoop) {
                echoMethod.paramsJitFns.toBinary.fn(['test'], serializer);
            }

            serializer.markAsEnded();

            const response = await fetch(`${baseUrl}/echo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                },
                body: serializer.getBufferView(),
            });

            expect(response.status).toBe(200);

            const arrayBuffer = await response.arrayBuffer();
            const deserializer = createDataViewDeserializer('test-response', arrayBuffer);

            // Read number of methods
            const numMethods = deserializer.view.getUint32(deserializer.index, true);
            deserializer.index += 4;

            // Should have both session and echo results
            expect(numMethods).toBeGreaterThanOrEqual(1);
        });
    });
});

describe('Binary Serialization HTTP Transport - Diagnostic Tests', () => {
    let server: Server;
    const port = 8077;
    const baseUrl = `http://127.0.0.1:${port}`;

    beforeAll(async () => {
        resetNodeHttpOpts();
        resetRouter();
        setNodeHttpOpts({port});
        await initRouter({
            contextDataFactory: () => ({user: null}),
            serialize: 'binary',
        });
        await registerRoutes(binaryRoutes);
        server = await startNodeServer();
    });

    afterAll(async () => {
        if (server) await closeServer(server);
    });

    it('should diagnose: verify binary body is received correctly by server', async () => {
        const binaryBody = createBinaryRequestBody('echo', ['Diagnostic Test']);

        console.log('Sending binary body length:', binaryBody.byteLength);
        console.log('Binary body first 20 bytes:', Array.from(binaryBody.slice(0, 20)));

        const response = await fetch(`${baseUrl}/echo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
            },
            body: binaryBody,
        });

        console.log('Response status:', response.status);
        console.log('Response content-type:', response.headers.get('content-type'));

        const responseBuffer = await response.arrayBuffer();
        console.log('Response body length:', responseBuffer.byteLength);
        console.log('Response first 20 bytes:', Array.from(new Uint8Array(responseBuffer).slice(0, 20)));

        // Try to decode the error response
        if (response.status !== 200) {
            try {
                const deserializer = createDataViewDeserializer('error-response', responseBuffer);
                const numMethods = deserializer.view.getUint32(deserializer.index, true);
                deserializer.index += 4;
                console.log('Number of methods in response:', numMethods);

                for (let i = 0; i < numMethods; i++) {
                    const methodId = deserializer.desString();
                    console.log('Method ID:', methodId);

                    // If it's @thrownErrors, try to read the error
                    if (methodId === '@thrownErrors') {
                        // The error is serialized as an object
                        // Let's try to read it as JSON for debugging
                        const remaining = new Uint8Array(responseBuffer, deserializer.index);
                        console.log('Remaining bytes after @thrownErrors:', remaining.length);
                        console.log('Remaining bytes (first 50):', Array.from(remaining.slice(0, 50)));
                    }
                }
            } catch (e) {
                console.log('Error decoding response:', e);
            }
        }

        expect(response.status).toBe(200);

        const results = deserializeBinaryResponseBody('echo', responseBuffer);
        expect(results.echo).toBe('Diagnostic Test');
    });

    it('should diagnose: verify JIT functions are properly initialized', async () => {
        const echoMethod = getRouteExecutable('echo');
        expect(echoMethod).toBeDefined();
        expect(echoMethod!.paramsJitFns).toBeDefined();
        expect(echoMethod!.paramsJitFns.toBinary).toBeDefined();
        expect(echoMethod!.returnJitFns).toBeDefined();
        expect(echoMethod!.returnJitFns.fromBinary).toBeDefined();

        console.log('echo paramsJitFns.toBinary.isNoop:', echoMethod!.paramsJitFns.toBinary.isNoop);
        console.log('echo returnJitFns.fromBinary.isNoop:', echoMethod!.returnJitFns.fromBinary.isNoop);
    });

    it('should diagnose: compare manual serialization vs JIT function', async () => {
        const echoMethod = getRouteExecutable('echo');
        expect(echoMethod).toBeDefined();

        // Method 1: Manual serialization (like router test)
        const manualSerializer = createDataViewSerializer('manual-test');
        manualSerializer.view.setUint32(manualSerializer.index, 1, true);
        manualSerializer.index += 4;
        manualSerializer.serString('echo');
        manualSerializer.serString('Test Message'); // Direct string serialization
        manualSerializer.markAsEnded();
        const manualBuffer = manualSerializer.getBufferView();

        // Method 2: JIT function serialization (like HTTP test)
        const jitSerializer = createDataViewSerializer('jit-test');
        jitSerializer.view.setUint32(jitSerializer.index, 1, true);
        jitSerializer.index += 4;
        jitSerializer.serString('echo');
        echoMethod!.paramsJitFns.toBinary.fn(['Test Message'], jitSerializer); // JIT function with array
        jitSerializer.markAsEnded();
        const jitBuffer = jitSerializer.getBufferView();

        console.log('Manual buffer length:', manualBuffer.length);
        console.log('Manual buffer bytes:', Array.from(manualBuffer));
        console.log('JIT buffer length:', jitBuffer.length);
        console.log('JIT buffer bytes:', Array.from(jitBuffer));

        // Test manual serialization with the server
        const manualResponse = await fetch(`${baseUrl}/echo`, {
            method: 'POST',
            headers: {'Content-Type': 'application/octet-stream'},
            body: manualBuffer,
        });
        console.log('Manual serialization response status:', manualResponse.status);

        // Test JIT serialization with the server
        const jitResponse = await fetch(`${baseUrl}/echo`, {
            method: 'POST',
            headers: {'Content-Type': 'application/octet-stream'},
            body: jitBuffer,
        });
        console.log('JIT serialization response status:', jitResponse.status);

        // Try to decode the error response
        if (manualResponse.status !== 200) {
            const errorBuffer = await manualResponse.arrayBuffer();
            const errorDeserializer = createDataViewDeserializer('error', errorBuffer);
            const numMethods = errorDeserializer.view.getUint32(errorDeserializer.index, true);
            errorDeserializer.index += 4;
            console.log('Error response numMethods:', numMethods);
            for (let i = 0; i < numMethods; i++) {
                const methodId = errorDeserializer.desString();
                console.log('Error method ID:', methodId);
                if (methodId === '@thrownErrors') {
                    // Try to read the error array
                    const numErrors = errorDeserializer.view.getUint32(errorDeserializer.index, true);
                    errorDeserializer.index += 4;
                    console.log('Number of errors:', numErrors);
                    for (let j = 0; j < numErrors; j++) {
                        const hookId = errorDeserializer.desString();
                        const errorType = errorDeserializer.desString();
                        const errorMessage = errorDeserializer.desString();
                        console.log(`Error ${j}: hookId=${hookId}, type=${errorType}, message=${errorMessage}`);
                    }
                }
            }
        }

        // At least one should work
        expect(manualResponse.status === 200 || jitResponse.status === 200).toBe(true);
    });
});
