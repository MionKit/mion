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
import {STRICT} from './Strict.ts';
import type {RTValidationError} from '@ts-runtypes/core';

/** Entries compared as a SET: the fused walk interleaves type and unknown-key
 *  errors per node where the two-call form groups all of one kind ahead of the
 *  other, so membership is the shared contract, not sequence. */
const errorKey = (error: RTValidationError) => JSON.stringify([error.path, error.expected]);
const asSet = (errors: RTValidationError[]) => errors.map(errorKey).sort();

describe('strict-validation / Strict', () => {
  for (const testCase of Object.values(STRICT)) {
    describe(testCase.title, () => {
      it('accepts every valid sample', () => {
        const isStrict = testCase.validateStrict();
        for (const value of testCase.valid) expect(isStrict(value)).toBe(true);
      });

      it('rejects every invalid sample', () => {
        const isStrict = testCase.validateStrict();
        for (const value of testCase.invalid) expect(isStrict(value)).toBe(false);
      });

      it('agrees with validate(v) && !hasUnknownKeys(v) on every sample', () => {
        const isStrict = testCase.validateStrict();
        const isValid = testCase.validate();
        const hasUnknown = testCase.hasUnknownKeys();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(isStrict(value)).toBe(isValid(value) && !hasUnknown(value));
        }
      });

      it('reports the same entries as getValidationErrors + unknownKeyErrors', () => {
        const errorsStrict = testCase.errorsStrict();
        const errors = testCase.errors();
        const keyErrors = testCase.unknownKeyErrors();
        for (const value of [...testCase.valid, ...testCase.invalid]) {
          expect(asSet(errorsStrict(value))).toEqual(asSet([...errors(value), ...keyErrors(value)]));
        }
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
