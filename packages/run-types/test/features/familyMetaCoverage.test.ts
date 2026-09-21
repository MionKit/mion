// registerTypeFnTuple joins a compiled entry with its family metadata by 4-char tag. A tag with no row is not an error:
// the call site silently falls back to the identity fn, which for a validator means answering true for every value.
// Nothing else enumerates the table, so a Go-side family with no TypeScript row ships a validator that accepts anything.

import {describe, expect, it} from 'vitest';
import {FAMILY_TAG_TO_FN_KEY} from '@mionjs/run-types/runtime';
import {familyMeta} from '../../src/runtypes/entryTuple.ts';

describe('familyMeta', () => {
  it('carries a row for every family tag an entry can be emitted under', () => {
    const missing = Object.keys(FAMILY_TAG_TO_FN_KEY).filter((tag) => familyMeta[tag] === undefined);
    expect(missing, `family tags with no familyMeta row degrade to the identity fallback: ${missing.join(', ')}`).toEqual([]);
  });

  it('names no tag the generated map does not know', () => {
    const known = new Set(Object.keys(FAMILY_TAG_TO_FN_KEY));
    // The JSON-composite tags (jeCL, jdST, …) borrow a host family's metadata and are not in the map.
    const stray = Object.keys(familyMeta).filter((tag) => !known.has(tag) && tag.length <= 4 && !/[A-Z]/.test(tag));
    expect(stray, `familyMeta rows for tags no entry can carry: ${stray.join(', ')}`).toEqual([]);
  });
});
