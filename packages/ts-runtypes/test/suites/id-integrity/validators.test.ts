// id-integrity / validators — for EVERY validation + format-validation case,
// assert the value-first schema form (`createValidateFn(RT.x())`) and the type-first
// form (`createValidateFn<T>()`) resolve to the SAME cached factory, i.e. the same
// structural type id (and therefore the same cached runtype). Reuses each case's
// existing validate / validateSchema / getValidationErrors / getValidationErrorsSchema thunks —
// no per-case data added. See util/idIntegrityAsserts.ts for the mechanism.

import {describe, it} from 'vitest';
import {VALIDATION_SUITE} from '../validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../format-validation/index.ts';
import type {ValidationCase} from '../validation/types.ts';
import {assertValidatorIdIntegrity} from '../../util/idIntegrityAsserts.ts';

function register(suiteName: string, suite: Record<string, Record<string, ValidationCase>>): void {
  for (const [groupName, cases] of Object.entries(suite)) {
    for (const c of Object.values(cases)) {
      it(`${suiteName} / ${groupName} — ${c.title}`, () => assertValidatorIdIntegrity(c));
    }
  }
}

describe('id-integrity / validators — value-first schema ↔ type-first resolve one cached factory', () => {
  register('validation', VALIDATION_SUITE);
  register('format-validation', FORMAT_VALIDATION_SUITE);
});
