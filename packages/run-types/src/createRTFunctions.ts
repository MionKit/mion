// Home for every RT-backed factory exported by this package. Each `createXxx<T>()` is a thin wrapper
// over the private `createRTFunction` generic; only the identity fallback and return type vary per
// family. The rtUtils singleton is the only cache; entries arrive as per-entry virtual module tuples
// injected at each call site (see runtypes/entryTuple.ts).

import {isRunTypeValue} from './runtypes/rtUtils.ts';
import {resolveEntryTupleFn} from './runtypes/entryTuple.ts';
import type {AnyFn, RunType} from './runtypes/types.ts';
import type {DataOnly} from './runtypes/dataOnly.ts';
import type {JSONShape} from './runtypes/jsonShape.ts';
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

/** Subset of the RunTypeOptions that parameterises the generated `validate` / `getValidationErrors`
 *  validators (NOT a property of the type itself). Pass an OBJECT LITERAL at the call site: the
 *  Go-side marker scanner reads the values at build time and routes the call to a per-option variant
 *  of the validator factory (same structural type id, distinct function id). **/
export interface ValidateOptions {
  /** A value with a reference cycle fails: `createValidateFn` returns false, `createGetValidationErrorsFn`
   *  records `{expected: 'circular'}`. COMPILE-TIME: forks the fnHash into a distinct entry with the check baked in. **/
  rejectCircularRefs?: boolean;
  /** Folds the unknown-key check INTO the validator: one walk answers "matches `T`, no undeclared keys".
   *  The key check runs after each object's property checks, so all-required shapes use a key COUNT at any depth.
   *  The errors form adds one `{expected: 'never'}` per undeclared key, interleaved per node with the type errors.
   *  Index-signature shapes (every key is declared) and arrays take no check; `createRemoveUnknownKeysFn` strips instead.
   *  Unions answer PER MATCHED BRANCH: a cat carrying a dog's `barks` fails, reported as `{path: [], expected: 'union'}`.
   *  COMPILE-TIME, and a different FAMILY: its cache key is `getFnHash('validateStrict')` / `'validationErrorsStrict'`.
   *  **/
  checkUnknowns?: boolean;
  /** The narrow half of `checkUnknowns`: checks keys on UNION MEMBER ARMS only. Default `false`.
   *
   *  A stripping decoder cannot clean a union: `prepareForJsonClone` / `compactForJson` never
   *  validate, so they pool every member's property names into one allowlist, and emit nothing at all
   *  once ANY member carries an index signature. So `{a: string} | Record<string, number>` accepts
   *  `{a: 'x', evil: 'garbage'}`, a value matching NEITHER member, and this option rejects it.
   *
   *  PER MATCHED BRANCH, not "reject anything extra": with `Record<string, string>` that same value
   *  IS a valid record and stays accepted. The check runs ONLY on a union with two or more members
   *  carrying properties by name (object literals, interfaces, records, named classes), so
   *  `{a: string} | number` answers exactly as plain `validate` does; arrays, tuples, `Date`, `Map`,
   *  `Set` and atomics do not count.
   *
   *  NOT a weaker `checkUnknowns`: a plain object nested INSIDE a member is not a union node, so its
   *  own undeclared keys go unchecked. Setting both is allowed and `checkUnknowns` wins.
   *
   *  COMPILE-TIME, and like `checkUnknowns` it selects a different compiled FAMILY rather than a
   *  variant, so resolve `getFnHash('validateUnionKeys')`, or `'validationErrorsUnionKeys'` for the
   *  errors form. **/
  checkUnionUnknowns?: boolean;
  /** How a `number` is checked, to match other libraries: `'isFinite'` (default) rejects `NaN` / `±Infinity`,
   *  `'typeof'` accepts them (as ajv / typia / JSON Schema do), `'notNaN'` rejects only `NaN`.
   *  COMPILE-TIME: forks the fnHash; the `validate.numberMode` plugin / tsconfig option sets the project default, a per-call value overrides it. **/
  numberMode?: 'isFinite' | 'typeof' | 'notNaN';
}

/** Validator returned by `createValidateFn<T>()`. The guard narrows to `DataOnly<T>`, the
 *  serialisable projection of `T` the validator actually enforces (functions / methods / symbols are
 *  silently dropped from the validated shape; see CLAUDE.md "validate contract"). `T` defaults to
 *  `unknown` so the bare `ValidateFn` alias stays a plain `(value) => boolean`-shaped guard for the
 *  cache typedefs that carry no source type. **/
export type ValidateFn<T = unknown> = (value: unknown) => value is DataOnly<T>;

/** Path segment for a Map / Set entry. `key` is the entry's iteration index: a Map/Set entry has no
 *  serialisable address of its own (keys/items can be objects, symbols or null), so the position is
 *  the only universal pointer, and a number is what Standard Schema's `getDotPath` can read.
 *  `failed` marks which side of the entry tripped. A valid Standard Schema `PathSegment` (it has
 *  `key: PropertyKey`); the extra `failed` is ignored by spec consumers. **/
export interface RTPathSegment {
  key: number;
  failed?: 'mapKey' | 'mapValue' | 'setKey';
}

/** One segment of a RTValidationError path: an object key (`string`), an array
 *  / tuple index (`number`), or a Map / Set entry (`RTPathSegment`). Every form
 *  is `PropertyKey | {key: PropertyKey}`, so a path is already a valid Standard
 *  Schema `path` with no transformation. **/
export type RTValidationErrorPathSegment = string | number | RTPathSegment;

/** Format-specific error detail attached to a RTValidationError when a TypeFormat constraint
 *  (pattern, length, version, …) fails. `name` is the format name (e.g. 'stringFormat', 'uuid');
 *  `formatPath` locates the failing param; `val` is the param value/marker.
 *
 *  `createGetValidationErrorsFn<T>()` returns the narrowed union for `T` (see `FormatErrorsOf`), so
 *  `switch (format.name)` narrows `errorType` per format; the bare `TypeFormatError` is the wide
 *  shape every consumer accepts. **/
export interface TypeFormatError<Name extends string = string, Mode extends string = string> {
  name: Name;
  val: RTValidationErrorPathSegment | boolean | bigint | (RTValidationErrorPathSegment | boolean | bigint)[];
  formatPath: (string | number)[];
  /** WHICH way the format failed, for a format with more than one (a card number can be the wrong
   *  shape, carry a broken checksum, or belong to a network the field does not take). Formats with a
   *  single failure mode leave it unset. Always a stable string the format documents
   *  (`CreditCardErrorType`, `EmailErrorType`, `DomainErrorType`, `IpErrorType`), so a consumer can
   *  switch on it: `formatPath` locates the failing param, this names the mode. */
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
  /** Present when a TypeFormat constraint failed (emitted via formatErr). */
  format?: Format;
}

/** Validator returned by `createGetValidationErrorsFn<T>()`. The optional `path` and `errors` slots
 *  let it be chained or pre-seeded, and the pre-seed slot stays wide so a chain across types keeps
 *  compiling. `Format` is the typed format detail the returned errors carry: the factory hands back
 *  `GetValidationErrorsFn<FormatErrorsOf<T>>`, and the bare `GetValidationErrorsFn` is the wide
 *  shape every narrowed one assigns to. (Parameterized over the error rather than over `T` so the
 *  parameter stays measurably covariant.) **/
export type GetValidationErrorsFn<Format extends TypeFormatError = TypeFormatError> = (
  value: unknown,
  path?: RTValidationErrorPathSegment[],
  errors?: RTValidationError[]
) => RTValidationError<Format>[];

/** Deep copy of the declared shape; RegExps and values it cannot rebuild (`any`, functions: RUK010/RUK015) are shared.
 *  `overrideRemoveUnknownKeys<T>()` is the escape hatch for custom copying. **/
export type RemoveUnknownKeysFn<T = unknown> = (value: T) => T;

/** Reduces a type to the plain runtime value the format transform operates on: TypeFormat brands
 *  collapse to their base (string formats → `string`), nested objects / arrays recurse. The brand is
 *  erased at runtime, so callers pass and receive plain data — `createFormatTransformFn<Lowercase>()`
 *  is `(value: string) => string`, not a branded-in/branded-out fn. **/
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

/** Applies `T`'s format `transform` rewrites (identity when it declares none); mion runs it on route params via `sanitizeParams`.
 *  Never a step inside validate / encode / decode. **/
export type FormatTransformFn<T> = (value: FormatTransformValue<T>) => FormatTransformValue<T>;

// `T` defaults to `unknown`, where `JSONShape` and `DataOnly` collapse to `unknown`, so the
// bare alias is the shape `getRTFunction` hands back.
export type PrepareForJsonFn<T = unknown> = (value: T) => JSONShape<T>;
export type RestoreFromJsonFn<T = unknown> = (value: unknown) => DataOnly<T>;

/** Stringifier returned by `createJsonEncoderFn<T>()`. Returns the JSON string,
 *  OR `undefined` for top-level `undefined` inputs (matches `JSON.stringify`). **/
export type JsonEncoderFn = (value: unknown) => string | undefined;

/** Parse function returned by `createJsonDecoderFn<T>()`. **/
export type JsonDecoderFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled `strategy` for every JSON entry point: `createPrepareForJsonFn<T>()`,
 *  `createRestoreFromJsonFn<T>()`, `createJsonEncoderFn<T>()` and `createJsonDecoderFn<T>()`.
 *  A pair must name the SAME word on both sides.
 *
 *  - `'clone'` (default): build a NEW value from the declared shape, dropping undeclared
 *    properties in both directions.
 *  - `'mutate'`: transform in place, allocating nothing and keeping undeclared properties.
 *  - `'compact'`: the positional wire — objects become arrays, so property names never
 *    reach the wire.
 *
 *  COMPILE-TIME: each value selects a different compiled family, so an unrecognised one
 *  takes `'clone'` rather than failing. **/
export type JsonValueStrategy = 'clone' | 'mutate' | 'compact';
export type PrepareForJsonOptions = {strategy?: JsonValueStrategy};
export type RestoreFromJsonOptions = {strategy?: JsonValueStrategy};

/** `createJsonEncoderFn<T>()` strategy: `JSON.stringify` over the matching prepare step.
 *  `'compact'` is shape-coupled like the binary codec: an absent optional rides a `null` placeholder,
 *  so a `T | null` optional cannot tell a present `null` from an absent value. **/
export type JsonEncoderStrategy = JsonValueStrategy;
// Both options are COMPILE-TIME (see ValidateOptions.rejectCircularRefs): `strategy`
// selects the composite, and `rejectCircularRefs` forks it into an armed variant
// whose body throws a CircularReferenceError on a reference cycle.
export type JsonEncoderOptions = {strategy?: JsonEncoderStrategy; rejectCircularRefs?: boolean};

/** `createJsonDecoderFn<T>()` strategy: the matching restore step over `JSON.parse`. **/
export type JsonDecoderStrategy = JsonValueStrategy;
export type JsonDecoderOptions = {strategy?: JsonDecoderStrategy};

// =============================================================================
// Private generic factories
// =============================================================================

/** Resolves the compiled closure for a createX factory routed through the InjectTypeFnArgs marker.
 *  The plugin injects the entry-module tuple at the trailing slot; `resolveEntryTupleFn` registers
 *  its dep closure and resolves the exact cache key (`<fnHash>_<typeId>`, variants pre-baked at
 *  build time). Slot 0 (`val`) may be a value-first schema whose runtime `.id` overrides the
 *  injected typeId (correct even for recursive schemas); the family fnHash still comes from the
 *  injected tuple's key. **/
function resolveTupleEntry<F extends AnyFn>(fnName: string, identityFn: F, val: unknown, args: unknown): F {
  const runTypeId = isRunTypeValue(val) ? val.id : undefined;
  return resolveEntryTupleFn(fnName, identityFn, runTypeId, args);
}

/** Returns the compiled closure for an option-carrying createX factory (3-arg
 *  `(val, options, args)`). The injected entry tuple sits at the trailing slot; options @slot1
 *  (`rejectCircularRefs` included) are compile-time, baked into the tuple's key, so the runtime
 *  ignores them. **/
function createTypeFnArgsFunction<F extends AnyFn>(
  fnName: string,
  identityFn: F
): (val?: unknown, options?: unknown, args?: unknown) => F {
  return (val, _options, args) => resolveTupleEntry(fnName, identityFn, val, args);
}

/** Option-less family: the entry tuple sits at slot 1; a value-first schema at slot 0 overrides its typeId. **/
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

// Two overloads, run-type form FIRST: TS resolves intersected call signatures top-to-bottom, and a
// `RunType<T>` arg must be tried before the `val?: T` reflection form, which would otherwise absorb
// it as `T = RunType<…>`. In the run-type form `createValidateFn(rt)` the call IS the injection site
// — `T` comes off `rt: RunType<T>` and is reflected through the trailing marker, with no `runType.id`
// read and no ref-tracing. Both overloads share the runtime impl (slot0 ignored, options @slot1,
// injected id @slot2).
export const createValidateFn = createTypeFnArgsFunction<ValidateFn>(
  'createValidateFn',
  // Cast through `unknown` because `ValidateFn` is a type guard: a direct cast of a boolean fn is
  // rejected, the two do not structurally overlap.
  (() => true) as unknown as ValidateFn
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  id?: InjectTypeFnArgs<T, 'validate'>
) => ValidateFn<T>) &
  (<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'validate'>) => ValidateFn<T>);

export const createGetValidationErrorsFn = createTypeFnArgsFunction<GetValidationErrorsFn>(
  'createGetValidationErrorsFn',
  getValidationErrorsIdentity
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  id?: InjectTypeFnArgs<T, 'validationErrors'>
) => GetValidationErrorsFn<FormatErrorsOf<T>>) &
  (<T>(
    val?: T,
    options?: CompTimeFnArgs<ValidateOptions>,
    id?: InjectTypeFnArgs<T, 'validationErrors'>
  ) => GetValidationErrorsFn<FormatErrorsOf<T>>);

// Leaf families take no options: a slot would let callers pass values the Go emitter silently ignores.

/** Returns a new value with only the declared keys (Dates, Maps, Sets, prototypes kept); never mutates the input. **/
export const createRemoveUnknownKeysFn = createRTFunction<RemoveUnknownKeysFn>(
  'createRemoveUnknownKeysFn',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'removeUnknownKeys'>) => RemoveUnknownKeysFn<T>) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'removeUnknownKeys'>) => RemoveUnknownKeysFn<T>);

// =============================================================================
// The VALUE-level JSON transforms, no string step: for a framework that parses ONE envelope per
// request and transforms many values inside it. Root `undefined` / `void` never throw (prepare
// passes the value through, restore returns `undefined`); the string encoder's `[value]` array
// envelope is a JSON-document concern the caller's own envelope replaces.
// =============================================================================

/** Typed value in, JSON-safe value out (bigint to string, Date preserved, Map/Set to arrays).
 *  Pair it with `createRestoreFromJsonFn<T>()` on the SAME strategy; the caller owns the
 *  `JSON.stringify`, so one stringify can cover many values. **/
export const createPrepareForJsonFn = createTypeFnArgsFunction<PrepareForJsonFn>(
  'createPrepareForJsonFn',
  identityValueFn
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<PrepareForJsonOptions>,
  id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>
) => PrepareForJsonFn<T>) &
  (<T>(
    val?: T,
    options?: CompTimeFnArgs<PrepareForJsonOptions>,
    id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>
  ) => PrepareForJsonFn<T>);

/** `JSON.parse` output in, typed value out; it does NOT check the value, so validate untrusted data. **/
export const createRestoreFromJsonFn = createTypeFnArgsFunction<RestoreFromJsonFn>(
  'createRestoreFromJsonFn',
  identityValueFn
) as unknown as (<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<RestoreFromJsonOptions>,
  id?: InjectTypeFnArgs<T, 'restoreFromJsonClone'>
) => RestoreFromJsonFn<T>) &
  (<T>(
    val?: T,
    options?: CompTimeFnArgs<RestoreFromJsonOptions>,
    id?: InjectTypeFnArgs<T, 'restoreFromJsonClone'>
  ) => RestoreFromJsonFn<T>);

// createFormatTransformFn returns a `(value) => transformedValue` for `T`. Identity
// fallback covers both noop-format types and the no-plugin case.
export const createFormatTransformFn = createRTFunction<FormatTransformFn<unknown>>(
  'createFormatTransformFn',
  identityValueFn
) as unknown as (<T>(runType: RunType<T>, id?: InjectTypeFnArgs<T, 'formatTransform'>) => FormatTransformFn<T>) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'formatTransform'>) => FormatTransformFn<T>);

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Composition lives in the Go backend: the plugin emits one composite cache entry per
// (typeId, strategy), keyed by the strategy's opaque composite fnHash, wrapping the underlying RT
// primitives (the prepare / restore / compact pairs) with native JSON. So both factories collapse to the same pure `resolveTupleEntry` lookup
// as binary, with no runtime strategy branching and no per-primitive `lookupRTFn` composition.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);
const jsonParseFallback: JsonDecoderFn = (s) => JSON.parse(s);

/** Returns a JSON encoder for `T`. Default `strategy: 'clone'`; see `JsonEncoderStrategy` for the
 *  full matrix. Accepts a value-first schema (`createJsonEncoderFn(rt)`) or the value/static form.
 *  The plugin injects a `[typeId, fnId]` tuple at the trailing marker slot where `fnId` IS the
 *  composite fnHash the backend computed from the comptime-resolved `strategy`, and the runtime
 *  resolves that composite entry directly. The `JSON.stringify` fallback covers the no-plugin case. **/
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

/** Returns a JSON decoder for `T`. Default `strategy: 'clone'`: the value is rebuilt from the
 *  declared shape, so undeclared properties are dropped. Accepts a value-first schema
 *  (`createJsonDecoderFn(rt)`) or the value/static form. As with the encoder, the trailing marker
 *  slot carries the `[typeId, fnId]` tuple whose `fnId` is the composite fnHash, resolved directly;
 *  the `JSON.parse` fallback covers the no-plugin case. **/
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
  // A decoded value is reconstructed from JSON, so it only ever holds serialisable data — hence the
  // `DataOnly<T>` projection (identity on clean DTOs). Runtime is unchanged; this is the boundary.
  return resolveTupleEntry<JsonDecoderFn<DataOnly<T>>>(
    'createJsonDecoderFn',
    jsonParseFallback as JsonDecoderFn<DataOnly<T>>,
    valOrSchema,
    id
  );
}

// =============================================================================
// getRTFunction — recover ANY family's compiled fn from an injected marker tuple
// =============================================================================

/** Maps each `InjectTypeFnArgs` fnKey to the runtime function shape `getRTFunction` returns for it,
 *  so a wrapper resolves any family by naming the SAME fnKey it put in the marker. Families whose fn
 *  is generic in `T` (`validate` / `jsonDecoder` / `formatTransform` / `fromBinary`) resolve to the
 *  base `T = unknown`; use the dedicated `createX<T>()` factory to keep `T` on the returned fn. **/
export interface RTFunctionByKey {
  // Validators.
  validate: ValidateFn;
  validationErrors: GetValidationErrorsFn;
  // The `{checkUnknowns: true}` fused twins — same call shapes, and additionally
  // reject (or report) undeclared properties.
  validateStrict: ValidateFn;
  validationErrorsStrict: GetValidationErrorsFn;
  // The `{checkUnionUnknowns: true}` twins: same shapes, rejecting a key the matched union member leaves undeclared.
  validateUnionKeys: ValidateFn;
  validationErrorsUnionKeys: GetValidationErrorsFn;
  // Unknown-keys group.
  removeUnknownKeys: RemoveUnknownKeysFn;
  // Format transform.
  formatTransform: FormatTransformFn<unknown>;
  // JSON string I/O.
  jsonEncoder: JsonEncoderFn;
  jsonDecoder: JsonDecoderFn;
  // Binary I/O primitives (serializer/deserializer-threaded).
  toBinary: ToBinaryFn;
  fromBinary: FromBinaryFn;
  // JSON value-level primitives, also reachable through their own createX factories above.
  prepareForJsonMutate: PrepareForJsonFn; // transforms in place, keeps undeclared keys
  prepareForJsonClone: PrepareForJsonFn; // builds a new value from the declared shape
  restoreFromJsonMutate: RestoreFromJsonFn; // restores in place, keeps undeclared keys
  restoreFromJsonClone: RestoreFromJsonFn; // rebuilds the declared shape, so undeclared keys are dropped
  compactForJson: PrepareForJsonFn; // compact encode (positional wire)
  compactFromJson: RestoreFromJsonFn; // compact decode
}

/** Every fnKey nameable in an `InjectTypeFnArgs<T, Fn>` marker and recoverable
 *  via `getRTFunction`. **/
export type RTFunctionKey = keyof RTFunctionByKey;

/** Recovers the compiled RT function for `T` from an injected `InjectTypeFnArgs` tuple, keyed by the
 *  SAME fnKey the marker names — the generic, family-agnostic counterpart of the `createX`
 *  factories, resolving every family including the value-level JSON set. A framework wrapper with
 *  its OWN `InjectTypeFnArgs<T, Fn>` marker parameter (e.g. mion's `route()`) forwards the injected
 *  slot here instead of calling one factory per function. The type parameter is the fnKey
 *  (`getRTFunction<'prepareForJsonClone'>(fns?.[0])`), so the return type comes from
 *  `RTFunctionByKey`.
 *
 *  Registers the tuple's dependency closure, then returns `entry.fn` by the tuple's key (the fnHash
 *  already encodes the exact function). Degrade paths mirror `resolveEntryTupleFn`: a missing-stub
 *  tuple / key miss on a registered runtype returns `fallback` (default identity `(v) => v`, correct
 *  for every value-shaped primitive), and no tuple at
 *  all (plugin inactive) throws with the actionable hint. It never applies the circular-reference
 *  guard — that stays with the encoder/validator factories, and a framework owning its own envelope
 *  guards at the encoder level. **/
export function getRTFunction<K extends RTFunctionKey>(injected: unknown, fallback?: RTFunctionByKey[K]): RTFunctionByKey[K] {
  const identityFn = (fallback ?? ((value: unknown) => value)) as AnyFn;
  return resolveEntryTupleFn('getRTFunction', identityFn, undefined, injected) as RTFunctionByKey[K];
}
