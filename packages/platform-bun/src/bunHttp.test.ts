/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {initRouter, registerRoutes, route} from '@mionjs/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp.ts';
import {CallContext} from '@mionjs/router';
import {MION_ROUTES, PublicRpcError, StatusCodes} from '@mionjs/core';
import {Server} from 'bun';

// Increase timeout for tests that involve type reflection (can be slow when running in parallel)
setDefaultTimeout(30_000);

describe('bun router should', () => {
    resetBunHttpOpts();
    type SimpleUser = {name: string; surname: string};
    type DataPoint = {date: Date};
    type MySharedData = ReturnType<typeof getSharedData>;
    type Context = CallContext<MySharedData>;

    const myApp = {
        cloudLogs: {
            log: () => null,
            error: () => null,
        },
        db: {
            changeUserName: (user: SimpleUser) => ({name: 'NewName', surname: user.surname}),
        },
    };
    const getSharedData = () => ({auth: {me: null as any}});

    const changeUserName = route((context: Context, user: SimpleUser): SimpleUser => {
        return myApp.db.changeUserName(user);
    }); // satisfies Route

    const getDate = route((context: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
    }); // satisfies Route

    const updateHeaders = route((context: Context): void => {
        context.response.headers.set('x-something', 'true');
        context.response.headers.set('server', 'my-server');
    }); // satisfies Route

    let server: Server<any>;
    const port = 8079;

    beforeAll(async () => {
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
        await registerRoutes({changeUserName, getDate, updateHeaders});
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    afterAll(() => {
        console.log('Stopping server');
        server.stop();
    });

    test('get an ok response from a route', async () => {
        const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });

        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('47');
        expect(headers['server']).toEqual('@mionjs');
    });

    test('get an error when sending invalid parameters', async () => {
        const requestData = {getDate: ['NOT A DATE POINT']};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const reply = (await response.json()) as Record<string, unknown>;
        const headers = Object.fromEntries(response.headers.entries());

        const expectedError: PublicRpcError<'validation-error'> = {
            'mion@isΣrrθr': true,
            publicMessage: `Invalid params in 'getDate', validation failed.`,
            type: 'validation-error',
            errorData: {typeErrors: expect.anything()},
            statusCode: StatusCodes.UNEXPECTED_ERROR,
        };

        expect(reply[MION_ROUTES.thrownErrors]).toEqual({getDate: expectedError});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('224');
        expect(headers['server']).toEqual('@mionjs');
    });

    test('set response headers from route response', async () => {
        const response = await fetch(`http://127.0.0.1:${port}/api/updateHeaders`, {
            method: 'POST',
            body: '{}',
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('2');
        expect(headers['server']).toEqual('my-server');
        expect(headers['x-something']).toEqual('true');
    });

    // TODO: maxBodySize not working correctly in bun: https://github.com/oven-sh/bun/issues/6031
    test('get an error when body size is too large and get default headers', async () => {
        const smallPort = port + 1;
        const routerOpts = {
            contextDataFactory: getSharedData,
            prefix: 'api/',
        };
        const bunOpts = {
            port: smallPort,
            // maxBodySize: 10,
            defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
        };
        resetBunHttpOpts();
        await initRouter(routerOpts);
        setBunHttpOpts(bunOpts);
        await registerRoutes({changeUserName, getDate, updateHeaders});
        const smallServer = await startBunServer();
        const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
        const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const headers = Object.fromEntries(response.headers.entries());
        expect(headers['x-app-name']).toEqual('MyApp');
        expect(headers['x-instance-id']).toEqual('3089');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        // expect(headers['content-length']).toEqual('107');
        expect(headers['server']).toEqual('@mionjs');

        smallServer.stop(true);

        // Restore router state for the main server
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
        await registerRoutes({changeUserName, getDate, updateHeaders});
        setBunHttpOpts({port});
    });

    test('compile routes metadata and skip server initialization', async () => {
        process.env.MION_COMPILE = 'buildOnly';
        const routerOpts = {
            contextDataFactory: getSharedData,
            prefix: 'api/',
        };
        const httpOpts = {
            port: 8080,
            maxBodySize: 1,
            defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
        };
        resetBunHttpOpts();
        setBunHttpOpts(httpOpts);
        await initRouter(routerOpts);
        await registerRoutes({changeUserName, getDate, updateHeaders});
        const smallServer = await startBunServer();
        expect(smallServer).toBeUndefined();

        // Restore router state for the main server
        delete process.env.MION_COMPILE;
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
        await registerRoutes({changeUserName, getDate, updateHeaders});
        setBunHttpOpts({port});
    });

    test('get an ok response from a route with Date objects using serializer=json', async () => {
        // Stop the main server
        server.stop(true);

        // Start a new server with serializer=json
        const testPort = 8081;
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'json'});
        await registerRoutes({changeUserName, getDate});
        setBunHttpOpts({port: testPort});
        const testServer = await startBunServer();

        const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
        const response = await fetch(`http://127.0.0.1:${testPort}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });

        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({getDate: {date: '2022-04-22T00:17:00.000Z'}});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['server']).toEqual('@mionjs');

        // Stop the test server
        testServer.stop(true);

        // Restart the main server
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
        await registerRoutes({changeUserName, getDate, updateHeaders});
        setBunHttpOpts({port});
        server = await startBunServer();
    });

    test('get an ok response from a route with complex objects using serializer=json', async () => {
        // Stop the main server
        server.stop(true);

        // Start a new server with serializer=json
        const testPort = 8081;
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/', serializer: 'json'});
        await registerRoutes({changeUserName, getDate});
        setBunHttpOpts({port: testPort});
        const testServer = await startBunServer();

        const requestData = {changeUserName: [{name: 'John', surname: 'Doe'}]};
        const response = await fetch(`http://127.0.0.1:${testPort}/api/changeUserName`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });

        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({changeUserName: {name: 'NewName', surname: 'Doe'}});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['server']).toEqual('@mionjs');

        // Stop the test server
        testServer.stop(true);

        // Restart the main server
        resetBunHttpOpts();
        await initRouter({contextDataFactory: getSharedData, basePath: 'api/'});
        await registerRoutes({changeUserName, getDate, updateHeaders});
        setBunHttpOpts({port});
        server = await startBunServer();
    });
});
