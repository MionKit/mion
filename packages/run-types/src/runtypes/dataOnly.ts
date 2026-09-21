import type {__rtFormatName, __rtContains, __rtPatternProps, __rtPropNames} from './sentinelKeys.ts';

/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** `DataOnly<T>` is the data-only projection of a type: the exact shape the AOT validator / serialiser produces,
 *  and the natural return shape for data-bound APIs. Two things to know before editing. The serializer's runtime
 *  enumerability guard (which may omit a property a value carries non-enumerably) applies ONLY to properties
 *  already OPTIONAL in `T` — a global's member is guarded only when it is `?` (`Error['stack']`), and the
 *  `@nonEnumerable` tag takes effect only on an optional member — so a guarded property is always one the type
 *  permits to be absent and `DataOnly<T>` never over-promises it; a `@nonEnumerable` tag on a REQUIRED property
 *  is a no-op the `NE` lint rule flags. And the `#region dataonly-extract` block below is sliced VERBATIM into
 *  `test/types/dataonly.compile.test.ts` and compiled by the real TypeScript compiler, so the region must stay
 *  self-contained: `lib` types plus its own declarations only. **/

// #region dataonly-extract — DataOnly machinery; sliced verbatim between these
// markers by test/types/dataonlyHarness.ts to build the per-branch budget test.

/** Augmentation hook for native / host classes `DataOnly` must KEEP verbatim (the RT validates them by identity,
 *  never by structural projection) but that this core module cannot NAME without forcing their lib onto every
 *  consumer. The opt-in `@mionjs/run-types/formats/temporal` subpath augments it with the 8 TC39 `Temporal`
 *  types; with nothing augmenting it the `DataOnlyNative` tail below stays `never`. One row per kept class. **/
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DataOnlyNativeExtra {}

/** Built-in classes `DataOnly` KEEPS verbatim — only the ones the AOT validator checks by IDENTITY AND that have
 *  a data form on the wire, so with nothing augmenting `DataOnlyNativeExtra` this is just `Date`; `Map` / `Set`
 *  have their own branches below. `RegExp` is validated by identity too but is NOT data (a pattern is code the
 *  receiver would run), so it is stripped instead. Deliberately NOT here:
 *   - `ArrayBuffer` / `SharedArrayBuffer` / `DataView` + every typed array, `SubKindNonSerializable` in the
 *     emitter, so `DataOnly` STRIPS them;
 *   - `URL` / `URLSearchParams` / `Blob` / `File` / `FileList` / `FormData`, plain classes the emitter validates
 *     STRUCTURALLY, so they fall through to the object branch and project to their data shape. **/
type DataOnlyNative = Date | DataOnlyNativeExtra[keyof DataOnlyNativeExtra];

/** Kinds the AOT validator treats as NON-DATA and strips: `symbol` (runtime identity, not round-trippable),
 *  `RegExp` (a pattern is code), any callable / constructable value, `Promise` / thenables (validate validates
 *  inbound public-API DATA, which never carries promises), and the non-serialisable built-ins — `ArrayBuffer` /
 *  `SharedArrayBuffer` / `DataView` and every typed array, which are `SubKindNonSerializable` in the Go emitter,
 *  i.e. unsupported for EVERY family: dropped at a property, `alwaysThrow` at root, exactly the `never`
 *  semantics. `WeakMap` / `WeakSet` are intentionally absent — a real `Map` / `Set` is structurally assignable
 *  to them, so listing them would wrongly strip `Map` / `Set`. At a PROPERTY slot these drop silently; at a
 *  PROPAGATING slot (root, array element, tuple slot, union member) they collapse the projection to `never`, so
 *  the single rule "a value that projects to `never` is dropped" subsumes symbol-keyed and method members alike.
 *  The `never[]` parameter positions disable variance so EVERY function and constructor shape is matched. **/
type DataOnlyStripped =
  | symbol
  // A RegExp value never rides the wire: the only regex a validator runs is a build-time `pattern` format. The
  // emitter drops a RegExp property like a function-valued one, and fails the build at a root position.
  | RegExp
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown)
  // Thenables, detected STRUCTURALLY rather than as `Promise<any>`: the latter's `T`-in-`then` contravariance
  // means `Promise<string> extends Promise<any>` does not hold, so it would miss. `never[]` keeps it
  // variance-free, matching every Promise.
  | {then: (...args: never[]) => unknown}
  // Non-serialisable built-ins: the binary buffers plus `ArrayBufferView` — the one lib type every typed array
  // AND `DataView` extend — so all 12 collapse to a single cheap check instead of a 12-arm union.
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView;

/** Recursion-budget decrement: `_DataOnlyDepth[N]` is `N - 1`, and `[0]` is never reached (the `Depth extends 0`
 *  guard stops first). Bounding the recursion is what lets circular / mutually recursive types resolve to a
 *  finite instantiation instead of tripping the TS2589 depth cap. **/
type _DataOnlyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** The data-only projection of `T` — the exact shape `createValidateFn<T>()` /
 *  `createGetValidationErrorsFn<T>()` validate. It walks `T` and DROPS every member the AOT emitter treats as
 *  non-data (see CLAUDE.md "validate contract — serializable data only"). Every class NOT enumerated in
 *  `DataOnlyNative` / `DataOnlyStripped` (`URL`, `Blob`, `FormData`, any user class) falls through to the object
 *  branch and PROJECTS to its data shape, mirroring the emitter's structural (`ClassRef{Name}`) validation — so
 *  this module names no `lib.dom` types. NO `infer` on the hot path: every arm is a bare `extends` test or a
 *  homomorphic map, which preserves array / tuple structure and `readonly` / `?` modifiers for free. Recursion
 *  is BOUNDED by the `Depth` budget, so a self- or mutually-referential type resolves to a finite instantiation
 *  rather than tripping TS2589; beyond the budget the remaining sub-tree is kept as-is, and 8 levels covers any
 *  realistic data shape. A root-level non-data kind collapses to `never`, which the emitter renders as an
 *  always-throw factory — those cases are intentionally `DataOnly`-divergent. **/
export type DataOnly<T, Depth extends number = 8> = Depth extends 0
  ? T // budget exhausted — keep the remaining sub-tree as-is (best effort)
  : unknown extends T
    ? T // any / unknown — keep the broad kinds
    : T extends DataOnlyStripped
      ? never // symbol / fn / ctor / thenable — strip
      : T extends string | number | boolean | bigint | null | undefined | DataOnlyNative
        ? T // primitive / native (+ Temporal) — keep verbatim
        : DataOnlySentinelKept<T> extends true
          ? T // sentinel-branded container (format brand / child-schema slot) — keep verbatim, exactly like a branded primitive: mapping over the intersection would mangle the brand (and hand the checker an array-like with no reference target)
          : DataOnlyLadder<T, Depth>;
// Sentinel detection must survive a string INDEX SIGNATURE base: a record's keyof absorbs the literal sentinel
// keys, and indexing a record at any key returns the value type, so each probe filters on the sentinel's VALUE
// SHAPE instead. A record whose declared value type happens to match a filter is kept verbatim — harmless,
// those value shapes are inherently clean data.
type DataOnlySentinelKeys = typeof __rtFormatName | typeof __rtContains | typeof __rtPatternProps | typeof __rtPropNames;
// The common path (every plain object / array / tuple) pays ONE Extract + ONE index-signature check: a literal
// sentinel key in keyof T is definitive (the __rt namespace is reserved), and only a string-index base — whose
// keyof ABSORBS the literal keys — needs the per-sentinel shape probes.
type DataOnlySentinelKept<T> =
  Extract<keyof T, DataOnlySentinelKeys> extends never ? (string extends keyof T ? DataOnlyRecordSentinelKept<T> : false) : true;
type DataOnlySentinelProbe<X, Shape> = [X] extends [never] ? false : X extends Shape ? true : false;
type DataOnlyProperStringLiteral<X> = [X] extends [never] ? false : string extends X ? false : X extends string ? true : false;
// Indexing a record at any key returns the VALUE type, so each probe filters on the sentinel's value shape;
// false positives are limited to inherently-clean value shapes.
type DataOnlyRecordSentinelKept<T> = true extends
  | DataOnlyProperStringLiteral<NonNullable<T[typeof __rtFormatName & keyof T]>>
  | DataOnlySentinelProbe<NonNullable<T[typeof __rtPatternProps & keyof T]>, Record<string, {rt$value: unknown}>>
  | DataOnlySentinelProbe<NonNullable<T[typeof __rtPropNames & keyof T]>, string>
  ? true
  : false;
type DataOnlyLadder<T, Depth extends number> =
  // Map / Set keep the COLLECTION but PROJECT keys & values, so a value's methods / Promises / non-data members
  // are gone. SEPARATE non-`infer` gates for `ReadonlyMap` and `ReadonlySet`: the cheap `<any, any>` check
  // filters out non-collections, and a Set never pays a wasted `ReadonlyMap` infer (nor a Map a `ReadonlySet`
  // one). The inner `Map` / `Set` test preserves the mutable-vs-readonly variant.
  T extends ReadonlyMap<any, any>
    ? T extends ReadonlyMap<infer K, infer V>
      ? T extends Map<any, any>
        ? Map<DataOnly<K, _DataOnlyDepth[Depth]>, DataOnly<V, _DataOnlyDepth[Depth]>>
        : ReadonlyMap<DataOnly<K, _DataOnlyDepth[Depth]>, DataOnly<V, _DataOnlyDepth[Depth]>>
      : never // unreachable — gate guarantees a Map
    : T extends ReadonlySet<any>
      ? T extends ReadonlySet<infer U>
        ? T extends Set<any>
          ? Set<DataOnly<U, _DataOnlyDepth[Depth]>>
          : ReadonlySet<DataOnly<U, _DataOnlyDepth[Depth]>>
        : never // unreachable — gate guarantees a Set
      : T extends readonly unknown[]
        ? {-readonly [K in keyof T]: DataOnly<T[K], _DataOnlyDepth[Depth]>} // array + tuple
        : T extends object
          ? object extends T
            ? T // broad `object` / `{}` — keep (the emitter accepts the broad kind)
            : {
                // Drop symbol keys, `__proto__` (writing that key swaps a prototype
                // instead of storing a value) and never-valued (⊇ method) props
                [K in keyof T as K extends symbol | '__proto__'
                  ? never
                  : [DataOnly<T[K], _DataOnlyDepth[Depth]>] extends [never]
                    ? never
                    : K]: DataOnly<T[K], _DataOnlyDepth[Depth]>;
              }
          : T;
// #endregion dataonly-extract
