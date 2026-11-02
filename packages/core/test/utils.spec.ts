/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {isUnsafePropertyName} from '../src/utils.ts';

describe('isUnsafePropertyName', () => {
  it('flags exactly __proto__, prototype and constructor', () => {
    for (const name of ['__proto__', 'prototype', 'constructor']) expect(isUnsafePropertyName(name)).toBe(true);
    for (const name of ['', 'proto', '__proto', 'prototypes', 'Constructor', 'toString', 'valueOf', 'hello_world'])
      expect(isUnsafePropertyName(name)).toBe(false);
  });
});
