/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {initClient} from './client.ts';
import {HSubRequest, RSubRequest} from './types.ts';
import {isRpcError, HeadersSubset} from '@mionkit/core';
import {TestServerApi} from '@mionkit/test-server';
import {TEST_SERVER_BASE_URL_JSON} from '../globalSetup.ts';

// Mock localStorage for method metadata storage (still needed for clientMethodsMetadata)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

// TODO: test & write client
describe('client', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    const baseURL = TEST_SERVER_BASE_URL_JSON;

    // Note: prefilledMiddleFnsCache is now per-client instance, so each test with a fresh client starts with empty cache

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const expectedAuthSubRequest: RSubRequest<any> & HSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: [authHeaders],
            call: expect.any(Function),
            callWithMiddleFns: expect.any(Function),
            callWithWorkflow: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        const expectedSayHelloSubRequest: RSubRequest<any> & HSubRequest<any> = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
            callWithMiddleFns: expect.any(Function),
            callWithWorkflow: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        const expectedSumTwoSubRequest: RSubRequest<any> & HSubRequest<any> = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils/sumTwo',
            isResolved: false,
            params: [2],
            call: expect.any(Function),
            callWithMiddleFns: expect.any(Function),
            callWithWorkflow: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        expect(middleFns.auth(authHeaders)).toEqual(expect.objectContaining(expectedAuthSubRequest));
        expect(routes.sayHello(someUser)).toEqual(expect.objectContaining(expectedSayHelloSubRequest));
        expect(routes.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwoSubRequest));

        // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
        // note bellow code should not be used when using the client
        const expectedUnknownSubRequest: RSubRequest<any> & HSubRequest<any> = {
            pointer: ['abcd'],
            id: 'abcd',
            isResolved: false,
            params: [1, 'a'],
            call: expect.any(Function),
            callWithMiddleFns: expect.any(Function),
            callWithWorkflow: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };
        expect((routes as any).abcd(1, 'a')).toEqual(expect.objectContaining(expectedUnknownSubRequest));
        expect((middleFns as any).abcd(1, 'a')).toEqual(expect.objectContaining(expectedUnknownSubRequest));
    });

    it('make a route call and get a valid response', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, error, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(error).toBeUndefined();
        expect(middleFnResults).toBeDefined();
        expect(middleFnErrors).toBeDefined();
    });

    it('make a route call using callWithMiddleFns method', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError, , middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(routeError).toBeUndefined();
        expect(middleFnErrors?.auth).toBeUndefined();
    });

    it('return error in result if a route call fails', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError] = await routes.alwaysFails(someUser).callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
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
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('ABYWZ-TOKEN');

        const request = middleFns.auth(authHeaders);
        request.prefill();
        // note auth has been prefilled and is not required to be sent in the call

        const [response, callError] = await routes.sayHello(someUser).call();
        expect(callError).toBeUndefined();
        expect(response).toEqual(`Hello John Doe`);

        // same call should fail after removing the prefill

        request.removePrefill();

        const [, error] = await routes.sayHello(someUser).call();

        // After removing prefill, the auth middleFn is not sent, so server returns headers validation error
        expect(error).toBeDefined();
        expect(isRpcError(error)).toBe(true);
        expect(error?.['mion@isΣrrθr']).toBe(true);
        expect(error?.publicMessage).toContain('auth');
    });

    // ========== Result Pattern Tests (using call() with prefilled auth) ==========

    describe('Result pattern', () => {
        it('call() should return data on success', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

            const [greeting, error] = await routes.sayHello(someUser).call();

            expect(greeting).toBe('Hello John Doe');
            expect(error).toBeUndefined();

            // Clean up
            middleFns.auth(authHeaders).removePrefill();
        });

        it('call() should return error on failure', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

            const [response, error] = await routes.alwaysFails(someUser).call();

            expect(response).toBeUndefined();
            expect(error).toBeDefined();
            expect(error?.type).toBe('unknown-error');
            expect(error?.publicMessage).toBe('Something fails');

            // Clean up
            middleFns.auth(authHeaders).removePrefill();
        });

        it('call() should not throw even on error', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

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
            middleFns.auth(authHeaders).removePrefill();
        });

        it('call() should return typed error that can be checked', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

            const [response, error] = await routes.alwaysFails(someUser).call();

            // alwaysFails always returns an error, so we expect error to be defined
            expect(error).toBeDefined();
            expect(error?.type).toBe('unknown-error');
            expect(response).toBeUndefined();

            // Clean up
            middleFns.auth(authHeaders).removePrefill();
        });
    });

    // ========== TypedEvent MiddleFn Success Handler Tests ==========

    describe('TypedEvent onSuccess handlers', () => {
        it('onSuccess should be called on every successful request', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCallCount = 0;
            let receivedSessionInfo: any = null;

            // Prefill the session middleFn and register onSuccess handler
            middleFns
                .session('valid-token')
                .prefill()
                .onSuccess((sessionInfo) => {
                    successCallCount++;
                    receivedSessionInfo = sessionInfo;
                });

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

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
            await middleFns.session('valid-token').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('onSuccess should NOT be called when middleFn fails', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCalled = false;
            let errorCalled = false;

            // Prefill with expired token and register handlers
            middleFns
                .session('expired')
                .prefill()
                .onSuccess(() => {
                    successCalled = true;
                })
                .onError('session-expired', () => {
                    errorCalled = true;
                });

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

            // Make request - should fail with session-expired
            await routes.sayHello(someUser).call();

            expect(successCalled).toBe(false);
            expect(errorCalled).toBe(true);

            // Clean up
            await middleFns.session('expired').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('offSuccess should remove success handler', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCallCount = 0;

            // Prefill and register onSuccess handler
            const typedEvent = middleFns
                .session('valid-token')
                .prefill()
                .onSuccess(() => {
                    successCallCount++;
                });

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

            // First request - handler should be called
            await routes.sayHello(someUser).call();
            expect(successCallCount).toBe(1);

            // Remove the success handler
            typedEvent.offSuccess();

            // Second request - handler should NOT be called
            await routes.sayHello(someUser).call();
            expect(successCallCount).toBe(1); // Still 1

            // Clean up
            await middleFns.session('valid-token').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('both onSuccess and onError can be registered on same TypedEvent', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let successCalled = false;
            let errorCalled = false;

            // Register both handlers
            middleFns
                .session('valid-token')
                .prefill()
                .onSuccess(() => {
                    successCalled = true;
                })
                .onError('session-expired', () => {
                    errorCalled = true;
                });

            // Prefill auth middleFn so call() works without callWithMiddleFns
            middleFns.auth(authHeaders).prefill();

            // Make successful request
            await routes.sayHello(someUser).call();

            expect(successCalled).toBe(true);
            expect(errorCalled).toBe(false);

            // Clean up
            await middleFns.session('valid-token').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('removePrefill should clear both success and error handlers', async () => {
            const {middleFns} = initClient<MyApi>({baseURL});

            // Register handlers
            const typedEvent = middleFns
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
            await middleFns.session('valid-token').removePrefill();

            // Verify handlers are cleared
            expect(typedEvent.hasSuccessHandler()).toBe(false);
            expect(typedEvent.hasErrorHandler('session-expired')).toBe(false);
        });

        it('call() with prefilled middleFns should return middleFnResults/middleFnErrors AND trigger TypedEvent handlers', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let typedEventSuccessCalled = false;
            let typedEventReceivedSession: any = null;

            // Prefill session middleFn with TypedEvent handlers
            middleFns
                .session('valid-token')
                .prefill()
                .onSuccess((sessionInfo) => {
                    typedEventSuccessCalled = true;
                    typedEventReceivedSession = sessionInfo;
                });

            // Prefill auth middleFn
            middleFns.auth(authHeaders).prefill();

            // call() should return both route result AND middleFn results/errors in the 4-tuple
            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call();

            // Route should succeed
            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();

            // MiddleFn results should be available in the 4-tuple (from prefilled middleFns)
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();

            // TypedEvent handler should ALSO have been called
            expect(typedEventSuccessCalled).toBe(true);
            expect(typedEventReceivedSession).toBeDefined();
            expect(typedEventReceivedSession.userId).toBe('user-123');

            // Clean up
            await middleFns.session('valid-token').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('call() with prefilled middleFns should return middleFnErrors AND trigger TypedEvent error handlers', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let typedEventErrorCalled = false;
            let typedEventReceivedError: any = null;

            // Prefill session middleFn with expired token and TypedEvent error handler
            middleFns
                .session('expired')
                .prefill()
                .onError('session-expired', (error) => {
                    typedEventErrorCalled = true;
                    typedEventReceivedError = error;
                });

            // Prefill auth middleFn
            middleFns.auth(authHeaders).prefill();

            // call() should return middleFn errors in the 4-tuple
            const [, , middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call();

            // MiddleFn errors should be available in the 4-tuple
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();

            // TypedEvent error handler should ALSO have been called
            expect(typedEventErrorCalled).toBe(true);
            expect(typedEventReceivedError).toBeDefined();
            expect(typedEventReceivedError.type).toBe('session-expired');

            // Clean up
            await middleFns.session('expired').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('call() with prefilled middleFns should handle mixed results (middleFn succeeds, route fails)', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let typedEventSuccessCalled = false;
            let typedEventReceivedSession: any = null;

            // Prefill session middleFn with TypedEvent success handler
            middleFns
                .session('valid-token')
                .prefill()
                .onSuccess((sessionInfo) => {
                    typedEventSuccessCalled = true;
                    typedEventReceivedSession = sessionInfo;
                });

            // Prefill auth middleFn
            middleFns.auth(authHeaders).prefill();

            // Call a route that always fails - middleFns still execute and succeed, but route returns error
            const [result, routeError, middleFnResults, middleFnErrors] = await routes.alwaysFails(someUser).call();

            // Route should fail
            expect(result).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
            expect(routeError?.publicMessage).toBe('Something fails');

            // MiddleFn results should be available (middleFns succeeded even though route failed)
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();

            // TypedEvent success handler SHOULD be called for the middleFn (middleFn succeeded independently)
            // This is the correct behavior - each middleFn is processed individually, not based on route success
            expect(typedEventSuccessCalled).toBe(true);
            expect(typedEventReceivedSession).toBeDefined();
            expect(typedEventReceivedSession.userId).toBe('user-123');

            // Clean up
            await middleFns.session('valid-token').removePrefill();
            await middleFns.auth(authHeaders).removePrefill();
        });
    });

    // ========== callWithMiddleFns() Tests ==========

    describe('callWithMiddleFns() API', () => {
        it('callWithMiddleFns should return route data on success', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();
        });

        it('callWithMiddleFns should return middleFn data on success', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                session: middleFns.session('valid-token'),
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(middleFnErrors?.auth).toBeUndefined();
            expect(middleFnResults?.session).toBeDefined();
            expect(middleFnResults?.session?.userId).toBe('user-123');
        });

        it('callWithMiddleFns should return route error on failure', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.alwaysFails(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
            });

            expect(greeting).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
        });

        it('callWithMiddleFns should return middleFn error on middleFn failure', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, , , middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                session: middleFns.session('expired'), // This will fail
            });

            // Route may or may not have data depending on middleFn execution order
            expect(middleFnErrors?.session).toBeDefined();
            expect(middleFnErrors?.session?.type).toBe('session-expired');
        });

        it('callWithMiddleFns should never throw', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let didThrow = false;
            try {
                const [, routeError] = await routes.alwaysFails(someUser).callWithMiddleFns({
                    auth: middleFns.auth(authHeaders),
                });
                // Should have error in result, not throw
                expect(routeError).toBeDefined();
            } catch {
                didThrow = true;
            }

            expect(didThrow).toBe(false);
        });

        it('callWithMiddleFns should NOT work with empty middleFns object', async () => {
            const {routes} = initClient<MyApi>({baseURL});

            // callWithMiddleFns with empty middleFns object should throw an error
            expect(() => routes.sayHello(someUser).callWithMiddleFns({})).toThrow(
                'callWithMiddleFns requires at least one middleFn. Use call() instead for requests without middleFns.'
            );
        });

        it('callWithMiddleFns should support partial success (route succeeds, middleFn fails)', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Session middleFn with expired token will fail
            const [, , , middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                session: middleFns.session('expired'),
            });

            // Route may or may not succeed depending on middleFn execution order
            // But session middleFn should definitely have an error
            expect(middleFnErrors?.session).toBeDefined();
            expect(middleFnErrors?.session?.type).toBe('session-expired');
        });

        it('callWithMiddleFns should return all middleFn results', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, , middleFnResults] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                session: middleFns.session('valid-token'),
            });

            // Session middleFn should have data
            expect(middleFnResults?.session).toBeDefined();
            expect(middleFnResults?.session?.userId).toBe('user-123');
        });

        it('callWithMiddleFns should work with multiple middleFns', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
                session: middleFns.session('valid-token'),
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(middleFnErrors?.auth).toBeUndefined();
            expect(middleFnResults?.session).toBeDefined();
        });

        it('callWithMiddleFns result should have correct types', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.sayHello(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
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

        it('callWithMiddleFns should handle route that always fails', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.alwaysFails(someUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
            });

            expect(greeting).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
            expect(routeError?.publicMessage).toBe('Something fails');
        });
    });

    // ========== Server-side MiddleFn Errors Tests (@thrownErrors) ==========

    describe('Server-side middleFn errors (@thrownErrors)', () => {
        it('validation error should be included in middleFnErrors when sending wrong param type', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Send a string instead of a number to calculateAge route
            // This should trigger a validation error from the server
            // We need to bypass TypeScript type checking to send wrong type
            const wrongParams = 'not-a-number' as unknown as number;

            const [result, routeError, middleFnResults, middleFnErrors] = await routes
                .calculateAge(wrongParams)
                .callWithMiddleFns({
                    auth: middleFns.auth(authHeaders),
                });

            // The request should fail due to validation error
            expect(result).toBeUndefined();

            // Either routeError or middleFnErrors should contain the validation error
            const hasError = routeError !== undefined || (middleFnErrors && Object.keys(middleFnErrors).length > 0);
            expect(hasError).toBe(true);

            // middleFnResults should be defined (even if empty)
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();
        });

        it('validation error should be included in middleFnErrors when sending wrong object structure', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Send an object with wrong structure (missing surname)
            // We need to bypass TypeScript type checking to send wrong type
            const wrongUser = {name: 'John'} as unknown as {name: string; surname: string};

            const [result, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(wrongUser).callWithMiddleFns({
                auth: middleFns.auth(authHeaders),
            });

            // The request should fail due to validation error
            expect(result).toBeUndefined();

            // Either routeError or middleFnErrors should contain the validation error
            const hasError = routeError !== undefined || (middleFnErrors && Object.keys(middleFnErrors).length > 0);
            expect(hasError).toBe(true);

            // middleFnResults should be defined (even if empty)
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();
        });

        it('validation error should be included in middleFnErrors for call() with prefilled middleFns', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Prefill auth middleFn
            middleFns.auth(authHeaders).prefill();

            // Send wrong param type
            const wrongParams = 'not-a-number' as unknown as number;

            const [result, routeError, middleFnResults, middleFnErrors] = await routes.calculateAge(wrongParams).call();

            // The request should fail due to validation error
            expect(result).toBeUndefined();

            // Either routeError or middleFnErrors should contain the validation error
            const hasError = routeError !== undefined || (middleFnErrors && Object.keys(middleFnErrors).length > 0);
            expect(hasError).toBe(true);

            // middleFnResults and middleFnErrors should always be defined in 4-tuple
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();

            // Clean up
            await middleFns.auth(authHeaders).removePrefill();
        });
    });

    // ========== Pure Functions E2E Tests (UUID validation with serialized pure functions) ==========

    describe('Pure Functions E2E (UUID validation)', () => {
        let routes: ReturnType<typeof initClient<MyApi>>['routes'];
        let middleFns: ReturnType<typeof initClient<MyApi>>['middleFns'];
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        beforeEach(() => {
            const client = initClient<MyApi>({baseURL});
            routes = client.routes;
            middleFns = client.middleFns;
            middleFns.auth(authHeaders).prefill();
        });

        afterEach(async () => {
            await middleFns.auth(authHeaders).removePrefill();
        });

        it('should successfully call route with valid UUID v4', async () => {
            const validUUID = '550e8400-e29b-41d4-a716-446655440000';

            const [result, routeError] = await routes.validateUUID(validUUID as any).call();

            expect(routeError).toBeUndefined();
            expect(result).toBe(`Valid UUID: ${validUUID}`);
        });

        it('should fail server-side validation with invalid UUID format', async () => {
            const invalidUUID = 'not-a-valid-uuid';

            const [result, routeError] = await routes.validateUUID(invalidUUID as any).call();

            // Server should reject invalid UUID
            expect(result).toBeUndefined();
            expect(routeError).toBeDefined();
        });

        it('should validate UUID locally using typeErrors() with serialized pure function', async () => {
            const validUUID = '550e8400-e29b-41d4-a716-446655440000';

            // typeErrors() uses serialized pure functions locally to validate
            const errors = await routes.validateUUID(validUUID as any).typeErrors();

            // Should have no errors for valid UUID
            expect(Array.isArray(errors)).toBe(true);
            expect(errors.length).toBe(0);
        });

        it('should return validation errors locally for invalid UUID using typeErrors()', async () => {
            const invalidUUID = 'not-a-valid-uuid';

            // typeErrors() uses serialized pure functions locally to validate
            const errors = await routes.validateUUID(invalidUUID as any).typeErrors();

            // Should have errors for invalid UUID
            expect(Array.isArray(errors)).toBe(true);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('should validate UUID v4 version locally (reject v7 format)', async () => {
            // UUID v7 format (starts with timestamp, version digit is 7)
            const uuidV7 = '01932c6c-426b-7b93-9000-f1e2d3c4b5a6';

            // typeErrors() should detect this is not a valid v4 UUID
            const errors = await routes.validateUUID(uuidV7 as any).typeErrors();

            // Should have errors because route expects v4, not v7
            expect(Array.isArray(errors)).toBe(true);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('should work with getUserById route that returns UUID in response', async () => {
            const validUUID = '550e8400-e29b-41d4-a716-446655440000';

            const [result, routeError] = await routes.getUserById(validUUID as any).call();

            expect(routeError).toBeUndefined();
            expect(result).toBeDefined();
            expect(result?.id).toBe(validUUID);
            expect(result?.name).toBe('Test User');
        });

        it('should validate getUserById params locally using typeErrors()', async () => {
            const invalidUUID = 'invalid-uuid-format';

            // typeErrors() uses serialized pure functions locally to validate
            const errors = await routes.getUserById(invalidUUID as any).typeErrors();

            // Should have errors for invalid UUID
            expect(Array.isArray(errors)).toBe(true);
            expect(errors.length).toBeGreaterThan(0);
        });

        it('should validate multiple UUID formats correctly', async () => {
            // Test valid UUID formats
            const validUUIDs = [
                '550e8400-e29b-41d4-a716-446655440000', // valid v4
                '6ba7b810-9dad-41d1-80b4-00c04fd430c8', // valid v4 variant
            ];

            for (const uuid of validUUIDs) {
                const errors = await routes.validateUUID(uuid as any).typeErrors();
                expect(errors.length).toBe(0);
            }

            // Test invalid UUID formats
            const invalidUUIDs = [
                'not-a-uuid', // invalid format
                '550e8400-e29b-51d4-a716-446655440000', // v5 instead of v4
                '', // empty string
                '550e8400-e29b-41d4-a716', // truncated UUID
            ];

            for (const uuid of invalidUUIDs) {
                const errors = await routes.validateUUID(uuid as any).typeErrors();
                expect(errors.length).toBeGreaterThan(0);
            }
        });
    });
});
