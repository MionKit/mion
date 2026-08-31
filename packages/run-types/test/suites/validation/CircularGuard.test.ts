// validation / CircularGuard — every circular-guard case run through validate
// and getValidationErrors, in both the static `<T>()` and reflect `(value)`
// call shapes (the marker both-shapes rule). The guard is armed per-call via
// `{rejectCircularRefs: true}` inside each thunk, so no global state is touched.
import {describe, it} from 'vitest';
import {CIRCULAR_GUARD} from './CircularGuard.ts';
import {assertCircularGetValidationErrors, assertCircularValidate} from '../../util/circularGuardAsserts.ts';

describe('validation / CircularGuard', () => {
  for (const testCase of Object.values(CIRCULAR_GUARD)) {
    it(`validate/static — ${testCase.title}`, () => assertCircularValidate(testCase, false));
    it(`validate/reflect — ${testCase.title}`, () => assertCircularValidate(testCase, true));
    it(`getValidationErrors/static — ${testCase.title}`, () => assertCircularGetValidationErrors(testCase, false));
    it(`getValidationErrors/reflect — ${testCase.title}`, () => assertCircularGetValidationErrors(testCase, true));
  }
});
