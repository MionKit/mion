import type {
  __rtFormatName,
  __rtFormatParams,
  __rtFormatBrand,
  __rtContains,
  __rtPatternProps,
  __rtPropNames,
} from './sentinelKeys.ts';
import type {DataOnlyNativeExtra} from './dataOnly.ts';

/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** `JSONShape<T>` — the RunTypes JSON WIRE shape of `T`: what `createJsonEncoderFn<T>()` writes and
 *  `createJsonDecoderFn<T>()` reads back. `DataOnly`'s wire twin: every JS-only leaf maps to its JSON
 *  encoding, mirroring the Go emitters (internal/cachegen/typefunctions/json_prepare.go / json_restore.go)
 *  leaf for leaf, unions included (union_flat.go).
 *  ⚠️ NOT the shape of arbitrary third-party JSON: a plain client does not wrap unions in envelopes.
 *  ⚠️ NEVER REFLECT it: `createValidateFn<JSONShape<T>>()` would validate the wire spelling with every brand deleted.
 *  Best-effort, safe-side corners: the envelope's index is not pinned per member; the `[-1, merged]` object arm is
 *  spelled as the plain union of object-member wires; the raw-vs-envelope predicate models neither the record-union
 *  optimisation nor the index-signature fallback; and a ROOT-level `undefined`, which the encoder returns as
 *  `undefined`, is spelled `null` here. **/

/** The full set from sentinelKeys.ts: the object map's symbol filter drops them, the primitive arms use them to detect a branded base. **/
type JSONShapeSentinelKeys =
  | typeof __rtFormatName
  | typeof __rtFormatParams
  | typeof __rtFormatBrand
  | typeof __rtContains
  | typeof __rtPatternProps
  | typeof __rtPropNames;

/** Non-data kinds the wire never carries — `DataOnly`'s stripped set. **/
type JSONShapeStripped =
  | symbol
  | RegExp
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown)
  | {then: (...args: never[]) => unknown}
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView;

/** Natives whose wire form is their canonical STRING; Temporal rides the same `DataOnlyNativeExtra` augmentation `DataOnly` uses. **/
type JSONShapeStringNative = Date | DataOnlyNativeExtra[keyof DataOnlyNativeExtra];

/** Recursion budget — same discipline as `DataOnly` / `StripRunTypeMeta`. **/
type _JSONShapeDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** True for a union; boolean is `true | false` and deliberately reads as one, its members being JSON-natural, so it stays raw. **/
type JSONShapeIsUnion<T> = [T] extends [never] ? false : true extends JSONShapeUnionProbe<T, T> ? true : false;
type JSONShapeUnionProbe<T, U> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/** The type-level twin of the Go layout's AtomicNeedsTuple rule (union_flat_layout.go): anything not JSON-natural forces the all-or-nothing wrap. **/
type JSONShapeUnionIsRaw<T> = [Exclude<T, string | number | boolean | null | undefined>] extends [never] ? true : false;

/** A declared `undefined` member stays spelled: it surfaces as an absent optional slot, which reads back as `undefined`. **/
type JSONShapeRawMember<T, Depth extends number> = T extends undefined ? undefined : JSONShapeNode<T, Depth>;

/** An undefined-capable slot spells `null`, because the tuple emitter replaces it so the array keeps its length (json_prepare.go, emitTupleMemberPrepareForJson). **/
// Object properties keep `undefined` instead: an absent key reads back as undefined.
type JSONShapeArraySlot<V, Depth extends number> = undefined extends V
  ? JSONShape<Exclude<V, undefined>, _JSONShapeDepth[Depth]> | null
  : JSONShape<V, _JSONShapeDepth[Depth]>;

/** The object members' `[-1, merged]` envelope arm is approximated by the plain union of their wire shapes. **/
type JSONShapeUnion<T, Depth extends number> =
  JSONShapeUnionIsRaw<T> extends true
    ? T extends unknown
      ? JSONShapeRawMember<T, Depth>
      : never
    : [number, T extends unknown ? JSONShape<T, _JSONShapeDepth[Depth]> : never];

/** The RunTypes JSON wire shape of `T` — see the module doc above. **/
export type JSONShape<T, Depth extends number = 8> = Depth extends 0
  ? unknown // budget exhausted — annotation-grade widen (never a wrong claim)
  : unknown extends T
    ? T // any / unknown — keep the broad kinds
    : JSONShapeIsUnion<T> extends true
      ? JSONShapeUnion<T, Depth>
      : JSONShapeNode<T, Depth>;

/** Single-constituent ladder — `DataOnly`'s order with the wire leaf maps. **/
type JSONShapeNode<T, Depth extends number> = T extends JSONShapeStripped
  ? never // symbol / fn / ctor / thenable / buffers — never on the wire
  : T extends bigint
    ? Extract<keyof T, JSONShapeSentinelKeys> extends never
      ? `${T}` // decimal-digit string; a literal keeps its exact digits
      : `${bigint}` // branded — the wire is the bare digit string
    : T extends string
      ? string extends T
        ? string
        : Extract<keyof T, JSONShapeSentinelKeys> extends never
          ? T // plain literal — keep verbatim
          : string // branded literal / nominal brand — the wire is the base
      : T extends number
        ? number extends T
          ? number
          : Extract<keyof T, JSONShapeSentinelKeys> extends never
            ? T
            : number
        : T extends boolean
          ? T // boolean / boolean literal — JSON-native
          : T extends null | undefined | void
            ? null // a declared undefined / void LEAF is null on the wire
            : T extends JSONShapeStringNative
              ? string // Date / Temporal — canonical string form
              : JSONShapeLadder<T, Depth>;

type JSONShapeLadder<T, Depth extends number> =
  T extends ReadonlyMap<any, any>
    ? T extends ReadonlyMap<infer K, infer V>
      ? [JSONShape<K, _JSONShapeDepth[Depth]>, JSONShape<V, _JSONShapeDepth[Depth]>][] // Map — entries array (new Map(v))
      : never // unreachable — gate guarantees a Map
    : T extends ReadonlySet<any>
      ? T extends ReadonlySet<infer U>
        ? JSONShape<U, _JSONShapeDepth[Depth]>[] // Set — element array (new Set(v))
        : never // unreachable — gate guarantees a Set
      : T extends readonly unknown[]
        ? Extract<keyof T, JSONShapeSentinelKeys> extends never
          ? {-readonly [K in keyof T]: JSONShapeArraySlot<T[K], Depth>} // array + tuple — slots recurse
          : T extends readonly (infer E)[]
            ? JSONShapeArraySlot<E, Depth>[] // structurally-branded array — element wire, brand gone
            : never // unreachable — gate guarantees an array
        : T extends object
          ? object extends T
            ? T // broad object / {} — keep
            : {
                // Symbol keys (all sentinels included) drop; `?` / `readonly` survive the map
                [K in keyof T as K extends symbol
                  ? never
                  : [JSONShape<T[K], _JSONShapeDepth[Depth]>] extends [never]
                    ? never
                    : K]: JSONShape<T[K], _JSONShapeDepth[Depth]>;
              }
          : T;
