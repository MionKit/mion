/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A client built against `oldRoutes` calls a server that moved on to `newRoutes`, both ends running route sync.
// Both route sets live here and the server runs in this process: the router is reset between the two.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createServer, type Server} from 'node:http';
import {routesCache} from '@mionjs/core';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {MionRouter, PublicApi} from '@mionjs/router';
import {mionSyncRoutes} from '@mionjs/router/middlewares';
import {httpRequestHandler} from '@mionjs/platform-node';
import {initClient} from '../../src/client.ts';
import type {RouteSubRequest} from '../../src/types.ts';
import {resetBundledApi} from '../../src/lib/bundledApi.ts';
import {useSyncRoutes} from '../../src/middlewares/syncRoutes.ts';
import {resetApiBuildVersion} from '../../src/lib/apiBuildVersion.ts';
import {resetApiVersionRecovery} from '../../src/lib/apiVersionRecovery.ts';
import {resetMetadataStore} from '../../src/lib/metadataStore.ts';
import {flushMetadataCache, resetMetadataCacheState} from '../../src/lib/clientMethodsMetadata.ts';

const options = {skipClientRoutes: false} as const;
type Mion = MionRouter<typeof options>;

/** How many times each handler ran: a refused call leaves its count alone. */
const handlerCalls: Record<string, number> = {};
const count = (id: string) => (handlerCalls[id] = (handlerCalls[id] ?? 0) + 1);

/** What the client was built against. */
const oldRoutes = (mion: Mion) => ({
  mionSyncRoutes,
  same: mion.route((ctx, value: number): number => (count('same'), value + 1)),
  paramsChanged: mion.route((ctx, name: string): string => (count('paramsChanged'), name)),
  returnChanged: mion.route((ctx, name: string): string => (count('returnChanged'), name)),
  optionsChanged: mion.query((ctx, value: number): number => (count('optionsChanged'), value)),
  parserChanged: mion.route((ctx, name: string): {name: string} => (count('parserChanged'), {name})),
  stored: mion.route((ctx, value: number): number => (count('stored'), value)),
  secured: {
    token: mion.middleware((ctx, token: string): void => undefined),
    data: mion.route((): string => (count('secured/data'), 'secret')),
  },
});

/** What the server runs now: each route differs from the old one in one way, or not at all. */
const newRoutes = (mion: Mion) => ({
  mionSyncRoutes,
  same: mion.route((ctx, value: number): number => (count('same'), value + 1)),
  paramsChanged: mion.route((ctx, name: string, age: number): string => (count('paramsChanged'), `${name} ${age}`)),
  returnChanged: mion.route((ctx, name: string): number => (count('returnChanged'), name.length)),
  // query to mutation: GET becomes POST, the types stay
  optionsChanged: mion.mutation((ctx, value: number): number => (count('optionsChanged'), value * 2)),
  // same types, other bytes on the wire
  parserChanged: mion.route((ctx, name: string): {name: string} => (count('parserChanged'), {name}), {parser: 'compact'}),
  stored: mion.route((ctx, value: number): string => (count('stored'), `${value}`)),
  added: mion.route((): string => 'new'),
  secured: {
    token: mion.middleware((ctx, token: number): void => undefined),
    data: mion.route((): string => (count('secured/data'), 'secret')),
  },
});

type OldApi = PublicApi<ReturnType<typeof oldRoutes>>;

let server: Server;
let baseURL: string;
const realFetch = globalThis.fetch;
let fetches = 0;

/** Explicit versions keep these two APIs out of the lane's own version check (MET007), which is one API per program. */
function serve(routes: typeof oldRoutes | typeof newRoutes, version: string) {
  resetRouter();
  const mion = createMionRouter(options);
  mion.initRoutes(routes(mion), version);
}

/** A page reload: no row in memory survives, the stored ones do. Compiled functions stay: the server shares them here. */
function reloadClient() {
  for (const id of Object.keys(routesCache.getCache())) routesCache.removeMetadata(id);
  resetMetadataCacheState();
  resetBundledApi();
  resetApiBuildVersion();
  resetApiVersionRecovery();
  // what the build injects for OldApi, spelled out for the same reason as in `serve`
  const client = initClient<OldApi>({baseURL, storageEngine: 'memory'}, 'old');
  useSyncRoutes(client.middlewares.mionSyncRoutes);
  return client;
}

/** A call site the build cannot see, so its route is fetched rather than bundled. */
function callWide(subRequest: RouteSubRequest<any>) {
  return subRequest.call();
}

async function counted<T>(run: () => Promise<T>): Promise<{value: T; fetches: number}> {
  const before = fetches;
  const value = await run();
  return {value, fetches: fetches - before};
}

describe('a client built against routes the server has since changed', () => {
  beforeAll(async () => {
    await resetMetadataStore();
    serve(oldRoutes, 'old');
    server = createServer(httpRequestHandler);
    await new Promise<void>((done) => server.listen(0, done));
    baseURL = `http://localhost:${(server.address() as {port: number}).port}`;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => (fetches++, realFetch(...args))) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    resetRouter();
    await resetMetadataStore();
  });

  describe('while the server runs the same routes', () => {
    it('sends the ids with the first call', async () => {
      const same = await counted(() => reloadClient().routes.same(1).call());
      expect(same.value[0]).toBe(2);
      expect(same.fetches).toBe(1);
    });

    it("refuses a fetched route's first call once, for its ids, then sends them", async () => {
      const {routes} = reloadClient();
      const first = await counted(() => callWide(routes.stored(3)));
      expect(first.value[0]).toBe(3);
      expect(first.fetches).toBe(2);
      const second = await counted(() => callWide(routes.stored(3)));
      expect(second.fetches).toBe(1);
      // kept for the reload after the server changes
      await flushMetadataCache();
    });
  });

  describe('after the server changed its routes', () => {
    beforeAll(() => serve(newRoutes, 'new'));

    it('runs an unchanged route in one request', async () => {
      const same = await counted(() => reloadClient().routes.same(1).call());
      expect(same.value[0]).toBe(2);
      expect(same.fetches).toBe(1);
    });

    it('runs a route whose options changed, and ignores a route the server added', async () => {
      const [value, , undeclared] = await reloadClient().routes.optionsChanged(2).call();
      expect(value).toBe(4);
      expect(undeclared).toBeUndefined();
    });

    // one literal call site each, so the build bundles the old row for it
    it.each([
      ['params', 'paramsChanged', () => reloadClient().routes.paramsChanged('Ana').call()],
      ['return', 'returnChanged', () => reloadClient().routes.returnChanged('Ana').call()],
      ['wire format', 'parserChanged', () => reloadClient().routes.parserChanged('Ana').call()],
    ] as [string, string, () => Promise<readonly unknown[]>][])(
      'refuses a bundled route whose %s changed: nothing to relearn, so no resend and no handler run',
      async (_, id, call) => {
        const before = handlerCalls[id];
        const refused = await counted(call);
        expect(refused.value[0]).toBeUndefined();
        // a middleware's returned error: its own slot, never the undeclared one
        expect((refused.value[4] as Record<string, unknown> | undefined)?.mionSyncRoutes).toMatchObject({
          type: 'route-types-mismatch',
          errorData: {routeIds: [id]},
        });
        expect(refused.value[2]).toBeUndefined();
        expect(refused.fetches).toBe(1);
        expect(handlerCalls[id]).toBe(before);
      }
    );

    it("checks the route only: a changed middleware is answered by the middleware's own validation", async () => {
      const before = handlerCalls['secured/data'];
      const {routes, middlewares} = reloadClient();
      middlewares.secured.token.onRequest((token) => token('t'));
      const result = await routes.secured.data().call();
      expect(result[4]?.mionSyncRoutes).toBeUndefined();
      expect(result[4]?.['secured/token']).toMatchObject({type: 'validation-error'});
      expect(handlerCalls['secured/data']).toBe(before);
    });

    it('relearns a saved row older than the server instead of refusing it on every reload', async () => {
      const relearned = await counted(() => callWide(reloadClient().routes.stored(3)));
      expect(relearned.value[0]).toBe('3');
      expect(relearned.value[2]).toBeUndefined();
      expect(relearned.value[4]?.mionSyncRoutes).toBeUndefined();
      // refused for the stale id, the fresh row fetched, then sent with the fresh id
      expect(relearned.fetches).toBe(3);
      // and saved: the next page load sends the fresh id straight away
      await flushMetadataCache();
      const afterReload = await counted(() => callWide(reloadClient().routes.stored(3)));
      expect(afterReload.value[0]).toBe('3');
      expect(afterReload.fetches).toBe(1);
    });

    it('relearns a row this page fetched before the server changed it', async () => {
      await resetMetadataStore();
      serve(oldRoutes, 'old');
      const {routes} = reloadClient();
      await callWide(routes.stored(3));
      const learned = routesCache.getMetadata('stored')!;
      serve(newRoutes, 'new');
      // this process's router writes its own rows into the client's table: put back what the page learned
      routesCache.setMetadata('stored', learned);

      const relearned = await counted(() => callWide(routes.stored(3)));
      expect(relearned.value[0]).toBe('3');
      expect(relearned.value[2]).toBeUndefined();
      expect(relearned.value[4]?.mionSyncRoutes).toBeUndefined();
      expect(relearned.fetches).toBe(3);
    });
  });
});
