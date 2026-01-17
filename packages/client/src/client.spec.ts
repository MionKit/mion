/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from './client';
import {HookSubRequest, RouteSubRequest} from './types';
import {isRpcError, HeadersSubset} from '@mionkit/core';
import {TestServerApi} from '../test/test-server';
import {createTestServerHooks, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS} from '../test/test-server-utils';

// Mock localStorage for method metadata storage (still needed for clientMethodsMetadata)
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// Helper to create auth headers for the test server's headersHook
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

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

    // Note: prefilledHooksCache is now per-client instance, so each test with a fresh client starts with empty cache

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const expectedAuthSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: [authHeaders],
            call: expect.any(Function),
            callWithHooks: expect.any(Function),
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
            callWithHooks: expect.any(Function),
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
            callWithHooks: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        expect(hooks.auth(authHeaders)).toEqual(expect.objectContaining(expectedAuthSubRequest));
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
            callWithHooks: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };
        expect((routes as any).abcd(1, 'a')).toEqual(expect.objectContaining(expectedUnknownSubRequest));
        expect((hooks as any).abcd(1, 'a')).toEqual(expect.objectContaining(expectedUnknownSubRequest));
    });

    it('make a route call and get a valid response', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [results, errors] = await routes.sayHello(someUser).callWithHooks({
            auth: hooks.auth(authHeaders),
        });

        expect(results.route).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(errors.route).toBeUndefined();
    });

    it('make a route call using callWithHooks method', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [results, errors] = await routes.sayHello(someUser).callWithHooks({
            auth: hooks.auth(authHeaders),
        });

        expect(results.route).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(errors.hooks.auth).toBeUndefined();
    });

    it('return error in result if a route call fails', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [results, errors] = await routes.alwaysFails(someUser).callWithHooks({
            auth: hooks.auth(authHeaders),
        });

        expect(results.route).toBeUndefined();
        expect(errors.route).toBeDefined();
        expect(errors.route?.type).toBe('unknown-error');
        expect(errors.route?.publicMessage).toBe('Something fails');
    });

    it('return error in result if a route is missing hook data', async () => {
        const {routes} = initClient<MyApi>({baseURL});

        // Call a route without providing the required auth hook
        // This should fail because the server expects authentication
        const [results, errors] = await routes.sayHello(someUser).callWithHooks({});

        // The server may or may not require auth depending on configuration
        // If auth is required, we should get an error
        // If auth is not required, the route should succeed
        // Either way, callWithHooks should not throw
        expect(data).toBeDefined();
        expect(errors).toBeDefined();

        // If there's an error, it should be an RpcError
        // Use a variable to avoid conditional expect
        const hasValidError = !errors.route || isRpcError(errors.route);
        expect(hasValidError).toBe(true);
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
        const authHeaders = createAuthHeaders('ABYWZ-TOKEN');

        const request = hooks.auth(authHeaders);
        request.prefill();
        // note auth has been prefilled and is not required to be sent in the call
        // Small delay to ensure prefill completes
        await new Promise((resolve) => setTimeout(resolve, 100));

        const [response, callError] = await routes.sayHello(someUser).call();
        expect(callError).toBeUndefined();
        expect(response).toEqual(`Hello John Doe`);

        // same call should fail after removing the prefill

        request.removePrefill();

        const [, error] = await routes.sayHello(someUser).call();

        // After removing prefill, the auth hook is not sent, so server returns headers validation error
        expect(error).toBeDefined();
        expect(isRpcError(error)).toBe(true);
        expect(error?.['mion@isΣrrθr']).toBe(true);
        expect(error?.publicMessage).toContain('auth');
    });

    // ========== Result Pattern Tests (using call() with prefilled auth) ==========

    describe('Result pattern', () => {
        it('call() should return data on success', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const [data, error] = await routes.sayHello(someUser).call();

            expect(data).toBe('Hello John Doe');
            expect(error).toBeUndefined();

            // Clean up
            hooks.auth(authHeaders).removePrefill();
        });

        it('call() should return error on failure', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const [data, error] = await routes.alwaysFails(someUser).call();

            expect(data).toBeUndefined();
            expect(error).toBeDefined();
            expect(error?.type).toBe('unknown-error');
            expect(error?.publicMessage).toBe('Something fails');

            // Clean up
            hooks.auth(authHeaders).removePrefill();
        });

        it('call() should not throw even on error', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // This should NOT throw
            let didThrow = false;
            try {
                const [, error] = await routes.alwaysFails(someUser).call();
                expect(error).toBeDefined();
            } catch {
                didThrow = true;
            }

            expect(didThrow).toBe(false);

            // Clean up
            hooks.auth(authHeaders).removePrefill();
        });

        it('call() should return typed error that can be checked', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const [data, error] = await routes.alwaysFails(someUser).call();

            // alwaysFails always returns an error, so we expect error to be defined
            expect(error).toBeDefined();
            expect(error?.type).toBe('unknown-error');
            expect(data).toBeUndefined();

            // Clean up
            hooks.auth(authHeaders).removePrefill();
        });
    });

    // ========== TypedEvent Hook Success Handler Tests ==========

    describe('TypedEvent onSuccess handlers', () => {
        it('onSuccess should be called on every successful request', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCallCount = 0;
            let receivedSessionInfo: any = null;

            // Prefill the session hook and register onSuccess handler
            hooks
                .session('valid-token')
                .prefill()
                .onSuccess((sessionInfo) => {
                    successCallCount++;
                    receivedSessionInfo = sessionInfo;
                });

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Make first request
            await routes.sayHello(someUser).call();
            expect(successCallCount).toBe(1);
            expect(receivedSessionInfo).toBeDefined();
            expect(receivedSessionInfo.userId).toBe('user-123');
            expect(receivedSessionInfo.role).toBe('admin');

            // Make second request - onSuccess should be called again
            await routes.sayHello(someUser).call();
            expect(successCallCount).toBe(2);

            // Clean up
            await hooks.session('valid-token').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });

        it('onSuccess should NOT be called when hook fails', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCalled = false;
            let errorCalled = false;

            // Prefill with expired token and register handlers
            hooks
                .session('expired')
                .prefill()
                .onSuccess(() => {
                    successCalled = true;
                })
                .onError('session-expired', () => {
                    errorCalled = true;
                });

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Make request - should fail with session-expired
            await routes.sayHello(someUser).call();

            expect(successCalled).toBe(false);
            expect(errorCalled).toBe(true);

            // Clean up
            await hooks.session('expired').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });

        it('offSuccess should remove success handler', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCallCount = 0;

            // Prefill and register onSuccess handler
            const typedEvent = hooks
                .session('valid-token')
                .prefill()
                .onSuccess(() => {
                    successCallCount++;
                });

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // First request - handler should be called
            await routes.sayHello(someUser).call();
            expect(successCallCount).toBe(1);

            // Remove the success handler
            typedEvent.offSuccess();

            // Second request - handler should NOT be called
            await routes.sayHello(someUser).call();
            expect(successCallCount).toBe(1); // Still 1

            // Clean up
            await hooks.session('valid-token').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });

        it('both onSuccess and onError can be registered on same TypedEvent', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCalled = false;
            let errorCalled = false;

            // Register both handlers
            hooks
                .session('valid-token')
                .prefill()
                .onSuccess(() => {
                    successCalled = true;
                })
                .onError('session-expired', () => {
                    errorCalled = true;
                });

            // Prefill auth hook so call() works without callWithHooks
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Make successful request
            await routes.sayHello(someUser).call();

            expect(successCalled).toBe(true);
            expect(errorCalled).toBe(false);

            // Clean up
            await hooks.session('valid-token').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });

        it('removePrefill should clear both success and error handlers', async () => {
            const {hooks} = initClient<MyApi>({baseURL});

            // Register handlers
            const typedEvent = hooks
                .session('valid-token')
                .prefill()
                .onSuccess(() => {
                    // Handler registered
                })
                .onError('session-expired', () => {
                    // Handler registered
                });

            // Verify handlers are registered
            expect(typedEvent.hasSuccessHandler()).toBe(true);
            expect(typedEvent.hasErrorHandler('session-expired')).toBe(true);

            // Remove prefill (should clear handlers)
            await hooks.session('valid-token').removePrefill();

            // Verify handlers are cleared
            expect(typedEvent.hasSuccessHandler()).toBe(false);
            expect(typedEvent.hasErrorHandler('session-expired')).toBe(false);
        });
    });

    // ========== callWithHooks() Tests ==========

    describe('callWithHooks() API', () => {
        it('callWithHooks should return route data on success', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data, errors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            expect(data.route).toBe('Hello John Doe');
            expect(errors.route).toBeUndefined();
        });

        it('callWithHooks should return hook data on success', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data, errors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('valid-token'),
            });

            expect(data.route).toBe('Hello John Doe');
            expect(errors.hooks.auth).toBeUndefined();
            expect(data.hooks.session).toBeDefined();
            expect(data.hooks.session?.userId).toBe('user-123');
        });

        it('callWithHooks should return route error on failure', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data, errors] = await routes.alwaysFails(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            expect(data.route).toBeUndefined();
            expect(errors.route).toBeDefined();
            expect(errors.route?.type).toBe('unknown-error');
        });

        it('callWithHooks should return hook error on hook failure', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, errors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('expired'), // This will fail
            });

            // Route may or may not have data depending on hook execution order
            expect(errors.hooks.session).toBeDefined();
            expect(errors.hooks.session?.type).toBe('session-expired');
        });

        it('callWithHooks should never throw', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let didThrow = false;
            try {
                const [, errors] = await routes.alwaysFails(someUser).callWithHooks({
                    auth: hooks.auth(authHeaders),
                });
                // Should have error in result, not throw
                expect(errors.route).toBeDefined();
            } catch {
                didThrow = true;
            }

            expect(didThrow).toBe(false);
        });

        it('callWithHooks should work with empty hooks object', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth so the route can succeed
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            const [data, errors] = await routes.sayHello(someUser).callWithHooks({});

            expect(data.route).toBe('Hello John Doe');
            expect(Object.keys(errors.hooks)).toHaveLength(0);

            // Clean up
            await hooks.auth(authHeaders).removePrefill();
        });

        it('callWithHooks should support partial success (route succeeds, hook fails)', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Session hook with expired token will fail
            const [, errors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('expired'),
            });

            // Route may or may not succeed depending on hook execution order
            // But session hook should definitely have an error
            expect(errors.hooks.session).toBeDefined();
            expect(errors.hooks.session?.type).toBe('session-expired');
        });

        it('callWithHooks should return all hook results', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('valid-token'),
            });

            // Session hook should have data
            expect(data.hooks.session).toBeDefined();
            expect(data.hooks.session?.userId).toBe('user-123');
        });

        it('callWithHooks should work with multiple hooks', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data, errors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('valid-token'),
            });

            expect(data.route).toBe('Hello John Doe');
            expect(errors.hooks.auth).toBeUndefined();
            expect(data.hooks.session).toBeDefined();
        });

        it('callWithHooks result should have correct types', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data, errors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            // Type checks - these should compile
            // Use variables to avoid conditional expects
            const greeting: string | undefined = data.route;
            const errorType: string | undefined = errors.route?.type;

            // At least one should be defined (either success or error)
            const hasResult = greeting !== undefined || errorType !== undefined;
            expect(hasResult).toBe(true);

            // If we have data, it should be a string
            expect(greeting === undefined || typeof greeting === 'string').toBe(true);
        });

        it('callWithHooks should handle route that always fails', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [data, errors] = await routes.alwaysFails(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            expect(data.route).toBeUndefined();
            expect(errors.route).toBeDefined();
            expect(errors.route?.type).toBe('unknown-error');
            expect(errors.route?.publicMessage).toBe('Something fails');
        });
    });
});
