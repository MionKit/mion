/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Contract tests for the client error dispatch rules.
 *
 * The result is [result, error, response]; `response` is the decoded body with ids nested by group:
 * - R1 route returned its own declared error              -> slot 1 (of its own entry in a batch) AND its path in slot 2
 * - R2 param validation failed for a route                -> slot 1 AND its path, client- or server-side
 * - R3 middleware declared error / validation error       -> its path in slot 2 AND its onError listener
 * - R4 anything not strongly typed (a throw, transport,   -> `response['@thrownErrors']` only, NO listener fires;
 *      platform, a failed hook, an unreadable answer)          every one is kept, in the order it happened
 * - R5 route produced a result                            -> slot 0 keeps it, whatever else failed
 * - R6 an error the route did not declare                 -> never appears in slot 1
 * - R7 with validateServerResponses, an answer its type   -> removed from its path, its error in `@thrownErrors`,
 *      does not describe                                        and NO listener fires
 */

import {describe, it, expect} from 'vitest';
import {initClient} from './lib/fetchingClient.ts';
import {batch} from '../src/batch.ts';
import {isRpcError, isFatalError, FatalError, RpcError, HeadersSubset, routesCache} from '@mionjs/core';
import {type TestServerApi, ScopedAuthError} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
}

/** Fakes fetch inside `run`, for answers the test server never sends */
async function withServerAnswer<T>(body: unknown, headers: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {headers: {'content-type': 'application/json', ...headers}})) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** Every route of the test server runs behind the root-level `auth` headers middleware. */
function useAuth(middlewares: ReturnType<typeof initClient<TestServerApi>>['middlewares'], token = 'XWYZ-TOKEN'): void {
  middlewares.auth.onRequest((auth) => auth(createAuthHeaders(token)));
}

describe('client error dispatch contract', () => {
  const someUser = {name: 'John', surname: 'Doe'};
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;

  describe('single route calls', () => {
    it('T1 (R1): route returns its declared error -> slot 1 and its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.alwaysFails(someUser).call();

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('unknown-error');
      expect((response as any).alwaysFails).toBe(routeError);
      expect(response['@thrownErrors']).toBeUndefined();
    });

    it('T2 (R2): route param validation fails client-side -> slot 1 and its path hold validation-error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.calculateAge('nope' as unknown as number).call();

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('validation-error');
      expect((response as any).calculateAge).toBe(routeError);
      expect(response['@thrownErrors']).toBeUndefined();
    });

    it('T2b (R2): route param validation fails server-side -> moved from @thrownErrors to slot 1 and its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL, validateParams: false});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.calculateAge('nope' as unknown as number).call();

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('validation-error');
      expect((response as any).calculateAge).toBe(routeError);
      expect(response['@thrownErrors']).toBeUndefined();
    });

    it('T3 (R5, pins the masking bug): route succeeds while a middleware fails -> slot 0 keeps the result', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      middlewares.session.onRequest((session) => session('expired'));

      const [result, routeError, response] = await routes.sayHello(someUser).call();

      // the server ran the route (a RETURNED middleware error does not abort the chain),
      // so the caller must see the result even though the session middleware failed
      expect(result).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect((response.session as RpcError<string>)?.type).toBe('session-expired');
    });

    it('T4 (R6, pins the hijack bug): a middleware error never appears in the typed route slot', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      middlewares.session.onRequest((session) => session('expired'));

      const [, routeError, response] = await routes.sayHello(someUser).call();

      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect((response.session as RpcError<string>)?.type).toBe('session-expired');
    });

    it('T5 (R4): timeout -> @thrownErrors holds request-timeout; slots 0 and 1 stay empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [result, routeError, response] = await routes.sleep(5000).call({timeout: 100});

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['request-timeout']);
    });

    it('T6 (R4): abort -> @thrownErrors holds request-aborted', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.sleep(5000).call({signal: AbortSignal.abort()});

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['request-aborted']);
    });

    it('T7 (R4): platform error -> @thrownErrors only', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.getRequestInfo('x'.repeat(300_000)).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(Object.keys(response)).toEqual(['@thrownErrors']);
      expect(response['@thrownErrors']?.[0]?.type).toBe('request-payload-too-large');
    });

    it('T8 (R4): unreachable server -> @thrownErrors holds the wrapped network failure', async () => {
      const {routes} = initClient<MyApi>({baseURL: 'http://127.0.0.1:59987'});
      const [result, routeError, response] = await routes.calculateAge(1990).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']?.length).toBe(1);
      expect(isRpcError(response['@thrownErrors']?.[0])).toBe(true);
    });

    it('T9 (R4): route THROWS an undeclared error server-side -> @thrownErrors, never slot 1 nor its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.throwsUnexpectedly('boom').call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect('throwsUnexpectedly' in response).toBe(false);
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['db-connection-lost']);
    });

    it('T26 (R4): a failing onRequest hook is reported in @thrownErrors and nothing is sent', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      middlewares.session.onRequest(() => {
        throw new Error('no token');
      });

      const [result, routeError, response] = await routes.sayHello(someUser).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['middleware-on-request-failed']);
    });

    it('T27 (R4): every failing hook is kept, not only the first', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      middlewares.session
        .onRequest((session) => session('valid-token'))
        .onResponse(() => {
          throw new Error('first');
        })
        .onResponse(() => {
          throw new Error('second');
        });

      const [result, , response] = await routes.sayHello(someUser).call();

      expect(result).toBe('Hello John Doe');
      expect(response['@thrownErrors']?.map((error) => error.publicMessage)).toEqual([
        `onResponse for middleware 'session' failed: first`,
        `onResponse for middleware 'session' failed: second`,
      ]);
    });

    it('T30 (R4): an answer the client cannot decode -> @thrownErrors, never slot 1 nor its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      await routes.flow.getStamp(5).call();
      const {json} = routesCache.useMethodJitFns('flow/getStamp').returnJitFns;
      const decode = json.decode;
      json.decode = {
        ...decode,
        isNoop: false,
        fn: () => {
          throw new Error('not a stamp');
        },
      };
      try {
        const [stamp, routeError, response] = await routes.flow.getStamp(5).call();

        expect(stamp).toBeUndefined();
        expect(routeError).toBeUndefined();
        expect((response as any).flow?.getStamp).toBeUndefined();
        expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['deserialization-error']);
      } finally {
        json.decode = decode;
      }
    });
  });

  describe('the response is the body, nested by group', () => {
    it('T28: ids become nested paths, and the route keeps its own entry', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [result, , response] = await routes.paramless.list(2).call();

      expect(result).toEqual([20, 21]);
      expect(response.paramless?.pageInfo).toEqual({page: 2, total: 100});
      expect((response.paramless as any)?.list).toEqual([20, 21]);
      expect(Object.keys(response).some((key) => key.includes('/'))).toBe(false);
    });

    it('T29: an answer sent as HTTP headers sits at its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [echo, , response] = await routes.respondHeaders('tag-1').call();

      expect(echo?.headers['x-mion-echo']).toBe('tag-1');
      expect((response as any).respondHeaders).toBe(echo);
    });
  });

  describe('batch calls', () => {
    it('T10 (R1): one route fails, another succeeds -> each stays in its own entry; @thrownErrors empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [[failResult, failError, response], [sum, sumError]] = await batch([
        routes.alwaysFails(someUser),
        routes.utils.sumTwo(5),
      ]).call();

      expect(failResult).toBeUndefined();
      expect(failError?.type).toBe('unknown-error');
      expect(sum).toBe(7);
      expect(sumError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      // one nested object for the whole batch
      expect((response as any).alwaysFails).toBe(failError);
      expect((response as any).utils?.sumTwo).toBe(7);
    });

    it('T11 (R4, pins the unreachable-fatal bug): flow timeout -> ONE request-scoped error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const entries = await batch([routes.sleep(5000), routes.utils.sumTwo(5)]).call({
        timeout: 100,
      });
      const [[, , response]] = entries;

      expect(entries.map(([value]) => value)).toEqual([undefined, undefined]);
      expect(entries.map(([, error]) => error)).toEqual([undefined, undefined]);
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['request-timeout']);
    });

    it('T12 (R3): flow + failing middleware -> its path + listener; per-route slots stay empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.session
        .onRequest((session) => session('expired'))
        .onError('session-expired', (error) => (listenerError = error));

      const [[, greetingError, response]] = await batch([routes.sayHello(someUser)]).call();

      expect(greetingError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect((response.session as RpcError<string>)?.type).toBe('session-expired');
      expect(listenerError?.type).toBe('session-expired');
    });

    it('T13: the same failure yields the same slot in single-route and flow shapes', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [, , single] = await routes.sleep(5000).call({timeout: 100});
      const [[, , batched]] = await batch([routes.sleep(5000)]).call({timeout: 100});

      expect(single['@thrownErrors']?.[0]?.type).toBe('request-timeout');
      expect(batched['@thrownErrors']?.[0]?.type).toBe('request-timeout');
    });

    it('T31 (R2): a client-side validation error in a batch sits at its nested path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [[, sumError, response], [, greetingError]] = await batch([
        routes.utils.sumTwo('x' as unknown as number),
        routes.sayHello(someUser),
      ]).call();

      expect(sumError?.type).toBe('validation-error');
      expect(greetingError).toBeUndefined();
      expect((response as any).utils?.sumTwo).toBe(sumError);
      expect(response['@thrownErrors']).toBeUndefined();
    });

    it('T33 (R1/R2/R5): each batch entry holds what a single call() of that route returns', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      // error ids are generated per error, so compare everything else
      const slots = ([value, error]: readonly [unknown, RpcError<string> | undefined, unknown]) => [
        value,
        error && {type: error.type, publicMessage: error.publicMessage, errorData: error.errorData},
      ];

      const ran = await batch([routes.utils.sumTwo(5), routes.alwaysFails(someUser)]).call();
      const ranSingles = [await routes.utils.sumTwo(5).call(), await routes.alwaysFails(someUser).call()];
      expect(ran.map(([, error]) => error?.type)).toEqual([undefined, 'unknown-error']);
      expect(ran.map(slots)).toEqual(ranSingles.map(slots));

      // a client-side validation error stops the request, so it gets a batch of its own
      const [invalid] = await batch([routes.sayHello({name: 1} as any)]).call();
      const invalidSingle = await routes.sayHello({name: 1} as any).call();
      expect(invalid[1]?.type).toBe('validation-error');
      expect(slots(invalid)).toEqual(slots(invalidSingle));
    });
  });

  describe('listeners', () => {
    it('T14 (R3): a middleware declared error reaches BOTH its listener and its path', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      middlewares.session
        .onRequest((session) => session('expired'))
        .onError('session-expired', (error) => (listenerError = error));
      useAuth(middlewares);

      const [, routeError, response] = await routes.sayHello(someUser).call();

      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect(response.session).toBe(listenerError);
      expect(listenerError?.type).toBe('session-expired');
    });

    it('T24 (R3): a middleware with no params needs no onRequest; its declared error still reaches its path and listener', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.paramless.pageInfo.onError('page-out-of-range', (error) => (listenerError = error));

      const [result, routeError, response] = await routes.paramless.list(12).call();

      // a plain RpcError from a middleware after the route keeps the route's answer
      expect(result).toEqual([120, 121]);
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect((response.paramless?.pageInfo as RpcError<string>)?.type).toBe('page-out-of-range');
      expect(listenerError?.type).toBe('page-out-of-range');
    });

    it('T15 (R4): transport failures never fire listeners, even ones registered for that code', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerFired = false;
      useAuth(middlewares);
      middlewares.session.onRequest((session) => session('valid-token'));
      (middlewares.session as any).onError('request-timeout', () => (listenerFired = true));

      const [, , response] = await routes.sleep(5000).call({timeout: 100});

      expect(response['@thrownErrors']?.[0]?.type).toBe('request-timeout');
      expect(listenerFired).toBe(false);
    });

    it('T15b: an onError registered before the onRequest hook still gets the typed error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.session.onError('session-expired', (error) => (listenerError = error));
      middlewares.session.onRequest((session) => session('expired'));

      await routes.sayHello(someUser).call();

      expect(listenerError?.type).toBe('session-expired');
    });

    it('T16 (D7): no internal mion route id is observable anywhere in the response on a platform error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [, , response] = await routes.getRequestInfo('x'.repeat(300_000)).call();

      expect(response['@thrownErrors']?.[0]?.type).toBe('request-payload-too-large');
      expect(Object.keys(response)).toEqual(['@thrownErrors']);
      expect(JSON.stringify(Object.keys(response))).not.toContain('mion@');
    });

    it('T17: a failing middleware AND a throwing route lose NO information - each error keeps its place', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let auditListenerError: any;
      useAuth(middlewares);
      middlewares.audit.onRequest((audit) => audit(true)).onError('audit-failed', (error) => (auditListenerError = error));

      // the audit middleware (alwaysRun) fails with its DECLARED error and the route throws an undeclared one
      const [result, routeError, response] = await routes.throwsUnexpectedly('boom').call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual(['db-connection-lost']);
      // the declared middleware error keeps its own path AND reaches its typed listener
      expect((response.audit as RpcError<string>)?.type).toBe('audit-failed');
      expect(auditListenerError?.type).toBe('audit-failed');
    });
  });

  describe('fatal errors (a returned FatalError halts the chain, typed)', () => {
    it('T19 (R3): a middleware FatalError reaches its typed path and listener; the skipped route leaves every route slot empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares, 'WRONG-TOKEN');
      middlewares.auth.onError('not-authorized', (error) => (listenerError = error));

      const [result, routeError, response] = await routes.sayHello(someUser).call();

      // the route never ran on the server, and that is a server detail: no slot pretends otherwise
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      // the gate's error is DECLARED, so it is typed: its own path and its listener, never @thrownErrors
      expect((response.auth as RpcError<string>)?.type).toBe('not-authorized');
      expect(listenerError?.type).toBe('not-authorized');
      expect(isRpcError(response.auth)).toBe(true);
    });

    it('T25 (R3): a FatalError from a gate with no params, and no onRequest, reaches its typed path and listener', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL, fetchOptions: {headers: {'x-gate': 'closed'}}});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.paramless.gate.onError('gate-closed', (error) => (listenerError = error));

      const [result, routeError, response] = await routes.paramless.list(1).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect((response.paramless?.gate as RpcError<string>)?.type).toBe('gate-closed');
      expect(listenerError?.type).toBe('gate-closed');
    });

    it('T20: a FatalError answered under a declared RpcError decodes by the declared type', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.fatalAsRpcError('closed').call();
      expect(result).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect(routeError?.type).toBe('gate-closed');
      expect(routeError instanceof RpcError).toBe(true);
      expect(routeError instanceof FatalError).toBe(false);
      expect(isFatalError(routeError)).toBe(false);
    });

    it('T21: a declared FatalError decodes back to a real FatalError', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.fatalDeclared('closed').call();
      expect(result).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect(routeError?.type).toBe('gate-closed');
      expect(routeError instanceof FatalError).toBe(true);
      expect(isFatalError(routeError)).toBe(true);
      expect(isRpcError(routeError)).toBe(true);
    });
  });

  describe('a signature declaring both RpcError and FatalError', () => {
    it('T22: each answer decodes as the class it was declared under, whichever member comes first', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [open] = await routes.fatalMixed('open').call();
      expect(open).toBe('open');

      const [, soft] = await routes.fatalMixed('soft').call();
      expect(soft?.type).toBe('soft');
      expect(soft instanceof RpcError).toBe(true);
      expect(soft instanceof FatalError).toBe(false);
      expect(isFatalError(soft)).toBe(false);

      const [, gate] = await routes.fatalMixed('gate').call();
      expect(gate?.type).toBe('gate-closed');
      expect(gate instanceof FatalError).toBe(true);
      expect(isFatalError(gate)).toBe(true);
    });
  });

  describe('a subclass of RpcError declared next to its base in the signature', () => {
    it('T23: the client gets the subclass back, with the fields it declares', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [open] = await routes.subclassError('open').call();
      expect(open).toBe('open');

      const [, denied] = await routes.subclassError('deny').call();
      expect(denied?.type).toBe('not-authorized');
      expect(denied instanceof ScopedAuthError).toBe(true);
      expect(denied?.statusCode).toBe(401);
      expect((denied as ScopedAuthError).scope).toBe('admin');
      expect((denied as ScopedAuthError).retryAfter).toBe(30);
    });
  });

  describe('validation error payload (ValidationErrorData)', () => {
    it('T18 (D6): client-side validation failure exposes errorData.typeErrors, matching the server shape', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [, routeError] = await routes.calculateAge('nope' as unknown as number).call();

      expect(routeError?.type).toBe('validation-error');
      expect(Array.isArray(routeError?.errorData?.typeErrors)).toBe(true);
      expect(routeError?.errorData?.typeErrors.length).toBeGreaterThan(0);

      // and the public typeErrors() API still returns the same flat RunTypeError[]
      const flatErrors = await routes.calculateAge('nope' as unknown as number).typeErrors();
      expect(Array.isArray(flatErrors)).toBe(true);
      expect(flatErrors.length).toBeGreaterThan(0);
      expect(flatErrors[0]).toHaveProperty('path');
    });
  });

  describe('validateServerResponses (R7)', () => {
    type Initialized = ReturnType<typeof initClient<MyApi>>;
    function checkingClient(token?: string): Initialized {
      const initialized = initClient<MyApi>({baseURL, validateServerResponses: true});
      useAuth(initialized.middlewares, token);
      return initialized;
    }

    it('is off by default, so a wrong answer reaches the caller', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, response] = await routes.wrongAnswers.wrongAnswer(someUser).call();
      expect(result).toEqual({name: 'John', surname: 42});
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
    });

    it('lets an answer that matches the return type through', async () => {
      const {routes} = checkingClient();
      const [result, routeError, response] = await routes.createProduct({id: 'p1', name: 'Pen', price: 2}).call();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect(result).toMatchObject({id: 'p1', name: 'Pen', price: 2});
    });

    it('drops a wrong answer from its path and reports it in @thrownErrors', async () => {
      const {routes} = checkingClient();
      const [result, routeError, response] = await routes.wrongAnswers.wrongAnswer(someUser).call();
      const [thrown] = response['@thrownErrors'] ?? [];
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect((response.wrongAnswers as any)?.wrongAnswer).toBeUndefined();
      expect(thrown?.type).toBe('response-validation-error');
      expect(thrown?.publicMessage).toBe(
        `Invalid response from Route or Middleware 'wrongAnswers/wrongAnswer', validation failed.`
      );
      expect(thrown?.errorData?.typeErrors?.length).toBeGreaterThan(0);
    });

    it('checks an answer the server left out, since a missing value is a wrong one too', async () => {
      const {routes} = checkingClient();
      const [result, , response] = await routes.wrongAnswers.missingAnswer().call();
      expect(result).toBeUndefined();
      expect(response['@thrownErrors']?.[0]?.type).toBe('response-validation-error');
    });

    it('never checks a member a stopped chain did not run', async () => {
      const {routes} = checkingClient('WRONG-TOKEN');
      const [result, , response] = await routes.wrongAnswers.missingAnswer().call();
      expect(result).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect((response.auth as RpcError<string>)?.type).toBe('not-authorized');
    });

    it('decodes before it checks, so Date, Map and Set answers pass', async () => {
      const {routes} = checkingClient();
      const [stamp, routeError, response] = await routes.flow.getStamp(5).call();
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']).toBeUndefined();
      expect(stamp?.when).toBeInstanceOf(Date);
      expect(stamp?.counts).toBeInstanceOf(Map);
    });

    it("a middleware's wrong answer goes to @thrownErrors, fires no listener and keeps the route result", async () => {
      const {routes, middlewares} = checkingClient();
      const heard: unknown[] = [];
      middlewares.wrongAnswers.wrongMiddleware.onRequest((call) => call('x')).onResponse((answer) => void heard.push(answer));
      const [result, routeError, response] = await routes.wrongAnswers.rightAnswer('ok').call();
      const [thrown] = response['@thrownErrors'] ?? [];
      expect(thrown?.type).toBe('response-validation-error');
      expect(thrown?.publicMessage).toContain(`'wrongAnswers/wrongMiddleware'`);
      expect(response.wrongAnswers?.wrongMiddleware).toBeUndefined();
      expect(heard).toEqual([]);
      expect(routeError).toBeUndefined();
      expect(result).toBe('ok');
    });

    it('checks an answer sent only as HTTP headers, even after another error', async () => {
      const {routes} = checkingClient();
      const [pages] = await routes.paramless.pageHeaders(2).call();
      expect(pages?.headers).toEqual({'x-page': '2', 'x-total': '100'});

      const pageError = new RpcError({type: 'page-out-of-range', publicMessage: 'No such page'});
      const [result, routeError, response] = await withServerAnswer({'paramless/pageInfo': pageError}, {'x-page': '12'}, () =>
        routes.paramless.pageHeaders(12).call()
      );
      // `x-total` is missing, which only the check can tell
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect((response.paramless?.pageInfo as RpcError<string>)?.type).toBe('page-out-of-range');
      expect((response.paramless as any)?.pageHeaders).toBeUndefined();
      expect(response['@thrownErrors']?.[0]?.publicMessage).toContain(`'paramless/pageHeaders'`);
    });
  });

  describe('a response the client cannot trust', () => {
    it('T32 (R4): thrown-record keys never write the prototype or replace @thrownErrors, and call() still resolves', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      await routes.calculateAge(1990).call();
      const validation = {type: 'validation-error', publicMessage: 'bad', 'mion@isΣrrθr': true};
      const body = {
        calculateAge: 36,
        '@thrownErrors': {'__proto__/polluted': validation, '@thrownErrors': validation, ['__proto__']: validation},
      };

      const [age, routeError, response] = await withServerAnswer(body, {}, () => routes.calculateAge(1990).call());

      expect(({} as any).polluted).toBeUndefined();
      expect(({} as any).isResolved).toBeUndefined();
      expect(age).toBe(36);
      expect(routeError).toBeUndefined();
      expect(response['@thrownErrors']?.map((error) => error.type)).toEqual([
        'validation-error',
        'validation-error',
        'validation-error',
      ]);
    });
  });
});
