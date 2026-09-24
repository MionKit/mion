// strict-validation / Strict — every case is checked four ways:
//
//   accepts / rejects  the stated samples (the behaviour a user reads about)
//   validator parity   fused === validate(v) && no undeclared key in the reference
//   report parity      fused errors === errors(v) + undeclaredKeyErrors(v), as a SET
//   agreement          the fused pair agrees with itself: empty report ⇔ accepted
//
// The parity pair is the load-bearing half: the reference is built from the plain
// validators plus an in-test key walk over the case's declared keys, so the fused
// functions are compared against an independent answer on every sample.

import {describe, expect, it} from 'vitest';
import {STRICT, undeclaredKeyErrors, type StrictCase} from './Strict.ts';
import type {RTValidationError} from '@mionjs/run-types';

/** Entries compared as a SET: the fused walk interleaves type and unknown-key
 *  errors per node where the reference groups all of one kind ahead of the
 *  other, so membership is the shared contract, not sequence. */
const errorKey = (error: RTValidationError) => JSON.stringify([error.path, error.expected]);
const asSet = (errors: RTValidationError[]) => errors.map(errorKey).sort();

describe('strict-validation / Strict', () => {
  // Widened to StrictCase: `as const satisfies` keeps the literal shape of each
  // entry, so a case that does not set `divergesFromReference` has no such
  // property to read at all.
  for (const testCase of Object.values(STRICT) as StrictCase[]) {
    describe(testCase.title, () => {
      const hasUndeclared = (value: unknown) => undeclaredKeyErrors(value, testCase.declaredKeys).length > 0;

      it('accepts every valid sample with an empty report', () => {
        const isStrict = testCase.validateStrict();
        const errorsStrict = testCase.errorsStrict();
        for (const value of testCase.valid) {
          expect(isStrict(value)).toBe(true);
          expect(errorsStrict(value)).toEqual([]);
        }
      });

      it('rejects every invalid sample with a non-empty report', () => {
        const isStrict = testCase.validateStrict();
        const errorsStrict = testCase.errorsStrict();
        for (const value of testCase.invalid) {
          expect(isStrict(value)).toBe(false);
          expect(errorsStrict(value).length).toBeGreaterThan(0);
        }
      });

      // Parity holds everywhere the two CAN agree. A union cannot: see the
      // divergence assertion below, and divergesFromReference on the case.
      it.skipIf(testCase.divergesFromReference)('agrees with validate(v) && no undeclared key on every sample', () => {
        const isStrict = testCase.validateStrict();
        const isValid = testCase.validate();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(isStrict(value)).toBe(isValid(value) && !hasUndeclared(value));
        }
      });

      it.skipIf(testCase.divergesFromReference)('reports the same entries as getValidationErrors + the reference', () => {
        const errorsStrict = testCase.errorsStrict();
        const errors = testCase.errors();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(asSet(errorsStrict(value))).toEqual(
            asSet([...errors(value), ...undeclaredKeyErrors(value, testCase.declaredKeys)])
          );
        }
      });

      // The divergence is never a relaxation: the fused form must be at least as
      // strict as the merged-allowlist reference on every sample, and STRICTLY
      // stricter on at least one, or the case has stopped being the thing it was
      // written for.
      it.runIf(testCase.divergesFromReference)('is stricter than the merged allowlist, never looser', () => {
        const isStrict = testCase.validateStrict();
        const isValid = testCase.validate();
        const samples = [...testCase.valid, ...testCase.invalid];
        for (const value of samples) {
          if (isStrict(value)) expect(isValid(value) && !hasUndeclared(value)).toBe(true);
        }
        expect(samples.some((value) => !isStrict(value) && isValid(value) && !hasUndeclared(value))).toBe(true);
      });

      it('reports no errors exactly when the validator accepts', () => {
        const isStrict = testCase.validateStrict();
        const errorsStrict = testCase.errorsStrict();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(errorsStrict(value).length === 0).toBe(isStrict(value));
        }
      });
    });
  }
});
