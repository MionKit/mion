/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {initRouter, registerRoutes, route} from '@mionjs/router';
import {createCloudflareHandler, resetCloudflareHandlerOpts, setCloudflareHandlerOpts} from './cloudflareHandler.ts';
import type {CallContext, Route} from '@mionjs/router';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';

describe('cloudflare handler', () => {
    type SimpleUser = {
        name: string;
        surname: string;
    };
    type DataPoint = {
        date: Date;
    };
    type MySharedData = ReturnType<typeof getSharedData>;
    type Context = CallContext<MySharedData>;

    const myApp = {
        db: {
            changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
        },
    };
    const getSharedData = () => ({auth: {me: null as any}});

    const changeUserName: Route = route((ctx: Context, user: SimpleUser): SimpleUser => {
        return myApp.db.changeUserName(user);
    });

    const getDate: Route = route((ctx: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
    });

    const updateHeaders: Route = route((context: Context): void => {
        context.response.headers.set('x-something', 'true');
        context.response.headers.set('server', 'my-server');
    });

    const createRequest = (body: string, path: string, method = 'POST', headers: Record<string, string> = {}) =>
        new Request(`http://localhost${path}`, {
            method,
            body,
            headers: {'content-type': 'application/json', ...headers},
        });

    describe('with serializer=stringifyJson (default)', () => {
        let handler: ReturnType<typeof createCloudflareHandler>;

        beforeAll(async () => {
            resetCloudflareHandlerOpts();
            setCloudflareHandlerOpts({basePath: ''});
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
            await registerRoutes({changeUserName, getDate, updateHeaders});
            handler = createCloudflareHandler();
        });

        it('should get an ok response from a route', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const req = createRequest(JSON.stringify(requestData), '/api/getDate');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
            expect(response.headers.get('server')).toEqual('@mionjs');
        });

        it('should get an error when sending invalid parameters', async () => {
            const requestData = {getDate: ['NOT A DATE POINT']};
            const req = createRequest(JSON.stringify(requestData), '/api/getDate');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            const expectedError: PublicRpcError<'serialization-error'> = {
                'mion@isΣrrθr': true,
                publicMessage: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
                type: 'serialization-error',
                errorData: {deserializeError: expect.any(String)},
                statusCode: StatusCodes.UNEXPECTED_ERROR,
            };
            expect(parsedResponse[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
            expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
            expect(response.headers.get('server')).toEqual('@mionjs');
        });

        it('should set response headers from route response', async () => {
            const requestData = {};
            const req = createRequest(JSON.stringify(requestData), '/api/updateHeaders');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            expect(parsedResponse).toEqual({});
            expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
            expect(response.headers.get('server')).toEqual('my-server');
            expect(response.headers.get('x-something')).toEqual('true');
        });

        it('should include default headers', async () => {
            resetCloudflareHandlerOpts();
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
            await registerRoutes({changeUserName, getDate, updateHeaders});
            setCloudflareHandlerOpts({
                basePath: '',
                defaultResponseHeaders: {
                    'x-app-name': 'MyApp',
                    'x-instance-id': '3089',
                },
            });
            handler = createCloudflareHandler();

            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const req = createRequest(JSON.stringify(requestData), '/api/getDate');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(response.headers.get('x-app-name')).toEqual('MyApp');
            expect(response.headers.get('x-instance-id')).toEqual('3089');
            expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
            expect(response.headers.get('server')).toEqual('@mionjs');

            // Restore state
            resetCloudflareHandlerOpts();
            setCloudflareHandlerOpts({basePath: ''});
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
            await registerRoutes({changeUserName, getDate, updateHeaders});
            handler = createCloudflareHandler();
        });
    });

    describe('with basePath stripping', () => {
        let handler: ReturnType<typeof createCloudflareHandler>;

        beforeAll(async () => {
            resetCloudflareHandlerOpts();
            setCloudflareHandlerOpts({basePath: '/api/mion'});
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/'});
            await registerRoutes({changeUserName, getDate});
            handler = createCloudflareHandler();
        });

        it('should strip basePath and route correctly', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const req = createRequest(JSON.stringify(requestData), '/api/mion/api/getDate');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            expect(response.status).toBe(200);
        });
    });

    describe('with serializer=json', () => {
        let handler: ReturnType<typeof createCloudflareHandler>;

        beforeAll(async () => {
            resetCloudflareHandlerOpts();
            setCloudflareHandlerOpts({basePath: ''});
            await initRouter({contextDataFactory: getSharedData, prefix: 'api/', serializer: 'json'});
            await registerRoutes({changeUserName, getDate});
            handler = createCloudflareHandler();
        });

        it('should get an ok response from a route with Date objects', async () => {
            const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
            const req = createRequest(JSON.stringify(requestData), '/api/getDate');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
            // Response.json() adds charset=utf-8 automatically
            expect(response.headers.get('content-type')).toContain('application/json');
            expect(response.headers.get('server')).toEqual('@mionjs');
        });

        it('should get an ok response from a route with complex objects', async () => {
            const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
            const req = createRequest(JSON.stringify(requestData), '/api/changeUserName');

            const response = await handler.fetch(req);
            const parsedResponse = await response.json();

            expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
            expect(response.headers.get('content-type')).toContain('application/json');
            expect(response.headers.get('server')).toEqual('@mionjs');
        });
    });
});
