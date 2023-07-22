/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {registerRoutes} from '@mionkit/router';
import fetch from 'node-fetch'; // must be node-fetch v2 as v3 is a node module non compatible whit current setup
import {initHttpRouter, resetHttpRouter, startHttpServer} from './mionHttp';
import type {CallContext, Headers, Mutable, Route} from '@mionkit/router';

describe('serverless router should', () => {
    resetHttpRouter();
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

    const changeUserName: Route = (context: Context, user: SimpleUser) => {
        return myApp.db.changeUserName(user);
    };

    const getDate: Route = (context: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
    };

    const updateHeaders: Route = (context: Context): void => {
        (context.response.headers as Mutable<Headers>)['x-something'] = true;
        (context.response.headers as Mutable<Headers>)['server'] = 'my-server';
    };

    let server;

    const port = 8075;
    beforeAll(async () => {
        initHttpRouter({sharedDataFactory: getSharedData, prefix: 'api/', port});
        registerRoutes({changeUserName, getDate, updateHeaders});
        server = await startHttpServer();
    });

    afterAll(
        async () =>
            new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject();
                    else resolve();
                });
            })
    );

    it('get an ok response from a route', async () => {
        const requestData = {'/api/getDate': [{date: new Date('2022-04-22T00:17:00.000Z')}]};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });

        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({'/api/getDate': {date: '2022-04-22T00:17:00.000Z'}});
        expect(headers['connection']).toEqual('close');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('52');
        expect(headers['server']).toEqual('@mionkit/http');
    });

    it('get an ok response from a route using callback', async () => {
        const portCallback = 8076;
        resetHttpRouter();
        initHttpRouter({sharedDataFactory: getSharedData, prefix: 'api/', port: portCallback, useCallbacks: true});
        registerRoutes({changeUserName, getDate, updateHeaders});
        const callbacksServer = await startHttpServer();

        const requestData = {'/api/getDate': [{date: new Date('2022-04-22T00:17:00.000Z')}]};
        const response = await fetch(`http://127.0.0.1:${portCallback}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        expect(reply).toEqual({'/api/getDate': {date: '2022-04-22T00:17:00.000Z'}});
        expect(headers['connection']).toEqual('close');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('52');
        expect(headers['server']).toEqual('@mionkit/http');

        const closeCallbacksServer = () => {
            return new Promise<void>((resolve, reject) => {
                callbacksServer.close((err) => {
                    if (err) reject();
                    else resolve();
                });
            });
        };
        await closeCallbacksServer();
    });

    it('get an error when sending invalid parameters', async () => {
        const requestData = {'/api/getDate': ['NOT A DATE POINT']};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        const expectedError = {
            message: `Invalid params '/api/getDate', can not deserialize. Parameters might be of the wrong type.`,
            name: 'Serialization Error',
            statusCode: 400,
        };
        expect(reply).toEqual([expectedError]);
        expect(headers['connection']).toEqual('close');
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(headers['content-length']).toEqual('152');
        expect(headers['server']).toEqual('@mionkit/http');
    });

    it('set response headers from route response', async () => {
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

    it('get an error when body size is too large, get default headers and call allowExceedMaxBodySize', async () => {
        const smallPort = port + 1;
        let isCalled = false;
        const httpOptions = {
            sharedDataFactory: getSharedData,
            prefix: 'api/',
            port: smallPort,
            maxBodySize: 1,
            defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
            allowExceedMaxBodySize: () => {
                isCalled = true;
                return false;
            },
        };
        resetHttpRouter();
        initHttpRouter(httpOptions);
        registerRoutes({changeUserName, getDate, updateHeaders});
        const smallServer = await startHttpServer();
        const closeSmallServer = () => {
            return new Promise<void>((resolve, reject) => {
                smallServer.close((err) => {
                    if (err) reject();
                    else resolve();
                });
            });
        };
        let err;
        try {
            const requestData = {'/api/getDate': [{date: new Date('2022-04-22T00:17:00.000Z')}]};
            const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });
            const headers = Object.fromEntries(response.headers.entries());
            const reply = await response.json();

            const expectedError = {
                message: `Request Payload Too Large`,
                statusCode: 413,
                name: 'Request Payload Too Large',
            };
            expect(reply).toEqual([expectedError]);
            expect(headers['x-app-name']).toEqual('MyApp');
            expect(headers['x-instance-id']).toEqual('3089');
            expect(headers['connection']).toEqual('close');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            expect(headers['content-length']).toEqual('93');
            expect(headers['server']).toEqual('@mionkit/http');
            expect(isCalled).toEqual(true);
        } catch (e) {
            err = e;
        }

        await closeSmallServer();
        if (err) throw err;
    });
});
