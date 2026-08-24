// cloning / Tuples — every case run through the universal clone assert (value
// equality, non-mutation, no shared mutable refs, prototype preservation;
// pass-through / factory-throw cases flip the relevant checks). One it() per
// case, delegating to util/cloningAsserts.ts.
import {describe, it} from 'vitest';
import {TUPLES} from './Tuples.ts';
import {assertCloneCase} from '../../util/cloningAsserts.ts';

describe('cloning / Tuples', () => {
  for (const c of Object.values(TUPLES)) {
    it(`clone - ${c.title}`, () => assertCloneCase(c));
  }
});
