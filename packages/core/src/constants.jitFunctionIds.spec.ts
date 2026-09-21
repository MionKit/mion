/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// JIT_FUNCTION_IDS is written out because calling getFnHash shipped the whole Go-generated hash
// table to every browser; this is the guarantee the literal gives up.

import {describe, expect, it} from 'vitest';
import {getFnHash} from '@mionjs/run-types/runtime';
import type {FnHashKey} from '@mionjs/run-types/runtime';
import {JIT_FUNCTION_IDS, PARAMS_PARSING, RETURN_PARSING} from './constants.ts';

describe('JIT_FUNCTION_IDS', () => {
  // The keys ARE the run-types family names, so there is no mapping table to keep in step: a key that is not
  // a family makes getFnHash throw, and a drifted value fails here.
  it.each(Object.keys(JIT_FUNCTION_IDS))('%s still matches getFnHash', (family) => {
    expect(JIT_FUNCTION_IDS[family as keyof typeof JIT_FUNCTION_IDS]).toBe(getFnHash(family as FnHashKey));
  });

  // Every family a parser strategy can ask for must have an id, or its route resolves nothing at run time.
  it('carries an id for every family the parsing tables name', () => {
    const named = new Set(
      [...Object.values(PARAMS_PARSING), ...Object.values(RETURN_PARSING)].flatMap((row) => Object.values(row))
    );
    const missing = [...named].filter((family) => !(family in JIT_FUNCTION_IDS));
    expect(missing, `families with no JIT_FUNCTION_IDS entry: ${missing.join(', ')}`).toEqual([]);
  });
});
