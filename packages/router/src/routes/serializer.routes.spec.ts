/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Mutable} from '@mionkit/core';
import type {Routes} from '../types/general';
import type {MionResponse, RawRequestBody} from '../types/context';
import {HeadersSubset} from '@mionkit/core';
import {headersHook, hook, route} from '../lib/handlers';
import {getRouterOptions, initMionRouter, resetRouter} from '../router';
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
    auth: headersHook((ctx, headers: HeadersSubset<'auth'>): void => {}),
    users: {
        updateUser: route((ctx, user: User): User => ({...user, lastActivity})),
    },
    sayHello: route((ctx, name: string): string => `Hello, ${name}!`),
    logs: hook((ctx): void => {}),
} satisfies Routes;

function getNewJsonContext(path: string, body: any) {
    const opts = getRouterOptions();
    const rawBody: RawRequestBody = JSON.stringify(body);
    const reqHeaders = headersFromRecord({auth: 'token'});
    const respHeaders = headersFromRecord({});
    return createCallContext(path, opts, rawBody, {}, reqHeaders, respHeaders);
}

describe('deserialize json Request Body', () => {
    beforeEach(() => resetRouter());

    it('should return the parsed body for the execution path of "updateUser" route', () => {
        initMionRouter(routes);
        const body = {'users/updateUser': {name: 'John', age: 30, lastActivity}};
        const context = getNewJsonContext('/users/updateUser', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });

    it('should return the parsed body for the execution path of "sayHello" route', () => {
        initMionRouter(routes);
        const body = {sayHello: 'John'};
        const context = getNewJsonContext('/sayHello', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });

    it('should return the parsed body for the execution path of "logs" hook', () => {
        initMionRouter(routes);
        const body = {logs: 'John'};
        const context = getNewJsonContext('/logs', body);
        expect(context.request.body).toEqual({});
        expect(typeof context.request.rawBody).toEqual('string');
        deserializeRequestBody(context);
        // JSOn body is only parsed, no restoreFromJson is applied until the handler is executed
        expect(context.request.body).toEqual(JSON.parse(context.request.rawBody as string));
    });

    it('should return the parsed body for complex objects', () => {
        initMionRouter(routes);
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

describe('serialize json Response Body', () => {
    beforeEach(() => resetRouter());

    it('should return the stringify function for the execution path of "updateUser" route', () => {
        initMionRouter(routes);
        const opts = getRouterOptions();
        const context = getNewJsonContext('/users/updateUser', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {'users/updateUser': {name: 'John', age: 30, lastActivity}};
        serializeResponseBody(context, opts);
        const expectedString =
            '{"users/updateUser":{"name":"John","age":30,"lastActivity":"' + lastActivity.toISOString() + '"}}';
        expect(response.rawBody).toEqual(expectedString);
    });

    it('should return the stringify function for the execution path of "sayHello" route', () => {
        initMionRouter(routes);
        const opts = getRouterOptions();
        const context = getNewJsonContext('/sayHello', {});
        const response = context.response as Mutable<MionResponse>;
        response.body = {sayHello: 'Hello, Jack!'};
        serializeResponseBody(context, opts);
        const expectedString = '{"sayHello":"Hello, Jack!"}';
        expect(response.rawBody).toEqual(expectedString);
    });

    it('should correctly stringify complex objects', () => {
        initMionRouter(routes);
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
