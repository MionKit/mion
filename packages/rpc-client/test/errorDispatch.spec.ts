/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Contract tests for the client error dispatch rules.
 *
 * The result tuple is [result, error, undeclared, middlewareResults, middlewareErrors]:
 * - R1 route returned its own declared error            -> slot 1 (that route's index in a flow)
 * - R2 param validation failed for a route              -> slot 1 (client- or server-side)
 * - R3 middleware declared error / validation error       -> slot 4 under its id AND its onError listener
 * - R4 anything thrown / undeclared, or an error for a  -> slot 2 (undeclared) only, NO listener fires;
 *      middleware that was not part of the request           several undeclared: first in execution order
 * - R5 route produced a result                          -> slot 0 keeps it, whatever else failed
 * - R6 an error the route did not declare               -> never appears in slot 1
 * - R7 with validateServerResponses, an answer its type -> slot 2, the value is dropped and NO listener fires
 *      does not describe
 */

import {describe, it, expect} from 'vitest';
import {initClient} from './lib/fetchingClient.ts';
import {batch} from '../src/batch.ts';
import {isRpcError, isFatalError, FatalError, RpcError, HeadersSubset} from '@mionjs/core';
import {type TestServerApi, ScopedAuthError} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
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
    it('T1 (R1): route returns its declared error -> slot 1 only', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.alwaysFails(someUser).call();

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('unknown-error');
      expect(fatal).toBeUndefined();
    });

    it('T2 (R2): route param validation fails client-side -> slot 1 holds validation-error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.calculateAge('nope' as unknown as number).call();

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('validation-error');
      expect(fatal).toBeUndefined();
    });

    it('T2b (R2): route param validation fails server-side -> still slot 1 (thrown carve-out)', async () => {
      // validation-error is thrown server-side but is part of every route's expected union
      const {routes, middlewares} = initClient<MyApi>({baseURL, validateParams: false});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.calculateAge('nope' as unknown as number).call();

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('validation-error');
      expect(fatal).toBeUndefined();
    });

    it('T3 (R5, pins the masking bug): route succeeds while a middleware fails -> slot 0 keeps the result', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      middlewares.session.onRequest((session) => session('expired'));

      const [result, routeError, fatal, , middlewareErrors] = await routes.sayHello(someUser).call();

      // the server ran the route (a RETURNED middleware error does not abort the chain),
      // so the caller must see the result even though the session middleware failed
      expect(result).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middlewareErrors?.session?.type).toBe('session-expired');
    });

    it('T4 (R6, pins the hijack bug): a middleware error never appears in the typed route slot', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      middlewares.session.onRequest((session) => session('expired'));

      const [, routeError, fatal, , middlewareErrors] = await routes.sayHello(someUser).call();

      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middlewareErrors?.session?.type).toBe('session-expired');
    });

    it('T5 (R4): timeout -> slot 2 holds request-timeout; slots 0 and 1 stay empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [result, routeError, fatal] = await routes.sleep(5000).call({timeout: 100});

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('request-timeout');
    });

    it('T6 (R4): abort -> slot 2 holds request-aborted', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.sleep(5000).call({signal: AbortSignal.abort()});

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('request-aborted');
    });

    it('T7 (R4): platform error -> slot 2 only', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal, middlewareResults] = await routes.getRequestInfo('x'.repeat(300_000)).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('request-payload-too-large');
      expect(middlewareResults).toEqual({});
    });

    it('T8 (R4): unreachable server -> slot 2 holds the wrapped network failure', async () => {
      const {routes} = initClient<MyApi>({baseURL: 'http://127.0.0.1:59987'});
      const [result, routeError, fatal] = await routes.calculateAge(1990).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal).toBeDefined();
      expect(isRpcError(fatal)).toBe(true);
    });

    it('T9 (R4): route THROWS an undeclared error server-side -> slot 2, never slot 1', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.throwsUnexpectedly('boom').call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('db-connection-lost');
    });
  });

  describe('batch calls', () => {
    it('T10 (R1): one route fails, another succeeds -> each stays in its own index; slot 2 empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [[failResult, sum], [failError, sumError], fatal] = await batch([
        routes.alwaysFails(someUser),
        routes.utils.sumTwo(5),
      ]).call();

      expect(failResult).toBeUndefined();
      expect(failError?.type).toBe('unknown-error');
      expect(sum).toBe(7);
      expect(sumError).toBeUndefined();
      expect(fatal).toBeUndefined();
    });

    it('T11 (R4, pins the unreachable-fatal bug): flow timeout -> ONE request-scoped fatal error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [results, errors, fatal] = await batch([routes.sleep(5000), routes.utils.sumTwo(5)]).call({
        timeout: 100,
      });

      expect(results).toEqual([undefined, undefined]);
      expect(errors).toEqual([undefined, undefined]);
      expect(fatal?.type).toBe('request-timeout');
    });

    it('T12 (R3): flow + failing middleware -> its middlewareErrors slot + listener; per-route slots stay empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.session
        .onRequest((session) => session('expired'))
        .onError('session-expired', (error) => (listenerError = error));

      const [, [greetingError], fatal, , middlewareErrors] = await batch([routes.sayHello(someUser)]).call();

      expect(greetingError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middlewareErrors?.session?.type).toBe('session-expired');
      expect(listenerError?.type).toBe('session-expired');
    });

    it('T13: the same failure yields the same slot in single-route and flow shapes', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);

      const [, , singleUnexpected] = await routes.sleep(5000).call({timeout: 100});
      const [, , batchUnexpected] = await batch([routes.sleep(5000)]).call({timeout: 100});

      expect(singleUnexpected?.type).toBe('request-timeout');
      expect(batchUnexpected?.type).toBe('request-timeout');
    });
  });

  describe('listeners', () => {
    it('T14 (R3): a middleware declared error reaches BOTH its listener and its middlewareErrors slot', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      middlewares.session
        .onRequest((session) => session('expired'))
        .onError('session-expired', (error) => (listenerError = error));
      useAuth(middlewares);

      const [, routeError, fatal, , middlewareErrors] = await routes.sayHello(someUser).call();

      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middlewareErrors?.session?.type).toBe('session-expired');
      expect(listenerError?.type).toBe('session-expired');
    });

    it('T24 (R3): a middleware with no params needs no onRequest; its declared error still reaches its slot and listener', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.paramless.pageInfo.onError('page-out-of-range', (error) => (listenerError = error));

      const [result, routeError, fatal, , middlewareErrors] = await routes.paramless.list(12).call();

      // a plain RpcError from a middleware after the route keeps the route's answer
      expect(result).toEqual([120, 121]);
      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middlewareErrors?.['paramless/pageInfo']?.type).toBe('page-out-of-range');
      expect(listenerError?.type).toBe('page-out-of-range');
    });

    it('T15 (R4): transport failures never fire listeners, even ones registered for that code', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerFired = false;
      useAuth(middlewares);
      middlewares.session.onRequest((session) => session('valid-token'));
      (middlewares.session as any).onError('request-timeout', () => (listenerFired = true));

      const [, , fatal] = await routes.sleep(5000).call({timeout: 100});

      expect(fatal?.type).toBe('request-timeout');
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

    it('T16 (D7): no internal mion route id is observable anywhere in the tuple on a platform error', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const result = await routes.getRequestInfo('x'.repeat(300_000)).call();

      const [, , fatal, middlewareResults, middlewareErrors] = result;
      expect(fatal?.type).toBe('request-payload-too-large');
      expect(Object.keys(middlewareResults ?? {})).toEqual([]);
      expect(Object.keys(middlewareErrors ?? {})).toEqual([]);
      expect(JSON.stringify([...Object.keys(result[3] ?? {}), ...Object.keys(result[4] ?? {})])).not.toContain('mion@');
    });

    it('T17: a failing middleware AND a throwing route lose NO information - each error keeps its slot', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let auditListenerError: any;
      useAuth(middlewares);
      middlewares.audit.onRequest((audit) => audit(true)).onError('audit-failed', (error) => (auditListenerError = error));

      // the audit middleware (alwaysRun) fails with its DECLARED error and the route throws
      // an undeclared one - separating the slots means BOTH stay visible
      const [result, routeError, fatal, , middlewareErrors] = await routes.throwsUnexpectedly('boom').call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      // the undeclared route throw is the fatal error
      expect(fatal?.type).toBe('db-connection-lost');
      // the declared middleware error keeps its own slot AND reaches its typed listener
      expect(middlewareErrors?.audit?.type).toBe('audit-failed');
      expect(auditListenerError?.type).toBe('audit-failed');
    });
  });

  describe('fatal errors (a returned FatalError halts the chain, typed)', () => {
    it('T19 (R3): a middleware FatalError reaches its typed slot and listener; the skipped route leaves every route slot empty', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      let listenerError: any;
      useAuth(middlewares, 'WRONG-TOKEN');
      middlewares.auth.onError('not-authorized', (error) => (listenerError = error));

      const [result, routeError, fatal, , middlewareErrors] = await routes.sayHello(someUser).call();

      // the route never ran on the server, and that is a server detail: no slot pretends otherwise
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      // the gate's error is DECLARED, so it is typed: its own slot and its listener, never the undeclared slot
      expect(middlewareErrors?.auth?.type).toBe('not-authorized');
      expect(listenerError?.type).toBe('not-authorized');
      expect(isRpcError(middlewareErrors?.auth)).toBe(true);
    });

    it('T25 (R3): a FatalError from a gate with no params, and no onRequest, reaches its typed slot and listener', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL, fetchOptions: {headers: {'x-gate': 'closed'}}});
      let listenerError: any;
      useAuth(middlewares);
      middlewares.paramless.gate.onError('gate-closed', (error) => (listenerError = error));

      const [result, routeError, fatal, , middlewareErrors] = await routes.paramless.list(1).call();

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middlewareErrors?.['paramless/gate']?.type).toBe('gate-closed');
      expect(listenerError?.type).toBe('gate-closed');
    });

    it('T20: a FatalError answered under a declared RpcError decodes by the declared type', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.fatalAsRpcError('closed').call();
      expect(result).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(routeError?.type).toBe('gate-closed');
      expect(routeError instanceof RpcError).toBe(true);
      expect(routeError instanceof FatalError).toBe(false);
      expect(isFatalError(routeError)).toBe(false);
    });

    it('T21: a declared FatalError decodes back to a real FatalError', async () => {
      const {routes, middlewares} = initClient<MyApi>({baseURL});
      useAuth(middlewares);
      const [result, routeError, fatal] = await routes.fatalDeclared('closed').call();
      expect(result).toBeUndefined();
      expect(fatal).toBeUndefined();
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
      const [result, routeError, undeclared] = await routes.wrongAnswers.wrongAnswer(someUser).call();
      expect(result).toEqual({name: 'John', surname: 42});
      expect(routeError).toBeUndefined();
      expect(undeclared).toBeUndefined();
    });

    it('lets an answer that matches the return type through', async () => {
      const {routes} = checkingClient();
      const [result, routeError, undeclared] = await routes.createProduct({id: 'p1', name: 'Pen', price: 2}).call();
      expect(routeError).toBeUndefined();
      expect(undeclared).toBeUndefined();
      expect(result).toMatchObject({id: 'p1', name: 'Pen', price: 2});
    });

    it('drops a wrong answer and reports it in slot 2', async () => {
      const {routes} = checkingClient();
      const [result, routeError, undeclared] = await routes.wrongAnswers.wrongAnswer(someUser).call();
      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(undeclared?.type).toBe('response-validation-error');
      expect(undeclared?.publicMessage).toBe(
        `Invalid response from Route or Middleware 'wrongAnswers/wrongAnswer', validation failed.`
      );
      expect(undeclared?.errorData?.typeErrors?.length).toBeGreaterThan(0);
    });

    it('checks an answer the server left out, since a missing value is a wrong one too', async () => {
      const {routes} = checkingClient();
      const [result, , undeclared] = await routes.wrongAnswers.missingAnswer().call();
      expect(result).toBeUndefined();
      expect(undeclared?.type).toBe('response-validation-error');
    });

    it('never checks a member a stopped chain did not run', async () => {
      const {routes} = checkingClient('WRONG-TOKEN');
      const [result, , undeclared, , middlewareErrors] = await routes.wrongAnswers.missingAnswer().call();
      expect(result).toBeUndefined();
      expect(undeclared).toBeUndefined();
      expect(middlewareErrors?.auth?.type).toBe('not-authorized');
    });

    it('decodes before it checks, so Date, Map and Set answers pass', async () => {
      const {routes} = checkingClient();
      const [stamp, routeError, undeclared] = await routes.flow.getStamp(5).call();
      expect(routeError).toBeUndefined();
      expect(undeclared).toBeUndefined();
      expect(stamp?.when).toBeInstanceOf(Date);
      expect(stamp?.counts).toBeInstanceOf(Map);
    });

    it("a middleware's wrong answer goes to slot 2, fires no listener and keeps the route result", async () => {
      const {routes, middlewares} = checkingClient();
      const heard: unknown[] = [];
      middlewares.wrongAnswers.wrongMiddleware.onRequest((call) => call('x')).onResponse((answer) => void heard.push(answer));
      const [result, routeError, undeclared, middlewareResults, middlewareErrors] = await routes.wrongAnswers
        .rightAnswer('ok')
        .call();
      expect(undeclared?.type).toBe('response-validation-error');
      expect(undeclared?.publicMessage).toContain(`'wrongAnswers/wrongMiddleware'`);
      expect(middlewareErrors?.['wrongAnswers/wrongMiddleware']).toBeUndefined();
      expect(middlewareResults?.['wrongAnswers/wrongMiddleware']).toBeUndefined();
      expect(heard).toEqual([]);
      expect(routeError).toBeUndefined();
      expect(result).toBe('ok');
    });
  });
});
