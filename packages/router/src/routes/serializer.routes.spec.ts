/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Mutable} from '@mionkit/core';
import type {Routes} from '../types/general';
import type {MionResponse, RawRequestBody} from '../types/context';
import {HeadersSubset, SerializerModes} from '@mionkit/core';
import {headersLinkedFn, linkedFn, route} from '../lib/handlers';
import {getRouterOptions, getRouteExecutionChain, initMionRouter, resetRouter} from '../router';
import {createCallContext} from '../dispatch';
import {headersFromRecord} from '../lib/headers';
import {deserializeRequestBody, serializeResponseBody} from './serializer.routes';

const lastActivity = new Date();
interface User {
    name: string;
    age: number;
    lastActivity: Date;
    // stringify prop names seems to be the best scenario for JitStringify
    extra?: {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;
        g: number;
        h: number;
        i: number;
        j: number;
    };
}

const routes = {
    auth: headersLinkedFn((ctx, h: HeadersSubset<'auth'>): void => {}),
    users: {
        updateUser: route((ctx, user: User): User => ({...user, lastActivity})),
    },
    sayHello: route((ctx, name: string): string => `Hello, ${name}!`),
    logs: linkedFn((ctx): void => {}),
} satisfies Routes;

function getNewJsonContext(path: string, body: any) {
    const opts = getRouterOptions();
    const rawBody: RawRequestBody = JSON.stringify(body);
    const reqHeaders = headersFromRecord({auth: 'token'});
    const respHeaders = headersFromRecord({});
    const context = createCallContext(path, opts, rawBody, {}, reqHeaders, respHeaders);
    // Set bodyType from ExecutionChain (as done in runExecutionChain)
    const executionChain = getRouteExecutionChain(path);
    if (executionChain) {
        (context.response as Mutable<MionResponse>).bodyType = executionChain.serializer;
    }
    return context;
}

describe('deserialize json Request Body', () => {
    beforeEach(() => resetRouter());

    it('should return the parsed body for the ExecutionChain of "updateUser" route', async () => {
        await initMionRouter(routes);
        const body = {'users/updateUser': {name: 'John', age: 30, lastActivity}};
        const context = getNewJsonContext('/users/updateUser', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });

    it('should return the parsed body for the ExecutionChain of "sayHello" route', async () => {
        await initMionRouter(routes);
        const body = {sayHello: 'John'};
        const context = getNewJsonContext('/sayHello', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });

    it('should return the parsed body for the ExecutionChain of "logs" linkedFn', async () => {
        await initMionRouter(routes);
        const body = {logs: 'John'};
        const context = getNewJsonContext('/logs', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });

    it('should return the parsed body for complex objects', async () => {
        await initMionRouter(routes);
        const body = {
            'users/updateUser': {
                name: 'John',
                age: 30,
                lastActivity,
                extra: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10},
            },
        };
        const context = getNewJsonContext('/users/updateUser', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });
});

describe('serialize json Response Body using jit stringify Json (body type J)', () => {
    beforeEach(() => resetRouter());

    it('should return the stringify function for the ExecutionChain of "updateUser" route', async () => {
        await initMionRouter(routes, {serializer: 'stringifyJson'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/users/updateUser', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {'users/updateUser': {name: 'John', age: 30, lastActivity}};
        serializeResponseBody(context, opts);
        const expectedString =
            '{"users/updateUser":{"name":"John","age":30,"lastActivity":"' + lastActivity.toISOString() + '"}}';
        expect(response.rawBody).toEqual(expectedString);
    });

    it('should return the stringify function for the ExecutionChain of "sayHello" route', async () => {
        await initMionRouter(routes, {serializer: 'stringifyJson'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/sayHello', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {sayHello: 'Hello, Jack!'};
        serializeResponseBody(context, opts);
        const expectedString = '{"sayHello":"Hello, Jack!"}';
        expect(response.rawBody).toEqual(expectedString);
    });

    it('should correctly stringify complex objects', async () => {
        await initMionRouter(routes, {serializer: 'stringifyJson'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/users/updateUser', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {
            'users/updateUser': {
                name: 'John',
                age: 30,
                lastActivity,
                extra: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10},
            },
        };

        serializeResponseBody(context, opts);
        const expectedString = JSON.stringify(response.body);

        // we need to parse back results to objects as json stringify can change the order of properties
        expect(JSON.parse(response.rawBody as string)).toEqual(JSON.parse(expectedString));
    });
});

describe('serialize Response Body with serialize=json (body type O)', () => {
    beforeEach(() => resetRouter());

    it('should prepare response.body for platform adapter JSON.stringify for "updateUser" route', async () => {
        await initMionRouter(routes, {serializer: 'json'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/users/updateUser', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {'users/updateUser': {name: 'John', age: 30, lastActivity}};
        expect(context.response.bodyType).toEqual(SerializerModes.json);
        serializeResponseBody(context, opts);
        expect(response.body).toEqual({
            'users/updateUser': {name: 'John', age: 30, lastActivity},
        });
        const jsonString = JSON.stringify(response.body);
        expect(jsonString).toEqual(
            '{"users/updateUser":{"name":"John","age":30,"lastActivity":"' + lastActivity.toISOString() + '"}}'
        );
        expect(response.rawBody).toEqual('');
    });

    it('should prepare response.body for platform adapter JSON.stringify for "sayHello" route', async () => {
        await initMionRouter(routes, {serializer: 'json'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/sayHello', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {sayHello: 'Hello, Jack!'};
        expect(context.response.bodyType).toEqual(SerializerModes.json);
        serializeResponseBody(context, opts);
        expect(response.body).toEqual({sayHello: 'Hello, Jack!'});
        const jsonString = JSON.stringify(response.body);
        expect(jsonString).toEqual('{"sayHello":"Hello, Jack!"}');
        expect(response.rawBody).toEqual('');
    });

    it('should correctly prepare complex objects for platform adapter JSON.stringify', async () => {
        await initMionRouter(routes, {serializer: 'json'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/users/updateUser', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {
            'users/updateUser': {
                name: 'John',
                age: 30,
                lastActivity,
                extra: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10},
            },
        };
        expect(context.response.bodyType).toEqual(SerializerModes.json);
        serializeResponseBody(context, opts);
        expect(response.body).toEqual({
            'users/updateUser': {
                name: 'John',
                age: 30,
                lastActivity,
                extra: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10},
            },
        });
        const jsonString = JSON.stringify(response.body);
        const parsed = JSON.parse(jsonString);
        expect(parsed).toEqual({
            'users/updateUser': {
                name: 'John',
                age: 30,
                lastActivity: lastActivity.toISOString(),
                extra: {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10},
            },
        });
        expect(response.rawBody).toEqual('');
    });

    it('should handle routes with void return (no return data)', async () => {
        await initMionRouter(routes, {serializer: 'json'});
        const opts = getRouterOptions();
        const context = getNewJsonContext('/sayHello', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {auth: undefined, logs: undefined};
        serializeResponseBody(context, opts);
        expect(response.body).toEqual({auth: undefined, logs: undefined});
        // For serialize: 'json' (body type SerializerMode.json), rawBody remains empty - platform adapter does JSON.stringify
        expect(response.rawBody).toEqual('');
    });
});
