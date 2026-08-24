// Per-family assertion helpers for the overrides suite — the override analogue of
// util/validationAsserts.ts. Each helper exercises ONE function family on an
// OverrideCase, so a failing test name (`<title> — jsonEncoder`) pinpoints which
// family broke. `registerOverrideCase` wires the five it()s for a case so each
// per-type-family .test.ts stays a one-liner.

import {it, expect} from 'vitest';
import type {OverrideCase} from './types.ts';

/** validate: the override predicate accepts/rejects the declared samples. */
export function assertValidateOverride(c: OverrideCase): void {
  const validate = c.validate();
  c.validateSamples.pass.forEach((value, i) => {
    expect(validate(value), `${c.title} validate: pass[${i}]`).toBe(true);
  });
  c.validateSamples.fail.forEach((value, i) => {
    expect(validate(value), `${c.title} validate: fail[${i}]`).toBe(false);
  });
}

/** getValidationErrors: the override appends its one custom error. */
export function assertGetValidationErrorsOverride(c: OverrideCase): void {
  const errors = c.getValidationErrors()(c.errorsValue);
  expect(errors, `${c.title} getValidationErrors`).toHaveLength(1);
  expect((errors[0] as {expected?: string}).expected).toBe('override');
}

/** jsonEncoder: the override returns its hand-tuned string. */
export function assertJsonEncoderOverride(c: OverrideCase): void {
  expect(c.jsonEncoder()(c.jsonValue), `${c.title} jsonEncoder`).toBe(c.jsonString);
}

/** jsonDecoder: the override parses the string back to the value. */
export function assertJsonDecoderOverride(c: OverrideCase): void {
  expect(c.jsonDecoder()(c.jsonString), `${c.title} jsonDecoder`).toEqual(c.jsonValue);
}

/** binary: the override encoder + decoder round-trip the value. */
export function assertBinaryOverride(c: OverrideCase): void {
  const bytes = c.binaryEncoder()(c.binaryValue);
  expect(c.binaryDecoder()(bytes), `${c.title} binary round-trip`).toEqual(c.binaryValue);
}

/** Registers the five family it()s for one case (call inside a describe). */
export function registerOverrideCase(c: OverrideCase): void {
  it(`${c.title} — validate`, () => assertValidateOverride(c));
  it(`${c.title} — getValidationErrors`, () => assertGetValidationErrorsOverride(c));
  it(`${c.title} — jsonEncoder`, () => assertJsonEncoderOverride(c));
  it(`${c.title} — jsonDecoder`, () => assertJsonDecoderOverride(c));
  it(`${c.title} — binary`, () => assertBinaryOverride(c));
}
