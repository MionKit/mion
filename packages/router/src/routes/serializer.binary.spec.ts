/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initMionRouter, resetRouter, getRouterOptions, getRouteExecutionChain} from '../router';
import {route, linkedFn} from '../lib/handlers';
import {Routes} from '../types/general';
import {serializeResponseBody, deserializeRequestBody} from './serializer.routes';
import {createCallContext} from '../callContext';
import {headersFromRecord} from '../lib/headers';
import type {MionResponse, RawRequestBody} from '../types/context';
import type {Mutable, MethodWithJitFns, BinaryInput} from '@mionkit/core';
import {createDataViewDeserializer, serializeBinaryBody, deserializeBinaryBody, SerializerModes} from '@mionkit/core';

/** Helper to build a methods map from an ExecutionChain */
function buildMethodsMap(executionChain: MethodWithJitFns[]): Map<string, MethodWithJitFns> {
    const map = new Map<string, MethodWithJitFns>();
    for (const method of executionChain) map.set(method.id, method);
    return map;
}

// Test types
interface User {
    id: string;
    name: string;
    age: number;
    createdAt: Date;
}

// Test routes with binary serialization
const routes = {
    auth: linkedFn((ctx: any, token: string): void => {}),
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

// Test routes with per-route serialization options
const routesWithPerRouteOptions = {
    // Route that uses JSON serialization even when router defaults to binary
    jsonRoute: route((ctx: any, name: string): string => `Hello, ${name}!`, {serializer: 'json'}),
    // Route that uses stringifyJson serialization
    stringifyJsonRoute: route((ctx: any, value: number): number => value * 2, {serializer: 'stringifyJson'}),
    // Route that uses binary serialization (explicit)
    binaryRoute: route((ctx: any, items: number[]): number[] => items.map((x) => x * 2), {serializer: 'binary'}),
    // Route without explicit serializer option (uses router default)
    defaultRoute: route((ctx: any, msg: string): string => msg),
} satisfies Routes;

/** Helper to create a binary context */
function getNewBinaryContext(path: string, body: RawRequestBody) {
    const opts = getRouterOptions();
    const reqHeaders = headersFromRecord({'content-type': 'application/octet-stream'});
    const respHeaders = headersFromRecord({});
    const context = createCallContext(path, opts, body, {}, reqHeaders, respHeaders);
    // Set bodyType from ExecutionChain (as done in runExecutionChain)
    const executionChain = getRouteExecutionChain(path);
    if (executionChain) {
        (context.response as Mutable<MionResponse>).bodyType = executionChain.serializer;
    }
    return context;
}

describe('Binary Serialization - Router', () => {
    beforeEach(() => resetRouter());

    it('should use binary serialization when serialize=binary', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        expect(opts.serializer).toBe('binary');
    });

    it('should default to json serialization', async () => {
        await initMionRouter(routes, {});
        const opts = getRouterOptions();
        expect(opts.serializer).toBe('json');
    });

    it('should serialize simple string response to binary', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        response.body = {sayHello: 'Hello, World!'};
        expect(context.response.bodyType).toBe(SerializerModes.binary);

        serializeResponseBody(context, opts);

        // rawBody should be a Uint8Array for binary
        expect(response.rawBody).toBeInstanceOf(Uint8Array);
        expect((response.rawBody as Uint8Array).length).toBeGreaterThan(0);
    });

    it('should serialize number response to binary', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        const context = getNewBinaryContext('/addNumbers', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        response.body = {addNumbers: 42};
        expect(context.response.bodyType).toBe(SerializerModes.binary);

        serializeResponseBody(context, opts);

        expect(response.rawBody).toBeInstanceOf(Uint8Array);
    });

    it('should serialize complex object response to binary', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
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
        expect(context.response.bodyType).toBe(SerializerModes.binary);

        serializeResponseBody(context, opts);

        expect(response.rawBody).toBeInstanceOf(Uint8Array);
        expect((response.rawBody as Uint8Array).length).toBeGreaterThan(0);
    });

    it('should serialize array response to binary', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        const context = getNewBinaryContext('/processArray', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        response.body = {processArray: [2, 4, 6, 8, 10]};
        expect(context.response.bodyType).toBe(SerializerModes.binary);

        serializeResponseBody(context, opts);

        expect(response.rawBody).toBeInstanceOf(Uint8Array);
    });

    it('should handle void return (no return data) in binary mode', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        const context = getNewBinaryContext('/voidRoute', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        response.body = {voidRoute: undefined};
        expect(context.response.bodyType).toBe(SerializerModes.binary);

        serializeResponseBody(context, opts);

        // Should still produce binary output even for void
        expect(response.rawBody).toBeInstanceOf(Uint8Array);
    });

    it('should follow the binary protocol format for responses', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        response.body = {sayHello: 'Hello!'};

        serializeResponseBody(context, opts);

        const rawBody = response.rawBody as BinaryInput;
        const deserializer = createDataViewDeserializer(rawBody);

        // Read number of methods
        const numMethods = deserializer.view.getUint32(deserializer.index, true);
        deserializer.index += 4;
        expect(numMethods).toBe(1);

        // Read method ID
        const methodId = deserializer.desString();
        expect(methodId).toBe('sayHello');
    });

    it('should serialize multiple methods in response', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const opts = getRouterOptions();
        const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        // Note: auth linkedFn has void return (hasReturnData: false), so it won't be serialized
        // Only sayHello with actual return data will be serialized
        response.body = {
            auth: undefined,
            sayHello: 'Hello!',
        };

        serializeResponseBody(context, opts);

        const rawBody = response.rawBody as BinaryInput;
        const deserializer = createDataViewDeserializer(rawBody);

        // Read number of methods (should be 1 - only sayHello has return data)
        // auth linkedFn has void return type so hasReturnData is false
        const numMethods = deserializer.view.getUint32(deserializer.index, true);
        deserializer.index += 4;
        expect(numMethods).toBe(1);
    });

    it('should correctly roundtrip string response', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/sayHello')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize
        const originalBody = {sayHello: 'Hello, World!'};
        const {buffer} = serializeBinaryBody('/sayHello', executionChain, originalBody, true);

        // Deserialize
        const {body: deserializedBody} = deserializeBinaryBody('/sayHello', methodsMap, buffer, true);

        expect(deserializedBody.sayHello).toBe('Hello, World!');
    });

    it('should correctly roundtrip number response', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/addNumbers')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize
        const originalBody = {addNumbers: 42};
        const {buffer} = serializeBinaryBody('/addNumbers', executionChain, originalBody, true);

        // Deserialize
        const {body: deserializedBody} = deserializeBinaryBody('/addNumbers', methodsMap, buffer, true);

        expect(deserializedBody.addNumbers).toBe(42);
    });

    it('should correctly roundtrip array response', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/processArray')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize
        const originalBody = {processArray: [1, 2, 3, 4, 5]};
        const {buffer} = serializeBinaryBody('/processArray', executionChain, originalBody, true);

        // Deserialize
        const {body: deserializedBody} = deserializeBinaryBody('/processArray', methodsMap, buffer, true);

        expect(deserializedBody.processArray).toEqual([1, 2, 3, 4, 5]);
    });

    it('should correctly roundtrip complex object response with Date', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/getUser')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize
        const originalDate = new Date('2025-01-01T00:00:00Z');
        const originalBody = {
            getUser: {
                id: '123',
                name: 'John',
                age: 30,
                createdAt: originalDate,
            },
        };
        const {buffer} = serializeBinaryBody('/getUser', executionChain, originalBody, true);

        // Deserialize
        const {body: deserializedBody} = deserializeBinaryBody('/getUser', methodsMap, buffer, true);

        expect(deserializedBody.getUser.id).toBe('123');
        expect(deserializedBody.getUser.name).toBe('John');
        expect(deserializedBody.getUser.age).toBe(30);
        expect(deserializedBody.getUser.createdAt).toEqual(originalDate);
    });

    it('should correctly roundtrip request params', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/sayHello')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize request params (isResponse = false)
        const originalBody = {sayHello: ['World']};
        const {buffer} = serializeBinaryBody('/sayHello', executionChain, originalBody, false);

        // Deserialize
        const {body: deserializedBody} = deserializeBinaryBody('/sayHello', methodsMap, buffer, false);

        expect(deserializedBody.sayHello).toEqual(['World']);
    });

    it('should correctly roundtrip multiple number params', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/addNumbers')!.methods;
        const methodsMap = buildMethodsMap(executionChain);

        // Serialize request params (isResponse = false)
        const originalBody = {addNumbers: [10, 25]};
        const {buffer} = serializeBinaryBody('/addNumbers', executionChain, originalBody, false);

        // Deserialize
        const {body: deserializedBody} = deserializeBinaryBody('/addNumbers', methodsMap, buffer, false);

        expect(deserializedBody.addNumbers).toEqual([10, 25]);
    });

    it('should deserialize binary request body', async () => {
        await initMionRouter(routes, {serializer: 'binary'});
        const executionChain = getRouteExecutionChain('/sayHello')!.methods;

        // Create binary request body using core serializeBinaryBody
        const originalBody = {sayHello: ['World']};
        const {buffer} = serializeBinaryBody('/sayHello', executionChain, originalBody, false);

        const context = getNewBinaryContext('/sayHello', buffer);

        // deserializeRequestBody doesn't return a value, it sets context.request.body
        deserializeRequestBody(context);

        // The body should have the method ID as key
        expect(context.request.body).toBeDefined();
        expect(context.request.body.sayHello).toBeDefined();
        expect(context.request.body.sayHello).toEqual(['World']);
    });

    it('should use JSON serialization when route specifies serializer: json', async () => {
        await initMionRouter(routesWithPerRouteOptions, {serializer: 'binary'});
        const opts = getRouterOptions();

        // Create context for the JSON route
        const reqHeaders = headersFromRecord({'content-type': 'application/json'});
        const respHeaders = headersFromRecord({});
        const context = createCallContext('/jsonRoute', opts, '{}', {}, reqHeaders, respHeaders);
        const response = context.response as Mutable<MionResponse>;
        response.body = {jsonRoute: 'Hello, World!'};

        // The body type should be updated based on route's serializer option
        // This happens in runExecutionChain, but we can test the serializer directly
        // by manually setting the body type
        (response as Mutable<MionResponse>).bodyType = SerializerModes.json; // JSON mode

        serializeResponseBody(context, opts);

        // Should use JSON content-type
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    });

    it('should use stringifyJson serialization when route specifies serializer: stringifyJson', async () => {
        await initMionRouter(routesWithPerRouteOptions, {serializer: 'binary'});
        const opts = getRouterOptions();

        const reqHeaders = headersFromRecord({'content-type': 'application/json'});
        const respHeaders = headersFromRecord({});
        const context = createCallContext('/stringifyJsonRoute', opts, '{}', {}, reqHeaders, respHeaders);
        const response = context.response as Mutable<MionResponse>;
        response.body = {stringifyJsonRoute: 42};
        (response as Mutable<MionResponse>).bodyType = SerializerModes.stringifyJson; // stringifyJson mode

        serializeResponseBody(context, opts);

        // Should use JSON content-type
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        // rawBody should be a string
        expect(typeof response.rawBody).toBe('string');
    });

    it('should use binary serialization when route specifies serializer: binary', async () => {
        await initMionRouter(routesWithPerRouteOptions, {serializer: 'json'});
        const opts = getRouterOptions();

        const reqHeaders = headersFromRecord({'content-type': 'application/octet-stream'});
        const respHeaders = headersFromRecord({});
        const context = createCallContext('/binaryRoute', opts, new Uint8Array(0), {}, reqHeaders, respHeaders);
        const response = context.response as Mutable<MionResponse>;
        response.body = {binaryRoute: [2, 4, 6]};
        (response as Mutable<MionResponse>).bodyType = SerializerModes.binary; // binary mode

        serializeResponseBody(context, opts);

        // Should use binary content-type
        expect(response.headers.get('content-type')).toBe('application/octet-stream');
        // rawBody should be a Uint8Array
        expect(response.rawBody).toBeInstanceOf(Uint8Array);
    });

    it('should use router default when route does not specify serializer option', async () => {
        await initMionRouter(routesWithPerRouteOptions, {serializer: 'binary'});
        const opts = getRouterOptions();

        const context = getNewBinaryContext('/defaultRoute', new Uint8Array(0));
        const response = context.response as Mutable<MionResponse>;
        response.body = {defaultRoute: 'test message'};

        // Body type should be binary (router default)
        expect(context.response.bodyType).toBe(SerializerModes.binary);

        serializeResponseBody(context, opts);

        // Should use binary content-type
        expect(response.headers.get('content-type')).toBe('application/octet-stream');
        expect(response.rawBody).toBeInstanceOf(Uint8Array);
    });

    it('should store serializer option in route executable', async () => {
        await initMionRouter(routesWithPerRouteOptions, {serializer: 'binary'});

        // Import getRouteExecutable to check the stored options
        const {getRouteExecutable} = await import('../router');

        const jsonRoute = getRouteExecutable('jsonRoute');
        expect(jsonRoute?.options.serializer).toBe('json');

        const stringifyJsonRoute = getRouteExecutable('stringifyJsonRoute');
        expect(stringifyJsonRoute?.options.serializer).toBe('stringifyJson');

        const binaryRoute = getRouteExecutable('binaryRoute');
        expect(binaryRoute?.options.serializer).toBe('binary');

        const defaultRoute = getRouteExecutable('defaultRoute');
        expect(defaultRoute?.options.serializer).toBe('binary');
    });
});
