// format-validation / CircularGuard — the circular guard is format-agnostic, so
// a recursive type with a branded (uuid) leaf behaves like the plain cases.
import {describe, it} from 'vitest';
import {CIRCULAR_GUARD} from './CircularGuard.ts';
import {assertCircularGetValidationErrors, assertCircularValidate} from '../../util/circularGuardAsserts.ts';

describe('format-validation / CircularGuard', () => {
  for (const testCase of Object.values(CIRCULAR_GUARD)) {
    it(`validate/static — ${testCase.title}`, () => assertCircularValidate(testCase, false));
    it(`validate/reflect — ${testCase.title}`, () => assertCircularValidate(testCase, true));
    it(`getValidationErrors/static — ${testCase.title}`, () => assertCircularGetValidationErrors(testCase, false));
    it(`getValidationErrors/reflect — ${testCase.title}`, () => assertCircularGetValidationErrors(testCase, true));
  }
});
