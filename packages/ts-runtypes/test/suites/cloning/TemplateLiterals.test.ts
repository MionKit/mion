// cloning / TemplateLiterals — every case run through the universal clone assert (value
// equality, non-mutation, no shared mutable refs, prototype preservation;
// pass-through / factory-throw cases flip the relevant checks). One it() per
// case, delegating to util/cloningAsserts.ts.
import {describe, it} from 'vitest';
import {TEMPLATE_LITERALS} from './TemplateLiterals.ts';
import {assertCloneCase} from '../../util/cloningAsserts.ts';

describe('cloning / TemplateLiterals', () => {
  for (const c of Object.values(TEMPLATE_LITERALS)) {
    it(`clone - ${c.title}`, () => assertCloneCase(c));
  }
});
