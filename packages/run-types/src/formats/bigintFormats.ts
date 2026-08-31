// BigInt-format TYPE aliases — the public type surface of the bigint
// format family (BigInt + the positive/negative/64-bit defaults).
// Validation, serialization (the setBigInt64/setBigUint64 8-byte packing)
// and mocking are emitted/registered elsewhere; this file is type-only +
// the brand wiring. Mirrors
// (ref: packages/type-formats/src/bigint/{bigIntFormat.runtype.ts,defaultBigNumberFormats.ts}).
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import {presetBuilder} from '../runtypes/builderCore.ts';

// ─────────────────────────── BigIntFormat ───────────────────────────

// BigIntParams — the wire-serialisable params shape for BigInt.
// Cross-param invariants (min⊕gt, max⊕lt, multipleOf>0) are validated
// build-time in Go: a lower/upper bound is inclusive OR exclusive, never
// both. No integer/float distinction — bigints are integers.
export interface BigIntParams {
  min?: bigint;
  max?: bigint;
  lt?: bigint;
  gt?: bigint;
  multipleOf?: bigint;
  /** JSON Schema alias of `min` (inclusive lower bound). Normalised to `min`. */
  minimum?: bigint;
  /** JSON Schema alias of `max` (inclusive upper bound). Normalised to `max`. */
  maximum?: bigint;
  /** JSON Schema alias of `gt` (exclusive lower bound). Normalised to `gt`. */
  exclusiveMinimum?: bigint;
  /** JSON Schema alias of `lt` (exclusive upper bound). Normalised to `lt`. */
  exclusiveMaximum?: bigint;
}

// BigInt — the branded bigint alias users annotate with:
// `BigInt<{min: 0n}>`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BigInt<P extends BigIntParams = {}, BrandName extends string = never> = TypeFormat<
  bigint,
  'bigintFormat',
  P,
  BrandName
>;

// Default bigint formats — ported from the reference defaultBigNumberFormats.ts.
// BigInt64 / BigUInt64 SET the min/max that select the 8-byte
// binary packing; the others fall back to decimal-string serialization.
export type BigPositive = BigInt<{min: 0n}>;
export type BigNegative = BigInt<{max: 0n}>;
export type BigPositiveInt = BigInt<{min: 0n; multipleOf: 1n}>;
export type BigNegativeInt = BigInt<{max: 0n; multipleOf: 1n}>;
export type BigInt64 = BigInt<{min: -9223372036854775808n; max: 9223372036854775807n}>;
export type BigUInt64 = BigInt<{min: 0n; max: 18446744073709551615n}>;

// ───────────────────── Predefined bigint builders ───────────────────
//
// Value-first builder per named alias (`TF.bigInt64()` → `RunType<BigInt64>`, …),
// carrying the CONCRETE alias above so the value-first id converges with the
// type-first `createValidateFn<BigInt64>()`. Fixed presets → a single no-arg overload
// via `presetBuilder`. For ad-hoc constraints use `TF.bigInt({min, max, …})`.

/** ≥ 0n (`BigPositive`). **/
export const bigPositive = presetBuilder<BigPositive>('bigint');
/** ≤ 0n (`BigNegative`). **/
export const bigNegative = presetBuilder<BigNegative>('bigint');
/** ≥ 0n, whole (`BigPositiveInt`). **/
export const bigPositiveInt = presetBuilder<BigPositiveInt>('bigint');
/** ≤ 0n, whole (`BigNegativeInt`). **/
export const bigNegativeInt = presetBuilder<BigNegativeInt>('bigint');
/** Signed 64-bit bigint (`BigInt64`). **/
export const bigInt64 = presetBuilder<BigInt64>('bigint');
/** Unsigned 64-bit bigint (`BigUInt64`). **/
export const bigUInt64 = presetBuilder<BigUInt64>('bigint');
