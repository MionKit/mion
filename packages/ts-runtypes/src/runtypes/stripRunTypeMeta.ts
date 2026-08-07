import type {
  __rtFormatName,
  __rtFormatParams,
  __rtFormatBrand,
  __rtNot,
  __rtContains,
  __rtPatternProps,
  __rtPropNames,
  __rtOneOf,
  __rtUnevaluated,
} from './sentinelKeys.ts';

/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** `StripRunTypeMeta<T>` — the ANNOTATION-grade projection of a type: every
 *  RunTypes sentinel (format brands, negation / contains / patternProperties /
 *  propertyNames / oneOf / unevaluated slots) is removed and the plain data
 *  shape survives. `Email` collapses to `string`, a `FormattedArray<number[],…>`
 *  to `number[]`, an object drops its sentinel-symbol keys and recurses its
 *  members. Use it where a CLEAN TypeScript type is the deliverable — editor
 *  hovers, generated documentation, assignability gates over external data.
 *
 *  ⚠️ NEVER REFLECT the stripped type. The metadata IS the validation
 *  contract: `createValidateFn<StripRunTypeMeta<T>>()` builds a validator with
 *  every constraint deleted, silently. `DataOnly<T>` is the reflection-safe
 *  projection (it KEEPS the sentinels for exactly this reason); this type is
 *  its never-reflected annotation twin. The same applies to `JsonSchemaType`.
 *
 *  Documented residuals (kept VERBATIM rather than guessed at):
 *   - branded LITERALS (`'a' & Format…`) and branded TUPLES — TypeScript has
 *     no generic intersection subtraction, and element inference on a branded
 *     tuple loses the slot structure, so both keep their brand;
 *   - a REQUIRED nominal brand (`__rtFormatBrand`) collapses with its format,
 *     so the stripped type is assignable FROM the branded one but not back —
 *     wide (optional-sentinel) brands stay mutually assignable;
 *   - Temporal formats (their base classes live behind the opt-in temporal
 *     subpath, which this core module cannot name), `Map`/`Set`/`RegExp` and
 *     function shapes pass through untouched.
 *
 *  The `#region stripmeta-extract` block is sliced VERBATIM by
 *  test/types/stripMetaHarness.ts into the per-branch budget test — keep it
 *  self-contained (lib types + its own declarations only). **/

// #region stripmeta-extract — StripRunTypeMeta machinery; sliced verbatim
// between these markers by test/types/stripMetaHarness.ts.

/** Every sentinel key the RunTypes encodings ride — the full set from
 *  sentinelKeys.ts, including the nominal brand key. **/
type StripMetaSentinelKeys =
  | typeof __rtFormatName
  | typeof __rtFormatParams
  | typeof __rtFormatBrand
  | typeof __rtNot
  | typeof __rtContains
  | typeof __rtPatternProps
  | typeof __rtPropNames
  | typeof __rtOneOf
  | typeof __rtUnevaluated;

/** Recursion-budget decrement — same discipline as `DataOnly`: bounded depth
 *  lets circular types resolve finitely, and the floor keeps the remaining
 *  sub-tree verbatim (best effort) instead of tripping TS2589. **/
type _StripMetaDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

export type StripRunTypeMeta<T, Depth extends number = 8> = Depth extends 0
  ? T // budget exhausted — keep the remaining sub-tree as-is (best effort)
  : unknown extends T
    ? T // any / unknown — keep the broad kinds
    : T extends string
      ? string extends T
        ? string // wide brand (Email, StringFormat<…>) — collapse to the base
        : T extends {readonly [__rtFormatBrand]: string}
          ? string // required nominal brand — collapse one-way to the base
          : T // plain literal, or a branded literal residual — keep verbatim
      : T extends number
        ? number extends T
          ? number
          : T extends {readonly [__rtFormatBrand]: string}
            ? number
            : T
        : T extends bigint
          ? bigint extends T
            ? bigint
            : T extends {readonly [__rtFormatBrand]: string}
              ? bigint
              : T
          : T extends boolean | null | undefined
            ? T
            : T extends Date
              ? Date // FormatDate<…> — collapse to the bare class
              : T extends (...args: never[]) => unknown
                ? T // functions stay functions — this is not DataOnly
                : T extends readonly unknown[]
                  ? StripMetaArray<T, Depth>
                  : T extends object
                    ? StripMetaObject<T, Depth>
                    : T;

/** Arrays + tuples. An UNBRANDED array-like recurses homomorphically (tuple
 *  slots, rest tails and modifiers all survive the mapped type). A BRANDED
 *  plain array recovers its element by inference — `FormattedArray<number[],…>
 *  extends readonly (infer E)[]` infers `number`, dropping every slot the
 *  brand rode — while a branded TUPLE keeps verbatim (element inference would
 *  erase the slot structure; a mapped type would mangle the brand). **/
type StripMetaArray<T extends readonly unknown[], Depth extends number> =
  Extract<keyof T, StripMetaSentinelKeys> extends never
    ? {[K in keyof T]: StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>}
    : number extends T['length']
      ? T extends readonly (infer E)[]
        ? T extends unknown[]
          ? StripRunTypeMeta<E, _StripMetaDepth[Depth]>[]
          : readonly StripRunTypeMeta<E, _StripMetaDepth[Depth]>[]
        : T
      : T; // branded tuple — keep-verbatim residual

/** Objects: drop every symbol key (the sentinels are symbol-keyed; symbol
 *  members are never data anyway) and recurse the values, preserving the
 *  `readonly` / `?` modifiers via the homomorphic `as` filter. `Map` / `Set` /
 *  `RegExp` and the broad `object` pass through verbatim. **/
type StripMetaObject<T extends object, Depth extends number> = object extends T
  ? T
  : T extends ReadonlyMap<any, any> | ReadonlySet<any> | RegExp
    ? T
    : {
        [K in keyof T as K extends symbol ? never : K]: StripRunTypeMeta<T[K], _StripMetaDepth[Depth]>;
      };
// #endregion stripmeta-extract
