/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {RpcError, routeSyncId, resetRoutesCache} from '@mionjs/core';
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

const row = (id: string, middlewareIds?: string[]) =>
  ({
    id,
    type: 1,
    paramsJitHash: `p-${id}`,
    returnJitHash: `r-${id}`,
    pointer: [id],
    nestLevel: 0,
    isAsync: false,
    hasReturnData: true,
    options: {},
    middlewareIds,
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

  it('computes one id per route from the rows held, and leaves a route with a missing chain row empty', () => {
    installMethodRows({
      methods: {auth: row('auth'), users: row('users', ['auth']), orphan: row('orphan', ['gone'])},
      deps: {},
      purFnDeps: {},
    });
    const [users, orphan, unknown] = routeSyncIds(['users', 'orphan', 'unknown']);
    expect(users).toBe(routeSyncId(row('users', ['auth']), (id) => (id === 'auth' ? row('auth') : undefined)));
    expect(orphan).toBe('');
    expect(unknown).toBe('');
  });

  it('reads a refusal out of its union envelope, and nothing else', () => {
    const refusal = new RpcError({type: 'route-types-mismatch', publicMessage: 'changed', errorData: {routeIds: ['users']}});
    expect(syncRefusalOf([0, JSON.parse(JSON.stringify(refusal))])).toMatchObject({type: 'route-types-mismatch'});
    expect(syncRefusalOf(undefined)).toBeUndefined();
    expect(syncRefusalOf([1, {'x-build-version': 'abc'}])).toBeUndefined();
  });
});
