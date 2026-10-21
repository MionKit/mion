/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// JIT_FUNCTION_IDS is generated from the Go registry, because calling getFnHash would pull FN_HASHES, the
// whole variant table, into every browser bundle. These tests are the JS-side cross-check that the narrow
// table and the resolver a consumer would otherwise call still answer the same thing.

import {describe, expect, it} from 'vitest';
import {getFnHash} from '@mionjs/run-types/runtime';
import type {FnHashKey} from '@mionjs/run-types/runtime';
import {JIT_FUNCTION_IDS, PARSE_MODES} from '../src/constants.ts';

describe('JIT_FUNCTION_IDS', () => {
  // The keys ARE the run-types family names, so there is nothing to map: a key that is not a family makes
  // getFnHash throw.
  it.each(Object.keys(JIT_FUNCTION_IDS))('%s still matches getFnHash', (family) => {
    expect(JIT_FUNCTION_IDS[family as keyof typeof JIT_FUNCTION_IDS]).toBe(getFnHash(family as FnHashKey));
  });

  // Every family a parser strategy can ask for must have an id, or its route resolves nothing at run time.
  it('carries an id for every family PARSE_MODES names', () => {
    const named = new Set(Object.values(PARSE_MODES).flatMap((row) => Object.values(row)));
    const missing = [...named].filter((family) => !(family in JIT_FUNCTION_IDS));
    expect(missing, `families with no JIT_FUNCTION_IDS entry: ${missing.join(', ')}`).toEqual([]);
  });
});
