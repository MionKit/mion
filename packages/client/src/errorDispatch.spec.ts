/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Contract tests for the client error dispatch rules (docs spec: client-error-dispatch-contract).
 *
 * The result tuple is [result, error, fatal, middleFnResults, middleFnErrors]:
 * - R1 route returned its own declared error            -> slot 1 (that route's index in a flow)
 * - R2 param validation failed for a route              -> slot 1 (client- or server-side)
 * - R3 middleFn declared error / validation error       -> slot 4 under its name AND its onError listener
 * - R4 anything thrown / undeclared, or an error for a  -> slot 2 (fatal) only, NO listener fires;
 *      middleFn that was not part of the request           several fatals: first in execution order
 * - R5 route produced a result                          -> slot 0 keeps it, whatever else failed
 * - R6 an error the route did not declare               -> never appears in slot 1
 */

import {describe, it, expect} from 'vitest';
import {initClient} from './client.ts';
import {batch} from './batch.ts';
import {isRpcError, HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
}

describe('client error dispatch contract', () => {
  const someUser = {name: 'John', surname: 'Doe'};
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;

  describe('single route calls', () => {
    it('T1 (R1): route returns its declared error -> slot 1 only', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [result, routeError, fatal] = await routes.alwaysFails(someUser).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('unknown-error');
      expect(fatal).toBeUndefined();
    });

    it('T2 (R2): route param validation fails client-side -> slot 1 holds validation-error', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [result, routeError, fatal] = await routes.calculateAge('nope' as unknown as number).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('validation-error');
      expect(fatal).toBeUndefined();
    });

    it('T2b (R2): route param validation fails server-side -> still slot 1 (thrown carve-out)', async () => {
      // validation-error is thrown server-side but is part of every route's expected union
      const {routes, middleFns} = initClient<MyApi>({baseURL, validateParams: false});
      const [result, routeError, fatal] = await routes.calculateAge('nope' as unknown as number).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

      expect(result).toBeUndefined();
      expect(routeError?.type).toBe('validation-error');
      expect(fatal).toBeUndefined();
    });

    it('T3 (R5, pins the masking bug): route succeeds while a middleFn fails -> slot 0 keeps the result', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [result, routeError, fatal, , middleFnErrors] = await routes.sayHello(someUser).call({
        middleFns: {
          auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN')),
          session: middleFns.session('expired'),
        },
      });

      // the server ran the route (a RETURNED middleFn error does not abort the chain),
      // so the caller must see the result even though the session middleFn failed
      expect(result).toBe('Hello John Doe');
      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middleFnErrors?.session?.type).toBe('session-expired');
    });

    it('T4 (R6, pins the hijack bug): a middleFn error never appears in the typed route slot', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [, routeError, fatal, , middleFnErrors] = await routes.sayHello(someUser).call({
        middleFns: {
          auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN')),
          session: middleFns.session('expired'),
        },
      });

      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middleFnErrors?.session?.type).toBe('session-expired');
    });

    it('T5 (R4): timeout -> slot 2 holds request-timeout; slots 0 and 1 stay empty', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).prefill();

      const [result, routeError, fatal] = await routes.sleep(5000).call({timeout: 100});

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('request-timeout');

      await middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).removePrefill();
    });

    it('T6 (R4): abort -> slot 2 holds request-aborted', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [result, routeError, fatal] = await routes.sleep(5000).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
        signal: AbortSignal.abort(),
      });

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('request-aborted');
    });

    it('T7 (R4): platform error -> slot 2 only', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [result, routeError, fatal, middleFnResults] = await routes.getRequestInfo('x'.repeat(300_000)).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('request-payload-too-large');
      expect(middleFnResults).toEqual({});
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
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [result, routeError, fatal] = await routes.throwsUnexpectedly('boom').call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      expect(fatal?.type).toBe('db-connection-lost');
    });
  });

  describe('batch calls', () => {
    it('T10 (R1): one route fails, another succeeds -> each stays in its own index; slot 2 empty', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [[failResult, sum], [failError, sumError], fatal] = await batch([
        routes.alwaysFails(someUser),
        routes.utils.sumTwo(5),
      ]).call({middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))}});

      expect(failResult).toBeUndefined();
      expect(failError?.type).toBe('unknown-error');
      expect(sum).toBe(7);
      expect(sumError).toBeUndefined();
      expect(fatal).toBeUndefined();
    });

    it('T11 (R4, pins the unreachable-fatal bug): flow timeout -> ONE request-scoped fatal error', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).prefill();

      const [results, errors, fatal] = await batch([routes.sleep(5000), routes.utils.sumTwo(5)]).call({
        timeout: 100,
      });

      expect(results).toEqual([undefined, undefined]);
      expect(errors).toEqual([undefined, undefined]);
      expect(fatal?.type).toBe('request-timeout');

      await middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).removePrefill();
    });

    it('T12 (R3): flow + failing middleFn -> its middleFnErrors slot + listener; per-route slots stay empty', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      let listenerError: any;
      const session = middleFns.session('expired');
      session.onError('session-expired', (error) => (listenerError = error));

      const [, [greetingError], fatal, , middleFnErrors] = await batch([routes.sayHello(someUser)]).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN')), session},
      });

      expect(greetingError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middleFnErrors?.session?.type).toBe('session-expired');
      expect(listenerError?.type).toBe('session-expired');
    });

    it('T13: the same failure yields the same slot in single-route and flow shapes', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).prefill();

      const [, , singleUnexpected] = await routes.sleep(5000).call({timeout: 100});
      const [, , batchUnexpected] = await batch([routes.sleep(5000)]).call({timeout: 100});

      expect(singleUnexpected?.type).toBe('request-timeout');
      expect(batchUnexpected?.type).toBe('request-timeout');

      await middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).removePrefill();
    });
  });

  describe('listeners', () => {
    it('T14 (R3): a middleFn declared error reaches BOTH its listener and its middleFnErrors slot', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      let listenerError: any;
      middleFns
        .session('expired')
        .prefill()
        .onError('session-expired', (error) => (listenerError = error));
      middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).prefill();

      const [, routeError, fatal, , middleFnErrors] = await routes.sayHello(someUser).call();

      expect(routeError).toBeUndefined();
      expect(fatal).toBeUndefined();
      expect(middleFnErrors?.session?.type).toBe('session-expired');
      expect(listenerError?.type).toBe('session-expired');

      await middleFns.session('expired').removePrefill();
      await middleFns.auth(createAuthHeaders('XWYZ-TOKEN')).removePrefill();
    });

    it('T15 (R4): transport failures never fire listeners, even ones registered for that code', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      let listenerFired = false;
      const session = middleFns.session('valid-token');
      (session as any).onError('request-timeout', () => (listenerFired = true));

      const [, , fatal] = await routes.sleep(5000).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN')), session},
        timeout: 100,
      });

      expect(fatal?.type).toBe('request-timeout');
      expect(listenerFired).toBe(false);
    });

    it('T15b: an INLINE (non-prefilled) middleFn with a registered onError gets the typed error', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      let listenerError: any;
      const session = middleFns.session('expired');
      session.onError('session-expired', (error) => (listenerError = error));

      await routes.sayHello(someUser).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN')), session},
      });

      expect(listenerError?.type).toBe('session-expired');
    });

    it('T16 (D7): no internal mion route id is observable anywhere in the tuple on a platform error', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const result = await routes.getRequestInfo('x'.repeat(300_000)).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

      const [, , fatal, middleFnResults, middleFnErrors] = result;
      expect(fatal?.type).toBe('request-payload-too-large');
      expect(Object.keys(middleFnResults ?? {})).toEqual([]);
      expect(Object.keys(middleFnErrors ?? {})).toEqual([]);
      expect(JSON.stringify([...Object.keys(result[3] ?? {}), ...Object.keys(result[4] ?? {})])).not.toContain('mion@');
    });

    it('T17: a failing middleFn AND a throwing route lose NO information - each error keeps its slot', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      let auditListenerError: any;
      const audit = middleFns.audit(true);
      audit.onError('audit-failed', (error) => (auditListenerError = error));

      // the audit middleFn (runOnError) fails with its DECLARED error and the route throws
      // an undeclared one - separating the slots means BOTH stay visible
      const [result, routeError, fatal, , middleFnErrors] = await routes.throwsUnexpectedly('boom').call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN')), audit},
      });

      expect(result).toBeUndefined();
      expect(routeError).toBeUndefined();
      // the undeclared route throw is the fatal error
      expect(fatal?.type).toBe('db-connection-lost');
      // the declared middleFn error keeps its own slot AND reaches its typed listener
      expect(middleFnErrors?.audit?.type).toBe('audit-failed');
      expect(auditListenerError?.type).toBe('audit-failed');
    });
  });

  describe('validation error payload (ValidationErrorData)', () => {
    it('T18 (D6): client-side validation failure exposes errorData.typeErrors, matching the server shape', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const [, routeError] = await routes.calculateAge('nope' as unknown as number).call({
        middleFns: {auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      });

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
});
