/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {initClient} from './client.ts';
import {batch} from './batch.ts';
import {MiddlewareSubRequest, RouteSubRequest} from './types.ts';
import {HeadersSubset} from '@mionjs/core';
import {INPUT_MAPPER_NAMESPACE} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
// NAME-lane calls (string 2nd arg) resolve to the marker-free overload, so the vite
// plugin never rewrites them; INLINE-mapper calls are extracted + hash-injected.
import {inputFrom as rawInputFrom} from './batch.ts';
import {inputFrom} from './batch.ts';

// Helper to create auth headers for the test server's headersFn
function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
}

describe('batch', () => {
  const someUser = {name: 'John', surname: 'Doe'};
  type MyApi = TestServerApi;

  const baseURL = TEST_SERVER_BASE_URL;

  describe('batch() function', () => {
    it('should execute a single route in a batch', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      // Prefill auth so it's included automatically
      middleFns.auth(authHeaders).prefill();

      const [[greeting], [greetingError]] = await batch([routes.sayHello(someUser)]).call();

      expect(greeting).toEqual('Hello John Doe');
      expect(greetingError).toBeUndefined();

      // Clean up
      void middleFns.auth(authHeaders).removePrefill();
    });

    it('should execute multiple routes in a batch', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      // Prefill auth so it's included automatically
      middleFns.auth(authHeaders).prefill();

      const [[greeting, age, sum], [greetingError, ageError, sumError]] = await batch([
        routes.sayHello(someUser),
        routes.calculateAge(1990),
        routes.utils.sumTwo(5),
      ]).call();

      expect(greeting).toEqual('Hello John Doe');
      expect(age).toEqual(new Date().getFullYear() - 1990);
      expect(sum).toEqual(7);
      expect(greetingError).toBeUndefined();
      expect(ageError).toBeUndefined();
      expect(sumError).toBeUndefined();

      // Clean up
      void middleFns.auth(authHeaders).removePrefill();
    });

    it('should execute batch with explicit middleFns', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      const [[greeting], [greetingError], fatal] = await batch([routes.sayHello(someUser)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(greeting).toEqual('Hello John Doe');
      expect(greetingError).toBeUndefined();
      expect(fatal).toBeUndefined();
    });

    it('should handle route errors in batch', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');

      const [[failResult], [failError]] = await batch([routes.alwaysFails(someUser)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      // The failing route should have an error
      expect(failError).toBeDefined();
      expect(failError?.type).toBe('unknown-error');
      expect(failResult).toBeUndefined();
    });

    it('should throw error when called with empty routes array', () => {
      expect(() => batch([])).toThrow('batch() requires at least one route subrequest.');
    });

    it('should throw when the build did not inject a batch id', () => {
      const {routes} = initClient<MyApi>({baseURL});
      // an alias whose type lost the InjectBatchId brand is invisible to the build, so no id is injected
      const untransformed = batch as unknown as (routes: RouteSubRequest<any>[]) => unknown;
      expect(() => untransformed([routes.sayHello(someUser)])).toThrow('batch() needs the mion build plugin');
    });

    it('should throw error when subrequests have different client instances', () => {
      const {routes: routes1} = initClient<MyApi>({baseURL});
      const {routes: routes2} = initClient<MyApi>({baseURL});

      expect(() => batch([routes1.sayHello(someUser), routes2.calculateAge(1990)])).toThrow(
        'All subrequests in a batch must use the same client instance'
      );
    });
  });

  describe('serialization/deserialization in batches', () => {
    it('should serialize and deserialize Date params and results', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testDate = new Date('2024-06-15T12:30:00.000Z');

      const [[sameDate], [dateError]] = await batch([routes.getSameDate(testDate)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(dateError).toBeUndefined();
      expect(sameDate).toBeInstanceOf(Date);
      expect(sameDate?.toISOString()).toEqual('2024-06-15T12:30:00.000Z');
    });

    it('should serialize Date params and return computed Date result', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testDate = new Date('2024-01-01T00:00:00.000Z');

      const [[datePlusDays], [dateError]] = await batch([routes.getDatePlusDays(testDate, 10)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(dateError).toBeUndefined();
      expect(datePlusDays).toBeInstanceOf(Date);
      expect(datePlusDays?.toISOString()).toEqual('2024-01-11T00:00:00.000Z');
    });

    it('should serialize and deserialize Map params and results', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testMap = new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const [[sameMap], [mapError]] = await batch([routes.getSameMap(testMap)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(mapError).toBeUndefined();
      expect(sameMap).toBeInstanceOf(Map);
      expect(sameMap?.get('a')).toEqual(1);
      expect(sameMap?.get('b')).toEqual(2);
    });

    it('should serialize Map params and return modified Map result', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testMap = new Map<string, number>([['x', 10]]);

      const [[mergedMap], [mapError]] = await batch([routes.mergeMap(testMap, 'y', 20)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(mapError).toBeUndefined();
      expect(mergedMap).toBeInstanceOf(Map);
      expect(mergedMap?.get('x')).toEqual(10);
      expect(mergedMap?.get('y')).toEqual(20);
    });

    it('should serialize and deserialize Set params and results', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testSet = new Set(['hello', 'world']);

      const [[sameSet], [setError]] = await batch([routes.getSameSet(testSet)]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(setError).toBeUndefined();
      expect(sameSet).toBeInstanceOf(Set);
      expect(sameSet?.has('hello')).toBe(true);
      expect(sameSet?.has('world')).toBe(true);
    });

    it('should serialize Set params and return modified Set result', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testSet = new Set(['a', 'b']);

      const [[modifiedSet], [setError]] = await batch([routes.addToSet(testSet, 'c')]).call({
        middleFns: {auth: middleFns.auth(authHeaders)},
      });

      expect(setError).toBeUndefined();
      expect(modifiedSet).toBeInstanceOf(Set);
      expect(modifiedSet?.has('a')).toBe(true);
      expect(modifiedSet?.has('b')).toBe(true);
      expect(modifiedSet?.has('c')).toBe(true);
    });

    it('should handle multiple routes mixing serializable and plain types in a batch', async () => {
      const {routes, middleFns} = initClient<MyApi>({baseURL});
      const authHeaders = createAuthHeaders('XWYZ-TOKEN');
      const testDate = new Date('2024-06-15T12:30:00.000Z');

      const [[sameDate, greeting, age], [dateError, greetingError, ageError]] = await batch([
        routes.getSameDate(testDate),
        routes.sayHello(someUser),
        routes.calculateAge(1990),
      ]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

      expect(dateError).toBeUndefined();
      expect(greetingError).toBeUndefined();
      expect(ageError).toBeUndefined();

      // Date result
      expect(sameDate).toBeInstanceOf(Date);
      expect(sameDate?.toISOString()).toEqual('2024-06-15T12:30:00.000Z');

      // String result
      expect(greeting).toEqual('Hello John Doe');

      // Number result
      expect(age).toEqual(new Date().getFullYear() - 1990);
    });
  });

  describe('proxy returns call method', () => {
    it('proxy should include call method on subrequests', () => {
      const {routes} = initClient<MyApi>({baseURL});
      const subRequest = routes.sayHello(someUser) as RouteSubRequest<any> & MiddlewareSubRequest<any>;

      expect(typeof subRequest.call).toBe('function');
      expect(typeof subRequest.call).toBe('function');
    });
  });
});

describe('inputFrom()', () => {
  const fakeSubRequest = {pointer: ['test'], id: 'test', isResolved: false, params: []} as any;

  it('should return a InputFromRef with correct properties (name lane)', () => {
    // name lane: references a server-registered mion pure fn; the mapperKey is
    // the FULL registry key 'mionjs::<name>'.
    const ref = rawInputFrom(fakeSubRequest, 'toPreferenceId');
    expect(ref.namespace).toBe(INPUT_MAPPER_NAMESPACE);
    expect(ref.fnName).toBe('toPreferenceId');
    expect(ref.mapperKey).toBe('mionjs::toPreferenceId');
    expect(ref.fromRequestId).toBe('test');
    expect(ref.toRequestId).toBe(''); // toRequestId is set once the ref is passed to the target subRequest
  });

  it('should use the full mionjs registry key as mapperKey (name lane)', () => {
    const ref = rawInputFrom(fakeSubRequest, 'someMapper');
    expect(ref.fnName).toBe('someMapper');
    expect(ref.mapperKey).toBe('mionjs::someMapper');
  });

  it('should build a content-hashed ref for an INLINE mapper (build-time extraction)', () => {
    // the mion vite plugin extracts the mapper + injects the trailing 'rt::<hash>' key
    const ref = rawInputFrom(fakeSubRequest, (customer: {preferenceId: number}) => customer.preferenceId);
    expect(ref.namespace).toBe('rt');
    expect(ref.mapperKey).toMatch(/^rt::/);
    expect(ref.mapperKey).toBe(`rt::${ref.fnName}`);
    expect(ref.fromRequestId).toBe('test');
  });

  it('should throw when the fn name is not provided', () => {
    expect(() => rawInputFrom(fakeSubRequest, '')).toThrow(
      'inputFrom() requires a mapper function or the name of a server-registered mion pure fn'
    );
  });

  it('fake() should return the ref itself', () => {
    const ref = rawInputFrom(fakeSubRequest, 'someMapper');
    const fakeResult = ref.asArg();
    // fake() returns the ref cast as ReturnType<F>
    expect(fakeResult).toBe(ref);
  });
});

describe('inputFrom e2e in batch', () => {
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;

  it('should map output of one route to input of another (name lane, server-registered mapper)', async () => {
    const {routes, middleFns} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    const customer = routes.getCustomerById(42);
    const [[customerData, prefs], [customerError, prefsError]] = await batch([
      customer,
      routes.getPreferencesById(inputFrom<typeof customer, number>(customer, 'toPreferenceId').asArg()),
    ]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

    expect(customerError).toBeUndefined();
    expect(prefsError).toBeUndefined();
    expect(customerData).toEqual({id: 42, name: 'Test Customer', preferenceId: 142});
    // 142 is even → 'dark', userId = prefId - 100 = 42 (original customer id)
    expect(prefs).toEqual({id: 142, userId: 42, theme: 'dark', lang: 'en'});
  });

  it('should map with an INLINE mapper declared in client code (build-time transport)', async () => {
    const {routes, middleFns} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    // the mapper body is authored HERE (client flow code), extracted at build time,
    // and executed by the server via the harvested server-mappers manifest.
    // NOTE: the mapper param is inferred as `resolvedValue | undefined` (the value
    // resolves server-side), hence the `!` — same convention as the docs examples.
    // the same routes as the name-lane test with a different mapper: the mappings are part of the
    // batch id, so this is its own batch
    const customer = routes.getCustomerById(7);
    const [[customerData, prefs], [customerError, prefsError]] = await batch([
      customer,
      routes.getPreferencesById(inputFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
    ]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

    expect(customerError).toBeUndefined();
    expect(prefsError).toBeUndefined();
    expect(customerData).toEqual({id: 7, name: 'Test Customer', preferenceId: 107});
    // 107 is odd → 'light', userId = prefId - 100 = 7 (original customer id)
    expect(prefs).toEqual({id: 107, userId: 7, theme: 'light', lang: 'en'});
  });

  it('should reject an unknown mapper key (server never evaluates unregistered mappers)', async () => {
    const {routes, middleFns} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');

    const customer = routes.getCustomerById(42);
    const [[customerData, prefs], [customerError, prefsError], fatal] = await batch([
      customer,
      routes.getPreferencesById(inputFrom<typeof customer, number>(customer, 'nonexistentMapper').asArg()),
    ]).call({middleFns: {auth: middleFns.auth(authHeaders)}});

    // the whole batch is rejected while building the chain (batch-mapper-not-allowed
    // server-side) — nothing executes. The failure is nobody's declared response, so it
    // surfaces once in the fatal slot, never in the per-route typed slots.
    expect(fatal ?? prefsError ?? customerError).toBeTruthy();
    expect(prefs).toBeUndefined();
    expect(customerData).toBeUndefined();
  });
});
