// Shared assertion helpers for the circular-reference GUARD suites (validation
// + serialization, atomic + format). Distinct from the existing Circular /
// CircularRefs suites — those exercise recursive TYPES with acyclic VALUES;
// these feed a runtime VALUE that contains a reference cycle and assert the
// opt-in guard catches it.
//
// Each case arms the guard via the compile-time `{rejectCircularRefs: true}`
// option in its factory thunks — a distinct compiled factory whose body bakes in
// the cycle check, so runs can't leak into each other (there is no global state).
// The thunk's value (if any) is for TYPE INFERENCE only; the cyclic value under
// test comes from `getValue()`.

import {expect} from 'vitest';
import {CircularReferenceError, type GetValidationErrorsFn} from '@ts-runtypes/core';

type AnyValidateFn = (value: unknown) => boolean;
type AnyJsonEncoderFn = (value: unknown) => string | undefined;
type AnyBinaryEncoderFn = (value: unknown) => unknown;

/** One circular-guard case for the validate / getValidationErrors families. */
export interface CircularGuardValidationCase {
  title: string;
  description?: string;
  /** `createValidateFn<T>(undefined, {rejectCircularRefs: true})` — STATIC form. */
  validate: () => AnyValidateFn;
  /** Reflect form — `T` inferred from an acyclic annotated value. */
  validateReflect: () => AnyValidateFn;
  /** `createGetValidationErrorsFn<T>(undefined, {rejectCircularRefs: true})` — STATIC. */
  getValidationErrors: () => GetValidationErrorsFn;
  /** Reflect-form companion. */
  getValidationErrorsReflect: () => GetValidationErrorsFn;
  /** Builds the runtime value under test — a cyclic graph, or an acyclic
   *  control when `expectValid` is true. */
  getValue: () => unknown;
  /** `true` for an acyclic control (validate passes, no circular error);
   *  `false` when the value cycles (validate fails, circular error recorded). */
  expectValid: boolean;
}

/** Runs the validate variant (static or reflect) against the case value. */
export function assertCircularValidate(testCase: CircularGuardValidationCase, reflect: boolean): void {
  const validate = reflect ? testCase.validateReflect() : testCase.validate();
  expect(validate(testCase.getValue())).toBe(testCase.expectValid);
}

/** Runs the getValidationErrors variant: an acyclic control yields `[]`, a cycle
 *  yields at least one `{expected: 'circular'}` entry. */
export function assertCircularGetValidationErrors(testCase: CircularGuardValidationCase, reflect: boolean): void {
  const getErrors = reflect ? testCase.getValidationErrorsReflect() : testCase.getValidationErrors();
  const errors = getErrors(testCase.getValue());
  if (testCase.expectValid) {
    expect(errors).toEqual([]);
  } else {
    expect(errors.some((error) => error.expected === 'circular')).toBe(true);
  }
}

/** One circular-guard case for the jsonEncode / binaryEncode families. */
export interface CircularGuardSerializationCase {
  title: string;
  description?: string;
  /** `createJsonEncoderFn<T>(undefined, {rejectCircularRefs: true})`. */
  jsonEncoder: () => AnyJsonEncoderFn;
  /** `createBinaryEncoderFn<T>(undefined, {rejectCircularRefs: true})`. */
  binaryEncoder: () => AnyBinaryEncoderFn;
  /** Builds the runtime value under test — cyclic, or an acyclic control. */
  getValue: () => unknown;
  /** `true` when the value cycles (encoders throw `CircularReferenceError`);
   *  `false` for an acyclic control (encoders succeed). */
  expectThrows: boolean;
}

/** Runs the JSON encoder: a cycle throws `CircularReferenceError`, an acyclic
 *  control encodes without throwing. */
export function assertCircularJsonEncode(testCase: CircularGuardSerializationCase): void {
  const encode = testCase.jsonEncoder();
  if (testCase.expectThrows) {
    expect(() => encode(testCase.getValue())).toThrow(CircularReferenceError);
  } else {
    expect(() => encode(testCase.getValue())).not.toThrow();
  }
}

/** Runs the binary encoder with the same cycle/acyclic contract. */
export function assertCircularBinaryEncode(testCase: CircularGuardSerializationCase): void {
  const encode = testCase.binaryEncoder();
  if (testCase.expectThrows) {
    expect(() => encode(testCase.getValue())).toThrow(CircularReferenceError);
  } else {
    expect(() => encode(testCase.getValue())).not.toThrow();
  }
}
