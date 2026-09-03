// Home for every RT-backed factory exported by this package. Each
// `createXxx<T>()` is a thin wrapper over the private `createRTFunction`
// generic; only the identity fallback and return type vary per family. The
// rtUtils singleton is the only cache; entries arrive as per-entry virtual
// module tuples injected at each call site (see runtypes/entryTuple.ts).

import {isRunTypeValue} from './runtypes/rtUtils.ts';
import {entryTupleAt, resolveEntryTupleFn} from './runtypes/entryTuple.ts';
import {ParseMismatch, RTParseError} from './runtypes/parseError.ts';
import type {AnyFn, RunType} from './runtypes/types.ts';
import type {DataOnly} from './runtypes/dataOnly.ts';
// One-way (erased) type edge: formatErrors.ts imports TypeFormatError back
// from here, and both sides are `import type`.
import type {FormatErrorsOf} from './runtypes/formatErrors.ts';
import type {CompTimeFnArgs, InjectTypeFnArgs} from './index.ts';
// Type-only — the binary primitive fn shapes complete the getRTFunction key map.
// createRTFBinary never imports back, so this is a one-way (erased) type edge.
import type {ToBinaryFn, FromBinaryFn} from './createRTFBinary.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** Subset of the RunTypeOptions that parameterises the generated
 *  `validate` / `getValidationErrors` validators (NOT a property of the type itself).
 *  Pass an OBJECT LITERAL at the call site — the Go-side marker scanner reads
 *  the values at build time and routes the call to a per-option variant of
 *  the validator factory (same structural type id, distinct function id). **/
export interface ValidateOptions {
  /** Literal validators degrade to their base-type check
   *  (`literal 'a'` → any string, `literal 2` → any finite number). **/
  noLiterals?: boolean;
  /** Skip the leading `Array.isArray(v)` guard on array validators.
   *  The variant cache key changes (e.g. `val_<id>` → `valNA_<id>`) so
   *  the same type id can serve both the guarded and unguarded factory. **/
  noIsArrayCheck?: boolean;
  /** Arms the circular-reference guard for THIS validator: a value containing a
   *  reference cycle makes `createValidateFn` return false and
   *  `createGetValidationErrorsFn` record a `{expected: 'circular'}` entry.
   *  COMPILE-TIME (like `noLiterals`): it forks the injected fnHash, so an armed
   *  and a plain validator for the same `T` compile to distinct entries — the
   *  armed one bakes the cycle check into its body (pay-for-use). **/
  rejectCircularRefs?: boolean;
  /** Folds the unknown-key check INTO the validator, so one compiled function
   *  answers "matches `T` and carries no undeclared properties". Replaces the
   *  two-call form:
   *
   *  ```ts
   *  // before: two compiled fns, two walks of the value
   *  isUser(v) && !hasExtraKeys(v)
   *  // after: one fn, one walk
   *  const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});
   *  ```
   *
   *  Faster than chaining because each object is visited once instead of twice,
   *  and because the key check sits AFTER that object's property checks: every
   *  declared property is known present by then, which lets an all-required
   *  shape use a key-COUNT compare instead of scanning the key list. The
   *  two-call form can only make that assumption at the top level (see
   *  `HasUnknownKeysCompileOptions.runsAfterValidation`); here it holds at every
   *  depth, nested named types included.
   *
   *  On `createGetValidationErrorsFn` each undeclared key adds one
   *  `{expected: 'never'}` entry, the same entry `createUnknownKeyErrorsFn`
   *  produces. NOTE the ORDER differs from concatenating the two calls: those
   *  group every type error ahead of every unknown-key error, while a single
   *  walk interleaves them per node, like every other error report.
   *
   *  Shapes with an index signature take no check: any key matching the index IS
   *  declared. An array takes none either, matching what
   *  `createHasUnknownKeysFn` answers for one: `[1, 2]` really is a
   *  `{length: number}`, and the shape error already names the problem once.
   *  `createHasUnknownKeysFn` remains the tool for a value you have already
   *  validated.
   *
   *  UNIONS ANSWER PER BRANCH, and this is the one place the fused form does not
   *  equal `isT(v) && !hasUnknownKeys(v)`. `createHasUnknownKeysFn` never
   *  validates, so it cannot know which member a value matched and pools every
   *  member's property names into one allowlist. The fused validator follows the
   *  branch that matched:
   *
   *  ```ts
   *  type Pet = {kind: 'cat'; meows: boolean} | {kind: 'dog'; barks: number};
   *  const mixed = {kind: 'cat', meows: true, barks: 3};
   *
   *  isPet(mixed) && !hasUnknown(mixed); // true  — barks is declared somewhere
   *  isPetStrict(mixed); // false — barks is not declared on Cat
   *  ```
   *
   *  A key belonging to NO member is rejected by both. The fused answer is the
   *  stricter one and the one that tracks the branch, so prefer it wherever the
   *  two must agree. The error form follows the same verdict: for a union it
   *  reports `{path: [], expected: 'union'}`, since the offending key is only
   *  undeclared relative to a branch.
   *
   *  COMPILE-TIME, like every option here, but unlike the others it selects a
   *  different compiled family rather than a variant of this one — so
   *  `getFnHash('val', {checkUnknowns: true})` is NOT its cache key. Resolve
   *  `getFnHash('vst')` (or `'vest'` for the errors form) instead. **/
  checkUnknowns?: boolean;
  /** Selects how the emitted validator checks a `number`, to align with other
   *  libraries when migrating. `'isFinite'` (default) uses `Number.isFinite`,
   *  rejecting `NaN` / `Infinity` / `-Infinity`; `'typeof'` uses
   *  `typeof v === 'number'`, accepting the non-finite values (matches ajv /
   *  typia / JSON Schema); `'notNaN'` rejects `NaN` but accepts `Infinity`.
   *  COMPILE-TIME (like `noLiterals`): it forks the injected fnHash. A project
   *  can set the default for every validator via the `validate.numberMode`
   *  plugin / tsconfig option; a per-call value overrides that default. **/
  numberMode?: 'isFinite' | 'typeof' | 'notNaN';
}

/** Validator function returned by `createValidateFn<T>()`. The type guard narrows
 *  to `DataOnly<T>` — the serialisable projection of `T` the validator actually
 *  enforces (non-data members like functions / methods / symbols are silently
 *  dropped from the validated shape; see CLAUDE.md "validate contract"). `T`
 *  defaults to `unknown` so the bare `ValidateFn` alias (`DataOnly<unknown>` ≡
 *  `unknown`) stays a plain `(value) => boolean`-shaped guard for the cache
 *  typedefs that don't carry a source type. **/
export type ValidateFn<T = unknown> = (value: unknown) => value is DataOnly<T>;

/** Object path segment for a Map / Set entry. `key` is the entry's iteration
 *  index — a Map/Set entry has no serialisable address of its own (keys/items
 *  can be objects, symbols or null), so the position is the only universal
 *  pointer, and a number is what Standard Schema's `getDotPath` can read.
 *  `failed` marks which side of the entry tripped: a Map key, a Map value, or
 *  a Set item. It is a valid Standard Schema `PathSegment` (it has `key:
 *  PropertyKey`); the extra `failed` rides along losslessly and is ignored by
 *  spec consumers (e.g. `getDotPath` reads only `key`). **/
export interface RTPathSegment {
  key: number;
  failed?: 'mapKey' | 'mapValue' | 'setKey';
}

/** One segment of a RTValidationError path: an object key (`string`), an array
 *  / tuple index (`number`), or a Map / Set entry (`RTPathSegment`). Every form
 *  is `PropertyKey | {key: PropertyKey}`, so a path is already a valid Standard
 *  Schema `path` with no transformation. **/
export type RTValidationErrorPathSegment = string | number | RTPathSegment;

/** Format-specific error detail attached to a RTValidationError when a
 *  TypeFormat constraint (pattern, length, version, …) fails. `name`
 *  is the format name (e.g. 'stringFormat', 'uuid'); `formatPath`
 *  locates the failing param; `val` is the param value/marker.
 *
 *  Generic over the format `Name` and the `errorType` `Mode` it can report, both
 *  defaulting to `string`. `createGetValidationErrorsFn<T>()` returns the
 *  narrowed union for `T` (see `FormatErrorsOf`), so `switch (format.name)`
 *  narrows `errorType` per format; the bare `TypeFormatError` is the wide shape
 *  every consumer accepts. **/
export interface TypeFormatError<Name extends string = string, Mode extends string = string> {
  name: Name;
  val: RTValidationErrorPathSegment | boolean | bigint | (RTValidationErrorPathSegment | boolean | bigint)[];
  formatPath: (string | number)[];
  /** WHICH way the format failed, for a format with more than one. A card
   *  number can be the wrong shape, carry a broken checksum, or belong to a
   *  network the field does not take, and a caller usually wants to say
   *  something different about each. Formats with a single failure mode (a
   *  pattern either matches or it does not) leave it unset.
   *
   *  Always a stable string the format documents (`CreditCardErrorType`,
   *  `EmailErrorType`, `DomainErrorType`, `IpErrorType`), so a consumer can
   *  switch on it. `formatPath` still locates the failing param; this names
   *  the mode. */
  errorType?: Mode;
  /** Echoed by the emitter when the field's number format sets the
   *  `isCurrency` param — pure presentation metadata: `createFriendlyTextI18n`
   *  renders the violated bound as money in the active locale. */
  isCurrency?: boolean;
}

/** One validation error. `Format` is the typed format detail (see
 *  `FormatErrorsOf<T>`); the bare `RTValidationError` is the wide shape, which
 *  every narrowed one assigns to. **/
export interface RTValidationError<Format extends TypeFormatError = TypeFormatError> {
  path: RTValidationErrorPathSegment[];
  expected: string;
  /** Present when a TypeFormat constraint failed (emitted via pf_formatErr). */
  format?: Format;
}

/** Validator returned by `createGetValidationErrorsFn<T>()`. Caller-optional `path`
 *  and `errors` slots so the validator can be chained or pre-seeded.
 *
 *  `Format` is the typed format detail the returned errors carry: the factory
 *  hands back `GetValidationErrorsFn<FormatErrorsOf<T>>`, and the bare
 *  `GetValidationErrorsFn` is the wide shape every narrowed one assigns to.
 *  (Parameterized over the error rather than over `T` so the parameter stays
 *  measurably covariant.) The pre-seed slot stays wide so a chain across types
 *  keeps compiling. **/
export type GetValidationErrorsFn<Format extends TypeFormatError = TypeFormatError> = (
  value: unknown,
  path?: RTValidationErrorPathSegment[],
  errors?: RTValidationError[]
) => RTValidationError<Format>[];

/** Options bag for HasUnknownKeysFn. When `checkNonRTProps` is true the
 *  known-keys list expands to include children the RT skipped. **/
export interface HasUnknownKeysOptions {
  checkNonRTProps?: boolean;
}

/** COMPILE-TIME options for `createHasUnknownKeysFn<T>(val?, options?, id?)` —
 *  baked into the emitted variant at build time (like `ValidateOptions`),
 *  never read at runtime.
 *
 *  `runsAfterValidation` declares the caller's precondition that every value
 *  passed to the returned predicate already PASSED this type's `validate`.
 *  That makes two emit optimisations sound: the per-object `typeof` guards
 *  are dropped, and all-required object nodes replace the O(props×keys)
 *  key-array scan with a key-count compare (`countEnumKeys(v) !== N`) —
 *  measured ~3x on a 7-prop shape and ~13x at 30 props (Node 26). The claim
 *  is about the VALUE, not about the root call, so it holds at every depth:
 *  a NAMED nested type (`{address: Address}`) gets the same treatment an
 *  inline one (`{address: {street: string}}`) does. Shapes the count check
 *  can't decide — optional props, index signatures, non-RT children — keep
 *  the scan, guardless. Standalone the count check is WRONG in both directions (`{a,b,x}` vs declared `{a,b,c}` slips
 *  through; `{a,b}` false-positives on a merely-missing prop), which is why
 *  this is an explicit opt-in: calling the variant on non-validated input is
 *  undefined behavior. Count checks assume JSON-like own-enumerable data —
 *  validated props living on a prototype can fool them. **/
export interface HasUnknownKeysCompileOptions {
  runsAfterValidation?: boolean;
}

/** Predicate returned by `createHasUnknownKeysFn<T>()`. **/
export type HasUnknownKeysFn = (value: unknown, options?: HasUnknownKeysOptions) => boolean;

/** Clone returned by `createCloneExactShapeFn<T>()`: a PROPER deep clone of the
 *  DECLARED shape. Unknown/undeclared keys are dropped by construction (the
 *  clone is built from the type, never `{...v}`), the input is never mutated
 *  (frozen inputs work), and `clone(x) !== x` holds for EVERY object-typed
 *  position: objects rebuild, class instances rebuild keeping their
 *  prototype (`instanceof` and methods hold), arrays/tuples/Map/Set are
 *  fresh containers, Dates re-wrap, RegExps are shared by reference (not
 *  data), Temporal instances re-materialize via their static `from()`.
 *  DECLARED members are never dropped — only undeclared keys are. Two kinds
 *  of values pass through by reference: PRIMITIVES (compare by value, so a
 *  "fresh" primitive is meaningless) and OPAQUE values the emitter cannot
 *  rebuild (`any`/`unknown`/bare `object`, functions, symbols, promises,
 *  non-serializable natives — copying a resource handle would be wrong).
 *  A declared member holding such a value is KEPT on the clone, shared by
 *  reference, and the build says so (CES010/CES015);
 *  `overrideCloneExactShape<T>()` is the escape hatch for custom copying.
 *  Replaces the removed mutating `stripUnknownKeys` /
 *  `unknownKeysToUndefined` (measured 3–24x faster, no delete-induced
 *  dictionary-mode deopt). Intended use: stripping validated parse output —
 *  and any place a schema-shaped deep clone is wanted. **/
export type CloneExactShapeFn<T = unknown> = (value: T) => T;

/** Validator returned by `createUnknownKeyErrorsFn<T>()`. Each unknown key
 *  produces one `{path, expected: 'never'}` entry.
 *
 *  Reports UNDECLARED KEYS ONLY, never shape. A value the schema does not
 *  admit at all — `null`, `undefined`, a primitive, an array where an object
 *  is declared, and the same at any nested position — has no undeclared keys
 *  to report, so it yields `[]` rather than throwing or inventing one entry
 *  per character / index. `createHasUnknownKeysFn` answers `false` on the
 *  same values. Shape is `createGetValidationErrorsFn`'s job, which is what
 *  lets the two compose into a strict report —
 *  `[...typeErrors(v), ...keyErrors(v)]` — with the shape reported exactly
 *  once. (The one exception is `createHasUnknownKeysFn`'s
 *  `runsAfterValidation` option, whose contract is that the caller already
 *  validated the value; it drops the guards deliberately.) **/
export type UnknownKeyErrorsFn = (
  value: unknown,
  path?: RTValidationErrorPathSegment[],
  errors?: RTValidationError[]
) => RTValidationError[];

/** FormatTransformValue<T> reduces a type to the plain runtime value the format
 *  transform operates on: TypeFormat brands collapse to their base
 *  (string formats → `string`), nested objects / arrays recurse. The
 *  brand exists only at the type level (erased at runtime), so callers
 *  pass and receive plain data — `createFormatTransformFn<Lowercase>()` is
 *  `(value: string) => string`, not a branded-in/branded-out fn. **/
export type FormatTransformValue<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer E)[]
        ? FormatTransformValue<E>[]
        : T extends object
          ? {[K in keyof T]: FormatTransformValue<T[K]>}
          : T;

/** Transform function returned by `createFormatTransformFn<T>()`. Applies the
 *  rewrites declared under a format's `transform` key anywhere in `T` (trim /
 *  case / replace; creditCard `stripSeparators`) and returns the transformed
 *  value. Identity when `T` declares none. This is the direct-caller surface;
 *  mion applies the same compiled fn to route params through `sanitizeParams`.
 *  Never a step inside validate / parse / encode / decode. **/
export type FormatTransformFn<T> = (value: FormatTransformValue<T>) => FormatTransformValue<T>;

// Internal RT-primitive signatures consumed by the JSON encoder/decoder.
export type PrepareForJsonFn = (value: unknown) => unknown;
export type RestoreFromJsonFn = (value: unknown) => unknown;
export type StringifyJsonFn = (value: unknown) => string | undefined;

/** Stringifier returned by `createJsonEncoderFn<T>()`. Returns the JSON string,
 *  OR `undefined` for top-level `undefined` inputs (matches `JSON.stringify`). **/
export type JsonEncoderFn = (value: unknown) => string | undefined;

/** Parse function returned by `createJsonDecoderFn<T>()`. **/
export type JsonDecoderFn<T = unknown> = (serialized: string) => T;

/** The compiled parse body: takes the output of `JSON.parse`, returns the typed
 *  value, and THROWS on a mismatch. Recovered through `getRTFunction<'prs'>()` by
 *  a framework that threads its own marker; most callers want `createParseFn<T>()`
 *  instead, which turns the throw into an `RTParseError`.
 *
 *  It throws a bare `ParseMismatch` carrying the restored value, not an
 *  `RTParseError`: building the report costs a second walk, and only the caller
 *  knows whether it wants one. **/
export type ParseRestoreFn = (value: unknown) => unknown;

/** Function returned by `createParseFn<T>()`. Takes the output of `JSON.parse`
 *  (NOT a JSON string) and returns the typed value, or throws `RTParseError`. **/
export type ParseFn<T = unknown> = (value: unknown) => DataOnly<T>;

/** Caller-controlled `strategy` for `createParseFn<T>()` — what to do with
 *  properties the type does not declare:
 *
 *  - `'preserve'` (default): keep them. The cheapest shape (no pre-pass, no key
 *    check), and what zod does, which strips only under `.strict()`.
 *  - `'strip'`: blank them before the restore walks the declared shape, so the
 *    returned value carries only what the type declares. The safer choice for an
 *    untrusted payload you are about to store or forward.
 *  - `'fail'`: reject a value carrying them, the same rule
 *    `createValidateFn`'s `checkUnknowns` applies.
 *
 *  A project can set the default for every parser via the `parse.strategy`
 *  plugin / tsconfig option; a per-call value overrides it, and an explicit
 *  `'preserve'` opts back out. Same shape as `validate.numberMode`.
 *
 *  COMPILE-TIME, like every option in this file: the plugin bakes the choice into
 *  the injected tuple and the runtime never reads it. Each value selects a
 *  different compiled family, so `getFnHash('prs')` is the loose one — `'prss'`
 *  for strip, `'prsf'` for fail. **/
export type ParseStrategy = 'preserve' | 'strip' | 'fail';
export type ParseOptions = {strategy?: ParseStrategy};

/** Caller-controlled `strategy` for `createJsonEncoderFn<T>()`. The walk mode:
 *
 *  - `'clone'` (default): walk the type and build a NEW value from the declared
 *    shape (`{a: v.a, b: prepareForJson(v.b)}`, never `{...v}`), then hand to
 *    native `JSON.stringify`. Because the clone is built from the type shape,
 *    undeclared keys are dropped by construction — a clone is stripped for free,
 *    so there is no separate "strip" variant. Non-mutating.
 *  - `'mutate'`: transform leaves in place (no clone allocation), then
 *    `JSON.stringify`. Mutates the input and PRESERVES undeclared keys on the wire.
 *  - `'direct'`: single-pass `stringifyJson` RT. Never mutates, no clone
 *    allocation, slower on non-trivial shapes; always strips undeclared keys.
 *  - `'compact'`: like `'clone'` (shape-derived, strips undeclared keys, never
 *    mutates) but emits each object's declared properties as a POSITIONAL ARRAY
 *    with no key names on the wire (`{a, b}` → `[v.a, v.b]`), producing a
 *    smaller payload. Pairs with the `'compact'` decoder, which rebuilds the
 *    keyed object from positions. An absent optional rides a `null` placeholder,
 *    so a `T | null` optional field cannot distinguish a present `null` from an
 *    absent value (both decode to `undefined`). The wire is shape-coupled: both
 *    ends must share the type, like the binary codec.
 */
export type JsonEncoderStrategy = 'clone' | 'mutate' | 'direct' | 'compact';
// Both options are COMPILE-TIME (see ValidateOptions.rejectCircularRefs): `strategy`
// selects the composite, and `rejectCircularRefs` forks it into an armed variant
// whose body throws a CircularReferenceError on a reference cycle.
export type JsonEncoderOptions = {strategy?: JsonEncoderStrategy; rejectCircularRefs?: boolean};

/** Caller-controlled `strategy` for `createJsonDecoderFn<T>()`. The decoder always
 *  allocates fresh via `JSON.parse`, so the only axis is undeclared keys:
 *  `'strip'` (default) sets them to `undefined` before restore walks the
 *  declared shape; `'preserve'` passes them through untouched. `'compact'`
 *  decodes the positional-array wire the `'compact'` ENCODER produces (the
 *  key-based strip/preserve decoders cannot read it), rebuilding the declared
 *  object from positions. **/
export type JsonDecoderStrategy = 'strip' | 'preserve' | 'compact';
export type JsonDecoderOptions = {strategy?: JsonDecoderStrategy};

// =============================================================================
// Private generic factories
// =============================================================================

/** Resolves the compiled closure for a createX factory routed through the
 *  InjectTypeFnArgs marker. The plugin injects the entry-module tuple at the
 *  trailing slot; `resolveEntryTupleFn` registers the tuple's dep closure and
 *  resolves its exact cache key (`<fnHash>_<typeId>`, variants pre-baked at
 *  build time). Slot 0 (`val`) may be a value-first schema whose runtime
 *  `.id` overrides the injected typeId (correct even for recursive schemas);
 *  the family fnHash still comes from the injected tuple's key. **/
function resolveTupleEntry<F extends AnyFn>(fnName: string, identityFn: F, val: unknown, args: unknown): F {
  const runTypeId = isRunTypeValue(val) ? val.id : undefined;
  return resolveEntryTupleFn(fnName, identityFn, runTypeId, args);
}

/** Returns the compiled closure for an option-carrying createX factory
 *  (`createValidateFn` / `createGetValidationErrorsFn`, 3-arg `(val, options, args)`). The
 *  injected entry tuple sits at the trailing slot; options @slot1 (including
 *  `rejectCircularRefs`) are compile-time — baked into the tuple's key at build
 *  time, so the runtime ignores them. **/
function createTypeFnArgsFunction<F extends AnyFn>(
  fnName: string,
  identityFn: F
): (val?: unknown, options?: unknown, args?: unknown) => F {
  return (val, _options, args) => resolveTupleEntry(fnName, identityFn, val, args);
}

/** Returns the compiled closure for a leaf family that does NOT honour
 *  `ValidateOptions` — every non-validator factory (`createHasUnknownKeysFn`,
 *  `createCloneExactShapeFn`, `createUnknownKeyErrorsFn`,
 *  `createFormatTransformFn`). The injected
 *  entry tuple sits at slot 1. Slot 0 may be a value-first schema
 *  (`createCloneExactShapeFn(rt)`) whose `.id` overrides the injected typeId. **/
function createRTFunction<F extends AnyFn>(fnName: string, identityFn: F): (val?: unknown, args?: unknown) => F {
  return (val, args) => resolveTupleEntry(fnName, identityFn, val, args);
}

// =============================================================================
// Standard family wrappers.
//
// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. <T>
// only exists at the type-checker layer and is erased before execution.
// =============================================================================

const identityValueFn = (v: unknown) => v;
const getValidationErrorsIdentity: GetValidationErrorsFn<never> = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];

// Two overloads, run-type form FIRST (TS resolves intersected call signatures
// top-to-bottom, and a `RunType<T>` arg must be tried before the `val?: T`
// reflection form, which would otherwise absorb it as `T = RunType<…>`):
//   - RUN-TYPE form `createValidateFn(rt)` — the value a builder returned. `T`
//     is inferred from `rt: RunType<T>` and reflected off the trailing
//     `InjectRunTypeId<T>`, exactly like the type/value forms. No `runType.id`
//     read, no ref-tracing — the call IS the injection site.
//   - VALUE / static form `createValidateFn<T>()` / `createValidateFn(value)`.
// Both share the runtime impl (`val`/`runType` @slot0 ignored, options @slot1,
// injected id @slot2).
export const createValidateFn = createTypeFnArgsFunction<ValidateFn>(
  'createValidateFn',
  // The runtime fallback is a plain `() => true`; `ValidateFn` is now a type
  // guard, so cast through `unknown` (a direct cast is rejected — a boolean fn
  // doesn't structurally overlap a type predicate).
  (() => true) as unknown as ValidateFn
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  id?: InjectTypeFnArgs<T, 'val'>
) => ValidateFn<T>) &
  (<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>) => ValidateFn<T>);

export const createGetValidationErrorsFn = createTypeFnArgsFunction<GetValidationErrorsFn>(
  'createGetValidationErrorsFn',
  getValidationErrorsIdentity
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  id?: InjectTypeFnArgs<T, 'verr'>
) => GetValidationErrorsFn<FormatErrorsOf<T>>) &
  (<T>(
    val?: T,
    options?: CompTimeFnArgs<ValidateOptions>,
    id?: InjectTypeFnArgs<T, 'verr'>
  ) => GetValidationErrorsFn<FormatErrorsOf<T>>);

// `ValidateOptions` stays exclusive to `createValidateFn` /
// `createGetValidationErrorsFn`; `createHasUnknownKeysFn` carries its OWN
// compile-time bag (`HasUnknownKeysCompileOptions`, options @slot1 baked into
// the variant fnHash exactly like the validate options). The remaining leaf
// families take no options — leaving a slot there would let callers pass
// values the Go emitter silently ignores.

export const createHasUnknownKeysFn = createTypeFnArgsFunction<HasUnknownKeysFn>(
  'createHasUnknownKeysFn',
  () => false
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<HasUnknownKeysCompileOptions>,
  id?: InjectTypeFnArgs<T, 'huk'>
) => HasUnknownKeysFn) &
  (<T>(val?: T, options?: CompTimeFnArgs<HasUnknownKeysCompileOptions>, id?: InjectTypeFnArgs<T, 'huk'>) => HasUnknownKeysFn);

export const createCloneExactShapeFn = createRTFunction<CloneExactShapeFn>(
  'createCloneExactShapeFn',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'ces'>) => CloneExactShapeFn<T>) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'ces'>) => CloneExactShapeFn<T>);

export const createUnknownKeyErrorsFn = createRTFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrorsFn',
  unknownKeyErrorsIdentity
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn);

// The VALUE-level JSON transforms — `prepareForJson` (maps a typed value to a
// JSON-safe value: bigint to string, Date preserved, undeclared keys stripped, …)
// and `restoreFromJson` (maps a JSON-safe value back to the typed shape:
// BigInt(...), Date revival, …), plus their per-strategy siblings (`pjs`/`cj`/
// `cjr`/`sj`/`ukuw`) — have NO dedicated `createX` factory. A framework that
// parses ONE JSON envelope per request and needs per-value transforms names the
// primitive it wants in an `InjectTypeFnArgs<T, '<key>'>` marker and recovers the
// injected handle with `getRTFunction<'<key>'>(…)` (below). Root `undefined` /
// `void` are handled inside the primitives (prepare passes the value; restore
// returns `undefined` for any input), so neither throws — the string encoder's
// `[value]` array envelope is a JSON-document concern the caller's own envelope
// replaces.

// createFormatTransformFn returns a `(value) => transformedValue` for `T`. Identity
// fallback covers both noop-format types and the no-plugin case.
export const createFormatTransformFn = createRTFunction<FormatTransformFn<unknown>>(
  'createFormatTransformFn',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'fmt'>) => FormatTransformFn<T>) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'fmt'>) => FormatTransformFn<T>);

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Composition moved to the Go backend (Slice 4): the plugin emits one composite
// cache entry per (typeId, strategy) — keyed by the strategy's opaque composite
// fnHash — that wraps the underlying RT primitives (prepareForJson /
// stringifyJson / unknownKeysToUndefined / restoreFromJson / ukuWire) with
// native JSON. So both factories collapse to the same pure `resolveTupleEntry`
// lookup as binary: the injected `[typeId, fnId]` tuple's `fnId` is the composite
// fnHash, and the runtime just resolves `<fnId>_<typeId>`. No runtime strategy
// branching, no per-primitive `lookupRTFn` composition.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);
const jsonParseFallback: JsonDecoderFn = (s) => JSON.parse(s);

/** Returns a JSON encoder for `T`. Default `strategy: 'clone'`. See
 *  `JsonEncoderStrategy` for the full matrix. Accepts either a value-first
 *  schema (`createJsonEncoderFn(rt)`) or the value/static form.
 *
 *  The trailing slot is the `InjectTypeFnArgs` marker — the plugin injects a
 *  `[typeId, fnId]` tuple where `fnId` IS the composite fnHash the backend
 *  computed from the comptime-resolved `strategy`. The runtime resolves that
 *  composite entry directly; the fallback (`JSON.stringify`) covers the
 *  no-plugin case. **/
export function createJsonEncoderFn<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<JsonEncoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
): JsonEncoderFn;
export function createJsonEncoderFn<T>(
  val?: T,
  options?: CompTimeFnArgs<JsonEncoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
): JsonEncoderFn;
export function createJsonEncoderFn<T>(
  valOrSchema?: T | RunType<T>,
  _options?: CompTimeFnArgs<JsonEncoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
): JsonEncoderFn {
  // `strategy` + `rejectCircularRefs` are compile-time — the plugin baked both
  // into `id`'s fnHash, so the runtime just resolves the injected tuple.
  return resolveTupleEntry<JsonEncoderFn>('createJsonEncoderFn', jsonStringifyFallback, valOrSchema, id);
}

/** Returns a JSON decoder for `T`. Default `strategy: 'strip'` — undeclared
 *  properties become `undefined` before restore walks the declared shape.
 *  Accepts either a value-first schema (`createJsonDecoderFn(rt)`) or the
 *  value/static form.
 *
 *  As with the encoder, the trailing `InjectTypeFnArgs` slot carries the
 *  `[typeId, fnId]` tuple whose `fnId` is the composite fnHash; the runtime
 *  resolves that entry directly. The fallback (`JSON.parse`) covers the
 *  no-plugin case. **/
export function createJsonDecoderFn<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<JsonDecoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
): JsonDecoderFn<DataOnly<T>>;
export function createJsonDecoderFn<T>(
  val?: T,
  options?: CompTimeFnArgs<JsonDecoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
): JsonDecoderFn<DataOnly<T>>;
export function createJsonDecoderFn<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeFnArgs<JsonDecoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
): JsonDecoderFn<DataOnly<T>> {
  // A decoded value is reconstructed from JSON, so it only ever holds
  // serialisable data — the return is the data-only projection `DataOnly<T>`
  // (identity on clean DTOs). Runtime is unchanged; this is the type boundary.
  return resolveTupleEntry<JsonDecoderFn<DataOnly<T>>>(
    'createJsonDecoderFn',
    jsonParseFallback as JsonDecoderFn<DataOnly<T>>,
    valOrSchema,
    id
  );
}

// =============================================================================
// createParseFn — restore + check in ONE walk
// =============================================================================

/** Returns a parse function for `T`: it takes the output of `JSON.parse` and
 *  gives back the typed value, throwing `RTParseError` when the data does not
 *  match.
 *
 *  ```ts
 *  const parseUser = createParseFn<User>();
 *  const user = parseUser(JSON.parse(body)); // typed, or throws
 *  ```
 *
 *  Replaces the three-call glue this used to take:
 *
 *  ```ts
 *  const restored = restoreFromJson(data);
 *  if (!isUser(restored)) throw new Error(...getValidationErrors(restored));
 *  ```
 *
 *  The compiled body restores and checks in a SINGLE walk, so a matching value
 *  costs one pass instead of two. A failing one pays for a second pass to build
 *  the report — and because it is built from the fully restored value, the
 *  `issues` are exactly what `createGetValidationErrorsFn<T>()` returns for it.
 *
 *  Input is parsed JSON, not a string, so it composes with whatever produced the
 *  envelope rather than duplicating it. Reach for `createJsonDecoderFn<T>()` when
 *  you want the string decoded for you and do not need validation.
 *
 *  `strategy` decides what happens to undeclared properties — `'strip'` by
 *  default; see `ParseStrategy`. **/
export function createParseFn<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ParseOptions>,
  ids?: InjectTypeFnArgs<T, 'prs', 'verr'>
): ParseFn<T>;
export function createParseFn<T>(
  val?: T,
  options?: CompTimeFnArgs<ParseOptions>,
  ids?: InjectTypeFnArgs<T, 'prs', 'verr'>
): ParseFn<T>;
export function createParseFn<T>(
  valOrSchema?: T | RunType<T>,
  _options?: CompTimeFnArgs<ParseOptions>,
  ids?: InjectTypeFnArgs<T, 'prs', 'verr'>
): ParseFn<T> {
  // A value-first schema's runtime `.id` overrides the injected type id (correct
  // even for recursive schemas), same as createStandardSchema.
  const runTypeId = isRunTypeValue(valOrSchema) ? valOrSchema.id : undefined;
  // TWO tuples in Fn-arg order 'prs','verr'. The parse body is the hot path; the
  // report is only built when something fails, which is why the pair is injected
  // here rather than composed by the caller.
  //
  // `strategy` is compile-time: the plugin already resolved it to one of the
  // three parse families and baked that family's fnHash into the first tuple, so
  // the runtime just resolves what it was handed.
  const parse = resolveEntryTupleFn<ParseRestoreFn>('createParseFn', parseNoPluginFallback, runTypeId, entryTupleAt(ids, 0));
  const getErrors = resolveEntryTupleFn<GetValidationErrorsFn<FormatErrorsOf<T>>>(
    'createParseFn',
    getValidationErrorsIdentity,
    runTypeId,
    entryTupleAt(ids, 1)
  );
  return (value: unknown): DataOnly<T> => {
    try {
      return parse(value) as DataOnly<T>;
    } catch (err) {
      // Only OUR signal is turned into a report. Anything else is a genuine bug
      // in a user hook or a class deserializer and must not be swallowed.
      if (err instanceof ParseMismatch) {
        // A throw from the restore is a DESERIALIZATION failure, so it reports as
        // one rather than as type errors — the same split `@mionjs/router` makes
        // when its restoreFromJson call throws. Only a value that deserialized
        // and then failed the check gets the validation report.
        if (err.cause !== undefined) throw new RTParseError({deserializeError: messageOf(err.cause)}, err.cause);
        throw new RTParseError(getErrors(err.value));
      }
      throw err;
    }
  };
}

/** No-plugin fallback. Unlike every other family this must NOT degrade to
 *  identity: a parse that accepts anything is a hole where the caller asked for a
 *  gate. Throws with the same actionable hint the JSON Schema family uses. **/
// The underlying message, for the serialization report. Anything can be thrown,
// so a non-Error is stringified rather than trusted to have `.message`.
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

const parseNoPluginFallback: ParseRestoreFn = () => {
  throw new Error('createParseFn(): no compiled parser. @mionjs/devtools must be active for the parse cache entry to exist.');
};

// =============================================================================
// getRTFunction — recover ANY family's compiled fn from an injected marker tuple
// =============================================================================

/** Maps each `InjectTypeFnArgs` fnKey to the runtime function shape
 *  `getRTFunction` returns for it. The JSON value-level primitives
 *  (`pj`/`pjs`/`rj`/`sj`/`ukuw`/`cj`/`cjr`) are the primary users — they have no
 *  `createX` factory — but every createX-backed family is keyed too, so a wrapper
 *  resolves any of them by naming the SAME fnKey it put in the marker. Families
 *  whose fn is generic in `T` (`val` / `jsonDecoder` / `fmt` / `fb`) resolve to
 *  the base `T = unknown`; reach for the dedicated `createX<T>()` factory when you
 *  need `T` preserved on the returned fn. **/
export interface RTFunctionByKey {
  // Validators.
  val: ValidateFn;
  verr: GetValidationErrorsFn;
  // The `{checkUnknowns: true}` fused twins — same call shapes, and additionally
  // reject (or report) undeclared properties.
  vst: ValidateFn;
  vest: GetValidationErrorsFn;
  // Unknown-keys group.
  huk: HasUnknownKeysFn;
  ces: CloneExactShapeFn;
  uke: UnknownKeyErrorsFn;
  // Format transform.
  fmt: FormatTransformFn<unknown>;
  // Parse — restore + check in one walk (one key per undeclared-key strategy).
  prs: ParseRestoreFn;
  prsf: ParseRestoreFn;
  prss: ParseRestoreFn;
  // JSON string I/O.
  jsonEncoder: JsonEncoderFn;
  jsonDecoder: JsonDecoderFn;
  // Binary I/O primitives (serializer/deserializer-threaded).
  tb: ToBinaryFn;
  fb: FromBinaryFn;
  // JSON value-level primitives — recovered ONLY through getRTFunction (no factory).
  pj: PrepareForJsonFn; // mutate prepare
  pjs: PrepareForJsonFn; // clone prepare
  rj: RestoreFromJsonFn; // restore
  sj: StringifyJsonFn; // direct (value -> JSON string)
  ukuw: RestoreFromJsonFn; // strip decoder's unknown-keys-to-undefined wire pre-pass
  cj: PrepareForJsonFn; // compact encode (positional wire)
  cjr: RestoreFromJsonFn; // compact decode
}

/** Every fnKey nameable in an `InjectTypeFnArgs<T, Fn>` marker and recoverable
 *  via `getRTFunction`. **/
export type RTFunctionKey = keyof RTFunctionByKey;

/** Recovers the compiled RT function for `T` from an injected `InjectTypeFnArgs`
 *  tuple, keyed by the SAME fnKey the marker names — the generic,
 *  family-agnostic counterpart of the `createX` factories. A framework wrapper
 *  that declares its OWN `InjectTypeFnArgs<T, Fn>` marker parameter (e.g. mion's
 *  `route()`) forwards the injected slot here to get the callable fn without a
 *  dedicated factory per function. This is the only way to reach the JSON
 *  value-level primitives that have no `createX` (`'pj'`/`'pjs'`/`'rj'`/`'sj'`/
 *  `'ukuw'`/`'cj'`/`'cjr'`); it also resolves any createX-backed family the same
 *  way. The type parameter is the fnKey (`getRTFunction<'pjs'>(fns?.[0])`), so the
 *  return type comes straight from `RTFunctionByKey`.
 *
 *  Registers the tuple's dependency closure, then returns `entry.fn` by the
 *  tuple's key (the fnHash already encodes the exact function). Degrade paths
 *  mirror `resolveEntryTupleFn`: a missing-stub tuple / key miss on a registered
 *  runtype returns `fallback` (default identity `(v) => v` — correct for every
 *  value-shaped primitive; pass `JSON.stringify` for `'sj'`), and no tuple at all
 *  (plugin inactive) throws with the actionable hint. It never applies the
 *  circular-reference guard — that stays with the encoder/validator factories;
 *  a framework owning its own envelope guards at the encoder level. **/
export function getRTFunction<K extends RTFunctionKey>(injected: unknown, fallback?: RTFunctionByKey[K]): RTFunctionByKey[K] {
  const identityFn = (fallback ?? ((value: unknown) => value)) as AnyFn;
  return resolveEntryTupleFn('getRTFunction', identityFn, undefined, injected) as RTFunctionByKey[K];
}
