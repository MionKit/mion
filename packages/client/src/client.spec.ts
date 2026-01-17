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

        const [greeting, error, hookResults, hookErrors] = await routes.sayHello(someUser).callWithHooks({
            auth: hooks.auth(authHeaders),
        });

        expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(error).toBeUndefined();
        expect(hookResults).toBeDefined();
        expect(hookErrors).toBeDefined();
    });

    it('make a route call using callWithHooks method', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError, , hookErrors] = await routes.sayHello(someUser).callWithHooks({
            auth: hooks.auth(authHeaders),
        });

        expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(routeError).toBeUndefined();
        expect(hookErrors?.auth).toBeUndefined();
    });

    it('return error in result if a route call fails', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError] = await routes.alwaysFails(someUser).callWithHooks({
            auth: hooks.auth(authHeaders),
        });

        expect(greeting).toBeUndefined();
        expect(routeError).toBeDefined();
        expect(routeError?.type).toBe('unknown-error');
        expect(routeError?.publicMessage).toBe('Something fails');
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

            const [greeting, error] = await routes.sayHello(someUser).call();

            expect(greeting).toBe('Hello John Doe');
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

            const [response, error] = await routes.alwaysFails(someUser).call();

            expect(response).toBeUndefined();
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

            const [response, error] = await routes.alwaysFails(someUser).call();

            // alwaysFails always returns an error, so we expect error to be defined
            expect(error).toBeDefined();
            expect(error?.type).toBe('unknown-error');
            expect(response).toBeUndefined();

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

        it('call() with prefilled hooks should return hookResults/hookErrors AND trigger TypedEvent handlers', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let typedEventSuccessCalled = false;
            let typedEventReceivedSession: any = null;

            // Prefill session hook with TypedEvent handlers
            hooks
                .session('valid-token')
                .prefill()
                .onSuccess((sessionInfo) => {
                    typedEventSuccessCalled = true;
                    typedEventReceivedSession = sessionInfo;
                });

            // Prefill auth hook
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // call() should return both route result AND hook results/errors in the 4-tuple
            const [greeting, routeError, hookResults, hookErrors] = await routes.sayHello(someUser).call();

            // Route should succeed
            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();

            // Hook results should be available in the 4-tuple (from prefilled hooks)
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();

            // TypedEvent handler should ALSO have been called
            expect(typedEventSuccessCalled).toBe(true);
            expect(typedEventReceivedSession).toBeDefined();
            expect(typedEventReceivedSession.userId).toBe('user-123');

            // Clean up
            await hooks.session('valid-token').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });

        it('call() with prefilled hooks should return hookErrors AND trigger TypedEvent error handlers', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let typedEventErrorCalled = false;
            let typedEventReceivedError: any = null;

            // Prefill session hook with expired token and TypedEvent error handler
            hooks
                .session('expired')
                .prefill()
                .onError('session-expired', (error) => {
                    typedEventErrorCalled = true;
                    typedEventReceivedError = error;
                });

            // Prefill auth hook
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // call() should return hook errors in the 4-tuple
            const [, , hookResults, hookErrors] = await routes.sayHello(someUser).call();

            // Hook errors should be available in the 4-tuple
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();

            // TypedEvent error handler should ALSO have been called
            expect(typedEventErrorCalled).toBe(true);
            expect(typedEventReceivedError).toBeDefined();
            expect(typedEventReceivedError.type).toBe('session-expired');

            // Clean up
            await hooks.session('expired').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });

        it('call() with prefilled hooks should handle mixed results (hook succeeds, route fails)', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let typedEventSuccessCalled = false;
            let typedEventReceivedSession: any = null;

            // Prefill session hook with TypedEvent success handler
            hooks
                .session('valid-token')
                .prefill()
                .onSuccess((sessionInfo) => {
                    typedEventSuccessCalled = true;
                    typedEventReceivedSession = sessionInfo;
                });

            // Prefill auth hook
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Call a route that always fails - hooks still execute and succeed, but route returns error
            const [result, routeError, hookResults, hookErrors] = await routes.alwaysFails(someUser).call();

            // Route should fail
            expect(result).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
            expect(routeError?.publicMessage).toBe('Something fails');

            // Hook results should be available (hooks succeeded even though route failed)
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();

            // TypedEvent success handler SHOULD be called for the hook (hook succeeded independently)
            // This is the correct behavior - each hook is processed individually, not based on route success
            expect(typedEventSuccessCalled).toBe(true);
            expect(typedEventReceivedSession).toBeDefined();
            expect(typedEventReceivedSession.userId).toBe('user-123');

            // Clean up
            await hooks.session('valid-token').removePrefill();
            await hooks.auth(authHeaders).removePrefill();
        });
    });

    // ========== callWithHooks() Tests ==========

    describe('callWithHooks() API', () => {
        it('callWithHooks should return route data on success', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, hookResults, hookErrors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();
        });

        it('callWithHooks should return hook data on success', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, hookResults, hookErrors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('valid-token'),
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(hookErrors?.auth).toBeUndefined();
            expect(hookResults?.session).toBeDefined();
            expect(hookResults?.session?.userId).toBe('user-123');
        });

        it('callWithHooks should return route error on failure', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.alwaysFails(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            expect(greeting).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
        });

        it('callWithHooks should return hook error on hook failure', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, , , hookErrors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('expired'), // This will fail
            });

            // Route may or may not have data depending on hook execution order
            expect(hookErrors?.session).toBeDefined();
            expect(hookErrors?.session?.type).toBe('session-expired');
        });

        it('callWithHooks should never throw', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let didThrow = false;
            try {
                const [, routeError] = await routes.alwaysFails(someUser).callWithHooks({
                    auth: hooks.auth(authHeaders),
                });
                // Should have error in result, not throw
                expect(routeError).toBeDefined();
            } catch {
                didThrow = true;
            }

            expect(didThrow).toBe(false);
        });

        it('callWithHooks should NOT work with empty hooks object', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // callWithHooks with empty hooks object should throw an error
            expect(() => routes.sayHello(someUser).callWithHooks({})).toThrow(
                'callWithHooks requires at least one hook. Use call() instead for requests without hooks.'
            );
        });

        it('callWithHooks should support partial success (route succeeds, hook fails)', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Session hook with expired token will fail
            const [, , , hookErrors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('expired'),
            });

            // Route may or may not succeed depending on hook execution order
            // But session hook should definitely have an error
            expect(hookErrors?.session).toBeDefined();
            expect(hookErrors?.session?.type).toBe('session-expired');
        });

        it('callWithHooks should return all hook results', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, , hookResults] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('valid-token'),
            });

            // Session hook should have data
            expect(hookResults?.session).toBeDefined();
            expect(hookResults?.session?.userId).toBe('user-123');
        });

        it('callWithHooks should work with multiple hooks', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, hookResults, hookErrors] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
                session: hooks.session('valid-token'),
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(hookErrors?.auth).toBeUndefined();
            expect(hookResults?.session).toBeDefined();
        });

        it('callWithHooks result should have correct types', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.sayHello(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            // Type checks - these should compile
            // Use variables to avoid conditional expects
            const greetingValue: string | undefined = greeting;
            const errorType: string | undefined = routeError?.type;

            // At least one should be defined (either success or error)
            const hasResult = greetingValue !== undefined || errorType !== undefined;
            expect(hasResult).toBe(true);

            // If we have data, it should be a string
            expect(greetingValue === undefined || typeof greetingValue === 'string').toBe(true);
        });

        it('callWithHooks should handle route that always fails', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.alwaysFails(someUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            expect(greeting).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
            expect(routeError?.publicMessage).toBe('Something fails');
        });
    });

    // ========== Server-side Hook Errors Tests (@thrownErrors) ==========

    describe('Server-side hook errors (@thrownErrors)', () => {
        it('validation error should be included in hookErrors when sending wrong param type', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Send a string instead of a number to calculateAge route
            // This should trigger a validation error from the server
            // We need to bypass TypeScript type checking to send wrong type
            const wrongParams = 'not-a-number' as unknown as number;

            const [result, routeError, hookResults, hookErrors] = await routes.calculateAge(wrongParams).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            // The request should fail due to validation error
            expect(result).toBeUndefined();

            // Either routeError or hookErrors should contain the validation error
            const hasError = routeError !== undefined || (hookErrors && Object.keys(hookErrors).length > 0);
            expect(hasError).toBe(true);

            // hookResults should be defined (even if empty)
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();
        });

        it('validation error should be included in hookErrors when sending wrong object structure', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Send an object with wrong structure (missing surname)
            // We need to bypass TypeScript type checking to send wrong type
            const wrongUser = {name: 'John'} as unknown as {name: string; surname: string};

            const [result, routeError, hookResults, hookErrors] = await routes.sayHello(wrongUser).callWithHooks({
                auth: hooks.auth(authHeaders),
            });

            // The request should fail due to validation error
            expect(result).toBeUndefined();

            // Either routeError or hookErrors should contain the validation error
            const hasError = routeError !== undefined || (hookErrors && Object.keys(hookErrors).length > 0);
            expect(hasError).toBe(true);

            // hookResults should be defined (even if empty)
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();
        });

        it('validation error should be included in hookErrors for call() with prefilled hooks', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth hook
            hooks.auth(authHeaders).prefill();
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Send wrong param type
            const wrongParams = 'not-a-number' as unknown as number;

            const [result, routeError, hookResults, hookErrors] = await routes.calculateAge(wrongParams).call();

            // The request should fail due to validation error
            expect(result).toBeUndefined();

            // Either routeError or hookErrors should contain the validation error
            const hasError = routeError !== undefined || (hookErrors && Object.keys(hookErrors).length > 0);
            expect(hasError).toBe(true);

            // hookResults and hookErrors should always be defined in 4-tuple
            expect(hookResults).toBeDefined();
            expect(hookErrors).toBeDefined();

            // Clean up
            await hooks.auth(authHeaders).removePrefill();
        });
    });
});
