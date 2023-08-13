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
        log: {
            forceRunOnError: true,
            hook: (ctx): any => {
                // console.log(ctx.path, ctx.request.headers, ctx.request.body);
            },
        },
    } satisfies Routes;

    const someUser = {name: 'John', surname: 'Doe'};
    let myApi: RemoteMethods<typeof routes>;
    type MyApi = typeof myApi;

    const port = 8076;
    const baseURL = `http://localhost:${port}`;
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
        const {client, methods} = initMionClient<MyApi>({baseURL});

        const expectedAuthSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: ['XWYZ-TOKEN'],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };

        const expectedSayHelloSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };

        const expectedSumTwoSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils-sumTwo',
            isResolved: false,
            params: [2],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };

        expect(methods.auth('XWYZ-TOKEN')).toEqual(expect.objectContaining(expectedAuthSubRequest));
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
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            validate: expect.any(Function),
        };
        expect((methods as any).abcd(1, 'a')).toEqual(expectedUnknownSubRequest);
    });

    it('make a route call and get a valid response', async () => {
        const {methods} = initMionClient<MyApi>({baseURL});

        const response = await methods.sayHello(someUser).call(methods.auth('XWYZ-TOKEN'));
        expect(response).toEqual(`Hello John Doe`);
    });

    it('throw error if a route call fails', async () => {
        const {client, methods} = initMionClient<MyApi>({baseURL});

        let error;
        const expectedError = new PublicError({
            message: 'Something fails',
            name: 'UnknownError',
            statusCode: 500,
        });

        try {
            await methods.alwaysFails(someUser).call(methods.auth('XWYZ-TOKEN'));
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });

    it('throw error if a route is missing hook data', async () => {
        const {client, methods} = initMionClient<MyApi>({baseURL});

        let error;
        const expectedError = new PublicError({
            message: `Invalid params for Route or Hook 'auth', validation failed.`,
            name: 'Validation Error',
            statusCode: 400,
        });

        try {
            const resp = await methods.sayHello(someUser).call();
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });

    it('validate parameters', async () => {
        const {client, methods} = initMionClient<MyApi>({baseURL});

        const responseOk = await methods.sayHello(someUser).validate();

        expect(responseOk).toEqual({
            errors: [[]],
            hasErrors: false,
            totalErrors: 0,
        });

        let error;
        const expectedError = new PublicError({
            message: `Invalid params for Route or Hook 'sayHello', validation failed.`,
            name: 'Validation Error',
            statusCode: 400,
            errorData: {
                errors: [[{code: 'type', message: 'Not an object', path: ''}]],
                hasErrors: true,
                totalErrors: 1,
            },
        });

        try {
            const resp = await methods.sayHello('invalid-param' as any).validate();
        } catch (e) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.errorData).toEqual(expectedError.errorData);
    });

    it('prefill and remove prefill from a request', async () => {
        const {client, methods} = initMionClient<MyApi>({baseURL});

        const request = methods.auth('ABYWZ-TOKEN');
        await request.prefill();
        // note auth has been prefilled and is not required to be sent in the call

        let response;
        try {
            response = await methods.sayHello(someUser).call();
        } catch (e) {
            console.trace(e);
        }
        expect(response).toEqual(`Hello John Doe`);

        // same call should fail after removing the prefill

        request.removePrefill();

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
