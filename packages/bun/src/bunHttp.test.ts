/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe} from 'bun:test';
import {initRouter, registerRoutes, route} from '@mionkit/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer} from './bunHttp';
import type {CallContext} from '@mionkit/router';
import {PublicRpcError} from '@mionkit/core';
// In theory node 18 supports fetch but not working fine with jest, we should update to jest 29
// update to jest 29 gonna take some changes as all globals must be imported from @jest/globals
// also the types for fetch are not available in node 18, fix here: https://stackoverflow.com/questions/71294230/how-can-i-use-native-fetch-with-node-in-typescript-node-v17-6#answer-75676044
import fetch from 'node-fetch';
import {Server} from 'bun';

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

    const changeUserName = route((context: Context, user: SimpleUser) => {
        return myApp.db.changeUserName(user);
    }); // satisfies Route

    const getDate = route((context: Context, dataPoint?: DataPoint): DataPoint => {
        return dataPoint || {date: new Date('2022-04-22T00:17:00.000Z')};
    }); // satisfies Route

    const updateHeaders = route((context: Context): void => {
        context.response.headers.set('x-something', 'true');
        context.response.headers.set('server', 'my-server');
    }); // satisfies Route

    let server: Server;

    const port = 8079;
    beforeAll(() => {
        initRouter({sharedDataFactory: getSharedData, prefix: 'api/'});
        registerRoutes({changeUserName, getDate, updateHeaders});
        setBunHttpOpts({port});
        server = startBunServer();
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
        expect(headers['server']).toEqual('@mionkit/http');
    });

    test('get an error when sending invalid parameters', async () => {
        const requestData = {getDate: ['NOT A DATE POINT']};
        const response = await fetch(`http://127.0.0.1:${port}/api/getDate`, {
            method: 'POST',
            body: JSON.stringify(requestData),
        });
        const reply = await response.json();
        const headers = Object.fromEntries(response.headers.entries());

        const expectedError: PublicRpcError = {
            message: `Invalid params 'getDate', can not deserialize. Parameters might be of the wrong type.`,
            name: 'Serialization Error',
            statusCode: 400,
            errorData: expect.anything(),
        };

        expect(reply).toEqual({getDate: expectedError});
        expect(headers['content-type']).toEqual('application/json; charset=utf-8');
        // In the past deepkit returned slightly different when running on bun and node so length was different
        // bun: getDate.errorData.message = 'Cannot convert NOT A DATE POINT to UnknownTypeName:() => __\\u{3a9}DataPoint'
        // node: getDate.errorData.message = 'Cannot convert NOT A DATE POINT to DataPoint'
        expect(headers['content-length']).toEqual('254');
        expect(headers['server']).toEqual('@mionkit/http');
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
            sharedDataFactory: getSharedData,
            prefix: 'api/',
        };
        const bunOpts = {
            port: smallPort,
            // maxBodySize: 10,
            defaultResponseHeaders: {'x-app-name': 'MyApp', 'x-instance-id': '3089'},
        };
        resetBunHttpOpts();
        initRouter(routerOpts);
        setBunHttpOpts(bunOpts);
        registerRoutes({changeUserName, getDate, updateHeaders});
        const smallServer = await startBunServer();
        let err;
        try {
            const requestData = {getDate: [{date: new Date('2022-04-22T00:17:00.000Z')}]};
            const response = await fetch(`http://127.0.0.1:${smallPort}/api/getDate`, {
                method: 'POST',
                body: JSON.stringify(requestData),
            });
            const headers = Object.fromEntries(response.headers.entries());
            // const reply = await response.json();

            // const expectedError: AnonymRpcError = {
            //     message: `Request Payload Too Large`,
            //     statusCode: 413,
            //     name: 'Request Payload Too Large',
            // };
            // expect(reply).toEqual({httpRequest: expectedError});
            expect(headers['x-app-name']).toEqual('MyApp');
            expect(headers['x-instance-id']).toEqual('3089');
            expect(headers['content-type']).toEqual('application/json; charset=utf-8');
            // expect(headers['content-length']).toEqual('107');
            expect(headers['server']).toEqual('@mionkit/http');
        } catch (e) {
            err = e;
        }

        smallServer.stop(true);
        if (err) throw err;
    });
});
