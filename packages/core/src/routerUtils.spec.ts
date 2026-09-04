/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {routesCache, addRoutesToCache, resetRoutesCache} from './routerUtils.ts';
import type {MethodWithOptions} from './types/method.types.ts';

describe('routesCache is an own-key table', () => {
  afterEach(() => resetRoutesCache());

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])("'%s' is not a registered method", (id) => {
    expect(routesCache.hasMetadata(id)).toBe(false);
    expect(routesCache.getMetadata(id)).toBeUndefined();
    expect(routesCache.getMethodJitFns(id)).toBeUndefined();
    expect(() => routesCache.useMethodJitFns(id)).toThrow(`Metadata for remote method ${id} not found`);
  });

  it('a registered id is found and counted', () => {
    routesCache.setMetadata('users/get', {id: 'users/get'} as MethodWithOptions);
    expect(routesCache.hasMetadata('users/get')).toBe(true);
    expect(routesCache.size()).toBe(1);
  });

  it('addRoutesToCache copies own entries only and never a prototype key', () => {
    const incoming = JSON.parse('{"__proto__": {"polluted": true}, "ok": {"id": "ok"}}');
    addRoutesToCache(incoming);
    expect(routesCache.hasMetadata('ok')).toBe(true);
    expect(routesCache.hasMetadata('__proto__')).toBe(true); // an own key on the incoming object, stored as data
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(routesCache.getCache())).toBeNull();
  });
});
