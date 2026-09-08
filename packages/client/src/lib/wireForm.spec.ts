/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeAll} from 'vitest';
import {routesCache} from '@mionjs/core';
import {initClient} from '../client.ts';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';
import {wireFormReplacer} from './serializer.ts';

// What wireFormReplacer writes for an optimistic first request must be byte for byte what the
// route's OWN compiled encoder writes, so the server decodes it exactly as it would the real thing.

describe('the optimistic wire forms match the compiled encoder', () => {
  const {routes} = initClient<TestServerApi>({baseURL: TEST_SERVER_BASE_URL});

  const optimistic = (params: unknown[]) => JSON.stringify(params, wireFormReplacer);
  const compiled = (id: string, params: unknown[]) =>
    JSON.stringify(routesCache.useMethodJitFns(id).paramsJitFns.json.encode.fn(params));

  // one warm call per route so its compiled functions are in the cache
  beforeAll(async () => {
    await routes.getSameMap(new Map([['a', 1]])).call();
    await routes.getSameSet(new Set(['a'])).call();
    await routes.getSameDate(new Date()).call();
    await routes.getSameBigInt(1n).call();
    await routes.getSameNestedMap(new Map()).call();
    await routes.getSameDateSet(new Set()).call();
    await routes.getSameMapOfDates(new Map()).call();
  });

  it('a flat Map writes an array of entries', () => {
    const params = [
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    ];
    expect(optimistic(params)).toBe(compiled('getSameMap', params));
    expect(optimistic(params)).toBe('[[["a",1],["b",2]]]');
  });

  it('a flat Set writes an array', () => {
    const params = [new Set(['x', 'y'])];
    expect(optimistic(params)).toBe(compiled('getSameSet', params));
    expect(optimistic(params)).toBe('[["x","y"]]');
  });

  it('a Date writes ISO text', () => {
    const params = [new Date('2024-02-02T02:02:02.000Z')];
    expect(optimistic(params)).toBe(compiled('getSameDate', params));
    expect(optimistic(params)).toBe('[["2024-02-02T02:02:02.000Z"]]'.replace('[[', '[').replace(']]', ']'));
  });

  it('a bigint writes a whole-number string', () => {
    const params = [9007199254740993n];
    expect(optimistic(params)).toBe(compiled('getSameBigInt', params));
    expect(optimistic(params)).toBe('["9007199254740993"]');
  });

  // the case the flat forms would miss: the replacer has to be applied again inside what it returned
  it('a Map nested in a Map, with bigint values, recurses all the way down', () => {
    const params = [
      new Map([
        ['a', new Map([['x', 1n]])],
        ['b', new Map([['y', 2n]])],
      ]),
    ];
    expect(optimistic(params)).toBe(compiled('getSameNestedMap', params));
    expect(optimistic(params)).toBe('[[["a",[["x","1"]]],["b",[["y","2"]]]]]');
  });

  it('a Set of Dates converts both the Set and every Date in it', () => {
    const params = [new Set([new Date('2024-01-01T00:00:00.000Z'), new Date('2024-06-06T06:06:06.000Z')])];
    expect(optimistic(params)).toBe(compiled('getSameDateSet', params));
    expect(optimistic(params)).toBe('[["2024-01-01T00:00:00.000Z","2024-06-06T06:06:06.000Z"]]');
  });

  it('a Map whose values are Dates converts the entries and the Dates', () => {
    const params = [new Map([['start', new Date('2024-01-01T00:00:00.000Z')]])];
    expect(optimistic(params)).toBe(compiled('getSameMapOfDates', params));
    expect(optimistic(params)).toBe('[[["start","2024-01-01T00:00:00.000Z"]]]');
  });
});
