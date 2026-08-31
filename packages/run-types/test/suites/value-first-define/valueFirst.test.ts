// value-first define — every VALUE_FIRST_SUITE case run through validate and a light getValidationErrors
// contract check, each delegating to its shared helper in util/validationAsserts.ts.
import {describe, it} from 'vitest';
import {VALUE_FIRST_SUITE} from './index.ts';
import {assertValidate, assertGetValidationErrorsContract} from '../../util/validationAsserts.ts';

describe('value-first define', () => {
  for (const c of Object.values(VALUE_FIRST_SUITE)) {
    it(`validate — ${c.title}`, () => assertValidate(c));
    it(`getValidationErrors — ${c.title}`, () => assertGetValidationErrorsContract(c));
  }
});
