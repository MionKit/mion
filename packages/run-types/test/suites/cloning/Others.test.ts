// cloning / Others — every case run through the universal clone assert (value
// equality, non-mutation, no shared mutable refs, prototype preservation;
// pass-through / factory-throw cases flip the relevant checks). One it() per
// case, delegating to util/cloningAsserts.ts.
import {describe, it} from 'vitest';
import {OTHERS} from './Others.ts';
import {assertCloneCase} from '../../util/cloningAsserts.ts';

describe('cloning / Others', () => {
  for (const c of Object.values(OTHERS)) {
    it(`clone - ${c.title}`, () => assertCloneCase(c));
  }
});
