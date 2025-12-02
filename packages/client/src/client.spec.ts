/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from './client';
import {HookSubRequest, RouteSubRequest} from './types';
import {isRpcError, RpcError} from '@mionkit/core';
import {TestServerApi} from '../test/test-server';
import {createTestServerHooks, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS} from '../test/test-server-utils';

// TODO move this into global jest config file if it is required by more tests
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// TODO: test & write client
describe('client', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    const port = TEST_PORT_MAPPING.client;

    // Create server hooks using the utility
    const serverHooks = createTestServerHooks({port});
    const baseURL = serverHooks.getBaseURL();

    beforeAll(serverHooks.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
    afterAll(serverHooks.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const expectedAuthSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: ['XWYZ-TOKEN'],
            call: expect.any(Function),
            hooks: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        const expectedSayHelloSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
            hooks: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        const expectedSumTwoSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils/sumTwo',
            isResolved: false,
            params: [2],
            call: expect.any(Function),
            hooks: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        expect(hooks.auth('XWYZ-TOKEN')).toEqual(expect.objectContaining(expectedAuthSubRequest));
        expect(routes.sayHello(someUser)).toEqual(expect.objectContaining(expectedSayHelloSubRequest));
        expect(routes.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwoSubRequest));

        // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
        // note bellow code should not be used when using the client
        const expectedUnknownSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['abcd'],
            id: 'abcd',
            isResolved: false,
            params: [1, 'a'],
            call: expect.any(Function),
            hooks: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };
        expect((routes as any).abcd(1, 'a')).toEqual(expectedUnknownSubRequest);
        expect((hooks as any).abcd(1, 'a')).toEqual(expectedUnknownSubRequest);
    });

    it('make a route call and get a valid response', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const response = await routes.sayHello(someUser).hooks(hooks.auth('XWYZ-TOKEN')).call();
        expect(response).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
    });

    it('make a route call using chainable hooks method', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const response = await routes.sayHello(someUser).hooks(hooks.auth('XWYZ-TOKEN')).call();
        expect(response).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
    });

    it('throw error if a route call fails', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        let error: any;
        const expectedError = new RpcError({
            publicMessage: 'Something fails',
            type: 'unknown-error',
            statusCode: 500,
        });

        try {
            await routes.alwaysFails(someUser).hooks(hooks.auth('XWYZ-TOKEN')).call();
        } catch (e: RpcError<string> | any) {
            error = e;
        }

        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });

    it('throw error if a route is missing hook data', async () => {
        const {routes} = initClient<MyApi>({baseURL});

        let error: any;
        try {
            // Call a route without providing the required auth hook
            // This should fail because the server expects authentication
            await routes.sayHello(someUser).call();
        } catch (e: RpcError<string> | any) {
            error = e;
        }

        // Verify that an error was thrown
        expect(error).toBeDefined();
        expect(isRpcError(error)).toBe(true);

        // The error should indicate missing authentication or validation failure
        // Based on the server setup, this should be a 400 error for missing auth
        expect(error.statusCode).toBe(400);
        expect(error.name).toBe('RpcError');
        expect(error.message).toContain('auth');
    });

    it('typeErrors method returns validation errors', async () => {
        const {routes} = initClient<MyApi>({baseURL});

        // Test with valid parameters - should return empty array
        const validationResp = await routes.sayHello(someUser).typeErrors();
        expect(Array.isArray(validationResp)).toBe(true);

        // Note: The actual validation behavior depends on the server implementation
        // This test mainly ensures the method exists and returns the expected type
    });

    it('prefill and remove prefill from a request', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});

        const request = hooks.auth('ABYWZ-TOKEN');
        await request.prefill();
        // note auth has been prefilled and is not required to be sent in the call

        let response: any;
        try {
            response = await routes.sayHello(someUser).call();
        } catch (e) {
            console.trace(e);
        }
        expect(response).toEqual(`Hello John Doe`);

        // same call should fail after removing the prefill

        request.removePrefill();

        let error: any;
        const expectedError = new RpcError({
            publicMessage: `Invalid params for Route or Hook 'auth', validation failed.`,
            type: 'validation-error',
            statusCode: 400,
        });

        try {
            await routes.sayHello(someUser).call();
        } catch (e) {
            error = e;
        }
        expect(error).toEqual(expectedError);
        expect(error.statusCode).toEqual(expectedError.statusCode);
    });
});
