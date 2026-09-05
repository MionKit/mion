/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getRouterOptions, getRouteExecutionChain} from '../router.ts';
import {Routes} from '../types/general.ts';
import {serializeResponseBody, deserializeRequestBody} from './serializer.routes.ts';
import {createCallContext} from '../callContext.ts';
import {headersFromRecord} from '../lib/headers.ts';
import type {MionResponse, RawRequestBody} from '../types/context.ts';
import type {Mutable, BinaryInput} from '@mionjs/core';
import {createDataViewDeserializer, serializeBinaryBody, deserializeBinaryBody, SerializerModes} from '@mionjs/core';

const mion = createMionRouter({serializer: 'binary'});

// Test types
interface User {
  id: string;
  name: string;
  age: number;
  createdAt: Date;
}

// Test routes with binary serialization
const routes = {
  auth: mion.middleFn((ctx: any, token: string): void => {}),
  getUser: mion.route(
    (ctx: any, id: string): User => ({
      id,
      name: 'John',
      age: 30,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    })
  ),
  updateUser: mion.route((ctx: any, user: User): User => user),
  sayHello: mion.route((ctx: any, name: string): string => `Hello, ${name}!`),
  addNumbers: mion.route((ctx: any, a: number, b: number): number => a + b),
  processArray: mion.route((ctx: any, items: number[]): number[] => items.map((x) => x * 2)),
  voidRoute: mion.route((ctx: any): void => {}),
} satisfies Routes;

// Test routes with per-route serialization options
const routesWithPerRouteOptions = {
  // Route that uses JSON serialization even when router defaults to binary
  jsonRoute: mion.route((ctx: any, name: string): string => `Hello, ${name}!`, {serializer: 'json'}),
  // Route that uses stringifyJson serialization
  stringifyJsonRoute: mion.route((ctx: any, value: number): number => value * 2, {serializer: 'stringifyJson'}),
  // Route that uses binary serialization (explicit)
  binaryRoute: mion.route((ctx: any, items: number[]): number[] => items.map((x) => x * 2), {serializer: 'binary'}),
  // Route without explicit serializer option (uses router default)
  defaultRoute: mion.route((ctx: any, msg: string): string => msg),
} satisfies Routes;

/** Helper to create a binary context */
function getNewBinaryContext(path: string, body: RawRequestBody) {
  const opts = getRouterOptions();
  const reqHeaders = headersFromRecord({'content-type': 'application/octet-stream'});
  const respHeaders = headersFromRecord({});
  const context = createCallContext(path, opts, body, {}, reqHeaders, respHeaders);
  // Set bodyType from ExecutionChain (as done in runExecutionChain)
  const executionChain = getRouteExecutionChain(path)!;
  if (executionChain) {
    (context.response as Mutable<MionResponse>).serializer = executionChain.serializer;
  }
  return context;
}

describe('Binary Serialization - Router', () => {
  beforeEach(() => resetRouter());

  it('should use binary serialization when serialize=binary', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    expect(opts.serializer).toBe('binary');
  });

  it('should default to json serialization', async () => {
    await createMionRouter({}).initRoutes(routes);
    const opts = getRouterOptions();
    expect(opts.serializer).toBe('json');
  });

  it('should serialize simple string response to binary', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    response.body = {sayHello: 'Hello, World!'};
    expect(context.response.serializer).toBe(SerializerModes.binary);

    void serializeResponseBody(context, opts);

    // binary payload is read from binSerializer, not rawBody
    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
    expect(response.binSerializer!.getLength()).toBeGreaterThan(0);
  });

  it('should serialize number response to binary', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    const context = getNewBinaryContext('/addNumbers', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    response.body = {addNumbers: 42};
    expect(context.response.serializer).toBe(SerializerModes.binary);

    void serializeResponseBody(context, opts);

    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
  });

  it('should serialize complex object response to binary', async () => {
    await mion.initRoutes(routes);
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
    expect(context.response.serializer).toBe(SerializerModes.binary);

    void serializeResponseBody(context, opts);

    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
    expect(response.binSerializer!.getLength()).toBeGreaterThan(0);
  });

  it('should serialize array response to binary', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    const context = getNewBinaryContext('/processArray', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    response.body = {processArray: [2, 4, 6, 8, 10]};
    expect(context.response.serializer).toBe(SerializerModes.binary);

    void serializeResponseBody(context, opts);

    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
  });

  it('should handle void return (no return data) in binary mode', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    const context = getNewBinaryContext('/voidRoute', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    response.body = {voidRoute: undefined};
    expect(context.response.serializer).toBe(SerializerModes.binary);

    void serializeResponseBody(context, opts);

    // Should still produce binary output even for void
    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
  });

  it('should follow the binary protocol format for responses', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    response.body = {sayHello: 'Hello!'};

    void serializeResponseBody(context, opts);

    const rawBody = response.binSerializer!.getBufferView() as BinaryInput;
    const deserializer = createDataViewDeserializer('test-response', rawBody);

    // Read number of methods
    const numMethods = deserializer.view.getUint32(deserializer.index, true);
    deserializer.index += 4;
    expect(numMethods).toBe(1);

    // Read method ID
    const methodId = deserializer.desString();
    expect(methodId).toBe('sayHello');
  });

  it('should serialize multiple methods in response', async () => {
    await mion.initRoutes(routes);
    const opts = getRouterOptions();
    const context = getNewBinaryContext('/sayHello', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    // Note: auth middleFn has void return (hasReturnData: false), so it won't be serialized
    // Only sayHello with actual return data will be serialized
    response.body = {
      auth: undefined,
      sayHello: 'Hello!',
    };

    void serializeResponseBody(context, opts);

    const rawBody = response.binSerializer!.getBufferView() as BinaryInput;
    const deserializer = createDataViewDeserializer('test-response', rawBody);

    // Read number of methods (should be 1 - only sayHello has return data)
    // auth middleFn has void return type so hasReturnData is false
    const numMethods = deserializer.view.getUint32(deserializer.index, true);
    deserializer.index += 4;
    expect(numMethods).toBe(1);
  });

  it('should correctly roundtrip string response', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/sayHello')!.methods;

    // Serialize
    const originalBody = {sayHello: 'Hello, World!'};
    const buffer = serializeBinaryBody('/sayHello', executionChain, originalBody, true).serializer.getBuffer();

    // Deserialize (uses routesCache internally)
    const {body: deserializedBody} = deserializeBinaryBody('/sayHello', buffer, true);

    expect(deserializedBody.sayHello).toBe('Hello, World!');
  });

  it('should correctly roundtrip number response', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/addNumbers')!.methods;

    // Serialize
    const originalBody = {addNumbers: 42};
    const buffer = serializeBinaryBody('/addNumbers', executionChain, originalBody, true).serializer.getBuffer();

    // Deserialize (uses routesCache internally)
    const {body: deserializedBody} = deserializeBinaryBody('/addNumbers', buffer, true);

    expect(deserializedBody.addNumbers).toBe(42);
  });

  it('should correctly roundtrip array response', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/processArray')!.methods;

    // Serialize
    const originalBody = {processArray: [1, 2, 3, 4, 5]};
    const buffer = serializeBinaryBody('/processArray', executionChain, originalBody, true).serializer.getBuffer();

    // Deserialize (uses routesCache internally)
    const {body: deserializedBody} = deserializeBinaryBody('/processArray', buffer, true);

    expect(deserializedBody.processArray).toEqual([1, 2, 3, 4, 5]);
  });

  it('should correctly roundtrip complex object response with Date', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/getUser')!.methods;

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
    const buffer = serializeBinaryBody('/getUser', executionChain, originalBody, true).serializer.getBuffer();

    // Deserialize (uses routesCache internally)
    const {body: deserializedBody} = deserializeBinaryBody('/getUser', buffer, true);

    expect(deserializedBody.getUser.id).toBe('123');
    expect(deserializedBody.getUser.name).toBe('John');
    expect(deserializedBody.getUser.age).toBe(30);
    expect(deserializedBody.getUser.createdAt).toEqual(originalDate);
  });

  it('should correctly roundtrip request params', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/sayHello')!.methods;

    // Serialize request params (isResponse = false)
    const originalBody = {sayHello: ['World']};
    const buffer = serializeBinaryBody('/sayHello', executionChain, originalBody, false).serializer.getBuffer();

    // Deserialize (uses routesCache internally)
    const {body: deserializedBody} = deserializeBinaryBody('/sayHello', buffer, false);

    expect(deserializedBody.sayHello).toEqual(['World']);
  });

  it('should correctly roundtrip multiple number params', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/addNumbers')!.methods;

    // Serialize request params (isResponse = false)
    const originalBody = {addNumbers: [10, 25]};
    const buffer = serializeBinaryBody('/addNumbers', executionChain, originalBody, false).serializer.getBuffer();

    // Deserialize (uses routesCache internally)
    const {body: deserializedBody} = deserializeBinaryBody('/addNumbers', buffer, false);

    expect(deserializedBody.addNumbers).toEqual([10, 25]);
  });

  it('should deserialize binary request body', async () => {
    await mion.initRoutes(routes);
    const executionChain = getRouteExecutionChain('/sayHello')!.methods;

    // Create binary request body using core serializeBinaryBody
    const originalBody = {sayHello: ['World']};
    const buffer = serializeBinaryBody('/sayHello', executionChain, originalBody, false).serializer.getBuffer();

    const context = getNewBinaryContext('/sayHello', buffer);

    // deserializeRequestBody doesn't return a value, it sets context.request.body
    void deserializeRequestBody(context);

    // The body should have the method ID as key
    expect(context.request.body).toBeDefined();
    expect(context.request.body.sayHello).toBeDefined();
    expect(context.request.body.sayHello).toEqual(['World']);
  });

  it('should use JSON serialization when route specifies serializer: json', async () => {
    await mion.initRoutes(routesWithPerRouteOptions);
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
    (response as Mutable<MionResponse>).serializer = SerializerModes.json; // JSON mode

    void serializeResponseBody(context, opts);

    // Should use JSON content-type
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('should use stringifyJson serialization when route specifies serializer: stringifyJson', async () => {
    await mion.initRoutes(routesWithPerRouteOptions);
    const opts = getRouterOptions();

    const reqHeaders = headersFromRecord({'content-type': 'application/json'});
    const respHeaders = headersFromRecord({});
    const context = createCallContext('/stringifyJsonRoute', opts, '{}', {}, reqHeaders, respHeaders);
    const response = context.response as Mutable<MionResponse>;
    response.body = {stringifyJsonRoute: 42};
    (response as Mutable<MionResponse>).serializer = SerializerModes.stringifyJson; // stringifyJson mode

    void serializeResponseBody(context, opts);

    // Should use JSON content-type
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    // rawBody should be a string
    expect(typeof response.rawBody).toBe('string');
  });

  it('should use binary serialization when route specifies serializer: binary', async () => {
    await createMionRouter({serializer: 'json'}).initRoutes(routesWithPerRouteOptions);
    const opts = getRouterOptions();

    const reqHeaders = headersFromRecord({'content-type': 'application/octet-stream'});
    const respHeaders = headersFromRecord({});
    const context = createCallContext('/binaryRoute', opts, new Uint8Array(0), {}, reqHeaders, respHeaders);
    const response = context.response as Mutable<MionResponse>;
    response.body = {binaryRoute: [2, 4, 6]};
    (response as Mutable<MionResponse>).serializer = SerializerModes.binary; // binary mode

    void serializeResponseBody(context, opts);

    // Should use binary content-type
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    // binary payload is read from binSerializer, not rawBody
    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
  });

  it('should use router default when route does not specify serializer option', async () => {
    await mion.initRoutes(routesWithPerRouteOptions);
    const opts = getRouterOptions();

    const context = getNewBinaryContext('/defaultRoute', new Uint8Array(0));
    const response = context.response as Mutable<MionResponse>;
    response.body = {defaultRoute: 'test message'};

    // Body type should be binary (router default)
    expect(context.response.serializer).toBe(SerializerModes.binary);

    void serializeResponseBody(context, opts);

    // Should use binary content-type
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.binSerializer!.getBufferView()).toBeInstanceOf(Uint8Array);
  });

  it('should store serializer option in route executable', async () => {
    await mion.initRoutes(routesWithPerRouteOptions);

    // Import getRouteExecutable to check the stored options
    const {getRouteExecutable} = await import('../router.ts');

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
