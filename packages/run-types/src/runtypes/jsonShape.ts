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

/** `JSONShape<T>` — the RunTypes JSON WIRE shape of `T`: the value
 *  `JSON.parse(createJsonEncoderFn<T>()(v))` produces and
 *  `createJsonDecoderFn<T>()` reads back. It is `DataOnly<T>`'s wire twin:
 *  where `DataOnly` keeps `Date` /
 *  `bigint` / `Map` verbatim (the validator checks the JS value), `JSONShape`
 *  maps every JS-only leaf to its JSON encoding, mirroring the Go serializer
 *  emitters (internal/cachegen/typefunctions/json_prepare.go /
 *  json_restore.go) leaf-for-leaf:
 *   - `Date` / Temporal (via the `DataOnlyNativeExtra` augmentation) → their
 *     ISO / canonical string (`toJSON()`, revived by `new Date(v)` /
 *     `Temporal.*.from(v)`);
 *   - `bigint` → its decimal-digit string (`v.toString()` / `BigInt(v)`), a
 *     bigint literal keeping the exact digits (`5n` → `"5"`);
 *   - `Map<K, V>` → `[K, V][]` entries (materialised for `new Map(v)`),
 *     `Set<V>` → `V[]`;
 *   - `undefined` / `void` leaves → `null` (the wire spelling in array and
 *     object slots — see json_stringify.go);
 *   - non-data members (symbols, functions, thenables, the non-serialisable
 *     buffers) → dropped, exactly as `DataOnly` drops them;
 *   - format / structural brands are META, not data: a branded primitive
 *     widens to its base (`Email` → `string`), sentinel-symbol keys never
 *     reach the wire.
 *
 *  UNIONS ride the serializer's FLAT-UNION envelope (union_flat.go): when any
 *  member is not JSON-natural (not `string | number | boolean | null |
 *  undefined`), the wire wraps as `[memberIndex, memberWire]` — spelled here
 *  as `[number, <union of member wires>]`, since TS cannot pin the runtime
 *  member ordering — and object members travel inside the same envelope as
 *  the `[-1, mergedObject]` arm, approximated by the union of the object
 *  members' own wire shapes. A union of JSON-natural members round-trips RAW
 *  (no envelope), `undefined` members spelling themselves (they surface as
 *  absent/optional slots; a declared `undefined` LEAF is `null` on the wire).
 *
 *  ⚠️ This is the RUNTYPES wire — what `createJsonEncoderFn` writes and
 *  `createJsonDecoderFn` reads — NOT the shape of arbitrary third-party JSON:
 *  a plain client does not wrap unions in envelopes. Use it to type stored /
 *  transported wire documents on the RunTypes side of the pipe.
 *
 *  ⚠️ NEVER REFLECT this type: `createValidateFn<JSONShape<T>>()` would
 *  validate the wire spelling with every brand deleted. Like
 *  `StripRunTypeMeta`, it is an annotation-grade projection.
 *
 *  Documented residuals (best-effort corners, all safe-side):
 *   - the envelope's `number` index is not pinned per member, and the
 *     `[-1, merged]` object arm is spelled as the plain union of object-member
 *     wires rather than the merged property bag;
 *   - the raw-vs-envelope predicate mirrors the Go rule's common shape
 *     ("every member JSON-natural"); the record-union optimisation and the
 *     index-signature fallback are not modelled;
 *   - a ROOT-level `undefined` is returned as `undefined` by the encoder
 *     (top-level `undefined` is not a JSON document) but spelled `null` here;
 *   - object-based sentinel carriers recurse structurally (their symbol keys
 *     drop). **/

/** Sentinel keys — the full set from sentinelKeys.ts; symbol-keyed, so the
 *  object map's symbol filter drops them and the primitive arms use them to
 *  detect a branded base. **/
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
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown)
  | {then: (...args: never[]) => unknown}
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView;

/** Native classes whose wire form is their canonical STRING: `Date` and the
 *  Temporal classes folded in through the same `DataOnlyNativeExtra`
 *  augmentation `DataOnly` uses. (`RegExp` is not data and never rides the
 *  wire; `DataOnly` strips it first.) **/
type JSONShapeStringNative = Date | DataOnlyNativeExtra[keyof DataOnlyNativeExtra];

/** Recursion budget — same discipline as `DataOnly` / `StripRunTypeMeta`. **/
type _JSONShapeDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** True when `T` is a union (2+ constituents). Boolean itself is `true |
 *  false` and deliberately reads as a union — its members are JSON-natural,
 *  so the union arm keeps it raw. **/
type JSONShapeIsUnion<T> = [T] extends [never] ? false : true extends JSONShapeUnionProbe<T, T> ? true : false;
type JSONShapeUnionProbe<T, U> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/** "Every member round-trips raw" — the type-level shape of the Go layout's
 *  AtomicNeedsTuple rule (union_flat_layout.go): JSON-natural members
 *  (strings — branded included, they are still strings on the wire — numbers,
 *  booleans, null, undefined) need no envelope. Anything else (Date, bigint,
 *  Map/Set, objects, arrays) forces the all-or-nothing wrap. **/
type JSONShapeUnionIsRaw<T> = [Exclude<T, string | number | boolean | null | undefined>] extends [never] ? true : false;

/** The wire of one RAW union member: primitives keep themselves (branded ones
 *  widen through the node arm), a declared `undefined` member stays spelled —
 *  it surfaces as an absent optional slot, which reads back as `undefined`. **/
type JSONShapeRawMember<T, Depth extends number> = T extends undefined ? undefined : JSONShapeNode<T, Depth>;

/** An ARRAY / TUPLE slot's wire: same as the value's, except a slot that can
 *  hold `undefined` spells it `null` — the tuple emitter replaces undefined
 *  slots with null so the array survives JSON without losing length
 *  (json_prepare.go, emitTupleMemberPrepareForJson). Object properties keep
 *  `undefined` instead: an absent key reads back as undefined. **/
type JSONShapeArraySlot<V, Depth extends number> = undefined extends V
  ? JSONShape<Exclude<V, undefined>, _JSONShapeDepth[Depth]> | null
  : JSONShape<V, _JSONShapeDepth[Depth]>;

/** The union arm: raw members distribute; anything else rides the flat-union
 *  envelope `[number, memberWire]` (object members' `[-1, merged]` arm is
 *  approximated by the plain union of their wire shapes). **/
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
                // plain object / class / sentinel carrier — symbol keys (all
                // sentinels included) drop, `?` / `readonly` survive the map
                [K in keyof T as K extends symbol
                  ? never
                  : [JSONShape<T[K], _JSONShapeDepth[Depth]>] extends [never]
                    ? never
                    : K]: JSONShape<T[K], _JSONShapeDepth[Depth]>;
              }
          : T;
