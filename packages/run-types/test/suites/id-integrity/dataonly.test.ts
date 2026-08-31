// id-integrity / DataOnly — for EVERY validation + format-validation case,
// assert the validator built from `createValidateFn<DataOnly<T>>()` (and the
// getValidationErrors companion) produces the SAME verdicts on the case's samples as
// the bare-`T` form. Reuses each case's existing validateDataOnly /
// getValidationErrorsDataOnly thunks + samples + getExpectedErrors — no new per-case
// data. Equivalent verdicts ⇒ the `DataOnly<T>` type mapping drops exactly the
// members the validator emitter drops. (Behavioural, not factory-identity: the
// emitter keeps dropped members as `notSupported` nodes, so the ids legitimately
// differ — see util/idIntegrityAsserts.ts for the mechanism.)

import {describe, it} from 'vitest';
import {VALIDATION_SUITE} from '../validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../format-validation/index.ts';
import type {ValidationCase} from '../validation/types.ts';
import {assertDataOnlyEquivalence} from '../../util/idIntegrityAsserts.ts';

function register(suiteName: string, suite: Record<string, Record<string, ValidationCase>>): void {
  for (const [groupName, cases] of Object.entries(suite)) {
    for (const c of Object.values(cases)) {
      it(`${suiteName} / ${groupName} — ${c.title}`, () => assertDataOnlyEquivalence(c));
    }
  }
}

describe('id-integrity / DataOnly — createValidateFn<DataOnly<T>>() validates the same samples as createValidateFn<T>()', () => {
  register('validation', VALIDATION_SUITE);
  register('format-validation', FORMAT_VALIDATION_SUITE);
});
