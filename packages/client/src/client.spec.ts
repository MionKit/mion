/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RemoteMethods, Routes, registerRoutes} from '@mionkit/router';
import {initMionClient} from './client';
import {HookRequest, RouteRequest} from './types';
import {initHttpRouter, startHttpServer} from '@mionkit/http';
import {Server} from 'http';

// TODO: test & write client
describe('client', () => {
    type User = {name: string; surname: string};

    const routes = {
        auth: {
            headerName: 'Authorization',
            canReturnData: true,
            headerHook: (ctx, token: string): User => ({name: 'John', surname: 'Doe'}),
        },
        sayHello: {route: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`},
        utils: {
            sumTwo: (ctx, a: number): number => a + 2,
        },
        log: {hook: (ctx): void => console.log('ending')},
    } satisfies Routes;

    const someUser = {name: 'John', surname: 'Doe'};
    let myApi: RemoteMethods<typeof routes>;
    type MyApi = typeof myApi;

    const port = 8076;
    let server: Server;
    beforeAll(async () => {
        initHttpRouter({sharedDataFactory: () => {}, port});
        myApi = registerRoutes(routes);
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
        const {client, methods} = initMionClient<MyApi>({baseURL: 'http://localhost:3000'});

        const expectedAuth: HookRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: ['token'],
            persist: expect.any(Function),
        };

        const expectedSayHello: RouteRequest<any> = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
        };

        const expectedSumTwo: HookRequest<any> = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils-sumTwo',
            isResolved: false,
            params: [2],
            persist: expect.any(Function),
        };

        expect(methods.auth('token')).toEqual(expect.objectContaining(expectedAuth));
        expect(methods.sayHello(someUser)).toEqual(expect.objectContaining(expectedSayHello));
        expect(methods.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwo));

        // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
        // note bellow code should not be used when using the client
        const expectedUntyped: RouteRequest<any> & HookRequest<any> = {
            pointer: ['abcd'],
            id: 'abcd',
            isResolved: false,
            params: [1, 'a'],
            call: expect.any(Function),
            persist: expect.any(Function),
        };
        expect((methods as any).abcd(1, 'a')).toEqual(expectedUntyped);
    });

    it('fetch a route', async () => {
        // TODO: implement the get public method info route in the router
        const {client, methods} = initMionClient<MyApi>({baseURL: 'http://localhost:3000'});

        const response = await methods.sayHello(someUser).call(methods.auth('token'));

        expect(response).toEqual(`Hello John Doe`);
    });

    it('fail if a remote call fails', () => {});
});
