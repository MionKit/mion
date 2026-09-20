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
import {JIT_FUNCTION_IDS} from './constants.ts';

// mion's family name -> the run-types family getFnHash is asked for.
const FAMILY_BY_ID: Record<keyof typeof JIT_FUNCTION_IDS, FnHashKey> = {
  isType: 'validate',
  typeErrors: 'validationErrors',
  hasUnknownKeys: 'hasUnknownKeys',
  unknownKeyErrors: 'unknownKeyErrors',
  formatTransform: 'formatTransform',
  prepareForJsonClone: 'prepareForJsonClone',
  prepareForJsonMutate: 'prepareForJsonMutate',
  compactForJson: 'compactForJson',
  restoreFromJsonMutate: 'restoreFromJsonMutate',
  restoreFromJsonClone: 'restoreFromJsonClone',
  compactFromJson: 'compactFromJson',
};

describe('JIT_FUNCTION_IDS', () => {
  it.each(Object.entries(FAMILY_BY_ID))('%s still matches getFnHash(%s)', (id, family) => {
    expect(JIT_FUNCTION_IDS[id as keyof typeof JIT_FUNCTION_IDS]).toBe(getFnHash(family));
  });

  it('names every family the constant declares', () => {
    expect(Object.keys(FAMILY_BY_ID).sort()).toEqual(Object.keys(JIT_FUNCTION_IDS).sort());
  });
});
