// Each case checks its samples, the fused pair's self-agreement (empty report ⇔ accepted), and the load-bearing
// validator and report parity against an independent reference: the plain validators plus an in-test key walk.

import {describe, expect, it} from 'vitest';
import {STRICT, undeclaredKeyErrors, type StrictCase} from './Strict.ts';
import type {RTValidationError} from '@mionjs/run-types';

/** Compared as a SET: the fused walk interleaves errors per node, the reference groups them by kind. */
const errorKey = (error: RTValidationError) => JSON.stringify([error.path, error.expected]);
const asSet = (errors: RTValidationError[]) => errors.map(errorKey).sort();

describe('strict-validation / Strict', () => {
  // Widened: `as const satisfies` leaves a case without `divergesFromReference` no such property to read.
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

      // A union cannot reach parity: see the divergence assertion below.
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

      // Never looser than the merged allowlist, and stricter on some sample, or the case no longer tests a divergence.
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
