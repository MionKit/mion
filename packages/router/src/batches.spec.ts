/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, setPlatformConfig} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {MionHeaders} from './types/context.ts';
import {Routes} from './types/general.ts';
import {
  MION_BATCH_KEY,
  MION_BATCH_PATH,
  MION_ROUTES,
  RpcError,
  StatusCodes,
  allowInputMapper,
  inputMapperKey,
} from '@mionjs/core';
import type {BatchDefinition} from '@mionjs/core';
import {getRTUtils, registerPureFn} from '@mionjs/run-types';
import {headersFromRecord} from './lib/headers.ts';
import {mionClientRoutes} from './routes/client.routes.ts';
import {
  registerBatches,
  getBatch,
  getBatchIds,
  clearBatches,
  replaceBatches,
  resolveBatchMaxBodySize,
  readBatchId,
} from './batches.ts';

const mion = createMionRouter();

// A batch runs several routes in ONE request, sharing the call context between them. The build
// compiles every batch into a table the server registers at boot; a request carries only the
// batch id (`/mion-batch?id=<batchId>`) and the server merges the routes' execution chains once
// per id, keeping the merged chain on the registered entry.

type RawRequest = {
  headers: MionHeaders;
  body: string;
};

describe('batches', () => {
  const getDefaultRequest = (body: Record<string, any[]>, headers: Record<string, string> = {}): RawRequest => ({
    headers: headersFromRecord(headers),
    body: JSON.stringify(body),
  });

  /** Sends a batch request the way the client does: the batch path plus `id=<batchId>` in the query. */
  const dispatchBatch = (request: RawRequest, urlQuery: string | undefined, path: string = MION_BATCH_PATH) =>
    dispatchRoute(path, request.body, request.headers, headersFromRecord({}), request, {}, undefined, urlQuery);

  const thrownErrors = (response: Awaited<ReturnType<typeof dispatchRoute>>): Record<string, RpcError<string>> =>
    response.body[MION_ROUTES.thrownErrors] as Record<string, RpcError<string>>;

  beforeEach(() => resetRouter());

  describe('route name validation', () => {
    it('should reject route names containing commas', async () => {
      const routesWithComma = {
        'route,with,commas': mion.route((ctx): string => 'test'),
      } satisfies Routes;

      expect(() => mion.initRoutes(routesWithComma)).toThrow('Route names cannot contain commas');
    });

    it('should reject route names using the reserved batch route name', async () => {
      const routesWithBatchName = {
        [MION_BATCH_KEY]: mion.route((ctx): string => 'test'),
      } satisfies Routes;

      expect(() => mion.initRoutes(routesWithBatchName)).toThrow(`'${MION_BATCH_KEY}' is a reserved mion route name`);
    });
  });

  describe('batch execution', () => {
    const route1 = mion.route((ctx): string => 'result1');
    const routeX2 = mion.route((ctx, value: number): number => value * 2);
    const routeSum = mion.route((ctx, a: number, b: number): number => a + b);

    const sharedMiddleFn = mion.middleFn((ctx): void => {
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

    it('should execute a single route in a batch', async () => {
      mion.initRoutes(routes);
      registerBatches({single: {routes: ['route1']}});

      const response = await dispatchBatch(getDefaultRequest({route1: []}), 'id=single');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
    });

    it('should execute multiple routes in a batch', async () => {
      mion.initRoutes(routes);
      registerBatches({three: {routes: ['route1', 'routeX2', 'routeSum']}});

      const request = getDefaultRequest({
        route1: [],
        routeX2: [5],
        routeSum: [10, 20],
      });
      const response = await dispatchBatch(request, 'id=three');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.routeX2).toBe(10);
      expect(response.body.routeSum).toBe(30);
    });

    it('should execute a batch under a basePath prefix', async () => {
      createMionRouter({basePath: 'api/v1'}).initRoutes(routes);
      // the table holds route IDS, never paths: the prefix is the server's business
      registerBatches({two: {routes: ['route1', 'routeX2']}});

      const request = getDefaultRequest({
        route1: [],
        routeX2: [5],
      });
      // The client sends the batch request to the prefixed batch path
      const response = await dispatchBatch(request, 'id=two', '/api/v1/mion-batch');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.routeX2).toBe(10);
    });

    it('should deduplicate shared middleFns', async () => {
      createMionRouter({contextDataFactory: () => ({middleFnCalled: 0})}).initRoutes(routesWithMiddleFn);
      registerBatches({two: {routes: ['route1', 'routeX2']}});

      const request = getDefaultRequest({
        route1: [],
        routeX2: [5],
      });
      const response = await dispatchBatch(request, 'id=two');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.routeX2).toBe(10);

      // The merged chain lives on the registered entry (no pathTransform, so the key is '')
      const chain = getBatch('two')!.chains.get('');
      expect(chain).toBeDefined();
      // routeIndex is the actual route index from the first route's chain
      expect(chain!.routeIndex).toBeGreaterThanOrEqual(0);

      // The sharedMiddleFn should only appear once in the merged methods
      const middleFnCount = chain!.methods.filter((m) => m.id === 'sharedMiddleFn').length;
      expect(middleFnCount).toBe(1);

      // Both route handlers should be present
      expect(chain!.methods.find((m) => m.id === 'route1')).toBeDefined();
      expect(chain!.methods.find((m) => m.id === 'routeX2')).toBeDefined();

      // Verify the chain includes deserialization and serialization
      expect(chain!.methods.find((m) => m.id === 'mionDeserializeRequest')).toBeDefined();
      expect(chain!.methods.find((m) => m.id === 'mionSerializeResponse')).toBeDefined();
    });

    it('should throw batch-route-not-found when a registered batch names a route the server lacks', async () => {
      mion.initRoutes(routes);
      registerBatches({stale: {routes: ['route1', 'nonExistent']}});

      // Errors during batch chain building are thrown as exceptions since they happen during context creation
      await expect(dispatchBatch(getDefaultRequest({}), 'id=stale')).rejects.toMatchObject({
        type: 'batch-route-not-found',
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        errorData: {batchId: 'stale', routeId: 'nonExistent'},
      });
    });

    it('should apply pathTransform to the batch route paths', async () => {
      createMionRouter({
        pathTransform: (req, path) => path.replace('/v1', ''),
      }).initRoutes(routes);
      // the table names 'v1/route1', which no route answers to: the transform maps it onto /route1
      registerBatches({one: {routes: ['v1/route1']}});

      const response = await dispatchBatch(getDefaultRequest({route1: []}), 'id=one');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
    });

    it('the same batch is batch-route-not-found without the pathTransform', async () => {
      mion.initRoutes(routes);
      registerBatches({one: {routes: ['v1/route1']}});

      await expect(dispatchBatch(getDefaultRequest({route1: []}), 'id=one')).rejects.toMatchObject({
        type: 'batch-route-not-found',
      });
    });

    it('should stop execution on first route error', async () => {
      const errorRoute = mion.route((ctx): string => {
        throw new RpcError({
          publicMessage: 'Test error',
          type: 'test-error',
        });
      });

      const routesWithError = {
        errorRoute,
        route1,
      } satisfies Routes;

      mion.initRoutes(routesWithError);
      registerBatches({failing: {routes: ['errorRoute', 'route1']}});

      const request = getDefaultRequest({
        errorRoute: [],
        route1: [],
      });
      const response = await dispatchBatch(request, 'id=failing');

      expect(response.hasErrors).toBe(true);
      expect(thrownErrors(response).errorRoute.type).toBe('test-error');
      // route1 should not have been executed due to error in errorRoute (unless it has runOnError: true)
      expect(response.body.route1).toBeUndefined();
    });
  });

  // ############# unknown id #############
  // The id is the ONLY untrusted input. Anything that does not name a registered batch is the same
  // 404, thrown while the context is acquired, before the body is read.
  describe('batch id resolution', () => {
    const route1 = mion.route((ctx): string => 'result1');

    beforeEach(async () => {
      mion.initRoutes({route1});
      registerBatches({known: {routes: ['route1']}});
    });

    it('resolves a registered id', async () => {
      const response = await dispatchBatch(getDefaultRequest({route1: []}), 'id=known');
      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
    });

    it('finds the id after another parameter', async () => {
      const response = await dispatchBatch(getDefaultRequest({route1: []}), 'trace=1&id=known');
      expect(response.hasErrors).toBe(false);
    });

    it('decodes a percent-encoded id', () => {
      expect(readBatchId('id=a%2Fb')).toBe('a/b');
    });

    it.each([
      ['no query string', undefined],
      ['no id parameter', 'data=abc'],
      ['an empty id', 'id='],
      ['an unregistered id', 'id=unknown'],
      ['an unregistered id after another parameter', 'trace=1&id=unknown'],
      ['a prototype name', 'id=__proto__'],
      ['a constructor name', 'id=constructor'],
      ['invalid percent-encoding', 'id=%E0%A4%A'],
      ['the known id as a value of another parameter', 'batch=known'],
    ])('refuses %s with batch-unknown-id before the body is read', async (_label, urlQuery) => {
      await expect(dispatchBatch(getDefaultRequest({route1: []}), urlQuery)).rejects.toMatchObject({
        type: 'batch-unknown-id',
        statusCode: StatusCodes.NOT_FOUND,
      });
    });

    it('readBatchId returns undefined for every unreadable form', () => {
      expect(readBatchId(undefined)).toBeUndefined();
      expect(readBatchId('')).toBeUndefined();
      expect(readBatchId('id=')).toBeUndefined();
      expect(readBatchId('id=%E0%A4%A')).toBeUndefined();
      expect(readBatchId('batch=known')).toBeUndefined();
    });
  });

  // ############# registry #############
  describe('batch registry', () => {
    const route1 = mion.route((ctx): string => 'result1');
    const routeX2 = mion.route((ctx, value: number): number => value * 2);

    const routes = {
      route1,
      routeX2,
    } satisfies Routes;

    it('builds the merged chain once per id and reuses it', async () => {
      mion.initRoutes(routes);
      registerBatches({one: {routes: ['route1']}});
      expect(getBatch('one')!.chains.size).toBe(0);

      const request = getDefaultRequest({route1: []});
      await dispatchBatch(request, 'id=one');
      expect(getBatch('one')!.chains.size).toBe(1);
      const firstChain = getBatch('one')!.chains.get('');

      await dispatchBatch(request, 'id=one');
      expect(getBatch('one')!.chains.size).toBe(1);
      expect(getBatch('one')!.chains.get('')).toBe(firstChain);
    });

    it('keeps one chain per tenant under a pathTransform', async () => {
      createMionRouter({
        pathTransform: (req: {headers: {get(name: string): string | null | undefined}}, path: string) =>
          path === '/route1' ? (req.headers.get('x-tenant') === 'x2' ? '/routeX2' : path) : path,
      }).initRoutes(routes);
      registerBatches({one: {routes: ['route1']}});

      const first = await dispatchBatch(getDefaultRequest({route1: []}, {'x-tenant': 'a'}), 'id=one');
      const second = await dispatchBatch(getDefaultRequest({routeX2: [4]}, {'x-tenant': 'x2'}), 'id=one');

      expect(first.body.route1).toBe('result1');
      expect(second.body.routeX2).toBe(8);
      expect(second.body.route1).toBeUndefined();
      expect(getBatch('one')!.chains.size).toBe(2);
      expect([...getBatch('one')!.chains.keys()].sort()).toEqual(['/route1', '/routeX2']);
    });

    it('clearBatches empties the registry', async () => {
      mion.initRoutes(routes);
      registerBatches({one: {routes: ['route1']}, two: {routes: ['route1', 'routeX2']}});
      expect(getBatchIds()).toEqual(['one', 'two']);

      clearBatches();

      expect(getBatchIds()).toEqual([]);
      expect(getBatch('one')).toBeUndefined();
    });

    it('resetRouter empties the registry', async () => {
      mion.initRoutes(routes);
      registerBatches({one: {routes: ['route1']}});
      expect(getBatchIds()).toEqual(['one']);

      resetRouter();

      expect(getBatchIds()).toEqual([]);
    });

    it('re-registering an id replaces the entry and drops its chains', async () => {
      mion.initRoutes(routes);
      registerBatches({one: {routes: ['route1']}});
      await dispatchBatch(getDefaultRequest({route1: []}), 'id=one');
      expect(getBatch('one')!.routes).toEqual(['route1']);
      expect(getBatch('one')!.chains.size).toBe(1);

      registerBatches({one: {routes: ['routeX2']}});

      expect(getBatch('one')!.routes).toEqual(['routeX2']);
      expect(getBatch('one')!.chains.size).toBe(0);
      const response = await dispatchBatch(getDefaultRequest({routeX2: [3]}), 'id=one');
      expect(response.body.routeX2).toBe(6);
      expect(getBatchIds()).toEqual(['one']);
    });

    it('copies the definition so a later mutation of the table does not reach the registry', () => {
      const definition: BatchDefinition = {routes: ['route1'], mappings: []};
      registerBatches({one: definition});
      definition.routes.push('routeX2');
      expect(getBatch('one')!.routes).toEqual(['route1']);
    });

    it('lists the registered ids', () => {
      expect(getBatchIds()).toEqual([]);
      registerBatches({a: {routes: ['route1']}, b: {routes: ['routeX2']}});
      expect(getBatchIds()).toEqual(['a', 'b']);
    });

    it('the metadata route lists the batch ids when all methods are requested', async () => {
      mion.initRoutes({...routes, ...mionClientRoutes});
      registerBatches({a: {routes: ['route1']}, b: {routes: ['route1', 'routeX2']}});

      const methodsId = MION_ROUTES.methodsMetadataById;
      const request = getDefaultRequest({[methodsId]: [[], true]});
      const response = await dispatchRoute(`/${methodsId}`, request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBe(false);
      expect(response.body[methodsId].batches).toEqual(['a', 'b']);
    });

    it('the metadata route omits the batch ids when only some methods are requested', async () => {
      mion.initRoutes({...routes, ...mionClientRoutes});
      registerBatches({a: {routes: ['route1']}});

      const methodsId = MION_ROUTES.methodsMetadataById;
      const request = getDefaultRequest({[methodsId]: [['route1']]});
      const response = await dispatchRoute(`/${methodsId}`, request.body, request.headers, headersFromRecord({}), request, {});

      expect(response.hasErrors).toBe(false);
      expect(response.body[methodsId].batches).toBeUndefined();
    });
  });

  // ############# malformed definitions #############
  // The table is build-generated, so a bad entry is a configuration error: it throws a plain Error
  // at registration (server boot), never an RpcError at request time.
  describe('registerBatches rejects a malformed definition', () => {
    it.each([
      ['an empty id', {'': {routes: ['route1']}}, /empty id/],
      ['a non-object definition', {bad: 'nope' as never}, /expected an object/],
      ['a null definition', {bad: null as never}, /expected an object/],
      ['missing routes', {bad: {} as never}, /`routes` must be a non-empty array/],
      ['empty routes', {bad: {routes: []}}, /`routes` must be a non-empty array/],
      ['a non-array routes', {bad: {routes: 'route1' as never}}, /`routes` must be a non-empty array/],
      ['a non-string route', {bad: {routes: ['route1', 2 as never]}}, /`routes` must be route ids/],
      ['an empty route id', {bad: {routes: ['']}}, /`routes` must be route ids/],
      ['a non-array mappings', {bad: {routes: ['route1'], mappings: 'nope' as never}}, /`mappings` must be an array/],
      ['a non-object mapping', {bad: {routes: ['route1'], mappings: ['nope' as never]}}, /every mapping must be an object/],
      [
        'a non-string mapping field',
        {bad: {routes: ['a', 'b'], mappings: [{fromId: 1 as never, toId: 'b', mapperKey: 'x', paramIndex: 0}]}},
        /must be strings/,
      ],
      [
        'a mapping source outside the batch',
        {bad: {routes: ['a', 'b'], mappings: [{fromId: 'c', toId: 'b', mapperKey: 'x', paramIndex: 0}]}},
        /mapping source 'c' is not a route of the batch/,
      ],
      [
        'a mapping target outside the batch',
        {bad: {routes: ['a', 'b'], mappings: [{fromId: 'a', toId: 'c', mapperKey: 'x', paramIndex: 0}]}},
        /mapping target 'c' is not a route of the batch/,
      ],
    ])('rejects %s', (_label, table, expected) => {
      expect(() => registerBatches(table as Record<string, BatchDefinition>)).toThrow(expected);
      expect(getBatchIds()).toEqual([]);
    });

    // the values that would turn an array index into an arbitrary property write
    it.each<[unknown, string]>([
      ['__proto__', 'prototype pollution'],
      ['length', 'array truncation'],
      ['0', 'a numeric string is still a string'],
      [-1, 'negative'],
      [1.5, 'fractional'],
      [NaN, 'not a number'],
      [null, 'null'],
    ])('rejects paramIndex %s (%s)', (paramIndex) => {
      const table = {
        bad: {routes: ['a', 'b'], mappings: [{fromId: 'a', toId: 'b', mapperKey: 'x', paramIndex: paramIndex as never}]},
      };
      expect(() => registerBatches(table)).toThrow(/paramIndex.*must be a non-negative integer/);
      expect(getBatchIds()).toEqual([]);
    });

    it('names the batch id in the error', () => {
      expect(() => registerBatches({orders: {routes: []}})).toThrow(/batch 'orders' is malformed/);
    });

    it('is a plain Error, not an RpcError', () => {
      let caught: unknown;
      try {
        registerBatches({orders: {routes: []}});
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(RpcError);
    });
  });

  // ############# whole-table replace (what the generated module calls) #############
  describe('replaceBatches', () => {
    const route1 = mion.route((ctx): string => 'result1');

    it('installs exactly the given table, dropping ids absent from it', async () => {
      mion.initRoutes({route1});
      registerBatches({old: {routes: ['route1']}, kept: {routes: ['route1']}});
      await dispatchBatch(getDefaultRequest({route1: []}), 'id=kept');
      expect(getBatch('kept')?.chains.size).toBe(1);

      // the client build rewrote the module: a re-evaluation must leave nothing from before
      replaceBatches({kept: {routes: ['route1']}, added: {routes: ['route1']}});
      expect(getBatchIds().sort()).toEqual(['added', 'kept']);
      // a kept id gets a fresh entry, so its merged chain is rebuilt from the new definition
      expect(getBatch('kept')?.chains.size).toBe(0);
      await expect(dispatchBatch(getDefaultRequest({route1: []}), 'id=old')).rejects.toMatchObject({type: 'batch-unknown-id'});
      const response = await dispatchBatch(getDefaultRequest({route1: []}), 'id=added');
      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
    });

    it('an empty table leaves no batch registered', async () => {
      mion.initRoutes({route1});
      registerBatches({old: {routes: ['route1']}});
      replaceBatches({});
      expect(getBatchIds()).toEqual([]);
    });
  });

  // ############# request body limit #############
  describe('batch body size', () => {
    const echo = mion.route((ctx, text: string): string => text);

    it('resolveBatchMaxBodySize fixes the router limit on the entry at first use', async () => {
      createMionRouter({maxBodySize: 64}).initRoutes({echo});
      registerBatches({one: {routes: ['echo']}});
      const entry = getBatch('one')!;
      expect(entry.maxBodySize).toBeUndefined();
      expect(resolveBatchMaxBodySize(entry)).toBe(64);
      expect(entry.maxBodySize).toBe(64);
    });

    it('resolveBatchMaxBodySize prefers the platform limit when the adapter publishes one', async () => {
      createMionRouter({maxBodySize: 64}).initRoutes({echo});
      setPlatformConfig({maxBodySize: 32});
      registerBatches({one: {routes: ['echo']}});
      expect(resolveBatchMaxBodySize(getBatch('one')!)).toBe(32);
    });

    it('resolveBatchMaxBodySize keeps the limit once fixed', async () => {
      createMionRouter({maxBodySize: 64}).initRoutes({echo});
      registerBatches({one: {routes: ['echo']}});
      const entry = getBatch('one')!;
      entry.maxBodySize = 10;
      expect(resolveBatchMaxBodySize(entry)).toBe(10);
    });

    it('a batch body one byte over the limit is refused, a body at the limit passes', async () => {
      const body = JSON.stringify({echo: ['hello']});
      createMionRouter({maxBodySize: body.length}).initRoutes({echo});
      registerBatches({one: {routes: ['echo']}});

      const atLimit = await dispatchBatch({headers: headersFromRecord({}), body}, 'id=one');
      expect(atLimit.hasErrors).toBe(false);
      expect(atLimit.body.echo).toBe('hello');

      const overLimit = await dispatchBatch({headers: headersFromRecord({}), body: body + ' '}, 'id=one');
      expect(overLimit.statusCode).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
      expect(thrownErrors(overLimit)['mionDeserializeRequest'].type).toBe('request-payload-too-large');
      expect(overLimit.headers.get('x-rpc-error')).toBe('request-payload-too-large');
    });

    it('a batch reads the limit fixed on its entry, not the router option', async () => {
      const body = JSON.stringify({echo: ['hello']});
      createMionRouter({maxBodySize: 1_000_000}).initRoutes({echo});
      registerBatches({one: {routes: ['echo']}});
      getBatch('one')!.maxBodySize = body.length - 1;

      const response = await dispatchBatch({headers: headersFromRecord({}), body}, 'id=one');
      expect(response.statusCode).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
      expect(thrownErrors(response)['mionDeserializeRequest'].type).toBe('request-payload-too-large');
    });
  });

  describe('scoped middleFns in batches', () => {
    const route1 = mion.route((ctx): string => 'result1');
    const route2 = mion.route((ctx): string => 'result2');
    const route3 = mion.route((ctx): string => 'result3');

    const scopedMiddleFn = mion.middleFn((ctx): void => {
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

    const chainMethodIds = (id: string) =>
      getBatch(id)!
        .chains.get('')!
        .methods.filter((m) => ['route1', 'other/scopedMiddleFn', 'other/route2', 'route3'].includes(m.id))
        .map((m) => m.id);

    it('should include scoped middleFn when route from that scope is called', async () => {
      createMionRouter({contextDataFactory: () => ({scopedMiddleFnCalled: 0})}).initRoutes(routes);
      registerBatches({mixed: {routes: ['route1', 'other/route2', 'route3']}});

      const request = getDefaultRequest({
        route1: [],
        'other/route2': [],
        route3: [],
      });
      const response = await dispatchBatch(request, 'id=mixed');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body['other/route2']).toBe('result2');
      expect(response.body.route3).toBe('result3');

      // The scopedMiddleFn should appear in the merged methods (with path prefix)
      const chain = getBatch('mixed')!.chains.get('')!;
      expect(chain.methods.find((m) => m.id === 'other/scopedMiddleFn')).toBeDefined();

      // Verify execution order: route1, other/scopedMiddleFn, other/route2, route3
      expect(chainMethodIds('mixed')).toEqual(['route1', 'other/scopedMiddleFn', 'other/route2', 'route3']);
    });

    it('should maintain correct order when scoped route is called first', async () => {
      createMionRouter({contextDataFactory: () => ({scopedMiddleFnCalled: 0})}).initRoutes(routes);
      registerBatches({scopedFirst: {routes: ['other/route2', 'route1', 'route3']}});

      const request = getDefaultRequest({
        'other/route2': [],
        route1: [],
        route3: [],
      });
      const response = await dispatchBatch(request, 'id=scopedFirst');

      expect(response.hasErrors).toBe(false);
      expect(response.body['other/route2']).toBe('result2');
      expect(response.body.route1).toBe('result1');
      expect(response.body.route3).toBe('result3');

      // Verify execution order: other/scopedMiddleFn, other/route2, route1, route3
      expect(chainMethodIds('scopedFirst')).toEqual(['other/scopedMiddleFn', 'other/route2', 'route1', 'route3']);
    });

    it('should not include scoped middleFn when no routes from that scope are called', async () => {
      createMionRouter({contextDataFactory: () => ({scopedMiddleFnCalled: 0})}).initRoutes(routes);
      registerBatches({unscoped: {routes: ['route1', 'route3']}});

      const request = getDefaultRequest({
        route1: [],
        route3: [],
      });
      const response = await dispatchBatch(request, 'id=unscoped');

      expect(response.hasErrors).toBe(false);
      expect(response.body.route1).toBe('result1');
      expect(response.body.route3).toBe('result3');

      // The scopedMiddleFn should NOT appear in the merged methods (with path prefix)
      const chain = getBatch('unscoped')!.chains.get('')!;
      expect(chain.methods.find((m) => m.id === 'other/scopedMiddleFn')).toBeUndefined();
    });
  });

  // ############# input mappings #############
  describe('batch input mappings', () => {
    const source = mion.route((ctx): {id: number} => ({id: 7}));
    const target = mion.route((ctx, id: number | null): number => (id ?? -1) * 10);
    const mapperRoutes = {source, target} satisfies Routes;

    const withMapping = (mapperKey: string, paramIndex = 0): BatchDefinition => ({
      routes: ['source', 'target'],
      mappings: [{fromId: 'source', toId: 'target', mapperKey, paramIndex}],
    });

    beforeEach(async () => {
      mion.initRoutes(mapperRoutes);
    });

    it('feeds the source output into the target param through an allow-listed mapper', async () => {
      // the name lane: the server registers the mapper with RunTypes and opts the key in
      registerPureFn('mionjs::batchSpecToId', (value: {id: number}) => value.id);
      allowInputMapper(inputMapperKey('batchSpecToId'));
      registerBatches({mapped: withMapping(inputMapperKey('batchSpecToId'))});

      const response = await dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=mapped');

      expect(response.hasErrors).toBe(false);
      expect(response.body.source).toEqual({id: 7});
      expect(response.body.target).toBe(70);

      // the mapping step sits between the two routes in the merged chain
      const ids = getBatch('mapped')!
        .chains.get('')!
        .methods.map((m) => m.id);
      const sourceIndex = ids.indexOf('source');
      const targetIndex = ids.indexOf('target');
      const mappingIndex = ids.findIndex((id) => id.startsWith('mionInputFrom_'));
      expect(sourceIndex).toBeLessThan(mappingIndex);
      expect(mappingIndex).toBeLessThan(targetIndex);
    });

    it('a source that returns a DECLARED error answers the target with batch-mapping-source-failed and skips its handler', async () => {
      let targetRuns = 0;
      const failingSource = mion.route(
        (ctx): {id: number} | RpcError<'source-error'> => new RpcError({type: 'source-error', publicMessage: 'no source'})
      );
      const countingTarget = mion.route((ctx, id: number | null): number => {
        targetRuns++;
        return (id ?? -1) * 10;
      });
      resetRouter();
      mion.initRoutes({source: failingSource, target: countingTarget});
      registerPureFn('mionjs::batchSpecSourceFailed', (value: {id: number}) => value.id);
      allowInputMapper(inputMapperKey('batchSpecSourceFailed'));
      registerBatches({sourceFailed: withMapping(inputMapperKey('batchSpecSourceFailed'))});

      const response = await dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=sourceFailed');

      // a returned error is a declared response, never a thrown one: the batch keeps going
      expect(response.hasErrors).toBe(false);
      // a union return travels as its `[index, value]` envelope once serialized
      const unwrap = (value: unknown): RpcError<string> => (Array.isArray(value) ? value[1] : value) as RpcError<string>;
      expect(unwrap(response.body.source).type).toBe('source-error');
      const targetError = unwrap(response.body.target);
      expect(targetError.type).toBe('batch-mapping-source-failed');
      expect(targetError.publicMessage).toContain("'source'");
      expect(targetError.publicMessage).toContain("'target'");
      expect(targetRuns).toBe(0);
      // the route's own RemoteMethod was copied, never mutated: a plain call still runs the handler
      const plain = await dispatchRoute(
        '/target',
        JSON.stringify({target: [4]}),
        headersFromRecord({}),
        headersFromRecord({}),
        {},
        {}
      );
      expect(plain.body.target).toBe(40);
      expect(targetRuns).toBe(1);
    });

    it('a mapper that THROWS is the typed batch-mapper-failed fatal, without the registry key', async () => {
      registerPureFn('mionjs::batchSpecThrowing', (value: {id: number}): number => {
        throw new Error('boom ' + value.id);
      });
      allowInputMapper(inputMapperKey('batchSpecThrowing'));
      registerBatches({throwing: withMapping(inputMapperKey('batchSpecThrowing'))});

      const response = await dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=throwing');

      expect(response.hasErrors).toBe(true);
      const thrown = Object.values(thrownErrors(response));
      expect(thrown).toHaveLength(1);
      expect(thrown[0].type).toBe('batch-mapper-failed');
      expect(thrown[0].publicMessage).toContain("'target'");
      expect(thrown[0].publicMessage).not.toContain('mionjs::');
      expect(thrown[0].publicMessage).not.toContain('boom');
      // the target never ran
      expect(response.body.target).toBeUndefined();
    });

    // ############# mapper gate (security) #############
    // The table names a registry key; the allow-list in core/src/runtypes/inputMappers.ts is the
    // only gate on what that key may resolve. core pins the gate itself; this pins it at the point
    // that matters, a real request driven through the router.
    it('rejects a mapper that exists in the registry but was never allow-listed', async () => {
      // present in the SHARED registry, but registered outside any mion lane: exactly the case the
      // gate exists for (a built-in, another library's entry, or one restored from a
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
      registerBatches({sneaky: withMapping('rt::routerSneakyMapper')});

      // rejected while building the execution chain: the mapper is never resolved, never run
      await expect(dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=sneaky')).rejects.toMatchObject({
        type: 'batch-mapper-not-allowed',
        publicMessage: "Input mapper 'rt::routerSneakyMapper' is not registered on the server.",
      });
      expect(getBatch('sneaky')!.chains.size).toBe(0);
    });

    it('rejects a mapper that is not in the registry at all', async () => {
      registerBatches({missing: withMapping('mionjs::doesNotExist')});

      await expect(dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=missing')).rejects.toMatchObject({
        type: 'batch-mapper-not-allowed',
        publicMessage: "Input mapper 'mionjs::doesNotExist' is not registered on the server.",
      });
    });

    // ############# paramIndex arity (security) #############
    // paramIndex is written straight into an array, `params[mapping.paramIndex] = value`. The
    // shape check at registration keeps it a non-negative integer; the UPPER bound needs the
    // target route's arity, so it lands while the chain is built. Either way, nothing runs.
    it('rejects a paramIndex past the target route arity', async () => {
      // structurally fine, semantically impossible: target takes 1 param, so 999 would write
      // 998 empty slots into the params array
      registerBatches({outOfRange: withMapping('mionjs::doesNotExist', 999)});

      await expect(dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=outOfRange')).rejects.toMatchObject({
        type: 'batch-mapping-invalid-param-index',
        publicMessage: "Mapping paramIndex 999 is out of range for target route 'target', which takes 1 parameter(s).",
      });
    });

    it('rejects a paramIndex equal to the target route arity', async () => {
      registerBatches({atArity: withMapping('mionjs::doesNotExist', 1)});

      await expect(dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=atArity')).rejects.toMatchObject({
        type: 'batch-mapping-invalid-param-index',
      });
    });

    // A mapping may name a route of the batch (registration checks that) which the server maps
    // away from the merged chain, e.g. a pathTransform that folds two routes into one: the
    // mapping source or target is then missing from the chain and the batch is refused.
    it('rejects a mapping whose source is not in the merged chain', async () => {
      resetRouter();
      createMionRouter({pathTransform: (req, path) => (path === '/source' ? '/target' : path)}).initRoutes(mapperRoutes);
      registerBatches({folded: withMapping('mionjs::doesNotExist')});

      await expect(dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=folded')).rejects.toMatchObject({
        type: 'batch-mapping-invalid-source',
      });
    });

    it('rejects a mapping whose target is not in the merged chain', async () => {
      resetRouter();
      createMionRouter({pathTransform: (req, path) => (path === '/target' ? '/source' : path)}).initRoutes(mapperRoutes);
      registerBatches({folded: withMapping('mionjs::doesNotExist')});

      await expect(dispatchBatch(getDefaultRequest({source: [], target: [null]}), 'id=folded')).rejects.toMatchObject({
        type: 'batch-mapping-invalid-target',
      });
    });
  });
});
