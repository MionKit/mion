// strict-validation / Strict — every case is checked four ways:
//
//   accepts / rejects  the stated samples (the behaviour a user reads about)
//   validator parity   fused === validate(v) && !hasUnknownKeys(v)
//   report parity      fused errors === verr(v) + uke(v), as a SET
//   agreement          the fused pair agrees with itself: empty report ⇔ accepted
//
// The parity pair is the load-bearing half. The composition is the reference
// implementation these functions replace, so comparing against it (rather than a
// hand-written expectation) is what stops the two drifting apart as either side
// changes.

import {describe, expect, it} from 'vitest';
import {STRICT, type StrictCase} from './Strict.ts';
import type {RTValidationError} from '@ts-runtypes/core';

/** Entries compared as a SET: the fused walk interleaves type and unknown-key
 *  errors per node where the two-call form groups all of one kind ahead of the
 *  other, so membership is the shared contract, not sequence. */
const errorKey = (error: RTValidationError) => JSON.stringify([error.path, error.expected]);
const asSet = (errors: RTValidationError[]) => errors.map(errorKey).sort();

describe('strict-validation / Strict', () => {
  // Widened to StrictCase: `as const satisfies` keeps the literal shape of each
  // entry, so a case that does not set `divergesFromComposition` has no such
  // property to read at all.
  for (const testCase of Object.values(STRICT) as StrictCase[]) {
    describe(testCase.title, () => {
      it('accepts every valid sample', () => {
        const isStrict = testCase.validateStrict();
        for (const value of testCase.valid) expect(isStrict(value)).toBe(true);
      });

      it('rejects every invalid sample', () => {
        const isStrict = testCase.validateStrict();
        for (const value of testCase.invalid) expect(isStrict(value)).toBe(false);
      });

      // Parity holds everywhere the two forms CAN agree. A union cannot: see
      // the divergence assertion below, and divergesFromComposition on the case.
      it.skipIf(testCase.divergesFromComposition)('agrees with validate(v) && !hasUnknownKeys(v) on every sample', () => {
        const isStrict = testCase.validateStrict();
        const isValid = testCase.validate();
        const hasUnknown = testCase.hasUnknownKeys();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(isStrict(value)).toBe(isValid(value) && !hasUnknown(value));
        }
      });

      it.skipIf(testCase.divergesFromComposition)('reports the same entries as getValidationErrors + unknownKeyErrors', () => {
        const errorsStrict = testCase.errorsStrict();
        const errors = testCase.errors();
        const keyErrors = testCase.unknownKeyErrors();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(asSet(errorsStrict(value))).toEqual(asSet([...errors(value), ...keyErrors(value)]));
        }
      });

      // The divergence is never a relaxation: the fused form must be at least as
      // strict as the composition on every sample, and STRICTLY stricter on at
      // least one, or the case has stopped being the thing it was written for.
      it.runIf(testCase.divergesFromComposition)('is stricter than the composition, never looser', () => {
        const isStrict = testCase.validateStrict();
        const isValid = testCase.validate();
        const hasUnknown = testCase.hasUnknownKeys();
        const samples = [...testCase.valid, ...testCase.invalid];
        for (const value of samples) {
          if (isStrict(value)) expect(isValid(value) && !hasUnknown(value)).toBe(true);
        }
        expect(samples.some((value) => !isStrict(value) && isValid(value) && !hasUnknown(value))).toBe(true);
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
