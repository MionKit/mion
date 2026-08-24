import type {GetValidationErrorsFn, JsonEncoderFn, JsonDecoderFn, BinaryEncoderFn, BinaryDecoderFn} from '@ts-runtypes/core';

/** One type-family case in the overrides suite. Mirrors the validation /
 *  serialization suites' shape: self-contained thunks that build the compiled
 *  factory (the `overrideX<T>(...)` declarations live at module scope in each
 *  fixture, so calling the factory picks up the override) plus the samples /
 *  expected outputs that prove the override took effect.
 *
 *  Every fixture uses a UNIQUE, branded type so its global override never leaks
 *  to a plain primitive or to another suite. One case per type family runs all
 *  function families against that one type (the type's id folds every family's
 *  cfn at once). */
export interface OverrideCase {
  title: string;

  /** validate — `createValidateFn<T>()` returns the custom predicate. */
  validate: () => (value: unknown) => boolean;
  /** Samples the override predicate must accept / reject. */
  validateSamples: {pass: unknown[]; fail: unknown[]};

  /** getValidationErrors — the override appends one custom error for any value. */
  getValidationErrors: () => GetValidationErrorsFn;
  /** A representative value handed to the errors override. */
  errorsValue: unknown;

  /** jsonEncoder — encodes `jsonValue` to the hand-tuned `jsonString`. */
  jsonEncoder: () => JsonEncoderFn;
  /** jsonDecoder — the inverse: decodes `jsonString` back to `jsonValue`. */
  jsonDecoder: () => JsonDecoderFn;
  jsonValue: unknown;
  jsonString: string;

  /** binary — the override encoder + decoder round-trip `binaryValue`. */
  binaryEncoder: () => BinaryEncoderFn;
  binaryDecoder: () => BinaryDecoderFn;
  binaryValue: unknown;
}
