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
import {mionSyncRoutes} from '../../middlewares.ts';
import {MION_BATCH_PATH, RpcError} from '@mionjs/core';
import type {SerializableMethodsData} from '@mionjs/core';
import type {RouteSyncErrorData} from '@mionjs/core/middlewares';

const SYNC = 'mionSyncRoutes';

function dispatch(path: string, body: unknown, urlQuery?: string) {
  const headers = headersFromRecord({});
  const raw = JSON.stringify(body);
  return dispatchRoute(path, raw, headers, headersFromRecord({}), {headers, body: raw}, {}, undefined, urlQuery);
}

/** `RouteSyncError | void` is still a union to the encoder, so the answer is an `[index, value]` envelope. */
function syncSlot(response: Awaited<ReturnType<typeof dispatch>>): RpcError<string> | undefined {
  const slot = response.body[SYNC] as unknown;
  return (Array.isArray(slot) ? slot[1] : slot) as RpcError<string> | undefined;
}
let calls: string[];

function initApi(withSync: boolean) {
  const mion = createMionRouter();
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
  mion.initRoutes(withSync ? {mionSyncRoutes, auth, hello, bye} : {auth, hello, bye}, 'abc123');
}

/** What a client holding the server's rows sends. */
function syncIdFromRows(id: string, data: SerializableMethodsData): string | undefined {
  return data.methods[id].syncId;
}

describe('mionSyncRoutes', () => {
  beforeEach(() => {
    resetRouter();
    calls = [];
  });

  describe('left out of the routes', () => {
    it('ignores any ids and runs the call', async () => {
      initApi(false);
      const response = await dispatch('/hello', {[SYNC]: [['wrong1']], auth: ['t'], hello: ['Ana']});
      expect(response.body.hello).toBe('Hello Ana');
      expect(response.body[SYNC]).toBeUndefined();
      expect(calls).toEqual(['auth:t', 'hello']);
    });
  });

  describe('placed in the routes', () => {
    it('is a middleware of every route, listed in its chain like any other', () => {
      initApi(true);
      expect(getRouteExecutable('hello')!.middlewareIds).toContain(SYNC);
    });

    it('refuses a call with no ids, runs nothing, and sends the rows of the route and its chain', async () => {
      initApi(true);
      const response = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      const refusal = syncSlot(response)!;
      expect(refusal).toMatchObject({type: 'route-sync-required'});
      const rows = (refusal.errorData as RouteSyncErrorData).metadata!;
      expect(Object.keys(rows.methods).sort()).toEqual(['auth', 'hello', SYNC]);
      expect(calls).toEqual([]);
      expect(response.body.hello).toBeUndefined();
    });

    it('sends every handler with the sync id the build gave it', async () => {
      initApi(true);
      const refused = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      const rows = (syncSlot(refused)!.errorData as RouteSyncErrorData).metadata!;
      expect(rows.methods.hello.syncId).toBe(getRouteExecutable('hello')!.syncId);
      expect(rows.methods.hello.syncId).toBeTruthy();
      expect(rows.methods.auth.syncId).toBeTruthy();
      expect(rows.methods.auth.syncId).not.toBe(rows.methods.hello.syncId);
    });

    it('runs a call whose id the client read from those rows', async () => {
      initApi(true);
      const refused = await dispatch('/hello', {auth: ['t'], hello: ['Ana']});
      const syncId = syncIdFromRows('hello', (syncSlot(refused)!.errorData as RouteSyncErrorData).metadata!);
      const response = await dispatch('/hello', {[SYNC]: [[syncId]], auth: ['t'], hello: ['Ana']});
      expect(response.body.hello).toBe('Hello Ana');
      expect(calls).toEqual(['auth:t', 'hello']);
    });

    it('refuses a call whose id differs, runs nothing, and names the route', async () => {
      initApi(true);
      const response = await dispatch('/hello', {[SYNC]: [['wrong1']], auth: ['t'], hello: ['Ana']});
      expect(syncSlot(response)).toMatchObject({type: 'route-types-mismatch', errorData: {routeIds: ['hello']}});
      expect(calls).toEqual([]);
    });

    it('never checks a call that names no route', async () => {
      initApi(true);
      const response = await dispatch('/nope', {});
      expect(syncSlot(response)).toBeUndefined();
    });

    it('checks one id per route of a batch, in call order', async () => {
      initApi(true);
      registerBatches({pair: {routes: ['hello', 'bye']}});
      const refused = await dispatch(MION_BATCH_PATH, {auth: ['t'], hello: ['Ana'], bye: ['Ana', true]}, 'id=pair');
      const rows = (syncSlot(refused)!.errorData as RouteSyncErrorData).metadata!;
      expect(Object.keys(rows.methods).sort()).toEqual(['auth', 'bye', 'hello', SYNC]);
      const ids = [syncIdFromRows('hello', rows), syncIdFromRows('bye', rows)];

      const swapped = await dispatch(
        MION_BATCH_PATH,
        {[SYNC]: [[ids[1], ids[0]]], hello: ['Ana'], bye: ['Ana', true]},
        'id=pair'
      );
      expect(syncSlot(swapped)).toMatchObject({type: 'route-types-mismatch', errorData: {routeIds: ['hello', 'bye']}});
      expect(calls).toEqual([]);

      const response = await dispatch(MION_BATCH_PATH, {[SYNC]: [ids], auth: ['t'], hello: ['Ana'], bye: ['Ana']}, 'id=pair');
      expect(syncSlot(response)).toBeUndefined();
      expect(calls).toEqual(['auth:t', 'hello', 'bye']);
    });
  });
});

describe("a routes key that names one of mion's own middlewares", () => {
  beforeEach(() => resetRouter());

  it('throws instead of silently reusing the internal one', () => {
    const mion = createMionRouter();
    const shadow = mion.middleware((ctx): void => undefined);
    const hello = mion.route((ctx): string => 'hi');
    expect(() => mion.initRoutes({'mion@methodsMetadata': shadow, hello})).toThrow(/reserved mion middleware name/);
  });
});
