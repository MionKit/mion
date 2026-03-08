/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {initRouter, registerRoutes, route} from '@mionjs/router';
import {resetVercelHandlerOpts, setVercelHandlerOpts} from './vercelHandler.ts';
import {startVercelDevServer} from './devServer.ts';
import type {CallContext, Route} from '@mionjs/router';
import {MION_ROUTES, StatusCodes, type PublicRpcError} from '@mionjs/core';
import type {Server as HttpServer} from 'http';
import type {Server as HttpsServer} from 'https';

type SimpleUser = {
    name: string;
    surname: string;
};
type DataPoint = {
    date: Date;
};
type MySharedData = ReturnType<typeof getSharedData>;
type Context = CallContext<MySharedData>;

const getSharedData = () => ({auth: {me: null as any}});

const changeUserName: Route = route((ctx: Context, user: SimpleUser): SimpleUser => {
    return {name: 'NewName', surname: user.surname};
});

const getDate: Route = route((ctx: Context, dataPoint?: DataPoint): DataPoint => {
    return dataPoint || {date: new Date('2022-04-10T02:13:00.000Z')};
});

const updateHeaders: Route = route((context: Context): void => {
    context.response.headers.set('x-something', 'true');
    context.response.headers.set('server', 'my-server');
});

const closeServer = (server: any) =>
    new Promise<void>((resolve) => {
        if (server && typeof server.close === 'function') server.close(() => resolve());
        else resolve();
    });

describe('vercel dev server (node) - stringifyJson', () => {
    const port = 8761;
    let server: HttpServer | HttpsServer | any;

    beforeAll(async () => {
        resetVercelHandlerOpts();
        setVercelHandlerOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
        await registerRoutes({changeUserName, getDate, updateHeaders});
        server = await startVercelDevServer({port});
    });

    afterAll(async () => {
        await closeServer(server);
    });

    it('should get an ok response from a route', async () => {
        const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
        const response = await fetch(`http://localhost:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {'content-type': 'application/json'},
        });
        const parsedResponse = await response.json();

        expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
        expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
        expect(response.headers.get('server')).toEqual('@mionjs');
    });

    it('should get an error when sending invalid parameters', async () => {
        const requestData = {getDate: ['NOT A DATE POINT']};
        const response = await fetch(`http://localhost:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {'content-type': 'application/json'},
        });
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
        const response = await fetch(`http://localhost:${port}/api/updateHeaders`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {'content-type': 'application/json'},
        });
        const parsedResponse = await response.json();

        expect(parsedResponse).toEqual({});
        expect(response.headers.get('content-type')).toEqual('application/json; charset=utf-8');
        expect(response.headers.get('server')).toEqual('my-server');
        expect(response.headers.get('x-something')).toEqual('true');
    });
});

describe('vercel dev server (node) - serializer=json', () => {
    const port = 8763;
    let server: HttpServer | HttpsServer | any;

    beforeAll(async () => {
        resetVercelHandlerOpts();
        setVercelHandlerOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'json'});
        await registerRoutes({changeUserName, getDate});
        server = await startVercelDevServer({port});
    });

    afterAll(async () => {
        await closeServer(server);
    });

    it('should get an ok response from a route with Date objects', async () => {
        const requestData = {getDate: [{date: new Date('2022-04-10T02:13:00.000Z')}]};
        const response = await fetch(`http://localhost:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {'content-type': 'application/json'},
        });
        const parsedResponse = await response.json();

        expect(parsedResponse).toEqual({getDate: {date: '2022-04-10T02:13:00.000Z'}});
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(response.headers.get('server')).toEqual('@mionjs');
    });

    it('should get an ok response from a route with complex objects', async () => {
        const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
        const response = await fetch(`http://localhost:${port}/api/changeUserName`, {
            method: 'POST',
            body: JSON.stringify(requestData),
            headers: {'content-type': 'application/json'},
        });
        const parsedResponse = await response.json();

        expect(parsedResponse).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(response.headers.get('server')).toEqual('@mionjs');
    });
});
