import type {__rtFormatName, __rtContains, __rtPatternProps, __rtPropNames} from './sentinelKeys.ts';

/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: MIT, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** `DataOnly<T>` — the data-only projection of a type: the exact shape the AOT
 *  validator / serialiser produces. Functions, methods, constructors, `Promise`s
 *  / thenables, symbols, and non-serialisable built-ins are stripped; primitives,
 *  `Date` / `RegExp` / `Map` / `Set` / Temporal are kept; arrays, tuples, objects,
 *  and Map/Set key/value types are recursed. It is the type `createValidateFn<T>()` /
 *  `createGetValidationErrorsFn<T>()` validate, and the natural return shape for data-bound
 *  APIs (JSON / binary decode).
 *
 *  **Non-enumerable / guarded properties — consistent by construction.**
 *  `DataOnly<T>` is a pure compile-time type; it cannot observe runtime
 *  enumerability or the `@nonEnumerable` JSDoc tag. To keep it accurate, the
 *  serializer's runtime enumerability guard (which may omit a property from the
 *  wire when a value carries it non-enumerably) is applied ONLY to properties
 *  that are already OPTIONAL in `T`: a member inherited from a global like
 *  `Error` is guarded only when it is `?` (`Error['stack']` / `Error['cause']`),
 *  and the `@nonEnumerable` tag takes effect only on an optional member. So a
 *  guarded property is always one the type already permits to be absent, and
 *  `DataOnly<T>` never over-promises it. The REQUIRED error envelope
 *  (`name` / `message`) is not guarded — it is always serialized, and
 *  `DataOnly<Error>` correctly lists it. (A `@nonEnumerable` tag on a REQUIRED
 *  property is a no-op — the property serializes unconditionally — and the `NE`
 *  lint rule flags it; make it optional for the tag to take effect.)
 *
 *  This lives in its own module because it is load-bearing and exhaustively
 *  tested: every branch has a correctness + instantiation-budget case in
 *  `test/types/dataonly.compile.test.ts`, which slices the `#region
 *  dataonly-extract` block below VERBATIM (via `test/types/dataonlyHarness.ts`)
 *  and compiles it through the real TypeScript compiler. Keep the region
 *  self-contained — it may reference only `lib` types + its own declarations. **/

// #region dataonly-extract — DataOnly machinery; sliced verbatim between these
// markers by test/types/dataonlyHarness.ts to build the per-branch budget test.

/** Augmentation hook for native / host classes that `DataOnly` must KEEP
 *  verbatim (the RT validates them by identity / `instanceof`, never by
 *  structural projection) but that this core module cannot NAME without forcing
 *  their lib onto every consumer. The opt-in
 *  `@mionjs/run-types/formats/temporal` subpath augments this interface
 *  with the 8 TC39 `Temporal` types; consumers who never import it pay nothing
 *  and the `DataOnlyNative` tail below stays `never`. Add one row per kept
 *  class (`{ temporalInstant: Temporal.Instant; … }`). **/
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DataOnlyNativeExtra {}

/** Built-in classes `DataOnly` KEEPS verbatim — only the ones the AOT validator
 *  checks by IDENTITY (`instanceof`): `Date` (SubKindDate) and `RegExp` (real
 *  `instanceof RegExp` emit). `Map`/`Set` have their own branches below (kept as
 *  `Map`/`Set` with key/value type args projected). The augmentable
 *  `DataOnlyNativeExtra` tail folds in Temporal; with
 *  nothing augmenting it the tail is `never`, so this is just `Date | RegExp`.
 *
 *  Deliberately NOT here (the old broad `Native` union grouped them wrongly):
 *   - `ArrayBuffer`/`SharedArrayBuffer`/`DataView` + every typed array are
 *     `SubKindNonSerializable` in the emitter → unsupported, so `DataOnly`
 *     STRIPS them (listed in `DataOnlyStripped`);
 *   - `URL`/`URLSearchParams`/`Blob`/`File`/`FileList`/`FormData` are plain
 *     classes the emitter validates STRUCTURALLY (`ClassRef{Name}`), so they
 *     fall through to the object branch and project to their data shape —
 *     neither kept verbatim nor stripped. **/
type DataOnlyNative = Date | RegExp | DataOnlyNativeExtra[keyof DataOnlyNativeExtra];

/** Kinds the AOT validator treats as NON-DATA and strips (the unsupported set):
 *   - `symbol` — runtime identity, not round-trippable;
 *   - any callable / constructable value (function, method, class value);
 *   - `Promise` / thenables — `validate` validates inbound public-API *data*,
 *     which never carries promises; a thenable is not data;
 *   - the non-serialisable built-ins — `ArrayBuffer`/`SharedArrayBuffer`/
 *     `DataView` and every typed array (`Int8Array`…`BigUint64Array`). These are
 *     `SubKindNonSerializable` in the Go emitter, i.e. unsupported for EVERY
 *     family (incl. validate/getValidationErrors): the validator drops them at a
 *     property and `alwaysThrow`s at root — exactly the `never` semantics.
 *
 *  (`WeakMap`/`WeakSet` are intentionally absent: a real `Map`/`Set` is
 *  structurally assignable to them, so listing them would wrongly strip
 *  `Map`/`Set`. They fall through to the object branch and project to `{}`,
 *  exactly as before.)
 *
 *  At a PROPERTY slot these drop silently; at a PROPAGATING slot (root, array
 *  element, tuple slot, union member) they collapse the projection to `never`.
 *  `DataOnly` maps each to `never`, so the single rule "a value that projects to
 *  `never` is dropped" subsumes symbol-keyed and method members alike. The
 *  `never[]` parameter positions disable variance so EVERY function and
 *  constructor shape is matched. **/
type DataOnlyStripped =
  | symbol
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown)
  // Thenables, detected STRUCTURALLY (a `.then` method) rather than as
  // `Promise<any>` — the latter's `T`-in-`then` contravariance means
  // `Promise<string> extends Promise<any>` does not hold, so it would miss.
  // The `never[]` params keep the check variance-free, matching every Promise.
  | {then: (...args: never[]) => unknown}
  // Non-serialisable built-ins (SubKindNonSerializable → unsupported). The
  // binary buffers, plus `ArrayBufferView` — the one lib type every typed array
  // AND `DataView` extend (`{ buffer; byteLength; byteOffset }`) — so all 12
  // collapse to a single cheap check instead of a 12-arm union.
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView;

/** Recursion-budget decrement for `DataOnly`: `_DataOnlyDepth[N]` is `N - 1`
 *  (and `_DataOnlyDepth[0]` is `never`, never reached — the `Depth extends 0`
 *  guard stops first). Bounding the recursion is what lets circular / mutually
 *  recursive types resolve to a finite instantiation instead of tripping the
 *  TS2589 depth cap. **/
type _DataOnlyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** The data-only projection of `T` — the exact shape `createValidateFn<T>()` /
 *  `createGetValidationErrorsFn<T>()` validate. It walks `T` and DROPS every member the
 *  AOT emitter treats as non-data (see CLAUDE.md "validate contract — serializable
 *  data only"):
 *   - `DataOnlyStripped` kinds (symbol / function / constructor / promise /
 *     non-serialisable built-ins / `never`) → `never`;
 *   - primitives, `Date`/`RegExp` (+ augmented Temporal), and `Map`/`Set` →
 *     kept verbatim (the validator checks these by identity);
 *   - `any` / `unknown` (and broad `object`) → kept (the emitter best-effort
 *     accepts the broad kinds — the validator emits `true`);
 *   - arrays + tuples → recurse per element/slot, preserving array-ness, slot
 *     order, and `readonly`/`?` modifiers;
 *   - objects → recurse per property, dropping symbol-keyed and `never`-valued
 *     (⊇ method) properties.
 *
 *  HOST / built-in CLASSES — what is deliberately handled where (see
 *  `DataOnlyNative` / `DataOnlyStripped` above for the why):
 *   - KEPT by identity: `Date`, `RegExp` (+ Temporal via the `DataOnlyNativeExtra`
 *     augmentation) — the validator checks these directly; `Map`/`Set` are kept as
 *     `Map`/`Set` but with their key/value type args recursively projected;
 *   - STRIPPED to `never`: `ArrayBuffer`, `SharedArrayBuffer`, `DataView` and
 *     every typed array — non-serialisable in the emitter;
 *   - LEFT OUT (not enumerated): every OTHER class — `URL`, `URLSearchParams`,
 *     `Blob`, `File`, `FileList`, `FormData`, and any user class — falls through
 *     to the object branch and PROJECTS to its data shape, mirroring the
 *     emitter's structural (`ClassRef{Name}`) validation of a plain class. (So
 *     this module names no `lib.dom` types.)
 *
 *  Implementation: NO `infer` on the hot path — every arm is a bare `extends`
 *  test or a homomorphic `{[K in keyof T]: …}` map (which preserves array/tuple
 *  structure and `readonly`/`?` modifiers for free). `Map`/`Set` keep the
 *  collection type but RECURSE into their key/value type args — the
 *  validator/decoder produces children checked against (or rebuilt as) their
 *  data-only schema, so a value's methods/Promises/non-data members are stripped
 *  just like anywhere else; cheap non-`infer` `ReadonlyMap`/`ReadonlySet` gates
 *  keep the inference off the path for every non-collection (and stop a Set from
 *  paying a wasted Map inference, or vice-versa).
 *
 *  Recursion is BOUNDED by the `Depth` budget (`_DataOnlyDepth` decrement): a
 *  self- or mutually-referential type resolves to a finite instantiation rather
 *  than tripping TS's instantiation-depth cap (TS2589). Beyond the budget the
 *  remaining sub-tree is kept as-is. 8 levels covers any realistic data shape.
 *
 *  Root-level non-data kinds (a bare function type, a `symbol`, a `Promise`)
 *  collapse to `never` here, which the emitter renders as an always-throw
 *  factory — those cases are intentionally `DataOnly`-divergent. **/
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
// Sentinel detection must survive a string INDEX SIGNATURE base (a record's
// keyof absorbs the literal sentinel keys, and indexing a record at any key
// returns the value type), so each probe filters on the sentinel's VALUE
// SHAPE: a proper string-literal for the brand name, the rt$-keyed spec for
// patternProperties, the string-family child for propertyNames, the
// rt$child spec for contains. A record whose declared
// value type happens to match a filter is kept verbatim — harmless, those
// value shapes are inherently clean data.
type DataOnlySentinelKeys = typeof __rtFormatName | typeof __rtContains | typeof __rtPatternProps | typeof __rtPropNames;
// The common path (every plain object / array / tuple in every DataOnly
// walk) pays ONE Extract + ONE index-signature check: a literal sentinel
// key in keyof T is definitive (the __rt namespace is reserved), and only
// a string-index base — whose keyof ABSORBS the literal keys — needs the
// per-sentinel shape probes.
type DataOnlySentinelKept<T> =
  Extract<keyof T, DataOnlySentinelKeys> extends never ? (string extends keyof T ? DataOnlyRecordSentinelKept<T> : false) : true;
type DataOnlySentinelProbe<X, Shape> = [X] extends [never] ? false : X extends Shape ? true : false;
type DataOnlyProperStringLiteral<X> = [X] extends [never] ? false : string extends X ? false : X extends string ? true : false;
// Record probes: indexing a record at any key returns the VALUE type, so
// each probe filters on the sentinel's value shape; false positives are
// limited to inherently-clean value shapes (a proper string literal, the
// rt$value spec, a string-family child).
type DataOnlyRecordSentinelKept<T> = true extends
  | DataOnlyProperStringLiteral<NonNullable<T[typeof __rtFormatName & keyof T]>>
  | DataOnlySentinelProbe<NonNullable<T[typeof __rtPatternProps & keyof T]>, Record<string, {rt$value: unknown}>>
  | DataOnlySentinelProbe<NonNullable<T[typeof __rtPropNames & keyof T]>, string>
  ? true
  : false;
type DataOnlyLadder<T, Depth extends number> =
  // Map / Set keep the COLLECTION but PROJECT keys & values: the validator
  // iterates and checks each child against its data-only schema (and a
  // decoder rebuilds children from JSON/bytes), so a value's methods /
  // Promises / non-data members are gone. SEPARATE non-`infer` gates for
  // `ReadonlyMap` and `ReadonlySet`: the cheap `<any, any>` check filters
  // out non-collections, and a Set never pays a wasted `ReadonlyMap` *infer*
  // (nor a Map a wasted `ReadonlySet` infer). The `infer` runs only once
  // the gate has confirmed the kind; the inner `Map`/`Set` test preserves
  // the mutable-vs-readonly variant.
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
                // plain object — drop symbol keys + never-valued (⊇ method) props
                [K in keyof T as K extends symbol
                  ? never
                  : [DataOnly<T[K], _DataOnlyDepth[Depth]>] extends [never]
                    ? never
                    : K]: DataOnly<T[K], _DataOnlyDepth[Depth]>;
              }
          : T;
// #endregion dataonly-extract
