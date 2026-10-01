/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {initClient} from './lib/fetchingClient.ts';
import {isMiddlewareInScope} from '../src/dispatch.ts';
import type {RouteSubRequest} from '../src/types.ts';
import {isRpcError, HeadersSubset, resetRoutesCache, RpcError} from '@mionjs/core';
import {resetJitFunctionsCache} from '@mionjs/core/testing';
import type {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
import {forgetMetadata} from './lib/testUtils.ts';

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
}

// TODO: test & write client
describe('client', () => {
  const someUser = {name: 'John', surname: 'Doe'};
  type MyApi = TestServerApi;

  const baseURL = TEST_SERVER_BASE_URL;

  // middleware hooks are per client, so each test's fresh client starts with none

  it('knows its API is not bundled: this project builds with bundleApi: false', () => {
    const {client} = initClient<MyApi>({baseURL});
    expect(client.isApiBundled).toBe(false);
  });

  it('proxy to trap remote methods calls and return MethodRequest data', () => {
    const {routes, middlewares} = initClient<MyApi>({baseURL});

    const expectedSayHelloSubRequest: RouteSubRequest<any> = {
      pointer: ['sayHello'],
      id: 'sayHello',
      isResolved: false,
      params: [someUser],
      call: expect.any(Function),
      typeErrors: expect.any(Function),
    };

    const expectedSumTwoSubRequest: RouteSubRequest<any> = {
      pointer: ['utils', 'sumTwo'],
      id: 'utils/sumTwo',
      isResolved: false,
      params: [2],
      call: expect.any(Function),
      typeErrors: expect.any(Function),
    };

    const sayHello = routes.sayHello(someUser);
    expect(sayHello).toEqual(expect.objectContaining(expectedSayHelloSubRequest));
    expect(routes.utils.sumTwo(2)).toEqual(expect.objectContaining(expectedSumTwoSubRequest));
    // hooks live on the middleware, never on a sub request
    for (const hook of ['events', 'onRequest', 'onResponse', 'onError', 'onSuccess']) {
      expect(sayHello).not.toHaveProperty(hook);
    }

    // a middleware is hooks only
    for (const hook of ['onRequest', 'offRequest', 'onResponse', 'offResponse', 'onError', 'offError']) {
      expect(typeof (middlewares.auth as any)[hook]).toBe('function');
    }

    // is a proxy so actually could trap any call even if does not exists in methods and is not strongly typed
    // note bellow code should not be used when using the client
    const expectedUnknownSubRequest: RouteSubRequest<any> = {
      pointer: ['abcd'],
      id: 'abcd',
      isResolved: false,
      params: [1, 'a'],
      call: expect.any(Function),
      typeErrors: expect.any(Function),
    };
    expect((routes as any).abcd(1, 'a')).toEqual(expect.objectContaining(expectedUnknownSubRequest));
    expect(typeof (middlewares as any).abcd.onRequest).toBe('function');
  });

  it('make a route call and get a valid response', async () => {
    const {routes, middlewares} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');
    middlewares.auth.onRequest((auth) => auth(authHeaders));

    const [greeting, error, clientResponse] = await routes.sayHello(someUser).call();

    expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
    expect(error).toBeUndefined();
    expect(clientResponse['@thrownErrors']).toBeUndefined();
    expect(clientResponse).toBeDefined();
  });

  it('make a route call with middlewares', async () => {
    const {routes, middlewares} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');
    middlewares.auth.onRequest((auth) => auth(authHeaders));

    const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

    expect(greeting).toEqual(`Hello John Doe`); // Test server returns: Hello ${user.name} ${user.surname}
    expect(routeError).toBeUndefined();
    expect(clientResponse['@thrownErrors']).toBeUndefined();
  });

  it('return error in result if a route call fails', async () => {
    const {routes, middlewares} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');
    middlewares.auth.onRequest((auth) => auth(authHeaders));

    const [greeting, routeError] = await routes.alwaysFails(someUser).call();

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

  it('onRequest feeds a middleware on every call and offRequest stops it', async () => {
    const {routes, middlewares} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('ABYWZ-TOKEN');

    middlewares.auth.onRequest((auth) => auth(authHeaders));

    const [response, callError] = await routes.sayHello(someUser).call();
    expect(callError).toBeUndefined();
    expect(response).toEqual(`Hello John Doe`);

    // same call should fail after removing the hook
    middlewares.auth.offRequest();

    const [, routeError, clientResponse] = await routes.sayHello(someUser).call();

    // The unsent auth fails the server's headers check: a typed validation error at the auth path
    const authError = clientResponse.auth as RpcError<string> | undefined;
    expect(routeError).toBeUndefined();
    expect(clientResponse['@thrownErrors']).toBeUndefined();
    expect(isRpcError(authError)).toBe(true);
    expect(authError?.type).toBe('validation-error');
    expect(authError?.publicMessage).toContain('auth');
  });

  // ========== Result Pattern Tests (using call() with an auth onRequest hook) ==========

  describe('Result pattern', () => {
    it('call() should return data on success', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, error] = await routes.sayHello(someUser).call();

      expect(greeting).toBe('Hello John Doe');
      expect(error).toBeUndefined();
    });

    it('call() should return error on failure', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [response, error] = await routes.alwaysFails(someUser).call();

      expect(response).toBeUndefined();
      expect(error).toBeDefined();
      expect(error?.type).toBe('unknown-error');
      expect(error?.publicMessage).toBe('Something fails');
    });

    it('call() should not throw even on error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // This should NOT throw
      let didThrow = false;
      try {
        const [, error] = await routes.alwaysFails(someUser).call();
        expect(error).toBeDefined();
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
    });

    it('call() should return typed error that can be checked', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [response, error] = await routes.alwaysFails(someUser).call();

      // alwaysFails always returns an error, so we expect error to be defined
      expect(error).toBeDefined();
      expect(error?.type).toBe('unknown-error');
      expect(response).toBeUndefined();
    });
  });

  // ========== TypedEvent Middleware Response Handler Tests ==========

  describe('TypedEvent onResponse handlers', () => {
    it('onResponse should be called on every successful request', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let successCallCount = 0;
      let receivedSessionInfo: any = null;

      middlewares.session
        .onRequest((session) => session('valid-token'))
        .onResponse((sessionInfo) => {
          successCallCount++;
          receivedSessionInfo = sessionInfo;
        });

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Make first request
      await routes.sayHello(someUser).call();
      expect(successCallCount).toBe(1);
      expect(receivedSessionInfo).toBeDefined();
      expect(receivedSessionInfo.userId).toBe('user-123');
      expect(receivedSessionInfo.role).toBe('admin');

      // Make second request - onResponse should be called again
      await routes.sayHello(someUser).call();
      expect(successCallCount).toBe(2);
    });

    it('onResponse should NOT be called when middleware fails', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let successCalled = false;
      let errorCalled = false;

      middlewares.session
        .onRequest((session) => session('expired'))
        .onResponse(() => {
          successCalled = true;
        })
        .onError('session-expired', () => {
          errorCalled = true;
        });

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Make request - should fail with session-expired
      await routes.sayHello(someUser).call();

      expect(successCalled).toBe(false);
      expect(errorCalled).toBe(true);
    });

    it('offResponse should remove the response handler', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let successCallCount = 0;
      const countSuccess = () => {
        successCallCount++;
      };

      const typedEvent = middlewares.session.onRequest((session) => session('valid-token')).onResponse(countSuccess);

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      await routes.sayHello(someUser).call();
      expect(successCallCount).toBe(1);

      typedEvent.offResponse(countSuccess);

      await routes.sayHello(someUser).call();
      expect(successCallCount).toBe(1); // Still 1
    });

    it('both onResponse and onError can be registered on same TypedEvent', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let successCalled = false;
      let errorCalled = false;

      // Register both handlers
      middlewares.session
        .onRequest((session) => session('valid-token'))
        .onResponse(() => {
          successCalled = true;
        })
        .onError('session-expired', () => {
          errorCalled = true;
        });

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Make successful request
      await routes.sayHello(someUser).call();

      expect(successCalled).toBe(true);
      expect(errorCalled).toBe(false);
    });

    it('offRequest, offResponse and offError each remove only their own handler', async () => {
      const {middlewares} = initClient<MyApi>({baseURL});

      const onResponse = () => {};
      const onSessionExpired = () => {};
      const typedEvent = middlewares.session
        .onRequest((session) => session('valid-token'))
        .onResponse(onResponse)
        .onError('session-expired', onSessionExpired);

      expect(typedEvent.hasRequestHandler()).toBe(true);
      expect(typedEvent.hasResponseHandler()).toBe(true);
      expect(typedEvent.hasErrorHandler('session-expired')).toBe(true);

      middlewares.session.offRequest();
      expect(typedEvent.hasRequestHandler()).toBe(false);
      expect(typedEvent.hasResponseHandler()).toBe(true);
      expect(typedEvent.hasErrorHandler('session-expired')).toBe(true);

      middlewares.session.offResponse(onResponse).offError('session-expired', onSessionExpired);
      expect(typedEvent.hasResponseHandler()).toBe(false);
      expect(typedEvent.hasErrorHandler('session-expired')).toBe(false);
    });

    it('call() with onRequest hooks should return the middleware answers AND trigger TypedEvent handlers', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let typedEventSuccessCalled = false;
      let typedEventReceivedSession: any = null;

      middlewares.session
        .onRequest((session) => session('valid-token'))
        .onResponse((sessionInfo) => {
          typedEventSuccessCalled = true;
          typedEventReceivedSession = sessionInfo;
        });

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

      // Route should succeed
      expect(greeting).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();

      // Filled by the hook fed middleware
      expect(clientResponse).toBeDefined();

      // TypedEvent handler should ALSO have been called
      expect(typedEventSuccessCalled).toBe(true);
      expect(typedEventReceivedSession).toBeDefined();
      expect(typedEventReceivedSession.userId).toBe('user-123');
    });

    it('call() with onRequest hooks should put the middleware error at its path AND trigger TypedEvent error handlers', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let typedEventErrorCalled = false;
      let typedEventReceivedError: any = null;

      middlewares.session
        .onRequest((session) => session('expired'))
        .onError('session-expired', (error) => {
          typedEventErrorCalled = true;
          typedEventReceivedError = error;
        });

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // a middleware's DECLARED error sits at its path, never in the route slot or @thrownErrors
      const [, routeError, clientResponse] = await routes.sayHello(someUser).call();

      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect((clientResponse.session as RpcError<string> | undefined)?.type).toBe('session-expired');

      // TypedEvent error handler should ALSO have been called
      expect(typedEventErrorCalled).toBe(true);
      expect(typedEventReceivedError).toBeDefined();
      expect(typedEventReceivedError.type).toBe('session-expired');
    });

    it('call() with onRequest hooks should handle mixed results (middleware succeeds, route fails)', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      let typedEventSuccessCalled = false;
      let typedEventReceivedSession: any = null;

      middlewares.session
        .onRequest((session) => session('valid-token'))
        .onResponse((sessionInfo) => {
          typedEventSuccessCalled = true;
          typedEventReceivedSession = sessionInfo;
        });

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // The route always fails; its middleware still runs and succeeds
      const [result, routeError, clientResponse] = await routes.alwaysFails(someUser).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeDefined();
      expect(routeError?.type).toBe('unknown-error');
      expect(routeError?.publicMessage).toBe('Something fails');
      expect(clientResponse['@thrownErrors']).toBeUndefined();

      // Filled even though the route failed
      expect(clientResponse).toBeDefined();

      // Each middleware's handler fires on its own success, whatever the route's outcome
      expect(typedEventSuccessCalled).toBe(true);
      expect(typedEventReceivedSession).toBeDefined();
      expect(typedEventReceivedSession.userId).toBe('user-123');
    });
  });

  // ========== call() with middlewares fed by onRequest ==========

  describe('call() with middlewares fed by onRequest', () => {
    it('call() should return route data on success', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

      expect(greeting).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect(clientResponse).toBeDefined();
    });

    it('call() should return middleware data on success', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.session.onRequest((session) => session('valid-token'));

      const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

      expect(greeting).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect(clientResponse.session).toBeDefined();
      expect((clientResponse.session as {userId: string} | undefined)?.userId).toBe('user-123');
    });

    it('call() should return route error on failure', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, routeError] = await routes.alwaysFails(someUser).call();

      expect(greeting).toBeUndefined();
      expect(routeError).toBeDefined();
      expect(routeError?.type).toBe('unknown-error');
    });

    it('call() should put a middleware failure at its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.session.onRequest((session) => session('expired'));

      const [, routeError, clientResponse] = await routes.sayHello(someUser).call();

      // A middleware's DECLARED error: its own path, never the route slot or @thrownErrors
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect((clientResponse.session as RpcError<string> | undefined)?.type).toBe('session-expired');
      expect(clientResponse.auth).toBeUndefined();
    });

    it('call() should never throw', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      let didThrow = false;
      try {
        const [, routeError] = await routes.alwaysFails(someUser).call();
        // Should have error in result, not throw
        expect(routeError).toBeDefined();
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
    });

    it('call() should support partial success (route succeeds, middleware fails)', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.session.onRequest((session) => session('expired'));

      // Session middleware with expired token will fail
      const [result, routeError, clientResponse] = await routes.sayHello(someUser).call();

      // another subrequest's error never masks the route's result in slot 0
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect((clientResponse.session as RpcError<string> | undefined)?.type).toBe('session-expired');
      if (result !== undefined) expect(result).toBe('Hello John Doe');
    });

    it('call() should return all middleware results', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.session.onRequest((session) => session('valid-token'));

      const [, , clientResponse] = await routes.sayHello(someUser).call();

      expect(clientResponse.session).toBeDefined();
      expect((clientResponse.session as {userId: string} | undefined)?.userId).toBe('user-123');
    });

    it('call() should work with multiple middlewares', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.session.onRequest((session) => session('valid-token'));

      const [greeting, routeError, clientResponse] = await routes.sayHello(someUser).call();

      expect(greeting).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect(clientResponse.session).toBeDefined();
    });

    it('call() result should have correct types', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, routeError] = await routes.sayHello(someUser).call();

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

    it('call() should handle route that always fails', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, routeError] = await routes.alwaysFails(someUser).call();

      expect(greeting).toBeUndefined();
      expect(routeError).toBeDefined();
      expect(routeError?.type).toBe('unknown-error');
      expect(routeError?.publicMessage).toBe('Something fails');
    });
  });

  // ========== Route validation errors (part of every route's expected union) ==========

  describe('Route validation errors', () => {
    it('validation error for wrong param type lands in the typed route error slot', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Send a string instead of a number to calculateAge route
      // We need to bypass TypeScript type checking to send wrong type
      const wrongParams = 'not-a-number' as unknown as number;

      const [result, routeError, clientResponse] = await routes.calculateAge(wrongParams).call();

      // ValidationError is part of the route's expected union: slot 1, not @thrownErrors
      expect(result).toBeUndefined();
      expect(routeError).toBeDefined();
      expect(routeError?.type).toBe('validation-error');
      expect(clientResponse['@thrownErrors']).toBeUndefined();
    });

    it('validation error for wrong object structure lands in the typed route error slot', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Send an object with wrong structure (missing surname)
      const wrongUser = {name: 'John'} as unknown as {name: string; surname: string};

      const [result, routeError, clientResponse] = await routes.sayHello(wrongUser).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeDefined();
      expect(routeError?.type).toBe('validation-error');
      expect(clientResponse['@thrownErrors']).toBeUndefined();
    });

    it('validation error lands in the typed route error slot for call() with onRequest hooks', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Send wrong param type
      const wrongParams = 'not-a-number' as unknown as number;

      const [result, routeError, clientResponse] = await routes.calculateAge(wrongParams).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeDefined();
      expect(routeError?.type).toBe('validation-error');
      expect(clientResponse['@thrownErrors']).toBeUndefined();
      expect(clientResponse).toBeDefined();
    });
  });

  // ========== Pure Functions E2E Tests (UUID validation with serialized pure functions) ==========

  describe('Pure Functions E2E (UUID validation)', () => {
    let routes: ReturnType<typeof initClient<MyApi>>['routes'];
    let middlewares: ReturnType<typeof initClient<MyApi>>['middlewares'];
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    beforeEach(() => {
      const client = initClient<MyApi>({baseURL});
      routes = client.routes;
      middlewares = client.middlewares;
      middlewares.auth.onRequest((auth) => auth(authHeaders));
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
    let middlewares: ReturnType<typeof initClient<MyApi>>['middlewares'];
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    beforeEach(() => {
      const client = initClient<MyApi>({baseURL});
      routes = client.routes;
      middlewares = client.middlewares;
      middlewares.auth.onRequest((auth) => auth(authHeaders));
    });

    it('query() route should use GET and send data in URL query', async () => {
      // a route's FIRST call is optimistic and always a POST (the metadata ask rides in the body);
      // GET is the shape of every call once the metadata is cached
      await routes.getRequestInfo('primes the metadata').call();
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

    it('query() route should work after the onRequest hook is replaced', async () => {
      middlewares.auth.onRequest((auth) => auth(createAuthHeaders('XWYZ-TOKEN')));
      const [result, error] = await routes.getRequestInfo('with middlewares').call();

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      expect(result?.message).toBe('with middlewares');
    });

    it('mutation() route should work after the onRequest hook is replaced', async () => {
      middlewares.auth.onRequest((auth) => auth(createAuthHeaders('XWYZ-TOKEN')));
      const [result, error] = await routes.mutateRequestInfo('mutate with middlewares').call();

      expect(error).toBeUndefined();
      expect(result).toBeDefined();
      expect(result?.message).toBe('mutate with middlewares');
      expect(result?.httpMethod).toBe('POST');
    });
  });

  // ========== Optimistic Mode with onRequest Hooks & Headers Tests ==========

  describe('optimistic mode with onRequest hooks and headers', () => {
    it('call() with an auth headersFn onRequest hook should succeed in optimistic mode', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [greeting, error] = await routes.sayHello(someUser).call();

      expect(error).toBeUndefined();
      expect(greeting).toBe('Hello John Doe');
    });

    it('call() with an ASYNC auth onRequest hook should succeed in optimistic mode', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest(async (auth) => {
        await Promise.resolve();
        auth(authHeaders);
      });

      const [greeting, error] = await routes.sayHello(someUser).call();

      expect(error).toBeUndefined();
      expect(greeting).toBe('Hello John Doe');
    });

    it('subsequent optimistic calls should use standard flow (metadata cached)', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // First call — triggers optimistic flow
      const [greeting1, error1] = await routes.sayHello(someUser).call();
      expect(error1).toBeUndefined();
      expect(greeting1).toBe('Hello John Doe');

      // Second call — metadata cached, should use standard flow
      const [greeting2, error2] = await routes.sayHello(someUser).call();
      expect(error2).toBeUndefined();
      expect(greeting2).toBe('Hello John Doe');
    });

    it('call() without auth should fail in optimistic mode (auth required by server)', async () => {
      const {routes} = initClient<MyApi>({baseURL});

      // the missing auth header is the auth middleware's validation error, never the route's
      const [, routeError, clientResponse] = await routes.sayHello(someUser).call();
      expect(routeError).toBeUndefined();
      expect((clientResponse.auth as RpcError<string> | undefined)?.type).toBe('validation-error');
    });

    it('offRequest should cause subsequent optimistic calls to fail', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // First call should succeed
      const [greeting, error] = await routes.sayHello(someUser).call();
      expect(error).toBeUndefined();
      expect(greeting).toBe('Hello John Doe');

      middlewares.auth.offRequest();

      // no auth now: the validation error sits at the auth path
      const [, , response2] = await routes.sayHello(someUser).call();
      expect((response2.auth as RpcError<string> | undefined)?.type).toBe('validation-error');
    });

    async function spyOnFetch(run: () => Promise<void>): Promise<{init: RequestInit; body: any}[]> {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        await run();
        return fetchSpy.mock.calls.map(([, init]) => ({
          init: init as RequestInit,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        }));
      } finally {
        fetchSpy.mockRestore();
      }
    }

    it('first optimistic call with an auth headersFn onRequest hook is one round trip (no retry)', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      // a scalar param, the simplest case of the optimistic path
      await forgetMetadata(baseURL, 'calculateAge');

      const calls = await spyOnFetch(async () => {
        const [age, error] = await routes.calculateAge(1990).call();
        expect(error).toBeUndefined();
        expect(age).toBe(new Date().getFullYear() - 1990);
      });

      expect(calls).toHaveLength(1);
      const [{init, body}] = calls;
      expect((init.headers as Record<string, string>).Authorization).toBe('XWYZ-TOKEN');
      // the hook fed headers travel as HTTP headers only, never inside the body
      expect(body.auth).toBeUndefined();
      expect(body.calculateAge).toEqual([1990]);
      // the metadata ask piggybacks on that single request
      expect(body['mionFetchMetadata']).toBeDefined();
    });

    it('first optimistic call with an ASYNC auth onRequest hook is one round trip (no retry)', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest(async (auth) => {
        await Promise.resolve();
        auth(authHeaders);
      });
      await forgetMetadata(baseURL, 'sayHello', 'auth');

      const calls = await spyOnFetch(async () => {
        const [greeting, error] = await routes.sayHello(someUser).call();
        expect(error).toBeUndefined();
        expect(greeting).toBe('Hello John Doe');
      });

      expect(calls).toHaveLength(1);
      const [{init, body}] = calls;
      expect((init.headers as Record<string, string>).Authorization).toBe('XWYZ-TOKEN');
      expect(body.auth).toBeUndefined();
    });

    it('every onRequest hook in scope rides along on the first optimistic call, and the ones in the chain resolve', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.session.onRequest((session) => session('valid-token'));
      await forgetMetadata(baseURL, 'sayHello');

      const calls = await spyOnFetch(async () => {
        const [greeting, error, clientResponse] = await routes.sayHello(someUser).call();
        expect(error).toBeUndefined();
        expect(clientResponse['@thrownErrors']).toBeUndefined();
        expect(greeting).toBe('Hello John Doe');
        expect(clientResponse.session).toEqual(expect.objectContaining({userId: 'user-123'}));
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].body.session).toEqual(['valid-token']);
    });

    it('a SCOPED onRequest hook rides along only on the first optimistic call of a route in its group', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      middlewares.utils.scopeTag.onRequest((scopeTag) => scopeTag('tagged'));
      await forgetMetadata(baseURL, 'sayHello', 'utils/sumTwo');

      // a top-level route: the utils-scoped middleware is not in its group, so it is never sent
      const topLevelCalls = await spyOnFetch(async () => {
        const [greeting, error, clientResponse] = await routes.sayHello(someUser).call();
        expect(error).toBeUndefined();
        expect(clientResponse['@thrownErrors']).toBeUndefined();
        expect(greeting).toBe('Hello John Doe');
        expect(clientResponse.utils?.scopeTag).toBeUndefined();
      });
      expect(topLevelCalls).toHaveLength(1);
      expect(topLevelCalls[0].body['utils/scopeTag']).toBeUndefined();

      // a route of the group: the scoped middleware and the top-level auth both ride along, one round trip
      const scopedCalls = await spyOnFetch(async () => {
        const [sum, error, clientResponse] = await routes.utils.sumTwo(5).call();
        expect(error).toBeUndefined();
        expect(clientResponse['@thrownErrors']).toBeUndefined();
        expect(sum).toBe(7);
        expect(clientResponse.utils?.scopeTag).toBe('tagged');
      });
      expect(scopedCalls).toHaveLength(1);
      expect(scopedCalls[0].body['utils/scopeTag']).toEqual(['tagged']);
      expect((scopedCalls[0].init.headers as Record<string, string>).Authorization).toBe('XWYZ-TOKEN');
    });

    it('isMiddlewareInScope: a middleware covers its own group and the groups nested in it', () => {
      expect(isMiddlewareInScope(['auth'], ['sayHello'])).toBe(true);
      expect(isMiddlewareInScope(['auth'], ['utils', 'sumTwo'])).toBe(true);
      expect(isMiddlewareInScope(['utils', 'scopeTag'], ['utils', 'sumTwo'])).toBe(true);
      expect(isMiddlewareInScope(['utils', 'scopeTag'], ['utils', 'deep', 'route'])).toBe(true);
      expect(isMiddlewareInScope(['utils', 'scopeTag'], ['sayHello'])).toBe(false);
      expect(isMiddlewareInScope(['utils', 'scopeTag'], ['flow', 'getUser'])).toBe(false);
      expect(isMiddlewareInScope(['utils', 'scopeTag'], ['utils'])).toBe(false);
    });

    it('optimistic mode with simple types should work without retry (no auth required route)', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [result, error] = await routes.calculateAge(1990).call();

      expect(error).toBeUndefined();
      expect(result).toBe(new Date().getFullYear() - 1990);
    });

    it('optimistic mode with nested routes and an auth onRequest hook', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [result, error] = await routes.utils.sumTwo(5).call();

      expect(error).toBeUndefined();
      expect(result).toBe(7);
    });
  });

  // The optimistic first request sends the params before the client knows the route's encoder, on
  // the plain wire forms every server decoder accepts, so the common case is one round trip; what a
  // decoder cannot read errors and the client retries with the real encoder. The auth middleware's
  // HeadersSubset rides as HTTP headers, never as a body param, so the first call is accepted.
  describe('optimistic first request', () => {
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');
    const requestsOf = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.map(([url, init]) => ({
        url: String(url),
        body: JSON.parse(((init as RequestInit | undefined)?.body as string | undefined) ?? '{}') as Record<string, unknown>,
        headers: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
      }));

    // the metadata cache is module state shared by every client in this file: start each case cold
    beforeEach(() => {
      resetRoutesCache();
      resetJitFunctionsCache();
    });

    it('a scalar payload goes optimistic: ONE round trip carrying the metadata ask', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [result, error] = await routes.calculateAge(1990).call();
        expect(error).toBeUndefined();
        expect(result).toBe(new Date().getFullYear() - 1990);
        const requests = requestsOf(fetchSpy);
        expect(requests.map((request) => request.url)).toHaveLength(1);
        expect(requests[0].body.calculateAge).toEqual([1990]);
        expect(requests[0].body['mionFetchMetadata']).toBeDefined();
        // the HeadersSubset rides as HTTP headers, so nothing is left and the body omits the key
        expect(requests[0].body.auth).toBeUndefined();
        expect(requests[0].headers.Authorization).toBe('XWYZ-TOKEN');
      } finally {
        fetchSpy.mockRestore();
      }
    });

    // A keyed object is not the compact wire form, yet the server's decoder reads it and validation
    // holds: the optimistic bet pays off on an entity sent to a route the client has never seen.
    it('an object payload goes optimistic on a compact route: ONE round trip, keyed on the wire', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [text, error] = await routes.compact.processSimpleUser({name: 'Ada', age: 36}).call();
        expect(error).toBeUndefined();
        expect(text).toBe('User: Ada, Age: 36');
        const requests = requestsOf(fetchSpy);
        expect(requests).toHaveLength(1);
        expect(requests[0].body['compact/processSimpleUser']).toEqual([{name: 'Ada', age: 36}]);
        expect(requests[0].body['mionFetchMetadata']).toBeDefined();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('a Date rides as ISO text in ONE round trip', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const date = new Date('2024-02-02T02:02:02.000Z');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [sameDate, error] = await routes.getSameDate(date).call();
        expect(error).toBeUndefined();
        expect(sameDate).toEqual(date);
        const requests = requestsOf(fetchSpy);
        expect(requests).toHaveLength(1);
        expect(requests[0].body.getSameDate).toEqual(['2024-02-02T02:02:02.000Z']);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('a Map rides as an array of entries in ONE round trip', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const map = new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [sameMap, error] = await routes.getSameMap(map).call();
        expect(error).toBeUndefined();
        expect(sameMap).toEqual(map);
        const requests = requestsOf(fetchSpy);
        expect(requests).toHaveLength(1);
        expect(requests[0].body.getSameMap).toEqual([
          [
            ['a', 1],
            ['b', 2],
          ],
        ]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('a Set rides as an array in ONE round trip', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const set = new Set(['x', 'y']);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [sameSet, error] = await routes.getSameSet(set).call();
        expect(error).toBeUndefined();
        expect(sameSet).toEqual(set);
        const requests = requestsOf(fetchSpy);
        expect(requests).toHaveLength(1);
        expect(requests[0].body.getSameSet).toEqual([['x', 'y']]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('a bigint rides as a whole-number string in ONE round trip', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [value, error] = await routes.getSameBigInt(9007199254740993n).call();
        expect(error).toBeUndefined();
        expect(value).toBe(9007199254740993n);
        const requests = requestsOf(fetchSpy);
        expect(requests).toHaveLength(1);
        expect(requests[0].body.getSameBigInt).toEqual(['9007199254740993']);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    // The one shape the optimistic body cannot write: a union mixing a JSON member with a
    // JavaScript-only one needs the [index, value] envelope, whose index needs the metadata. The
    // server refuses the bare value rather than misreading it, so this is the retry case.
    it('a union needing the [index, value] envelope is refused and retried, never misread', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [value, error] = await routes.echoStringOrDate(new Date('2024-02-02T02:02:02.000Z')).call();
        expect(error).toBeUndefined();
        expect(value).toBe('2024-02-02T02:02:02.000Z');
        const requests = requestsOf(fetchSpy);
        expect(requests).toHaveLength(2);
        // first the bare value, refused; then the same call with the member index in front
        expect(requests[0].body.echoStringOrDate).toEqual(['2024-02-02T02:02:02.000Z']);
        expect(requests[1].body.echoStringOrDate).toEqual([[1, '2024-02-02T02:02:02.000Z']]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('a compact route with scalar params still goes optimistic and decodes its positional answer', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const [user, error] = await routes.compact.getSimpleUser('Ada', 36).call();
        expect(error).toBeUndefined();
        expect(user).toEqual({name: 'Ada', age: 36});
        const requests = requestsOf(fetchSpy);
        expect(requests.map((request) => request.url)).toHaveLength(1);
        expect(requests[0].body['compact/getSimpleUser']).toEqual(['Ada', 36]);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  // For routes declared as `route(async (...): Promise<T> => ...)`, the client must
  // resolve the returnJitHash against the unwrapped T (not the wrapped Promise<T>),
  // since the JIT functions are registered under the unwrapped type's hash.
  describe('async routes', () => {
    it('async route returning Promise<T> resolves through the client metadata-fetch path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [result, error] = await routes.sleep(50).call();

      expect(error).toBeUndefined();
      expect(result).toBe(50);
    });
  });

  describe('cancellation and timeouts', () => {
    it('already-aborted signal returns immediate error without network call', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const signal = AbortSignal.abort();
      const [result, routeError, clientResponse] = await routes.sleep(5000).call({signal});
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-aborted');
    });

    it('per-request abort signal cancels in-flight request', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const controller = new AbortController();
      // sleep(5000) ensures the request is still in-flight when we abort
      const promise = routes.sleep(5000).call({signal: controller.signal});
      setTimeout(() => controller.abort(), 50);

      const [result, routeError, clientResponse] = await promise;
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(isRpcError(clientResponse['@thrownErrors']?.[0])).toBe(true);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-aborted');
    });

    it('per-request timeout produces request-timeout error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // sleep(5000) ensures the request outlasts the 100ms timeout
      const [result, routeError, clientResponse] = await routes.sleep(5000).call({timeout: 100});
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(isRpcError(clientResponse['@thrownErrors']?.[0])).toBe(true);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-timeout');
    });

    it('client-level default timeout applies to all requests', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL, timeout: 100});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [result, routeError, clientResponse] = await routes.sleep(5000).call();
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-timeout');
    });

    it('per-request timeout overrides client-level default', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL, timeout: 30_000});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      // Client has 30s default, but per-request 100ms should take effect
      const [result, , clientResponse] = await routes.sleep(5000).call({timeout: 100});
      expect(result).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-timeout');
    });

    it('global client.abort() cancels all in-flight requests', async () => {
      const {client, routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const p1 = routes.sleep(5000).call();
      const p2 = routes.sleep(5000).call();
      setTimeout(() => client.abort(), 50);

      const [, , response1] = await p1;
      const [, , response2] = await p2;
      expect(response1['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(response1['@thrownErrors']![0].type).toBe('request-aborted');
      expect(response2['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(response2['@thrownErrors']![0].type).toBe('request-aborted');
    });

    it('new requests work normally after client.abort()', async () => {
      const {client, routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      client.abort();

      const [result, error] = await routes.sleep(50).call();
      expect(error).toBeUndefined();
      expect(result).toBe(50);
    });

    it('client.destroy() aborts in-flight requests', async () => {
      const {client, routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const p1 = routes.sleep(5000).call();
      setTimeout(() => client.destroy(), 50);

      const [, , clientResponse] = await p1;
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-aborted');
    });

    it('cancellation works with an onRequest hook, which never runs for an aborted call', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      let hookCalls = 0;
      middlewares.auth.onRequest((auth) => {
        hookCalls++;
        auth(authHeaders);
      });

      const signal = AbortSignal.abort();
      const [result, routeError, clientResponse] = await routes.sleep(5000).call({signal});
      expect(hookCalls).toBe(0);
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-aborted');
    });

    it('cancellation works with batch', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const {batch} = await import('../src/batch.ts');
      const signal = AbortSignal.abort();

      const [, errors, clientResponse] = await batch([routes.sleep(5000), routes.utils.sumTwo(5)]).call({signal});

      // The abort is request-scoped: ONE untyped error, per-route slots stay empty
      expect(errors).toEqual([undefined, undefined]);
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']![0].type).toBe('request-aborted');
    });
  });

  // ========== Platform Error Dispatch Tests ==========
  // Platform errors precede the router and nobody declares them: ONCE in @thrownErrors, no route or middleware slot (R4/R6)
  describe('platform error dispatch', () => {
    // The test server's routes take `string` params with no maximum, so they take the node adapter's
    // maxBodySize (128 KB by default). A 300_000-char string in a JSON body exceeds it and reliably
    // triggers a 'request-payload-too-large' platform error.
    const HUGE_PAYLOAD = 'x'.repeat(300_000);

    it('platform error appears in @thrownErrors on a single route call', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [result, routeError, clientResponse] = await routes.getRequestInfo(HUGE_PAYLOAD).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(isRpcError(clientResponse['@thrownErrors']?.[0])).toBe(true);
      expect(clientResponse['@thrownErrors']?.[0]?.type).toBe('request-payload-too-large');
    });

    it('platform error in a batch is ONE @thrownErrors entry, not one per route', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const {batch} = await import('../src/batch.ts');
      // the request-scoped platform error must not leak into any route's positional slot
      const [results, errors, clientResponse] = await batch([routes.getRequestInfo(HUGE_PAYLOAD), routes.utils.sumTwo(5)]).call();

      expect(results).toEqual([undefined, undefined]);
      expect(errors).toEqual([undefined, undefined]);
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(isRpcError(clientResponse['@thrownErrors']?.[0])).toBe(true);
      expect(clientResponse['@thrownErrors']?.[0]?.type).toBe('request-payload-too-large');
    });

    it('platform error is never keyed to a middleware fed by its onRequest hook', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      middlewares.auth.onRequest((auth) => auth(authHeaders));

      const [result, routeError, clientResponse] = await routes.getRequestInfo(HUGE_PAYLOAD).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(clientResponse['@thrownErrors']?.length).toBeGreaterThan(0);
      expect(clientResponse['@thrownErrors']?.[0]?.type).toBe('request-payload-too-large');
      expect(Object.keys(clientResponse)).toEqual(['@thrownErrors']);
    });
  });
});
