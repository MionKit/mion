/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {FatalError, resetRoutesCache} from '@mionjs/core';
import type {MethodWithOptions, MethodWithOptsAndJitFns} from '@mionjs/core';
import type {RouteSyncError, SyncRoutesHandler} from '@mionjs/core/middlewares';
import type {CallContext, ClientMiddlewareOf, ClientOptions, MiddlewareContext} from '../../src/types.ts';
import {useSyncRoutes} from '../../src/middlewares/syncRoutes.ts';
import {installMethodRows} from '../../src/lib/clientMethodsMetadata.ts';
import {hasMethod, resetBundledMethods, setBundledMethod} from '../../src/lib/methods.ts';

const options = {baseURL: 'http://x'} as ClientOptions;

const row = (id: string, syncId?: string) =>
  ({
    id,
    type: 1,
    paramsJitHash: `p-${id}`,
    returnJitHash: `r-${id}`,
    syncId,
    pointer: [id],
    nestLevel: 0,
    isAsync: false,
    hasReturnData: true,
    options: {},
  }) as unknown as MethodWithOptions;

type ErrorHook = (refusal: RouteSyncError, context: MiddlewareContext) => Promise<void>;

/** Records the hooks an installer sets, so each one can be run on its own. */
function installed() {
  const hooks: {request?: (call: (ids?: string[]) => void, context: CallContext) => void; errors: Record<string, ErrorHook>} = {
    errors: {},
  };
  const middleware = {
    onRequest: (handler: any) => ((hooks.request = handler), middleware),
    onResponse: () => middleware,
    onError: (type: string, handler: any) => ((hooks.errors[type] = handler), middleware),
  } as unknown as ClientMiddlewareOf<SyncRoutesHandler>;
  useSyncRoutes(middleware);
  const sent = (context: Partial<CallContext>) => {
    let ids: string[] | undefined;
    hooks.request!((value) => (ids = value), {options, subRequestList: {}, ...context});
    return ids;
  };
  return {hooks, sent};
}

const refusal = (type: RouteSyncError['type'], errorData: RouteSyncError['errorData']) =>
  new FatalError({type, publicMessage: type, errorData}) as RouteSyncError;

const contextFor = (routeId: string, retry: () => boolean) =>
  ({options, subRequestList: {}, route: {id: routeId}, retry}) as unknown as MiddlewareContext;

describe('useSyncRoutes', () => {
  beforeEach(() => {
    resetRoutesCache();
    resetBundledMethods();
  });

  it("sends each route's own id from its row, and '' for a row without one or no row", () => {
    installMethodRows({methods: {users: row('users', 'aB3dE9x'), older: row('older')}, deps: {}, purFnDeps: {}}, options);
    const {sent} = installed();
    expect(sent({batchSubRequests: [{id: 'users'}, {id: 'older'}, {id: 'unknown'}] as any})).toEqual(['aB3dE9x', '', '']);
  });

  it("sends the called route's id, and a batch's ids in the batch's order", () => {
    installMethodRows({methods: {a: row('a', 'idA'), b: row('b', 'idB')}, deps: {}, purFnDeps: {}}, options);
    const {sent} = installed();
    expect(sent({route: {id: 'a'} as any})).toEqual(['idA']);
    expect(sent({batchSubRequests: [{id: 'b'}, {id: 'a'}] as any})).toEqual(['idB', 'idA']);
  });

  it('learns the rows a route-sync-required refusal carries, then resends', async () => {
    const {hooks} = installed();
    let retried = 0;
    const rows = {methods: {users: row('users', 'aB3dE9x')}, deps: {}, purFnDeps: {}};
    await hooks.errors['route-sync-required'](
      refusal('route-sync-required', {metadata: rows}),
      contextFor('users', () => (retried++, true))
    );
    expect(hasMethod('users')).toBe(true);
    expect(retried).toBe(1);
  });

  it('hands the refusal back when the resend is refused', async () => {
    const {hooks} = installed();
    const refused = refusal('route-sync-required', {});
    await expect(
      hooks.errors['route-sync-required'](
        refused,
        contextFor('users', () => false)
      )
    ).rejects.toBe(refused);
  });

  it('never resends a bundled route whose types changed: only a new build fixes it', async () => {
    setBundledMethod('users', row('users', 'old') as unknown as MethodWithOptsAndJitFns);
    const {hooks} = installed();
    let retried = 0;
    const refused = refusal('route-types-mismatch', {routeIds: ['users']});
    await expect(
      hooks.errors['route-types-mismatch'](
        refused,
        contextFor('users', () => (retried++, true))
      )
    ).rejects.toBe(refused);
    expect(retried).toBe(0);
  });
});
