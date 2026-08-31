// cloning / LargeObjects — every case run through the universal clone assert (value
// equality, non-mutation, no shared mutable refs, prototype preservation;
// pass-through / factory-throw cases flip the relevant checks). One it() per
// case, delegating to util/cloningAsserts.ts.
import {describe, it} from 'vitest';
import {LARGE_OBJECTS} from './LargeObjects.ts';
import {assertCloneCase} from '../../util/cloningAsserts.ts';

describe('cloning / LargeObjects', () => {
  for (const c of Object.values(LARGE_OBJECTS)) {
    it(`clone - ${c.title}`, () => assertCloneCase(c));
  }
});
