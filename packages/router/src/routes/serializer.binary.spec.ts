/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initMionRouter, resetRouter, getRouterOptions} from '../router';
import {route, hook} from '../lib/handlers';
import {Routes} from '../types/general';
import {serializeResponseBody, deserializeRequestBody} from './serializer.routes';
import {createCallContext} from '../dispatch';
import {headersFromRecord} from '../lib/headers';
import type {MionResponse, RawRequestBody} from '../types/context';
import type {Mutable} from '@mionkit/core';
import {createDataViewSerializer, createDataViewDeserializer} from '@mionkit/core';

// Test types
interface User {
    id: string;
    name: string;
    age: number;
    createdAt: Date;
}

// Test routes with binary serialization
const routes = {
    auth: hook((ctx: any, token: string): void => {}),
    getUser: route(
        (ctx: any, id: string): User => ({
            id,
            name: 'John',
            age: 30,
            createdAt: new Date('2025-01-01T00:00:00Z'),
        })
    ),
    updateUser: route((ctx: any, user: User): User => user),
    sayHello: route((ctx: any, name: string): string => `Hello, ${name}!`),
    addNumbers: route((ctx: any, a: number, b: number): number => a + b),
    processArray: route((ctx: any, items: number[]): number[] => items.map((x) => x * 2)),
    voidRoute: route((ctx: any): void => {}),
} satisfies Routes;

/** Helper to create a binary context */
function getNewBinaryContext(path: string, body: RawRequestBody) {
    const opts = getRouterOptions();
    const reqHeaders = headersFromRecord({'content-type': 'application/octet-stream'});
    const respHeaders = headersFromRecord({});
    return createCallContext(path, opts, body, {}, reqHeaders, respHeaders);
}

describe('Binary Serialization - Router', () => {
    beforeEach(() => resetRouter());

    describe('Configuration', () => {
        it('should use binary serialization when serialize=binary', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            expect(opts.serialize).toBe('binary');
            expect(opts.deserialize).toBe('binary');
        });

        it('should default to stringifyJson serialization', async () => {
            await initMionRouter(routes, {});
            const opts = getRouterOptions();
            expect(opts.serialize).toBe('stringifyJson');
            expect(opts.deserialize).toBe('json');
        });
    });

    describe('Response Serialization (body type B)', () => {
        it('should serialize simple string response to binary', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            response.body = {sayHello: 'Hello, World!'};
            expect(context.response.bodyType).toBe('B');

            serializeResponseBody(context, opts);

            // rawBody should be a Uint8Array for binary
            expect(response.rawBody).toBeInstanceOf(Uint8Array);
            expect((response.rawBody as Uint8Array).length).toBeGreaterThan(0);
        });

        it('should serialize number response to binary', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/addNumbers', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            response.body = {addNumbers: 42};
            expect(context.response.bodyType).toBe('B');

            serializeResponseBody(context, opts);

            expect(response.rawBody).toBeInstanceOf(Uint8Array);
        });

        it('should serialize complex object response to binary', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/getUser', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            response.body = {
                getUser: {
                    id: '123',
                    name: 'John',
                    age: 30,
                    createdAt: new Date('2025-01-01T00:00:00Z'),
                },
            };
            expect(context.response.bodyType).toBe('B');

            serializeResponseBody(context, opts);

            expect(response.rawBody).toBeInstanceOf(Uint8Array);
            expect((response.rawBody as Uint8Array).length).toBeGreaterThan(0);
        });

        it('should serialize array response to binary', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/processArray', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            response.body = {processArray: [2, 4, 6, 8, 10]};
            expect(context.response.bodyType).toBe('B');

            serializeResponseBody(context, opts);

            expect(response.rawBody).toBeInstanceOf(Uint8Array);
        });

        it('should handle void return (no return data) in binary mode', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/voidRoute', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            response.body = {voidRoute: undefined};
            expect(context.response.bodyType).toBe('B');

            serializeResponseBody(context, opts);

            // Should still produce binary output even for void
            expect(response.rawBody).toBeInstanceOf(Uint8Array);
        });
    });

    describe('Binary Protocol Format', () => {
        it('should follow the binary protocol format for responses', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            response.body = {sayHello: 'Hello!'};

            serializeResponseBody(context, opts);

            const rawBody = response.rawBody as Uint8Array;
            const deserializer = createDataViewDeserializer('test-response', rawBody.buffer);

            // Read number of methods
            const numMethods = deserializer.view.getUint32(deserializer.index, true);
            deserializer.index += 4;
            expect(numMethods).toBe(1);

            // Read method ID
            const methodId = deserializer.desString();
            expect(methodId).toBe('sayHello');
        });

        it('should serialize multiple methods in response', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});
            const opts = getRouterOptions();
            const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
            const response = context.response as Mutable<MionResponse>;
            // Note: auth hook has void return (hasReturnData: false), so it won't be serialized
            // Only sayHello with actual return data will be serialized
            response.body = {
                auth: undefined,
                sayHello: 'Hello!',
            };

            serializeResponseBody(context, opts);

            const rawBody = response.rawBody as Uint8Array;
            const deserializer = createDataViewDeserializer('test-response', rawBody.buffer);

            // Read number of methods (should be 1 - only sayHello has return data)
            // auth hook has void return type so hasReturnData is false
            const numMethods = deserializer.view.getUint32(deserializer.index, true);
            deserializer.index += 4;
            expect(numMethods).toBe(1);
        });
    });

    describe('Request Deserialization (body type B)', () => {
        it('should deserialize binary request body', async () => {
            await initMionRouter(routes, {serialize: 'binary', deserialize: 'binary'});

            // Create binary request body
            const serializer = createDataViewSerializer('test-request');
            // Write number of methods
            serializer.view.setUint32(serializer.index, 1, true);
            serializer.index += 4;
            // Write method ID
            serializer.serString('sayHello');
            // Write params - for sayHello, params is [name: string]
            // The toBinary JIT function expects the params array
            serializer.serString('World');
            serializer.markAsEnded();
            const binaryBody = serializer.getBufferView();

            const context = getNewBinaryContext('/sayHello', binaryBody);

            // deserializeRequestBody doesn't return a value, it sets context.request.body
            deserializeRequestBody(context);

            // The body should have the method ID as key
            expect(context.request.body).toBeDefined();
            expect(context.request.body.sayHello).toBeDefined();
        });
    });
});
