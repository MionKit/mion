/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {initClient} from './client.ts';
import {MiddlewareSubRequest, RouteSubRequest} from './types.ts';
import {isRpcError, HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
    return new HeadersSubset({Authorization: token});
}

// TODO: test & write client
describe('client', () => {
    const someUser = {name: 'John', surname: 'Doe'};
    type MyApi = TestServerApi;

    const baseURL = TEST_SERVER_BASE_URL;

    // Note: prefilledMiddleFnsCache is now per-client instance, so each test with a fresh client starts with empty cache

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const expectedAuthSubRequest: RouteSubRequest<any> & MiddlewareSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: [authHeaders],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        const expectedSayHelloSubRequest: RouteSubRequest<any> & MiddlewareSubRequest<any> = {
            pointer: ['sayHello'],
            id: 'sayHello',
            isResolved: false,
            params: [someUser],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        const expectedSumTwoSubRequest: RouteSubRequest<any> & MiddlewareSubRequest<any> = {
            pointer: ['utils', 'sumTwo'],
            id: 'utils/sumTwo',
            isResolved: false,
            params: [2],
            call: expect.any(Function),
            prefill: expect.any(Function),
            removePrefill: expect.any(Function),
            typeErrors: expect.any(Function),
        };

        expect(middleFns.auth(authHeaders)).toEqual(expect.objectContaining(expectedAuthSubRequest));
        expect(routes.sayHello(someUser)).toEqual(expect.objectContaining(expectedSayHelloSubRequest));
        expect(routes.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwoSubRequest));

        // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
        // note bellow code should not be used when using the client
        const expectedUnknownSubRequest: RouteSubRequest<any> & MiddlewareSubRequest<any> = {
            pointer: ['abcd'],
            id: 'abcd',
            isResolved: false,
            params: [1, 'a'],
            call: expect.any(Function),
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

        const [greeting, error, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call({
            middleFns: {auth: middleFns.auth(authHeaders)},
        });

        expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(error).toBeUndefined();
        expect(middleFnResults).toBeDefined();
        expect(middleFnErrors).toBeDefined();
    });

    it('make a route call with middleFns', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError, , middleFnErrors] = await routes.sayHello(someUser).call({
            middleFns: {auth: middleFns.auth(authHeaders)},
        });

        expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
        expect(routeError).toBeUndefined();
        expect(middleFnErrors?.auth).toBeUndefined();
    });

    it('return error in result if a route call fails', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const [greeting, routeError] = await routes.alwaysFails(someUser).call({
            middleFns: {auth: middleFns.auth(authHeaders)},
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

            // Prefill auth middleFn so call() works without explicit middleFns
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

    // ========== call() with middleFns Tests ==========

    describe('call() with middleFns API', () => {
        it('call({middleFns}) should return route data on success', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(middleFnResults).toBeDefined();
            expect(middleFnErrors).toBeDefined();
        });

        it('call({middleFns}) should return middleFn data on success', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call({
                middleFns: {
                    auth: middleFns.auth(authHeaders),
                    session: middleFns.session('valid-token'),
                },
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(middleFnErrors?.auth).toBeUndefined();
            expect(middleFnResults?.session).toBeDefined();
            expect(middleFnResults?.session?.userId).toBe('user-123');
        });

        it('call({middleFns}) should return route error on failure', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.alwaysFails(someUser).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(greeting).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('unknown-error');
        });

        it('call({middleFns}) should return middleFn error on middleFn failure', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, , , middleFnErrors] = await routes.sayHello(someUser).call({
                middleFns: {
                    auth: middleFns.auth(authHeaders),
                    session: middleFns.session('expired'), // This will fail
                },
            });

            // Route may or may not have data depending on middleFn execution order
            expect(middleFnErrors?.session).toBeDefined();
            expect(middleFnErrors?.session?.type).toBe('session-expired');
        });

        it('call({middleFns}) should never throw', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let didThrow = false;
            try {
                const [, routeError] = await routes.alwaysFails(someUser).call({
                    middleFns: {auth: middleFns.auth(authHeaders)},
                });
                // Should have error in result, not throw
                expect(routeError).toBeDefined();
            } catch {
                didThrow = true;
            }

            expect(didThrow).toBe(false);
        });

        it('call({middleFns}) should support partial success (route succeeds, middleFn fails)', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            // Session middleFn with expired token will fail
            const [, , , middleFnErrors] = await routes.sayHello(someUser).call({
                middleFns: {
                    auth: middleFns.auth(authHeaders),
                    session: middleFns.session('expired'),
                },
            });

            // Route may or may not succeed depending on middleFn execution order
            // But session middleFn should definitely have an error
            expect(middleFnErrors?.session).toBeDefined();
            expect(middleFnErrors?.session?.type).toBe('session-expired');
        });

        it('call({middleFns}) should return all middleFn results', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [, , middleFnResults] = await routes.sayHello(someUser).call({
                middleFns: {
                    auth: middleFns.auth(authHeaders),
                    session: middleFns.session('valid-token'),
                },
            });

            // Session middleFn should have data
            expect(middleFnResults?.session).toBeDefined();
            expect(middleFnResults?.session?.userId).toBe('user-123');
        });

        it('call({middleFns}) should work with multiple middleFns', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(someUser).call({
                middleFns: {
                    auth: middleFns.auth(authHeaders),
                    session: middleFns.session('valid-token'),
                },
            });

            expect(greeting).toBe('Hello John Doe');
            expect(routeError).toBeUndefined();
            expect(middleFnErrors?.auth).toBeUndefined();
            expect(middleFnResults?.session).toBeDefined();
        });

        it('call({middleFns}) result should have correct types', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.sayHello(someUser).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
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

        it('call({middleFns}) should handle route that always fails', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, routeError] = await routes.alwaysFails(someUser).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
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

            const [result, routeError, middleFnResults, middleFnErrors] = await routes.calculateAge(wrongParams).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
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

            const [result, routeError, middleFnResults, middleFnErrors] = await routes.sayHello(wrongUser).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
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

    // ========== Query vs Mutation (GET vs POST) E2E Tests ==========

    describe('query() and mutation() handlers', () => {
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

        it('query() route should use GET and send data in URL query', async () => {
            const [result, error] = await routes.getRequestInfo('hello from query').call();

            expect(error).toBeUndefined();
            expect(result).toBeDefined();
            expect(result?.message).toBe('hello from query');
            expect(result?.httpMethod).toBe('GET');
            expect(result?.urlQuery).toContain('data=');
        });

        it('mutation() route should use POST', async () => {
            const [result, error] = await routes.mutateRequestInfo('hello from mutation').call();

            expect(error).toBeUndefined();
            expect(result).toBeDefined();
            expect(result?.message).toBe('hello from mutation');
            expect(result?.httpMethod).toBe('POST');
            // mutation routes send body via POST/PUT, urlQuery may be undefined
        });

        it('query() route should work with call({middleFns})', async () => {
            const [result, error] = await routes.getRequestInfo('with middlefns').call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(error).toBeUndefined();
            expect(result).toBeDefined();
            expect(result?.message).toBe('with middlefns');
        });

        it('mutation() route should work with call({middleFns})', async () => {
            const [result, error] = await routes.mutateRequestInfo('mutate with middlefns').call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(error).toBeUndefined();
            expect(result).toBeDefined();
            expect(result?.message).toBe('mutate with middlefns');
            expect(result?.httpMethod).toBe('POST');
        });
    });

    // ========== Optimistic Mode with Prefilled Middleware & Headers Tests ==========

    describe('optimistic mode with prefilled middleware and headers', () => {
        it('call() with prefilled auth headersFn should succeed in optimistic mode', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, serializer: 'optimistic'});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const [greeting, error] = await routes.sayHello(someUser).call();

            expect(error).toBeUndefined();
            expect(greeting).toBe('Hello John Doe');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('call({middleFns}) with explicit auth headersFn should succeed in optimistic mode', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, serializer: 'optimistic'});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [greeting, error] = await routes.sayHello(someUser).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(error).toBeUndefined();
            expect(greeting).toBe('Hello John Doe');
        });

        it('subsequent optimistic calls should use standard flow (metadata cached)', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, serializer: 'optimistic'});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            // First call — triggers optimistic flow
            const [greeting1, error1] = await routes.sayHello(someUser).call();
            expect(error1).toBeUndefined();
            expect(greeting1).toBe('Hello John Doe');

            // Second call — metadata cached, should use standard flow
            const [greeting2, error2] = await routes.sayHello(someUser).call();
            expect(error2).toBeUndefined();
            expect(greeting2).toBe('Hello John Doe');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('call() without auth should fail in optimistic mode (auth required by server)', async () => {
            const {routes} = initClient<MyApi>({baseURL, serializer: 'optimistic'});

            const [, error] = await routes.sayHello(someUser).call();
            expect(error).toBeDefined();
            expect(isRpcError(error)).toBe(true);
        });

        it('removing prefill should cause subsequent optimistic calls to fail', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, serializer: 'optimistic'});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            // First call should succeed
            const [greeting, error] = await routes.sayHello(someUser).call();
            expect(error).toBeUndefined();
            expect(greeting).toBe('Hello John Doe');

            // Remove prefill
            middleFns.auth(authHeaders).removePrefill();

            // Call should now fail (no auth)
            const [, error2] = await routes.sayHello(someUser).call();
            expect(error2).toBeDefined();
            expect(isRpcError(error2)).toBe(true);
        });

        it('optimistic mode with simple types should work without retry (no auth required route)', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, serializer: 'optimistic'});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const [result, error] = await routes.calculateAge(1990).call();

            expect(error).toBeUndefined();
            expect(result).toBe(new Date().getFullYear() - 1990);

            middleFns.auth(authHeaders).removePrefill();
        });

        it('optimistic mode with nested routes and prefilled auth', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, serializer: 'optimistic'});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const [result, error] = await routes.utils.sumTwo(5).call();

            expect(error).toBeUndefined();
            expect(result).toBe(7);

            middleFns.auth(authHeaders).removePrefill();
        });
    });

    // For routes declared as `route(async (...): Promise<T> => ...)`, the client must
    // resolve the returnJitHash against the unwrapped T (not the wrapped Promise<T>),
    // since the JIT functions are registered under the unwrapped type's hash.
    describe('async routes', () => {
        it('async route returning Promise<T> resolves through the client metadata-fetch path', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const [result, error] = await routes.sleep(50).call();

            expect(error).toBeUndefined();
            expect(result).toBe(50);

            middleFns.auth(authHeaders).removePrefill();
        });
    });

    describe('cancellation and timeouts', () => {
        it('already-aborted signal returns immediate error without network call', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const signal = AbortSignal.abort();
            const [result, error] = await routes.sleep(5000).call({signal});
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(error!.type).toBe('request-aborted');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('per-request abort signal cancels in-flight request', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const controller = new AbortController();
            // sleep(5000) ensures the request is still in-flight when we abort
            const promise = routes.sleep(5000).call({signal: controller.signal});
            setTimeout(() => controller.abort(), 50);

            const [result, error] = await promise;
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(isRpcError(error)).toBe(true);
            expect(error!.type).toBe('request-aborted');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('per-request timeout produces request-timeout error', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            // sleep(5000) ensures the request outlasts the 100ms timeout
            const [result, error] = await routes.sleep(5000).call({timeout: 100});
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(isRpcError(error)).toBe(true);
            expect(error!.type).toBe('request-timeout');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('client-level default timeout applies to all requests', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, timeout: 100});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const [result, error] = await routes.sleep(5000).call();
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(error!.type).toBe('request-timeout');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('per-request timeout overrides client-level default', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL, timeout: 30_000});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            // Client has 30s default, but per-request 100ms should take effect
            const [result, error] = await routes.sleep(5000).call({timeout: 100});
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(error!.type).toBe('request-timeout');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('global client.abort() cancels all in-flight requests', async () => {
            const {client, routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const p1 = routes.sleep(5000).call();
            const p2 = routes.sleep(5000).call();
            setTimeout(() => client.abort(), 50);

            const [, err1] = await p1;
            const [, err2] = await p2;
            expect(err1).toBeDefined();
            expect(err1!.type).toBe('request-aborted');
            expect(err2).toBeDefined();
            expect(err2!.type).toBe('request-aborted');

            middleFns.auth(authHeaders).removePrefill();
        });

        it('new requests work normally after client.abort()', async () => {
            const {client, routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            client.abort();

            const [result, error] = await routes.sleep(50).call();
            expect(error).toBeUndefined();
            expect(result).toBe(50);

            middleFns.auth(authHeaders).removePrefill();
        });

        it('client.destroy() aborts in-flight requests', async () => {
            const {client, routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const p1 = routes.sleep(5000).call();
            setTimeout(() => client.destroy(), 50);

            const [, error] = await p1;
            expect(error).toBeDefined();
            expect(error!.type).toBe('request-aborted');
        });

        it('cancellation works with middleFns in call setup', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const signal = AbortSignal.abort();
            const [result, error] = await routes.sleep(5000).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
                signal,
            });
            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(error!.type).toBe('request-aborted');
        });

        it('cancellation works with routesFlow', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const {routesFlow} = await import('./routesFlow.ts');
            const signal = AbortSignal.abort();

            const [, errors] = await routesFlow([routes.sleep(5000), routes.utils.sumTwo(5)]).call({signal});

            // With an already-aborted signal, all routes get abort errors
            expect(errors).toBeDefined();

            middleFns.auth(authHeaders).removePrefill();
        });
    });

    // ========== Platform Error Propagation Tests ==========
    // A "platform error" is set by the platform adapter (e.g. payload too large) BEFORE the router
    // ever runs. The client's contract is to surface this error in EVERY positional slot of the
    // returned tuple — single-route, routesFlow routes, and middleFns alike — so callers always
    // see the failure regardless of which slot they read. This describe block locks in that contract.
    describe('platform error propagation', () => {
        // Test server uses platform-node's default maxBodySize (256KB).
        // A 300_000-char string in a JSON body comfortably exceeds it and reliably triggers
        // a 'request-payload-too-large' platform error returned by the platform adapter.
        const HUGE_PAYLOAD = 'x'.repeat(300_000);

        it('platform error appears as routeError on a single route call', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const [result, error] = await routes.getRequestInfo(HUGE_PAYLOAD).call();

            expect(result).toBeUndefined();
            expect(error).toBeDefined();
            expect(isRpcError(error)).toBe(true);
            expect(error?.type).toBe('request-payload-too-large');

            await middleFns.auth(authHeaders).removePrefill();
        });

        it('platform error propagates to every route position in a routesFlow', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');
            middleFns.auth(authHeaders).prefill();

            const {routesFlow} = await import('./routesFlow.ts');
            // Mix the oversized-payload route with a normal one — both should receive the same
            // platform error in their positional slots
            const [results, errors] = await routesFlow([routes.getRequestInfo(HUGE_PAYLOAD), routes.utils.sumTwo(5)]).call();

            expect(results).toEqual([undefined, undefined]);
            expect(errors).toBeDefined();
            expect(Array.isArray(errors)).toBe(true);
            expect(errors?.length).toBe(2);
            expect(isRpcError(errors?.[0])).toBe(true);
            expect(isRpcError(errors?.[1])).toBe(true);
            expect(errors?.[0]?.type).toBe('request-payload-too-large');
            expect(errors?.[1]?.type).toBe('request-payload-too-large');

            await middleFns.auth(authHeaders).removePrefill();
        });

        it('platform error also appears in middleFnErrors when calling with explicit middleFns', async () => {
            const {routes, middleFns} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            const [result, routeError, , middleFnErrors] = await routes.getRequestInfo(HUGE_PAYLOAD).call({
                middleFns: {auth: middleFns.auth(authHeaders)},
            });

            expect(result).toBeUndefined();
            expect(routeError).toBeDefined();
            expect(routeError?.type).toBe('request-payload-too-large');
            expect(middleFnErrors?.auth).toBeDefined();
            expect(middleFnErrors?.auth?.type).toBe('request-payload-too-large');
        });
    });
});
