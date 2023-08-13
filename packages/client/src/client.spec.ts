/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RemoteMethods, Routes, registerRoutes} from '@mionkit/router';
import {initMionClient} from './client';
import {HookSubRequest, RouteSubRequest} from './types';
import {initHttpRouter, startHttpServer} from '@mionkit/http';
import {clientRoutes} from '@mionkit/common';
import {Server} from 'http';
import {PublicError} from '@mionkit/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// TODO: test & write client
describe('client', () => {
    type User = {name: string; surname: string};

    const routes = {
        auth: {
            headerName: 'Authorization',
            canReturnData: true,
            headerHook: (ctx, token: string): User => ({name: 'John', surname: 'Doe'}),
        },
        sayHello: {route: (ctx, user: User): string | PublicError => `Hello ${user.name} ${user.surname}`},
        alwaysFails: (ctx, user: User): User | PublicError =>
            new PublicError({statusCode: 500, message: 'Something fails', name: 'UnknownError'}),
        utils: {
            sumTwo: (ctx, a: number): number => a + 2,
        },
        log: {hook: (ctx): any => 'Logger.log(....)'},
    } satisfies Routes;

    const someUser = {name: 'John', surname: 'Doe'};
    let myApi: RemoteMethods<typeof routes>;
    type MyApi = typeof myApi;

    const port = 8076;
    let server: Server;
    beforeAll(async () => {
        initHttpRouter({sharedDataFactory: () => {}, port});
        myApi = registerRoutes(routes);
        registerRoutes(clientRoutes);
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

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {client, methods} = initMionClient<MyApi>({baseURL: `http://localhost:${port}`});

        const expectedAuthSubRequest = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: ['token'],
            persist: expect.any(Function),
        };

        const expectedSayHelloSubRequest = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
        };

        const expectedSumTwoSubRequest = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils-sumTwo',
            isResolved: false,
            params: [2],
            persist: expect.any(Function),
        };

        expect(methods.auth('token')).toEqual(expect.objectContaining(expectedAuthSubRequest));
        expect(methods.sayHello(someUser)).toEqual(expect.objectContaining(expectedSayHelloSubRequest));
        expect(methods.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwoSubRequest));

        // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
        // note bellow code should not be used when using the client
        const expectedUnknownSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['abcd'],
            id: 'abcd',
            isResolved: false,
            params: [1, 'a'],
            call: expect.any(Function),
            persist: expect.any(Function),
            validate: expect.any(Function),
        };
        expect((methods as any).abcd(1, 'a')).toEqual(expectedUnknownSubRequest);
    });

    // TODO: jest upgrade required to include nadive node fetch types without using jsdom
    it('make a route call and get a valid response', async () => {
        // TODO: implement the get public method info route in the router
        const {methods} = initMionClient<MyApi>({baseURL: `http://localhost:${port}`});

        const response = await methods.sayHello(someUser).call(methods.auth('token'));
        expect(response).toEqual(`Hello John Doe`);
    });

    it('throw error if a route call fails', async () => {
        // TODO: implement the get public method info route in the router
        const {client, methods} = initMionClient<MyApi>({baseURL: `http://localhost:${port}`});

        let error;
        const expectedError = new PublicError({
            message: 'Something fails',
            name: 'UnknownError',
            statusCode: 500,
        });

        try {
            await methods.alwaysFails(someUser).call(methods.auth('token'));
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });

    it('throw error if a route is missing hook data', async () => {
        // TODO: implement the get public method info route in the router
        const {client, methods} = initMionClient<MyApi>({baseURL: `http://localhost:${port}`});

        let error;
        const expectedError = new PublicError({
            message: `Invalid params for Route or Hook 'auth', validation failed.`,
            name: 'Validation Error',
            statusCode: 400,
        });

        try {
            await methods.sayHello(someUser).call();
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });
});
