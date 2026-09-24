// BigInt-format TYPE aliases; validation, serialization and mocking are emitted elsewhere. `TypeFormat` is a value
// import (not `import type`) so each brand alias's reflection metadata stays reachable for tsgo.
// (ref: packages/type-formats/src/bigint/{bigIntFormat.runtype.ts,defaultBigNumberFormats.ts}).

import {TypeFormat} from '../runtypes/typeFormat.ts';
import {presetBuilder} from '../runtypes/builderCore.ts';

// ─────────────────────────── BigIntFormat ───────────────────────────

// Cross-param invariants (min⊕gt, max⊕lt, multipleOf>0) are validated build-time in Go: a bound is
// inclusive OR exclusive, never both. No integer/float distinction, bigints are integers.
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

// The branded bigint alias users annotate with, e.g. `BigInt<{min: 0n}>`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BigInt<P extends BigIntParams = {}, BrandName extends string = never> = TypeFormat<
  bigint,
  'bigintFormat',
  P,
  BrandName
>;

export type BigPositive = BigInt<{min: 0n}>;
export type BigNegative = BigInt<{max: 0n}>;
export type BigPositiveInt = BigInt<{min: 0n; multipleOf: 1n}>;
export type BigNegativeInt = BigInt<{max: 0n; multipleOf: 1n}>;
export type BigInt64 = BigInt<{min: -9223372036854775808n; max: 9223372036854775807n}>;
export type BigUInt64 = BigInt<{min: 0n; max: 18446744073709551615n}>;

// ───────────────────── Predefined bigint builders ───────────────────
//
// Each builder carries the CONCRETE alias above, so the value-first id converges with the type-first
// `createValidateFn<BigInt64>()`. For ad-hoc constraints use `TF.bigInt({min, max, …})`.

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
