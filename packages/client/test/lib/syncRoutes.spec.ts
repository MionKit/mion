/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {RpcError, resetRoutesCache} from '@mionjs/core';
import type {MethodWithOptions} from '@mionjs/core';
import {
  learnSyncRoutes,
  resetSyncRoutes,
  routeSyncIds,
  sendsSyncIds,
  setInjectedRouterOptions,
  syncRefusalOf,
} from '../../src/lib/syncRoutes.ts';
import {installMethodRows} from '../../src/lib/clientMethodsMetadata.ts';

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

describe('client route sync ids', () => {
  beforeEach(() => {
    resetSyncRoutes();
    resetRoutesCache();
  });

  it('sends ids only to a server the build named or a refusal taught', () => {
    setInjectedRouterOptions('http://built', {syncRoutes: true});
    setInjectedRouterOptions('http://plain', undefined);
    learnSyncRoutes('http://learned');
    expect(sendsSyncIds('http://built')).toBe(true);
    expect(sendsSyncIds('http://plain')).toBe(false);
    expect(sendsSyncIds('http://learned')).toBe(true);
  });

  it("sends each route's own id from its row, and '' for a row without one or no row", () => {
    installMethodRows({methods: {users: row('users', 'aB3dE9x'), older: row('older')}, deps: {}, purFnDeps: {}});
    expect(routeSyncIds(['users', 'older', 'unknown'])).toEqual(['aB3dE9x', '', '']);
  });

  it('reads a refusal out of its union envelope, and nothing else', () => {
    const refusal = new RpcError({type: 'route-types-mismatch', publicMessage: 'changed', errorData: {routeIds: ['users']}});
    expect(syncRefusalOf([0, JSON.parse(JSON.stringify(refusal))])).toMatchObject({type: 'route-types-mismatch'});
    expect(syncRefusalOf(undefined)).toBeUndefined();
    expect(syncRefusalOf([1, {'x-build-version': 'abc'}])).toBeUndefined();
  });
});
