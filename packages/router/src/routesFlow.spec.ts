/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {registerRoutes, resetRouter, initRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {MionHeaders} from './types/context.ts';
import {Routes} from './types/general.ts';
import {RpcError, toBase64Url} from '@mionjs/core';
import {getRTUtils} from '@mionjs/run-types';
import {middleFn, route} from './lib/handlers.ts';
import {headersFromRecord} from './lib/headers.ts';
import {clearRoutesFlowCache, getRoutesFlowCacheSize, getCachedRoutesFlow} from './routesFlow.ts';
import {WORKFLOW_KEY, WORKFLOW_PATH} from './constants.ts';
import type {RoutesFlowQuery} from '@mionjs/core';

/** Helper to encode a RoutesFlowQuery as base64url JSON with data= prefix (same format the client sends) */
function encodeRoutesFlowQuery(query: RoutesFlowQuery): string {
  return `data=${toBase64Url(JSON.stringify(query))}`;
}

// RoutesFlows allow calling multiple routes in a single request, with shared context between them
// a new execution chain is created for each routesFlow request, merging the execution chains of all routes in the routesFlow

type RawRequest = {
  headers: MionHeaders;
  body: string;
};

describe('RoutesFlow routes', () => {
  const getDefaultRequest = (body: Record<string, any[]>): RawRequest => ({
    headers: headersFromRecord({}),
    body: JSON.stringify(body),
  });

  beforeEach(() => resetRouter());

  describe('route name validation', () => {
    it('should reject route names containing commas', async () => {
      await initRouter();
      const routesWithComma = {
        'route,with,commas': route((ctx): string => 'test'),
      } satisfies Routes;

      await expect(registerRoutes(routesWithComma)).rejects.toThrow('Route names cannot contain commas');
    });

    it('should reject route names using reserved routesFlow route name', async () => {
      await initRouter();
      const routesWithRoutesFlowName = {
        [WORKFLOW_KEY]: route((ctx): string => 'test'),
      } satisfies Routes;

      await expect(registerRoutes(routesWithRoutesFlowName)).rejects.toThrow(`'${WORKFLOW_KEY}' is a reserved mion route name`);
    });
  });

  describe('routesFlow execution', () => {
    const route1 = route((ctx): string => 'result1');
    const routeX2 = route((ctx, value: number): number => value * 2);
    const routeSum = route((ctx, a: number, b: number): number => a + b);

    const sharedMiddleFn = middleFn((ctx): void => {
      ctx.shared.middleFnCalled = (ctx.shared.middleFnCalled || 0) + 1;
    });

    const routes = {
      route1,
      routeX2,
      routeSum,
    } satisfies Routes;

    const routesWithMiddleFn = {
      sharedMiddleFn,
      route1,
      routeX2,
    } satisfies Routes;

    it('should execute single route in routesFlow', async () => {
      await initRouter();
      await registerRoutes(routes);

      const request = getDefaultRequest({route1: []});
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
    });

    it('should execute multiple routes in routesFlow', async () => {
      await initRouter();
      await registerRoutes(routes);

      const request = getDefaultRequest({
        route1: [],
        routeX2: [5],
        routeSum: [10, 20],
      });
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1', '/routeX2', '/routeSum']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.routeX2).toBe(10);
      expect(response.body.routeSum).toBe(30);
    });

    it('should execute routesFlow with prefix', async () => {
      await initRouter({basePath: 'api/v1'});
      await registerRoutes(routes);

      const request = getDefaultRequest({
        route1: [],
        routeX2: [5],
      });
      // Client sends the routesFlow request to the prefixed path
      const routesFlowPath = '/api/v1/mion-routes-flow';
      // Route paths inside the query also include the prefix
      const urlQuery = encodeRoutesFlowQuery({routes: ['/api/v1/route1', '/api/v1/routeX2']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.routeX2).toBe(10);
    });

    it('should deduplicate shared middleFns', async () => {
      clearRoutesFlowCache();
      await initRouter({contextDataFactory: () => ({middleFnCalled: 0})});
      await registerRoutes(routesWithMiddleFn);

      const request = getDefaultRequest({
        route1: [],
        routeX2: [5],
      });
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1', '/routeX2']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.routeX2).toBe(10);

      // Verify the cached routesFlow has deduplicated middleFns
      const cachedRoutesFlow = getCachedRoutesFlow(urlQuery);
      expect(cachedRoutesFlow).toBeDefined();
      // routeIndex is the actual route index from the first route's chain
      expect(cachedRoutesFlow!.routeIndex).toBeGreaterThanOrEqual(0);

      // The sharedMiddleFn should only appear once in the merged methods
      const middleFnCount = cachedRoutesFlow!.methods.filter((m) => m.id === 'sharedMiddleFn').length;
      expect(middleFnCount).toBe(1);

      // Both route handlers should be present
      const route1Handler = cachedRoutesFlow!.methods.find((m) => m.id === 'route1');
      const routeX2Handler = cachedRoutesFlow!.methods.find((m) => m.id === 'routeX2');
      expect(route1Handler).toBeDefined();
      expect(routeX2Handler).toBeDefined();

      // Verify the chain includes deserialization and serialization
      const deserializer = cachedRoutesFlow!.methods.find((m) => m.id === 'mionDeserializeRequest');
      const serializer = cachedRoutesFlow!.methods.find((m) => m.id === 'mionSerializeResponse');
      expect(deserializer).toBeDefined();
      expect(serializer).toBeDefined();
    });

    it('should throw error for non-existent route in routesFlow', async () => {
      await initRouter();
      await registerRoutes(routes);

      const request = getDefaultRequest({});
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/nonExistent']});

      // Errors during routesFlow chain building are thrown as exceptions
      // since they happen during context creation
      await expect(
        dispatchRoute(
          routesFlowPath,
          request.body,
          request.headers,
          headersFromRecord({}),
          request,
          undefined,
          undefined,
          urlQuery
        )
      ).rejects.toThrow('Route not found in routesFlow: /nonExistent');
    });

    it('should throw error for routesFlow path without query string', async () => {
      await initRouter();
      await registerRoutes(routes);

      const request = getDefaultRequest({});
      const routesFlowPath = WORKFLOW_PATH;

      // When no urlQuery is provided, the routesFlow should throw an error
      await expect(
        dispatchRoute(
          routesFlowPath,
          request.body,
          request.headers,
          headersFromRecord({}),
          request,
          undefined,
          undefined,
          undefined // no urlQuery
        )
      ).rejects.toThrow('RoutesFlow request requires a query string with route paths.');
    });

    it('should throw error for invalid base64url query string', async () => {
      await initRouter();
      await registerRoutes(routes);

      const request = getDefaultRequest({route1: []});
      const routesFlowPath = WORKFLOW_PATH;
      // Invalid base64url (not valid JSON when decoded)
      const urlQuery = `data=${toBase64Url('not-valid-json')}`;

      await expect(
        dispatchRoute(
          routesFlowPath,
          request.body,
          request.headers,
          headersFromRecord({}),
          request,
          undefined,
          undefined,
          urlQuery
        )
      ).rejects.toMatchObject({
        type: 'routesFlow-invalid-query',
        publicMessage: 'RoutesFlow query string is not valid base64url-encoded JSON.',
      });
    });

    it('should apply pathTransform to routesFlow route paths', async () => {
      await initRouter({
        pathTransform: (req, path) => path.replace('/v1', ''),
      });
      await registerRoutes(routes);

      const request = getDefaultRequest({route1: []});
      const routesFlowPath = WORKFLOW_PATH;
      // Path with /v1 prefix that should be transformed
      const urlQuery = encodeRoutesFlowQuery({routes: ['/v1/route1']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
    });

    it('should stop execution on first route error', async () => {
      const errorRoute = route((ctx): string => {
        throw new RpcError({
          publicMessage: 'Test error',
          type: 'test-error',
        });
      });

      const routesWithError = {
        errorRoute,
        route1,
      } satisfies Routes;

      await initRouter();
      await registerRoutes(routesWithError);

      const request = getDefaultRequest({
        errorRoute: [],
        route1: [],
      });
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/errorRoute', '/route1']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(true);
      // route1 should not have been executed due to error in errorRoute
      // (unless it has runOnError: true)
      expect(response.body.route1).toBeUndefined();
    });
  });

  // Note: RoutesFlow routes are no longer registered as a separate route.
  // The routesFlow execution chain is built dynamically in getExecutionChain()
  // when the path matches the routesFlow route path.

  describe('routesFlow cache', () => {
    const route1 = route((ctx): string => 'result1');
    const routeX2 = route((ctx, value: number): number => value * 2);

    const routes = {
      route1,
      routeX2,
    } satisfies Routes;

    beforeEach(() => {
      clearRoutesFlowCache();
    });

    it('should cache merged execution chains', async () => {
      await initRouter();
      await registerRoutes(routes);

      expect(getRoutesFlowCacheSize()).toBe(0);

      const request = getDefaultRequest({route1: []});
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1']});

      // First request - should add to cache
      await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(getRoutesFlowCacheSize()).toBe(1);

      // Second request with same query - should use cache
      await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      // Cache size should still be 1 (reused)
      expect(getRoutesFlowCacheSize()).toBe(1);
    });

    it('should cache different query strings separately', async () => {
      await initRouter();
      await registerRoutes(routes);

      const routesFlowPath = WORKFLOW_PATH;

      // First query
      const request1 = getDefaultRequest({route1: []});
      const response1 = await dispatchRoute(
        routesFlowPath,
        request1.body,
        request1.headers,
        headersFromRecord({}),
        request1,
        undefined,
        undefined,
        encodeRoutesFlowQuery({routes: ['/route1']})
      );

      expect(response1.hasErrors).toBe(false);
      expect(getRoutesFlowCacheSize()).toBe(1);

      // Second query (different)
      const request2 = getDefaultRequest({routeX2: [5]});
      const response2 = await dispatchRoute(
        routesFlowPath,
        request2.body,
        request2.headers,
        headersFromRecord({}),
        request2,
        undefined,
        undefined,
        encodeRoutesFlowQuery({routes: ['/routeX2']})
      );

      expect(response2.hasErrors).toBe(false);
      expect(getRoutesFlowCacheSize()).toBe(2);
    });

    it('should evict oldest entries when cache is full (FILO)', async () => {
      // Initialize with small cache size
      await initRouter({maxRoutesFlowsCacheSize: 2});
      await registerRoutes(routes);

      const routesFlowPath = WORKFLOW_PATH;

      // Add first entry
      const request1 = getDefaultRequest({route1: []});
      await dispatchRoute(
        routesFlowPath,
        request1.body,
        request1.headers,
        headersFromRecord({}),
        request1,
        undefined,
        undefined,
        encodeRoutesFlowQuery({routes: ['/route1']})
      );
      expect(getRoutesFlowCacheSize()).toBe(1);

      // Add second entry
      const request2 = getDefaultRequest({routeX2: [5]});
      await dispatchRoute(
        routesFlowPath,
        request2.body,
        request2.headers,
        headersFromRecord({}),
        request2,
        undefined,
        undefined,
        encodeRoutesFlowQuery({routes: ['/routeX2']})
      );
      expect(getRoutesFlowCacheSize()).toBe(2);

      // Add third entry - should evict first
      const request3 = getDefaultRequest({route1: [], routeX2: [5]});
      await dispatchRoute(
        routesFlowPath,
        request3.body,
        request3.headers,
        headersFromRecord({}),
        request3,
        undefined,
        undefined,
        encodeRoutesFlowQuery({routes: ['/route1', '/routeX2']})
      );
      expect(getRoutesFlowCacheSize()).toBe(2);
    });

    it('should not cache when maxRoutesFlowsCacheSize is 0', async () => {
      await initRouter({maxRoutesFlowsCacheSize: 0});
      await registerRoutes(routes);

      const request = getDefaultRequest({route1: []});
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1']});

      await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(getRoutesFlowCacheSize()).toBe(0);
    });

    it('should clear cache with clearRoutesFlowCache', async () => {
      await initRouter();
      await registerRoutes(routes);

      const request = getDefaultRequest({route1: []});
      const routesFlowPath = WORKFLOW_PATH;

      await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        encodeRoutesFlowQuery({routes: ['/route1']})
      );

      expect(getRoutesFlowCacheSize()).toBe(1);

      clearRoutesFlowCache();

      expect(getRoutesFlowCacheSize()).toBe(0);
    });
  });

  describe('scoped middleFns in routesFlow', () => {
    const route1 = route((ctx): string => 'result1');
    const route2 = route((ctx): string => 'result2');
    const route3 = route((ctx): string => 'result3');

    const scopedMiddleFn = middleFn((ctx): void => {
      ctx.shared.scopedMiddleFnCalled = (ctx.shared.scopedMiddleFnCalled || 0) + 1;
    });

    const routes = {
      route1,
      other: {
        scopedMiddleFn,
        route2,
      },
      route3,
    } satisfies Routes;

    beforeEach(() => {
      clearRoutesFlowCache();
    });

    it('should include scoped middleFn when route from that scope is called', async () => {
      await initRouter({contextDataFactory: () => ({scopedMiddleFnCalled: 0})});
      await registerRoutes(routes);

      const request = getDefaultRequest({
        route1: [],
        'other/route2': [],
        route3: [],
      });
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1', '/other/route2', '/route3']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body['other/route2']).toBe('result2');
      expect(response.body.route3).toBe('result3');

      // Verify the cached routesFlow has the scoped middleFn
      const cachedRoutesFlow = getCachedRoutesFlow(urlQuery);
      expect(cachedRoutesFlow).toBeDefined();

      // The scopedMiddleFn should appear in the merged methods (with path prefix)
      const scopedMiddleFnMethod = cachedRoutesFlow!.methods.find((m) => m.id === 'other/scopedMiddleFn');
      expect(scopedMiddleFnMethod).toBeDefined();

      // Verify execution order: route1, other/scopedMiddleFn, other/route2, route3
      const methodIds = cachedRoutesFlow!.methods
        .filter((m) => ['route1', 'other/scopedMiddleFn', 'other/route2', 'route3'].includes(m.id))
        .map((m) => m.id);
      expect(methodIds).toEqual(['route1', 'other/scopedMiddleFn', 'other/route2', 'route3']);
    });

    it('should maintain correct order when scoped route is called first', async () => {
      await initRouter({contextDataFactory: () => ({scopedMiddleFnCalled: 0})});
      await registerRoutes(routes);

      const request = getDefaultRequest({
        'other/route2': [],
        route1: [],
        route3: [],
      });
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/other/route2', '/route1', '/route3']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body['other/route2']).toBe('result2');
      expect(response.body.route1).toBe('result1');
      expect(response.body.route3).toBe('result3');

      // Verify the cached routesFlow has the scoped middleFn
      const cachedRoutesFlow = getCachedRoutesFlow(urlQuery);
      expect(cachedRoutesFlow).toBeDefined();

      // Verify execution order: other/scopedMiddleFn, other/route2, route1, route3
      const methodIds = cachedRoutesFlow!.methods
        .filter((m) => ['route1', 'other/scopedMiddleFn', 'other/route2', 'route3'].includes(m.id))
        .map((m) => m.id);
      expect(methodIds).toEqual(['other/scopedMiddleFn', 'other/route2', 'route1', 'route3']);
    });

    it('should not include scoped middleFn when no routes from that scope are called', async () => {
      await initRouter({contextDataFactory: () => ({scopedMiddleFnCalled: 0})});
      await registerRoutes(routes);

      const request = getDefaultRequest({
        route1: [],
        route3: [],
      });
      const routesFlowPath = WORKFLOW_PATH;
      const urlQuery = encodeRoutesFlowQuery({routes: ['/route1', '/route3']});

      const response = await dispatchRoute(
        routesFlowPath,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        urlQuery
      );

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.route3).toBe('result3');

      // Verify the cached routesFlow does NOT have the scoped middleFn
      const cachedRoutesFlow = getCachedRoutesFlow(urlQuery);
      expect(cachedRoutesFlow).toBeDefined();

      // The scopedMiddleFn should NOT appear in the merged methods (with path prefix)
      const scopedMiddleFnMethod = cachedRoutesFlow!.methods.find((m) => m.id === 'other/scopedMiddleFn');
      expect(scopedMiddleFnMethod).toBeUndefined();
    });
  });

  // ############# wire-driven mapper dispatch (security) #############
  // `mapping.bodyHash` arrives in the URL query, decoded with a bare JSON.parse and no schema
  // validation, and is handed to getServerMapper. The allow-list in core/src/runtypes/serverMappers.ts
  // is the only gate. core pins the gate itself; this pins it at the point that actually matters —
  // a real request, driven through the router.
  describe('routesFlow mapper dispatch rejects keys no mion lane opted in', () => {
    const source = route((ctx): {id: number} => ({id: 7}));
    const target = route((ctx, id: number | null): number => (id ?? -1) * 10);
    const mapperRoutes = {source, target} satisfies Routes;

    it('rejects a bodyHash that exists in the mion registry but was never allow-listed', async () => {
      await initRouter();
      await registerRoutes(mapperRoutes);

      // present in the SHARED registry, but registered outside any mion lane — exactly the case
      // the gate exists for (a built-in, another library's entry, or one restored from a
      // methods-metadata payload).
      getRTUtils().addPureFn('rt::routerSneakyMapper', {
        namespace: 'rt',
        fnName: 'routerSneakyMapper',
        bodyHash: '',
        paramNames: [],
        code: '',
        pureFnDependencies: [],
        createPureFn: () => () => 999,
      } as never);
      expect(getRTUtils().hasPureFnByKey('rt::routerSneakyMapper')).toBe(true);

      const request = getDefaultRequest({source: [], target: [null]});
      const urlQuery = encodeRoutesFlowQuery({
        routes: ['/source', '/target'],
        mappings: [{fromId: 'source', toId: 'target', bodyHash: 'rt::routerSneakyMapper', paramIndex: 0}],
      });

      // rejected while building the execution chain — the mapper is never resolved, never run
      await expect(
        dispatchRoute(
          WORKFLOW_PATH,
          request.body,
          request.headers,
          headersFromRecord({}),
          request,
          undefined,
          undefined,
          urlQuery
        )
      ).rejects.toThrow(/Mapping pure function 'rt::routerSneakyMapper' not found/);
    });

    it('rejects a bodyHash that is not in the registry at all', async () => {
      await initRouter();
      await registerRoutes(mapperRoutes);

      const request = getDefaultRequest({source: [], target: [null]});
      const urlQuery = encodeRoutesFlowQuery({
        routes: ['/source', '/target'],
        mappings: [{fromId: 'source', toId: 'target', bodyHash: 'mionjs::doesNotExist', paramIndex: 0}],
      });

      await expect(
        dispatchRoute(
          WORKFLOW_PATH,
          request.body,
          request.headers,
          headersFromRecord({}),
          request,
          undefined,
          undefined,
          urlQuery
        )
      ).rejects.toThrow(/Mapping pure function 'mionjs::doesNotExist' not found/);
    });
  });

  // ############# query shape / paramIndex (security) #############
  // The whole RoutesFlowQuery arrives in the URL query string and used to cross the boundary as a
  // bare cast. `paramIndex` in particular was written straight into an array —
  // `params[mapping.paramIndex] = value` — so a string sailed through the `number` type and became
  // a plain property write. Shape is now established once on decode; the arity bound needs the
  // target route, so it lands while the chain is built. Either way, nothing runs.
  describe('routesFlow rejects a malformed query before anything executes', () => {
    const source = route((ctx): {id: number} => ({id: 7}));
    const target = route((ctx, id: number | null): number => (id ?? -1) * 10);
    const mapperRoutes = {source, target} satisfies Routes;

    const dispatchQuery = (query: unknown) => {
      const request = getDefaultRequest({source: [], target: [null]});
      return dispatchRoute(
        WORKFLOW_PATH,
        request.body,
        request.headers,
        headersFromRecord({}),
        request,
        undefined,
        undefined,
        `data=${toBase64Url(JSON.stringify(query))}`
      );
    };

    const withParamIndex = (paramIndex: unknown) => ({
      routes: ['/source', '/target'],
      mappings: [{fromId: 'source', toId: 'target', bodyHash: 'mionjs::toId', paramIndex}],
    });

    beforeEach(async () => {
      await initRouter();
      await registerRoutes(mapperRoutes);
    });

    // the values that turn an array index into an arbitrary property write
    it.each([
      ['__proto__', 'prototype pollution'],
      ['length', 'array truncation'],
      ['0', 'a numeric string is still a string'],
    ])('rejects a string paramIndex (%s — %s)', async (paramIndex) => {
      await expect(dispatchQuery(withParamIndex(paramIndex))).rejects.toThrow(/paramIndex.*must be a non-negative integer/);
    });

    it.each([-1, 1.5, NaN])('rejects a non-index number paramIndex (%s)', async (paramIndex) => {
      // NaN does not survive JSON, so it arrives as null — still not a valid index
      await expect(dispatchQuery(withParamIndex(paramIndex))).rejects.toThrow(/paramIndex.*must be a non-negative integer/);
    });

    it('rejects a paramIndex past the target route arity', async () => {
      // structurally fine, semantically impossible: target takes 1 param, so 999 would write
      // 998 empty slots into the params array
      await expect(dispatchQuery(withParamIndex(999))).rejects.toThrow(
        /paramIndex 999 is out of range for target route 'target', which takes 1 parameter/
      );
    });

    it.each([
      [{routes: 'not-an-array'}, /`routes` must be an array of strings/],
      [{routes: [1, 2]}, /`routes` must be an array of strings/],
      [{routes: ['/source'], mappings: 'nope'}, /`mappings` must be an array/],
      [{routes: ['/source'], mappings: ['nope']}, /every mapping must be an object/],
      [
        {routes: ['/source', '/target'], mappings: [{fromId: 1, toId: 'target', bodyHash: 'x', paramIndex: 0}]},
        /must be strings/,
      ],
    ])('rejects a structurally invalid query (%#)', async (query, expected) => {
      await expect(dispatchQuery(query)).rejects.toThrow(expected);
    });

    it('reports a shape problem as a shape problem, not a parse failure', async () => {
      // the check runs outside decode's try/catch, so its error is not swallowed and relabelled
      await expect(dispatchQuery(withParamIndex('__proto__'))).rejects.toThrow(/RoutesFlow query is malformed/);
    });
  });
});
