/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutable} from '../../src/router.ts';
import {dispatchRoute} from '../../src/dispatch.ts';
import {headersFromRecord} from '../../src/lib/headers.ts';
import {registerBatches} from '../../src/batches.ts';
import {BUILD_VERSION_HEADER, MION_BATCH_PATH, MION_ROUTES, RpcError} from '@mionjs/core';
import type {SerializableMethodsData} from '@mionjs/core';
import type {RouterOptionsInput} from '../../src/types/mionRouter.ts';
import type {RouteSyncErrorData} from '../../src/routes/syncRoutes.routes.ts';

function dispatch(path: string, body: unknown, urlQuery?: string) {
  const headers = headersFromRecord({});
  const raw = JSON.stringify(body);
  return dispatchRoute(path, raw, headers, headersFromRecord({}), {headers, body: raw}, {}, undefined, urlQuery);
}

/** `RouteSyncError | void` is still a union to the encoder, so the answer is an `[index, value]` envelope. */
function syncSlot(response: Awaited<ReturnType<typeof dispatch>>): RpcError<string> | undefined {
  const slot = response.body[MION_ROUTES.syncRoutes] as unknown;
  return (Array.isArray(slot) ? slot[1] : slot) as RpcError<string> | undefined;
}
let calls: string[];

function initApi(options: RouterOptionsInput, buildVersion = 'abc123') {
  const mion = createMionRouter(options);
  const auth = mion.middleware((ctx, token: string): void => {
    calls.push(`auth:${token}`);
  });
  const hello = mion.route((ctx, name: string): string => {
    calls.push('hello');
    return `Hello ${name}`;
  });
  // types unlike hello's, or the two share a sync id
  const bye = mion.route((ctx, name: string, polite?: boolean): string => {
    calls.push('bye');
    return `Bye ${name}`;
  });
  mion.initRoutes({auth, hello, bye}, buildVersion);
}

/** What a client holding the server's rows sends. */
function syncIdFromRows(id: string, data: SerializableMethodsData): string | undefined {
  return data.methods[id].syncId;
}

describe('mion@syncRoutes', () => {
  beforeEach(() => {
    resetRouter();
    calls = [];
  });

  describe('the API version header', () => {
    it('is sent by the middleware on a route and on a not-found answer', async () => {
      initApi({});
      const found = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      expect(found.headers.get(BUILD_VERSION_HEADER)).toBe('abc123');
      const notFound = await dispatch('/nope', {});
      expect(notFound.headers.get(BUILD_VERSION_HEADER)).toBe('abc123');
    });

    // No literal: the build fills the slot from this file's routes, so the JS suite runs the whole pipeline.
    it('carries the version the build injects when the call leaves the slot empty', async () => {
      const mion = createMionRouter();
      const hello = mion.route((ctx, name: string): string => name);
      mion.initRoutes({hello});
      const response = await dispatch('/hello', {hello: ['Ana']});
      expect(response.headers.get(BUILD_VERSION_HEADER)).toMatch(/^[A-Za-z0-9]{12}$/);
    });

    it('is not sent with apiVersionCheck off', async () => {
      initApi({apiVersionCheck: false});
      const response = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      expect(response.headers.get(BUILD_VERSION_HEADER)).toBeFalsy();
    });

    it('is not in a route chain when neither option needs it', async () => {
      initApi({apiVersionCheck: false});
      const chain = getRouteExecutable('hello');
      expect(chain).toBeDefined();
      const response = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      expect(response.body[MION_ROUTES.syncRoutes]).toBeUndefined();
      expect(calls).toEqual(['auth:t', 'hello']);
    });
  });

  describe('with syncRoutes off', () => {
    it('ignores any ids and runs the call', async () => {
      initApi({});
      const response = await dispatch('/hello', {[MION_ROUTES.syncRoutes]: [['wrong1']], auth: ['t'], hello: ['Ana']});
      expect(response.body.hello).toBe('Hello Ana');
      expect(calls).toEqual(['auth:t', 'hello']);
    });
  });

  describe('with syncRoutes on', () => {
    it('refuses a call with no ids, runs nothing, and sends the rows of the route and its chain', async () => {
      initApi({syncRoutes: true});
      const response = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      const refusal = syncSlot(response)!;
      expect(refusal).toMatchObject({type: 'route-sync-required'});
      const rows = (refusal.errorData as RouteSyncErrorData).metadata!;
      expect(Object.keys(rows.methods).sort()).toEqual(['auth', 'hello']);
      expect(calls).toEqual([]);
      expect(response.body.hello).toBeUndefined();
    });

    it('sends every handler with the sync id the build gave it', async () => {
      initApi({syncRoutes: true});
      const refused = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      const rows = (syncSlot(refused)!.errorData as RouteSyncErrorData).metadata!;
      expect(rows.methods.hello.syncId).toBe(getRouteExecutable('hello')!.syncId);
      expect(rows.methods.hello.syncId).toBeTruthy();
      expect(rows.methods.auth.syncId).toBeTruthy();
      expect(rows.methods.auth.syncId).not.toBe(rows.methods.hello.syncId);
    });

    it('runs a call whose id the client read from those rows', async () => {
      initApi({syncRoutes: true});
      const refused = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      const syncId = syncIdFromRows('hello', (syncSlot(refused)!.errorData as RouteSyncErrorData).metadata!);
      const response = await dispatch('/hello', {[MION_ROUTES.syncRoutes]: [[syncId]], auth: ['t'], hello: ['Ana']});
      expect(response.body.hello).toBe('Hello Ana');
      expect(calls).toEqual(['auth:t', 'hello']);
      expect(response.headers.get(BUILD_VERSION_HEADER)).toBe('abc123');
    });

    it('refuses a call whose id differs, runs nothing, and names the route', async () => {
      initApi({syncRoutes: true});
      const response = await dispatch('/hello', {[MION_ROUTES.syncRoutes]: [['wrong1']], auth: ['t'], hello: ['Ana']});
      expect(syncSlot(response)).toMatchObject({type: 'route-types-mismatch', errorData: {routeIds: ['hello']}});
      expect(calls).toEqual([]);
    });

    it('never checks mion routes a client calls without ids', async () => {
      initApi({syncRoutes: true});
      const response = await dispatch('/nope', {});
      expect(syncSlot(response)).toBeUndefined();
    });

    it('checks one id per route of a batch, in call order', async () => {
      initApi({syncRoutes: true});
      registerBatches({pair: {routes: ['hello', 'bye']}});
      const refused = await dispatch(MION_BATCH_PATH, {auth: ['t'], hello: ['Ana'], bye: ['Ana', true]}, 'id=pair');
      const rows = (syncSlot(refused)!.errorData as RouteSyncErrorData).metadata!;
      expect(Object.keys(rows.methods).sort()).toEqual(['auth', 'bye', 'hello']);
      const ids = [syncIdFromRows('hello', rows), syncIdFromRows('bye', rows)];

      const swapped = await dispatch(
        MION_BATCH_PATH,
        {[MION_ROUTES.syncRoutes]: [[ids[1], ids[0]]], hello: ['Ana'], bye: ['Ana', true]},
        'id=pair'
      );
      expect(syncSlot(swapped)).toMatchObject({type: 'route-types-mismatch', errorData: {routeIds: ['hello', 'bye']}});
      expect(calls).toEqual([]);

      const response = await dispatch(
        MION_BATCH_PATH,
        {[MION_ROUTES.syncRoutes]: [ids], auth: ['t'], hello: ['Ana'], bye: ['Ana']},
        'id=pair'
      );
      expect(syncSlot(response)).toBeUndefined();
      expect(calls).toEqual(['auth:t', 'hello', 'bye']);
    });
  });
});
