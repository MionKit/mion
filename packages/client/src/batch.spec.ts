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
import {HeadersSubset, RpcError, MION_ROUTES, getRoutePath} from '@mionjs/core';
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

const someUser = {name: 'John', surname: 'Doe'};

describe('batch', () => {
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

// ############# END-TO-END: every route shape the build reads #############
//
// The build reads each `batch([...])` call site: the ordered route ids and the inputFrom mappings.
// Every shape below is one the build accepts (inline, const/let bound, renamed destructuring,
// the client object, a const sub-proxy, element access), and each one must run against the test
// server and answer the right values, which proves the injected id matched the table the server
// was built with.
describe('batch build shapes end to end', () => {
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;
  const {routes, middleFns} = initClient<MyApi>({baseURL});
  const auth = () => ({auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))});

  it('inline route calls', async () => {
    const [[user, org], [userError, orgError], fatal] = await batch([routes.flow.getUser(3), routes.flow.getOrg(30)]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(userError).toBeUndefined();
    expect(orgError).toBeUndefined();
    expect(user).toEqual({id: 3, orgId: 30, tagIds: [3, 4]});
    expect(org).toEqual({id: 30, name: 'Org 30'});
  });

  it('const-bound and let-bound elements (let with an initializer)', async () => {
    const user = routes.flow.getUser(4);
    // eslint-disable-next-line prefer-const
    let org = routes.flow.getOrg(40);
    const [[userValue, orgValue], errors, fatal] = await batch([user, org]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(userValue).toEqual({id: 4, orgId: 40, tagIds: [4, 5]});
    expect(orgValue).toEqual({id: 40, name: 'Org 40'});
  });

  it('renamed destructuring: const {routes: r} = initClient()', async () => {
    const {routes: r, middleFns: m} = initClient<MyApi>({baseURL});
    const [[user, sum], errors, fatal] = await batch([r.flow.getUser(5), r.utils.sumTwo(5)]).call({
      middleFns: {auth: m.auth(createAuthHeaders('XWYZ-TOKEN'))},
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(user).toEqual({id: 5, orgId: 50, tagIds: [5, 6]});
    expect(sum).toBe(7);
  });

  it('client object: const client = initClient(); client.routes.x()', async () => {
    const client = initClient<MyApi>({baseURL});
    const [[user, greeting], errors, fatal] = await batch([client.routes.flow.getUser(6), client.routes.sayHello(someUser)]).call(
      {
        middleFns: {auth: client.middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))},
      }
    );
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(user).toEqual({id: 6, orgId: 60, tagIds: [6, 7]});
    expect(greeting).toBe('Hello John Doe');
  });

  it('const sub-proxy: const flow = routes.flow, as element AND as mapping source', async () => {
    const flow = routes.flow;
    const user = flow.getUser(7);
    const [[userValue, org], errors, fatal] = await batch([user, flow.getOrg(inputFrom(user, 'toOrgId').asArg())]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(userValue).toEqual({id: 7, orgId: 70, tagIds: [7, 8]});
    expect(org).toEqual({id: 70, name: 'Org 70'});
  });

  it("element access: routes['flow'].getUser() and routes['utils']['sumTwo']()", async () => {
    const [[user, sum], errors, fatal] = await batch([routes['flow'].getUser(8), routes['utils']['sumTwo'](8)]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(user).toEqual({id: 8, orgId: 80, tagIds: [8, 9]});
    expect(sum).toBe(10);
  });

  it('a batch inside an async helper whose route ARGUMENTS come from the parameters', async () => {
    // only the route identity is static; the values travel at runtime like any other call
    async function loadUserWithOrg(userId: number) {
      const user = routes.flow.getUser(userId);
      return batch([user, routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg())]).call({middleFns: auth()});
    }
    const [[user9, org9], errors9, fatal9] = await loadUserWithOrg(9);
    const [[user11, org11], errors11, fatal11] = await loadUserWithOrg(11);
    expect(fatal9).toBeUndefined();
    expect(fatal11).toBeUndefined();
    expect(errors9).toEqual([undefined, undefined]);
    expect(errors11).toEqual([undefined, undefined]);
    expect(user9).toEqual({id: 9, orgId: 90, tagIds: [9, 10]});
    expect(org9).toEqual({id: 90, name: 'Org 90'});
    expect(user11).toEqual({id: 11, orgId: 110, tagIds: [11, 12]});
    expect(org11).toEqual({id: 110, name: 'Org 110'});
  });
});

// ############# END-TO-END: every mapping shape the build reads #############
describe('inputFrom mapping shapes end to end', () => {
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;
  const {routes, middleFns} = initClient<MyApi>({baseURL});
  const auth = () => ({auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))});

  it('.asArg() with an inline mapper', async () => {
    const user = routes.flow.getUser(12);
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(inputFrom(user, (u) => u!.orgId).asArg())]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 120, name: 'Org 120'});
  });

  it('a bare inputFrom ref passed straight as the argument (no .asArg())', async () => {
    const user = routes.flow.getUser(13);
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(inputFrom(user, (u) => u!.orgId) as never)]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 130, name: 'Org 130'});
  });

  it('a mapping bound to a const first', async () => {
    const user = routes.flow.getUser(14);
    const orgId = inputFrom(user, (u) => u!.orgId).asArg();
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(orgId)]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 140, name: 'Org 140'});
  });

  it('name lane with a string literal', async () => {
    const user = routes.flow.getUser(15);
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg())]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 150, name: 'Org 150'});
  });

  it('name lane with a const bound to the literal', async () => {
    const MAPPER_NAME = 'toOrgId';
    const user = routes.flow.getUser(16);
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(inputFrom(user, MAPPER_NAME).asArg())]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 160, name: 'Org 160'});
  });

  it('a mapping at param index 1, the literal at index 0 stays as sent', async () => {
    const order = routes.flow.getOrder(2);
    const [[orderValue, product], errors, fatal] = await batch([
      order,
      routes.flow.getProduct(77, inputFrom(order, (o) => o!.currency).asArg()),
    ]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(orderValue).toEqual({id: 2, currency: 'EUR'});
    expect(product).toEqual({orderId: 77, currency: 'EUR', sku: 'SKU-77-EUR'});
  });

  it('two mappings into one route from two different sources', async () => {
    const user = routes.flow.getUser(17);
    const order = routes.flow.getOrder(3);
    const [[, , product], errors, fatal] = await batch([
      user,
      order,
      routes.flow.getProduct(inputFrom(user, (u) => u!.id).asArg(), inputFrom(order, (o) => o!.currency).asArg()),
    ]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined, undefined]);
    expect(product).toEqual({orderId: 17, currency: 'USD', sku: 'SKU-17-USD'});
  });

  it('a three-route chain A -> B -> C, C fed by B which was fed by A', async () => {
    const user = routes.flow.getUser(18);
    const org = routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg());
    const [[userValue, orgValue, label], errors, fatal] = await batch([
      user,
      org,
      routes.flow.getOrgLabel(inputFrom(org, (o) => o!.name).asArg()),
    ]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined, undefined]);
    expect(userValue).toEqual({id: 18, orgId: 180, tagIds: [18, 19]});
    expect(orgValue).toEqual({id: 180, name: 'Org 180'});
    expect(label).toBe('[Org 180]');
  });

  it('one source feeding two targets', async () => {
    const user = routes.flow.getUser(19);
    const [[, org, tags], errors, fatal] = await batch([
      user,
      routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg()),
      routes.flow.getTags(inputFrom(user, (u) => u!.tagIds).asArg()),
    ]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined, undefined]);
    expect(org).toEqual({id: 190, name: 'Org 190'});
    expect(tags).toEqual([
      {id: 19, label: 'tag-19'},
      {id: 20, label: 'tag-20'},
    ]);
  });

  // The next two tests are the SAME batch written twice (same routes, same mapping): both call sites
  // hash to the same id and both must work.
  it('the same batch written twice in the file: first site', async () => {
    const user = routes.flow.getUser(20);
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg())]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 200, name: 'Org 200'});
  });

  it('the same batch written twice in the file: second site', async () => {
    const user = routes.flow.getUser(21);
    const [[, org], errors, fatal] = await batch([user, routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg())]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 210, name: 'Org 210'});
  });

  it('the same routes with different mappings are two batches, both work', async () => {
    const userA = routes.flow.getUser(22);
    const byName = await batch([userA, routes.flow.getOrg(inputFrom(userA, 'toOrgId').asArg())]).call({middleFns: auth()});
    const userB = routes.flow.getUser(23);
    // the inline mapper picks a DIFFERENT value than the named one, so the two ids cannot be confused
    const inline = await batch([userB, routes.flow.getOrg(inputFrom(userB, (u) => u!.id).asArg())]).call({middleFns: auth()});
    expect(byName[2]).toBeUndefined();
    expect(inline[2]).toBeUndefined();
    expect(byName[0][1]).toEqual({id: 220, name: 'Org 220'});
    expect(inline[0][1]).toEqual({id: 23, name: 'Org 23'});
  });

  it('a batch with explicit middleFns AND mappings', async () => {
    const user = routes.flow.getUser(24);
    const [[, org], errors, fatal, middleFnResults, middleFnErrors] = await batch([
      user,
      routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg()),
    ]).call({middleFns: {...auth(), session: middleFns.session('valid-token')}});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 240, name: 'Org 240'});
    expect(middleFnErrors).toEqual({});
    expect(middleFnResults.session).toMatchObject({userId: 'user-123', role: 'admin'});
  });

  it('a prefilled middleFn is restored inside a batch with mappings', async () => {
    const {routes: r, middleFns: m} = initClient<MyApi>({baseURL});
    const authHeaders = createAuthHeaders('XWYZ-TOKEN');
    m.auth(authHeaders).prefill();
    m.session('valid-token').prefill();

    const user = r.flow.getUser(25);
    const [[, org], errors, fatal, middleFnResults] = await batch([
      user,
      r.flow.getOrg(inputFrom(user, 'toOrgId').asArg()),
    ]).call();
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(org).toEqual({id: 250, name: 'Org 250'});
    // a restored prefill is reported under its own id
    expect((middleFnResults as Record<string, any>).session).toMatchObject({userId: 'user-123', role: 'admin'});

    await m.auth(authHeaders).removePrefill();
    await m.session('valid-token').removePrefill();
  });

  it('results and errors arrays keep the array order', async () => {
    const [results, errors, fatal] = await batch([
      routes.alwaysFails(someUser),
      routes.sayHello(someUser),
      routes.flow.getUser(-1),
      routes.flow.getOrg(1),
    ]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(results).toEqual([undefined, 'Hello John Doe', undefined, {id: 1, name: 'Org 1'}]);
    expect(errors.map((error) => error?.type)).toEqual(['unknown-error', undefined, 'user-not-found', undefined]);
  });

  it('a Date survives through a mapped route', async () => {
    const stamp = routes.flow.getStamp(5);
    const [[stampValue, sameDate], errors, fatal] = await batch([
      stamp,
      routes.getSameDate(inputFrom(stamp, (s) => s!.when).asArg()),
    ]).call({middleFns: auth()});
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([undefined, undefined]);
    expect(stampValue?.when).toBeInstanceOf(Date);
    expect(stampValue?.counts).toBeInstanceOf(Map);
    expect(stampValue?.labels).toBeInstanceOf(Set);
    expect(sameDate).toBeInstanceOf(Date);
    expect(sameDate?.toISOString()).toBe('2024-01-05T00:00:00.000Z');
  });

  // A mapped param travels as a `null` placeholder. The compiled JSON stringifier for a Map / Set
  // param iterates it, so a mapped subrequest falls back to the plain wire forms (lib/serializer.ts).
  // The metadata is primed first so the compiled stringifier, not the optimistic JSON.stringify, runs.
  it('a Map placeholder is sent once metadata is cached, and the mapped Map arrives intact', async () => {
    await routes.getSameMap(new Map([['x', 1]])).call({middleFns: auth()});
    const stamp = routes.flow.getStamp(5);
    const [[, sameMap], [, mapError], fatal] = await batch([
      stamp,
      routes.getSameMap(inputFrom(stamp, (s) => s!.counts).asArg()),
    ]).call({
      middleFns: auth(),
    });
    expect(fatal).toBeUndefined();
    expect(mapError).toBeUndefined();
    expect(sameMap).toBeInstanceOf(Map);
    expect([...(sameMap as Map<string, number>).entries()]).toEqual([['id', 5]]);
  });
});

// ############# RUNTIME BEHAVIOUR #############
describe('batch runtime behaviour', () => {
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;
  const {routes, middleFns} = initClient<MyApi>({baseURL});
  const auth = () => ({auth: middleFns.auth(createAuthHeaders('XWYZ-TOKEN'))});

  it('a source route answering a DECLARED error: pins what every slot receives, and the server keeps serving', async () => {
    const user = routes.flow.getUser(-1);
    const [[userValue, org], [userError, orgError], fatal] = await batch([
      user,
      routes.flow.getOrg(inputFrom(user, 'toOrgId').asArg()),
    ]).call({middleFns: auth()});

    // the source's own declared error stays in its slot
    expect(userValue).toBeUndefined();
    expect(userError?.type).toBe('user-not-found');
    // a returned error does not stop the chain, but the target has nothing to map from: the mapping
    // step answers it with a typed error naming both routes and the target handler never runs
    expect(org).toBeUndefined();
    expect(orgError?.type).toBe('batch-mapping-source-failed');
    expect(orgError?.publicMessage).toContain("'flow/getUser'");
    expect(orgError?.publicMessage).toContain("'flow/getOrg'");
    expect(fatal).toBeUndefined();

    // the server is still up: the next request answers normally
    const [greeting, greetingError, greetingFatal] = await routes.sayHello(someUser).call({middleFns: auth()});
    expect(greeting).toBe('Hello John Doe');
    expect(greetingError).toBeUndefined();
    expect(greetingFatal).toBeUndefined();
  });

  it('a mapper that THROWS (reading a property of null): pins the outcome, and the server keeps serving', async () => {
    const maybe = routes.flow.getUserOrNull(0);
    const [[maybeValue, org], [maybeError, orgError], fatal] = await batch([
      maybe,
      routes.flow.getOrg(inputFrom(maybe, (u) => u!.orgId).asArg()),
    ]).call({middleFns: auth()});

    // the source answered (null) and has no error of its own
    expect(maybeValue).toBeNull();
    expect(maybeError).toBeUndefined();
    // the mapper step threw: nobody declared it, so it is the ONE fatal, typed, naming the two
    // routes but never the mapper's registry key; the target never ran
    expect(org).toBeUndefined();
    expect(orgError).toBeUndefined();
    expect(fatal?.type).toBe('batch-mapper-failed');
    expect(fatal?.statusCode).toBe(422);
    expect(fatal?.publicMessage).not.toContain('rt::');
    expect(fatal?.publicMessage).toContain("'flow/getOrg'");

    const [greeting, , greetingFatal] = await routes.sayHello(someUser).call({middleFns: auth()});
    expect(greeting).toBe('Hello John Doe');
    expect(greetingFatal).toBeUndefined();
  });

  it('an unknown batch id (explicit id the build leaves alone) is a 404 batch-unknown-id fatal that never echoes the id', async () => {
    const [results, errors, fatal] = await batch([routes.sayHello(someUser)], 'b_nope').call({middleFns: auth()});
    expect(results).toEqual([undefined]);
    expect(errors).toEqual([undefined]);
    expect(fatal?.type).toBe('batch-unknown-id');
    expect(fatal?.statusCode).toBe(404);
    expect(fatal?.publicMessage).not.toContain('b_nope');
    expect(fatal?.publicMessage).toContain('not registered');
  });

  it('batch-missing-id is typed (brand-lost alias, no id injected)', () => {
    const untransformed = batch as unknown as (routes: RouteSubRequest<any>[]) => unknown;
    let caught: unknown;
    try {
      untransformed([routes.sayHello(someUser)]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RpcError);
    expect((caught as RpcError<string>).type).toBe('batch-missing-id');
  });

  it('batch-empty-routes is typed and thrown before any id is looked at', () => {
    let caught: unknown;
    try {
      batch([]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RpcError);
    expect((caught as RpcError<string>).type).toBe('batch-empty-routes');
  });

  it('batch-client-mismatch is typed and names the offending index', () => {
    const other = initClient<MyApi>({baseURL});
    let caught: unknown;
    try {
      batch([routes.sayHello(someUser), routes.calculateAge(1990), other.routes.utils.sumTwo(1)]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RpcError);
    expect((caught as RpcError<string>).type).toBe('batch-client-mismatch');
    expect((caught as RpcError<string>).publicMessage).toContain('index 2');
  });

  it('timeout in a batch with mappings is ONE request-scoped fatal, per-route slots stay empty', async () => {
    const slow = routes.sleep(3000);
    const [results, errors, fatal] = await batch([slow, routes.flow.getOrg(inputFrom(slow, (ms) => ms!).asArg())]).call({
      middleFns: auth(),
      timeout: 100,
    });
    expect(results).toEqual([undefined, undefined]);
    expect(errors).toEqual([undefined, undefined]);
    expect(fatal?.type).toBe('request-timeout');
  });

  it('abort in a batch with mappings is ONE request-scoped fatal, per-route slots stay empty', async () => {
    const slow = routes.sleep(3000);
    const [results, errors, fatal] = await batch([slow, routes.flow.getOrg(inputFrom(slow, (ms) => ms!).asArg())]).call({
      middleFns: auth(),
      signal: AbortSignal.abort(),
    });
    expect(results).toEqual([undefined, undefined]);
    expect(errors).toEqual([undefined, undefined]);
    expect(fatal?.type).toBe('request-aborted');
  });

  it('the metadata route lists the registered batch ids', async () => {
    const url = new URL(getRoutePath([MION_ROUTES.methodsMetadataById], {basePath: '', suffix: ''} as never), baseURL);
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({[MION_ROUTES.methodsMetadataById]: [[], true]}),
    });
    expect(response.ok).toBe(true);
    // the route answers a union (data | RpcError), which the wire encodes as [memberIndex, value]
    const body = (await response.json()) as Record<string, unknown>;
    const envelope = body[MION_ROUTES.methodsMetadataById];
    const metadata = (Array.isArray(envelope) ? envelope[1] : envelope) as {batches?: string[]; methods: Record<string, unknown>};
    expect(metadata.methods['flow/getUser']).toBeDefined();
    // every id the build compiled in; this file alone defines well over a dozen
    expect(Array.isArray(metadata.batches)).toBe(true);
    expect(metadata.batches!.length).toBeGreaterThan(12);
    for (const id of metadata.batches!) expect(id).toMatch(/^b_[A-Za-z0-9_-]+$/);
    // an explicitly filled id slot is a pass-through the build never registers
    expect(metadata.batches).not.toContain('b_nope');
  });
});
