/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach} from 'vitest';
import {
  routesCache,
  addRoutesToCache,
  resetRoutesCache,
  resolveSerializerOption,
  jsonStrategyFor,
  getJitFnHashes,
  getHeaderJitFnHashes,
  getJitFunctionsFromHash,
  getNoopJitFns,
  strategyFromJitFns,
} from './routerUtils.ts';
import {BUILT_IN_SERIALIZER} from './constants.ts';
import {getFnHash} from '@mionjs/run-types';
import type {MethodWithOptions} from './types/method.types.ts';

describe('routesCache is an own-key table', () => {
  afterEach(() => resetRoutesCache());

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])("'%s' is not a registered method", (id) => {
    expect(routesCache.hasMetadata(id)).toBe(false);
    expect(routesCache.getMetadata(id)).toBeUndefined();
    expect(routesCache.getMethodJitFns(id)).toBeUndefined();
    expect(() => routesCache.useMethodJitFns(id)).toThrow(`Metadata for remote method ${id} not found`);
  });

  it('a registered id is found', () => {
    routesCache.setMetadata('users/get', {id: 'users/get'} as MethodWithOptions);
    expect(routesCache.hasMetadata('users/get')).toBe(true);
    expect(routesCache.getMetadata('users/get')).toEqual({id: 'users/get'});
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

describe('serializer strategies', () => {
  it('resolves a serializer option per direction over its fallback', () => {
    const fallback = {params: 'compact', return: 'clone'} as const;
    expect(resolveSerializerOption(undefined, fallback)).toEqual({params: 'compact', return: 'clone'});
    expect(resolveSerializerOption('binary', fallback)).toEqual({params: 'binary', return: 'binary'});
    expect(resolveSerializerOption({return: 'direct'}, fallback)).toEqual({params: 'compact', return: 'direct'});
    expect(resolveSerializerOption({params: 'mutate', return: 'direct'}, fallback)).toEqual({params: 'mutate', return: 'direct'});
    // the built-in pair is today's wire: the client stringifies its params, the server prepares its return in place
    expect(resolveSerializerOption(undefined, BUILT_IN_SERIALIZER)).toEqual({params: 'direct', return: 'mutate'});
  });

  it('a binary direction keeps the built-in json pair of that direction', () => {
    expect(jsonStrategyFor('binary', 'params')).toBe('direct');
    expect(jsonStrategyFor('binary', 'return')).toBe('mutate');
    expect(jsonStrategyFor('compact', 'params')).toBe('compact');
    expect(jsonStrategyFor('clone', 'return')).toBe('clone');
  });

  it('names the cache keys of the families a strategy compiles, nothing more', () => {
    const compact = getJitFnHashes('T1', 'compact', 'params');
    expect(compact.json).toEqual({encode: `${getFnHash('cj')}_T1`, decode: `${getFnHash('cjr')}_T1`});
    expect(compact.binary).toBeUndefined();
    const clone = getJitFnHashes('T1', 'clone', 'return');
    expect(clone.json).toEqual({encode: `${getFnHash('pjs')}_T1`, decode: `${getFnHash('rj')}_T1`});
    const direct = getJitFnHashes('T1', 'direct', 'return');
    expect(direct.json.encode).toBe(`${getFnHash('sj')}_T1`);
    const binaryParams = getJitFnHashes('T1', 'binary', 'params');
    expect(binaryParams.json.encode).toBe(`${getFnHash('sj')}_T1`);
    expect(binaryParams.binary).toEqual({toBinary: `${getFnHash('tb')}_T1`, fromBinary: `${getFnHash('fb')}_T1`});
    const binaryReturn = getJitFnHashes('T1', 'binary', 'return');
    expect(binaryReturn.json.encode).toBe(`${getFnHash('pj')}_T1`);
    expect(binaryReturn.isType).toBe(`${getFnHash('val')}_T1`);
    expect(binaryReturn.formatTransform).toBe(`${getFnHash('fmt')}_T1`);
    expect(getHeaderJitFnHashes('H1')).toEqual({isType: `${getFnHash('val')}_H1`, typeErrors: `${getFnHash('verr')}_H1`});
  });

  it('the noop set carries the built-in json pair shape and reads as mutate', () => {
    const noop = getNoopJitFns();
    expect(noop.json.strategy).toBe('mutate');
    expect(noop.json.encode.isNoop).toBe(true);
    expect(noop.json.decode.isNoop).toBe(true);
    expect(noop.binary).toBeUndefined();
    expect(strategyFromJitFns(noop)).toBe('mutate');
    expect(getJitFunctionsFromHash('', 'compact', 'params')).toBe(noop);
  });

  it('a strategy whose families were not compiled fails closed instead of decoding with the wrong family', () => {
    expect(() => getJitFunctionsFromHash('nope', 'compact', 'params')).toThrow(/Jit function isType not found/);
  });
});
