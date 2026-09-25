/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {FatalError, resetRoutesCache} from '@mionjs/core';
import type {MethodWithOptsAndJitFns} from '@mionjs/core';
import type {RouteSyncError, SyncRoutesHandler} from '@mionjs/core/middlewares';
import type {CallContext, ClientMiddlewareOf, ClientOptions, MiddlewareContext, SubRequest} from '../../src/types.ts';
import {useSyncRoutes} from '../../src/middlewares/syncRoutes.ts';
import {installMethodRows, resetMetadataCacheState} from '../../src/lib/clientMethodsMetadata.ts';
import {hasMethod, resetBundledMethods, setBundledMethod} from '../../src/lib/methods.ts';
import {HandlersRegistry} from '../../src/lib/handlersRegistry.ts';
import {TypedEvent} from '../../src/lib/typedEvent.ts';
import {DEFAULT_CLIENT_OPTIONS} from '../../src/constants.ts';
import {methodRow} from '../lib/testUtils.ts';

const options = {...DEFAULT_CLIENT_OPTIONS, baseURL: 'http://x', storageEngine: 'memory'} as ClientOptions;
const ID = 'mionSyncRoutes';

/** Installs through the real hook registry, as `initClient`'s middlewares do. */
function installed() {
  const registry = new HandlersRegistry();
  const middleware = new TypedEvent(ID, registry, () => ({}) as SubRequest<any>);
  useSyncRoutes(middleware as unknown as ClientMiddlewareOf<SyncRoutesHandler>);
  const sent = (context: Partial<CallContext>) => {
    let ids: string[] | undefined;
    registry.getRequestHandler(ID)!.handler((value?: string[]) => (ids = value), {options, subRequestList: {}, ...context});
    return ids;
  };
  const onError = (refusal: RouteSyncError, context: MiddlewareContext) => registry.executeHandler(ID, refusal, context);
  return {sent, onError};
}

const refusal = (type: RouteSyncError['type'], errorData: RouteSyncError['errorData']) =>
  new FatalError({type, publicMessage: type, errorData}) as RouteSyncError;

const contextFor = (routeId: string, retry: () => boolean) =>
  ({options, subRequestList: {}, route: {id: routeId}, retry}) as unknown as MiddlewareContext;

describe('useSyncRoutes', () => {
  const realFetch = globalThis.fetch;
  let fetches: number;

  beforeEach(() => {
    resetRoutesCache();
    resetBundledMethods();
    resetMetadataCacheState();
    fetches = 0;
    globalThis.fetch = (async () => {
      fetches++;
      const rows = {methods: {users: methodRow('users', 'fresh')}, deps: {}, purFnDeps: {}};
      return new Response(JSON.stringify({'mion@methodsMetadataById': rows}), {headers: {'content-type': 'application/json'}});
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("sends each route's own id from its row, and '' for a row without one or no row", () => {
    installMethodRows(
      {methods: {users: methodRow('users', 'aB3dE9x'), older: methodRow('older')}, deps: {}, purFnDeps: {}},
      options
    );
    const {sent} = installed();
    expect(sent({batchSubRequests: [{id: 'users'}, {id: 'older'}, {id: 'unknown'}] as any})).toEqual(['aB3dE9x', '', '']);
  });

  it("sends the called route's id, and a batch's ids in the batch's order", () => {
    installMethodRows({methods: {a: methodRow('a', 'idA'), b: methodRow('b', 'idB')}, deps: {}, purFnDeps: {}}, options);
    const {sent} = installed();
    expect(sent({route: {id: 'a'} as any})).toEqual(['idA']);
    expect(sent({batchSubRequests: [{id: 'b'}, {id: 'a'}] as any})).toEqual(['idB', 'idA']);
  });

  it('learns the rows a route-sync-required refusal carries, then resends', async () => {
    const {onError} = installed();
    let retried = 0;
    const rows = {methods: {users: methodRow('users', 'aB3dE9x')}, deps: {}, purFnDeps: {}};
    await onError(
      refusal('route-sync-required', {metadata: rows}),
      contextFor('users', () => (retried++, true))
    );
    expect(hasMethod('users')).toBe(true);
    expect(retried).toBe(1);
  });

  it('refetches a fetched route whose types changed, then resends', async () => {
    installMethodRows({methods: {users: methodRow('users', 'stale')}, deps: {}, purFnDeps: {}}, options);
    const {onError} = installed();
    let retried = 0;
    await onError(
      refusal('route-types-mismatch', {routeIds: ['users']}),
      contextFor('users', () => (retried++, true))
    );
    expect(fetches).toBe(1);
    expect(retried).toBe(1);
  });

  it('leaves the refusal to the call when its resend is refused', async () => {
    installMethodRows({methods: {users: methodRow('users', 'stale')}, deps: {}, purFnDeps: {}}, options);
    const {onError} = installed();
    const refused = onError(
      refusal('route-types-mismatch', {routeIds: ['users']}),
      contextFor('users', () => false)
    );
    await expect(refused).resolves.toBeUndefined();
  });

  it('never resends a bundled route whose types changed: only a new build fixes it', async () => {
    setBundledMethod('users', methodRow('users', 'old') as unknown as MethodWithOptsAndJitFns);
    const {onError} = installed();
    let retried = 0;
    await onError(
      refusal('route-types-mismatch', {routeIds: ['users']}),
      contextFor('users', () => (retried++, true))
    );
    expect(retried).toBe(0);
    expect(fetches).toBe(0);
  });

  it('never resends a mismatch that names no route, and fetches nothing', async () => {
    const {onError} = installed();
    let retried = 0;
    await onError(
      refusal('route-types-mismatch', {}),
      contextFor('users', () => (retried++, true))
    );
    expect(retried).toBe(0);
    expect(fetches).toBe(0);
  });
});
