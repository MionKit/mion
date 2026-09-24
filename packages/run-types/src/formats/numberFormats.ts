// Number-format TYPE aliases; validation, serialization and
// mocking are emitted elsewhere. `TypeFormat` IS imported as a value (not `import type`): the
// value-level import keeps each brand alias's reflection metadata reachable for tsgo.
// (ref: packages/type-formats/src/number/{numberFormat.runtype.ts,defaultNumberFormats.ts}).

import {TypeFormat} from '../runtypes/typeFormat.ts';
import {presetBuilder} from '../runtypes/builderCore.ts';

// ─────────────────────────── NumberFormat ───────────────────────────

// Cross-param invariants (integer⊕float, min⊕gt, max⊕lt, multipleOf rules) are validated build-time
// in Go: a lower bound is inclusive (`min`) OR exclusive (`gt`), never both, likewise the upper bound.
export interface NumberParams {
  integer?: boolean;
  /** Generation/presentation tag, NEVER a failable constraint (a float legally holds whole values
   *  like 2.0): steers mocks toward fractional samples.
   *  Mutually exclusive with `integer`. */
  float?: boolean;
  min?: number;
  max?: number;
  lt?: number;
  gt?: number;
  multipleOf?: number;
  /** Tolerance relative to `value / multipleOf` for a FRACTIONAL step (floats can't hold 0.01). Default 4 * EPSILON, in (0, 1). */
  multipleOfTolerance?: number;
  /** JSON Schema alias of `min` (inclusive lower bound). Normalised to `min`. */
  minimum?: number;
  /** JSON Schema alias of `max` (inclusive upper bound). Normalised to `max`. */
  maximum?: number;
  /** JSON Schema alias of `gt` (exclusive lower bound). Normalised to `gt`. */
  exclusiveMinimum?: number;
  /** JSON Schema alias of `lt` (exclusive upper bound). Normalised to `lt`. */
  exclusiveMaximum?: number;
  /** Marks the value as a monetary amount: PURE PRESENTATION METADATA, the only number param with no
   *  failable constraint, so validation, serialization and mocking ignore it and it never becomes an
   *  `rt$errors` template key. The emitter echoes it onto every error the field produces, so
   *  `createFriendlyTextI18n` renders a violated bound via `Intl.NumberFormat(locale, {style:
   *  'currency', currency})` with the app-supplied `currency` renderer option. WHICH currency a value
   *  is in is runtime data, deliberately never a type param. */
  isCurrency?: boolean;
}

// The branded number alias users annotate with, e.g. `Number<{min: 0; max: 100}>`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Number<P extends NumberParams = {}, BrandName extends string = never> = TypeFormat<
  number,
  'numberFormat',
  P,
  BrandName
>;

// A PARAM PRESET over the plain number format (like Integer / Int8), merging `isCurrency: true` into
// the user's params: no distinct format name, no special Go functionality.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Currency<P extends NumberParams = {}, BrandName extends string = never> = Number<P & {isCurrency: true}, BrandName>;

// The fixed-width int formats SET the min/max of their width (Int8 → -128..127, UInt16 → 0..65535, …).
export type Integer = Number<{integer: true}>;
export type Float = Number<{float: true}>;
export type Positive = Number<{min: 0}>;
export type Negative = Number<{max: 0}>;
export type PositiveInt = Number<{min: 0; integer: true}>;
export type NegativeInt = Number<{max: 0; integer: true}>;
export type Int8 = Number<{integer: true; min: -128; max: 127}>;
export type Int16 = Number<{integer: true; min: -32768; max: 32767}>;
export type Int32 = Number<{integer: true; min: -2147483648; max: 2147483647}>;
export type UInt8 = Number<{integer: true; min: 0; max: 255}>;
export type UInt16 = Number<{integer: true; min: 0; max: 65535}>;
export type UInt32 = Number<{integer: true; min: 0; max: 4294967295}>;

// ───────────────────── Predefined number builders ───────────────────
//
// Each builder carries the CONCRETE alias above, so the Go scanner reflects the SAME branded type off
// its `InjectRunTypeId<…>` brand as the type-first `createValidateFn<Int8>()` and the two converge on
// one structural id. For ad-hoc constraints use `TF.number({min, max, …})`.

/** Integer (`Integer`). **/
export const integer = presetBuilder<Integer>('number');
/** Float-natured number (`Float`): fractional mocks, float64 packing; whole values still validate. **/
export const float = presetBuilder<Float>('number');
/** ≥ 0 (`Positive`). **/
export const positive = presetBuilder<Positive>('number');
/** ≤ 0 (`Negative`). **/
export const negative = presetBuilder<Negative>('number');
/** Integer ≥ 0 (`PositiveInt`). **/
export const positiveInt = presetBuilder<PositiveInt>('number');
/** Integer ≤ 0 (`NegativeInt`). **/
export const negativeInt = presetBuilder<NegativeInt>('number');
/** Signed 8-bit integer (`Int8`). **/
export const int8 = presetBuilder<Int8>('number');
/** Signed 16-bit integer (`Int16`). **/
export const int16 = presetBuilder<Int16>('number');
/** Signed 32-bit integer (`Int32`). **/
export const int32 = presetBuilder<Int32>('number');
/** Unsigned 8-bit integer (`UInt8`). **/
export const uint8 = presetBuilder<UInt8>('number');
/** Unsigned 16-bit integer (`UInt16`). **/
export const uint16 = presetBuilder<UInt16>('number');
/** Unsigned 32-bit integer (`UInt32`). **/
export const uint32 = presetBuilder<UInt32>('number');
