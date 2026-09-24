/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getOrCreateGlobal, isUnsafePropertyName} from '../src/utils.ts';
import * as core from '../index.ts';

describe('getOrCreateGlobal', () => {
  it('returns the same instance across calls with the same key', () => {
    const a = getOrCreateGlobal('mion.test.utils.sameInstance', () => ({value: 1}));
    const b = getOrCreateGlobal('mion.test.utils.sameInstance', () => ({value: 99}));
    expect(b).toBe(a);
    expect(b.value).toBe(1); // factory is not called the second time
  });

  it('initializes with the factory only on the first call', () => {
    let factoryCalls = 0;
    const factory = () => {
      factoryCalls++;
      return new Map<string, number>([['k', factoryCalls]]);
    };
    getOrCreateGlobal('mion.test.utils.factoryOnce', factory);
    getOrCreateGlobal('mion.test.utils.factoryOnce', factory);
    getOrCreateGlobal('mion.test.utils.factoryOnce', factory);
    expect(factoryCalls).toBe(1);
  });

  it('supports independent storage for different keys', () => {
    const a = getOrCreateGlobal('mion.test.utils.keyA', () => ({n: 1}));
    const b = getOrCreateGlobal('mion.test.utils.keyB', () => ({n: 2}));
    expect(a).not.toBe(b);
    expect(a.n).toBe(1);
    expect(b.n).toBe(2);
  });

  it('mutations to the returned object persist across re-fetches (singleton semantics)', () => {
    const cache = getOrCreateGlobal('mion.test.utils.singleton', () => new Map<string, string>());
    cache.set('foo', 'bar');
    const again = getOrCreateGlobal('mion.test.utils.singleton', () => new Map<string, string>());
    expect(again.get('foo')).toBe('bar');
    expect(again).toBe(cache);
  });

  it('uses Symbol.for so different module copies converge on the same slot', () => {
    getOrCreateGlobal('mion.test.utils.symbolFor', () => ({stamped: true}));
    const sym = Symbol.for('mion.test.utils.symbolFor');
    expect((globalThis as any)[sym]).toEqual({stamped: true});
  });
});

describe('isUnsafePropertyName', () => {
  it('flags exactly __proto__, prototype and constructor', () => {
    for (const name of ['__proto__', 'prototype', 'constructor']) expect(isUnsafePropertyName(name)).toBe(true);
    for (const name of ['', 'proto', '__proto', 'prototypes', 'Constructor', 'toString', 'valueOf', 'hello_world'])
      expect(isUnsafePropertyName(name)).toBe(false);
  });
});

describe('@mionjs/core exports', () => {
  it('does not export the removed unused constants', () => {
    expect(core).not.toHaveProperty('MIME_TYPES');
    expect(core).not.toHaveProperty('UNSAFE_PROPERTY_NAMES');
  });
});
