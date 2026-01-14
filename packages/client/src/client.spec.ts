/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initClient} from './client';
import {HookSubRequest, RouteSubRequest} from './types';
import {isRpcError, RpcError, HeadersSubset} from '@mionkit/core';
import {TestServerApi} from '../test/test-server';
import {createTestServerHooks, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS} from '../test/test-server-utils';
import {clearPrefilledHooksCache} from './request';

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

    // Clear prefilled hooks cache between tests to ensure prefilled hooks don't leak between tests
    beforeEach(() => {
        clearPrefilledHooksCache();
    });

    it('proxy to trap remote methods calls and return MethodRequest data', () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const expectedAuthSubRequest: RouteSubRequest<any> & HookSubRequest<any> = {
            pointer: ['auth'],
            id: 'auth',
            isResolved: false,
            params: [authHeaders],
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
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const response = await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();
        expect(response).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
    });

    it('make a route call using chainable hooks method', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        const response = await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();
        expect(response).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
    });

    it('throw error if a route call fails', async () => {
        const {routes, hooks} = initClient<MyApi>({baseURL});
        const authHeaders = createAuthHeaders('XWYZ-TOKEN');

        let error: any;
        const expectedError = new RpcError({
            publicMessage: 'Something fails',
            type: 'unknown-error',
        });

        try {
            await routes.alwaysFails(someUser).hooks(hooks.auth(authHeaders)).call();
        } catch (e: RpcError<string> | any) {
            error = e;
        }

        expect(error).toEqual(expectedError);
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
        // Error is a plain object with RpcError structure (not an instance)
        expect(error['mion@isΣrrθr']).toBe(true);
        expect(error.publicMessage).toContain('auth');
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
        try {
            await routes.sayHello(someUser).call();
        } catch (e) {
            error = e;
        }

        // After removing prefill, the auth hook is not sent, so server returns headers validation error
        expect(error).toBeDefined();
        expect(isRpcError(error)).toBe(true);
        expect(error['mion@isΣrrθr']).toBe(true);
        expect(error.publicMessage).toContain('auth');
    });

    // ========== Error Handler Tests ==========

    describe('error handlers', () => {
        it('catchError should be called for matching error type', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let catchErrorCalled = false;
            let caughtError: any = null;

            await routes
                .alwaysFails(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .catchError('unknown-error', (error) => {
                    catchErrorCalled = true;
                    caughtError = error;
                });

            expect(catchErrorCalled).toBe(true);
            expect(caughtError).toBeDefined();
            expect(caughtError.type).toBe('unknown-error');
            expect(caughtError.publicMessage).toBe('Something fails');
        });

        it('catchUnknown should NOT be called when catchError handles the error', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let catchErrorCalled = false;
            let catchUnknownCalled = false;

            await routes
                .alwaysFails(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .catchError('unknown-error', () => {
                    catchErrorCalled = true;
                })
                .catchUnknown(() => {
                    catchUnknownCalled = true;
                });

            expect(catchErrorCalled).toBe(true);
            expect(catchUnknownCalled).toBe(false);
        });

        it('catchUnknown should be called when no catchError matches', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let catchErrorCalled = false;
            let catchUnknownCalled = false;
            let caughtError: any = null;

            await routes
                .alwaysFails(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .catchError('some-other-error' as any, () => {
                    catchErrorCalled = true;
                })
                .catchUnknown((error) => {
                    catchUnknownCalled = true;
                    caughtError = error;
                });

            expect(catchErrorCalled).toBe(false);
            expect(catchUnknownCalled).toBe(true);
            expect(caughtError.type).toBe('unknown-error');
        });

        it('catch should NOT be called when catchError handles the error', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let catchErrorCalled = false;
            let catchCalled = false;

            await routes
                .alwaysFails(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .catchError('unknown-error', () => {
                    catchErrorCalled = true;
                })
                .catch(() => {
                    catchCalled = true;
                });

            expect(catchErrorCalled).toBe(true);
            expect(catchCalled).toBe(false);
        });

        it('catch should NOT be called when catchUnknown handles the error', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let catchUnknownCalled = false;
            let catchCalled = false;

            await routes
                .alwaysFails(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .catchUnknown(() => {
                    catchUnknownCalled = true;
                })
                .catch(() => {
                    catchCalled = true;
                });

            expect(catchUnknownCalled).toBe(true);
            expect(catchCalled).toBe(false);
        });

        it('catch should be called with error record when no other handler matches', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let catchCalled = false;
            let caughtErrors: Record<string, any> = {};

            await routes
                .alwaysFails(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .catchError('some-other-error' as any, () => {
                    // This won't match
                })
                .catch((errors) => {
                    catchCalled = true;
                    caughtErrors = errors;
                });

            expect(catchCalled).toBe(true);
            expect(Object.keys(caughtErrors).length).toBeGreaterThan(0);
            // The error should be keyed by method ID
            const errorKeys = Object.keys(caughtErrors);
            expect(errorKeys.some((key) => key.includes('alwaysFails'))).toBe(true);
            expect(Object.values(caughtErrors)[0].type).toBe('unknown-error');
        });

        it('promise should reject when no error handler is registered', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let thrownError: any = null;

            try {
                await routes.alwaysFails(someUser).hooks(hooks.auth(authHeaders)).call();
            } catch (e) {
                thrownError = e;
            }

            expect(thrownError).toBeDefined();
            expect(thrownError.type).toBe('unknown-error');
        });

        it('then should receive success value when no error occurs', async () => {
            const {routes, hooks} = initClient<MyApi>({baseURL});
            const authHeaders = createAuthHeaders('XWYZ-TOKEN');

            let thenCalled = false;
            let receivedValue: any = null;

            await routes
                .sayHello(someUser)
                .hooks(hooks.auth(authHeaders))
                .call()
                .then((value) => {
                    thenCalled = true;
                    receivedValue = value;
                });

            expect(thenCalled).toBe(true);
            expect(receivedValue).toBe('Hello John Doe');
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

            // Make first request
            await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();
            expect(successCallCount).toBe(1);
            expect(receivedSessionInfo).toBeDefined();
            expect(receivedSessionInfo.userId).toBe('user-123');
            expect(receivedSessionInfo.role).toBe('admin');

            // Make second request - onSuccess should be called again
            await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();
            expect(successCallCount).toBe(2);

            // Clean up
            await hooks.session('valid-token').removePrefill();
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

            // Make request - should fail with session-expired
            await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();

            expect(successCalled).toBe(false);
            expect(errorCalled).toBe(true);

            // Clean up
            await hooks.session('expired').removePrefill();
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

            // First request - handler should be called
            await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();
            expect(successCallCount).toBe(1);

            // Remove the success handler
            typedEvent.offSuccess();

            // Second request - handler should NOT be called
            await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();
            expect(successCallCount).toBe(1); // Still 1

            // Clean up
            await hooks.session('valid-token').removePrefill();
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

            // Make successful request
            await routes.sayHello(someUser).hooks(hooks.auth(authHeaders)).call();

            expect(successCalled).toBe(true);
            expect(errorCalled).toBe(false);

            // Clean up
            await hooks.session('valid-token').removePrefill();
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
});
