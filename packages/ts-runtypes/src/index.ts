// Public entry point for ts-runtypes.
export {
  type InjectRunTypeId,
  type InjectTypeFnArgs,
  type InjectPureFnHash,
  type CompTimeArgs,
  type CompTimeFnArgs,
  type CompTimeHints,
  type PureFunction,
  type PureFunctionFactory,
  getRunTypeId,
} from './markers.ts';

// RT registry — exported BEFORE `./createRTFunctions.ts` so rtUtils is a
// real function by the time downstream cache modules call `initCache(getRTUtils())`
// at module top level through any ESM cycle.
export {getRTUtils, getRTFnCaches, type RTUtils} from './runtypes/rtUtils.ts';

// Compiled-fn data model + reconstruction — the surface a consumer needs to ship
// compiled RT functions over the wire and rebuild them on the far side: send the
// closure-free `CompiledFnData` (its `code` is the factory body), restore the
// factory with `buildFactoryFromCode(code)` (the `new Function('utl', code)` step;
// `buildPureFnFactoryFromCode` is the pure-fn-lane twin), assemble a `CompiledTypeFn`,
// write it back through the already-public `RTUtils.addToRTCache` / `.addPureFn`, then
// materialise + call via `getRTUtils().getRT(hash)`. Only the argument types and the
// restore helpers were unreachable before — the cache-write methods were already public.
export {
  type CompiledFnData,
  type CompiledTypeFn,
  type InitializedTypeFn,
  type CompiledFnArgs,
  type CompiledPureFunction,
  type PureFunctionData,
  type AnyFn,
} from './runtypes/types.ts';
export {buildFactoryFromCode, buildPureFnFactoryFromCode, entryCode} from './runtypes/rtUtils.ts';

// The generic runtime type node + the helper that recovers the source TS type
// a `RunType<T>` carries (`InferType<typeof schema>`). Both are part of the
// value-first surface: builders return `RunType<T>`, `InferType` maps back.
export {type RunType} from './runtypes/types.ts';
// `getRunType` is the value-bearing twin of `getRunTypeId` — same two call
// shapes, but returns the traversable RunType<T> node instead of its id string.
// Exported after getRTUtils so the registry is initialised first.
export {getRunType} from './getRunType.ts';
export {type DataOnly} from './runtypes/dataOnly.ts';
export {type StripRunTypeMeta, type JsonValue} from './runtypes/stripRunTypeMeta.ts';
export {type InferType, type OneOf, type AnyOf} from './schema/static.ts';

// AI enrichment — type-keyed, committed maps validated against `T` at scan time
// (see docs/AI_ENRICHMENT.md). `FriendlyText<T>` combines labels + error
// templates; `MockData<T>` carries sample pools/ranges feeding `createMockDataFn`.
export {
  type FriendlyText,
  type FriendlyNode,
  type FriendlyMeta,
  type ErrorTemplates,
  type FriendlyTemplate,
  type PluralCategory,
  type PluralTemplate,
  type TemplateLeaf,
} from './enrich/friendlyText.ts';
import type {FriendlyText} from './enrich/friendlyText.ts';
/** @deprecated Renamed to `FriendlyText`. This alias is kept for one release; migrate `FriendlyType<T>` → `FriendlyText<T>`. */
export type FriendlyType<T> = FriendlyText<T>;
export {type MockData, type MockNode} from './enrich/mockData.ts';
// Pure-data runtime: render `getValidationErrors` output into human messages.
// `createFriendlyTextI18n` is the locale-selecting wrapper over the same walk: the
// source map is the source language + terminal fallback, translations are
// same-tree per-locale consts, plurals select via Intl.PluralRules, and
// `$[val]` renders type-driven (an isCurrency-marked bound via the app-supplied
// `currency` option, date-family bounds via Intl.DateTimeFormat).
export {
  createFriendlyText,
  createFriendlyTextI18n,
  resolveLocale,
  type FriendlyMessage,
  type FriendlyRenderer,
  type FriendlyI18nOptions,
} from './enrich/createFriendlyText.ts';

// getFnHash derives the version-independent fnHash for a function family (+ its
// compile-time options) — the fnHash half of the `<fnHash>_<typeId>` runtime
// cache key. A framework holding a type's injected typeId can rebuild the key
// itself (`getFnHash('val') + '_' + typeId`) instead of hand-pinning a
// family→prefix map. The hashes ride a Go-generated table (single source of
// truth = operations.FnHashFor); stable across releases, so consumers derive
// once and never re-pin on a version bump.
export {getFnHash, type FnHashKey, type FnHashOptions} from './fnHash.ts';

// Run-type registration is per-entry now: each marker call site imports its
// type's virtual entry module and registers it (plus transitive children) on
// first use — there is no monolithic cache module to populate up front.

// `pureFn.ts` MUST evaluate before any cache factory that references pure-fn
// helpers (e.g. validationErrors needs `rt::newRunTypeErr`).
export {
  registerPureFnFactory,
  registerPureFn,
  registerAnonymousPureFn,
  registerAnonymousPureFnFactory,
  type PureFnId,
} from './runtypes/pureFn.ts';
// Side-effect import: the `rt::` built-in pure fns (newRunTypeErr,
// getUnknownKeysFromArray, …) register at their own registerPureFnFactory
// call sites now — there is no monolithic pureFnsCache module delivering
// their bodies — so the package entry MUST load the registration file
// before any materialised factory calls utl.getPureFn('rt::…').
import './runtypes/pure-fns-utils.ts';

// Custom class serializer registry — register a class (with an optional
// serialize/deserialize handler) so the JSON + binary families rebuild a real
// instance instead of decoding to a plain object. See classSerializerRegistry.ts.
export {
  registerClassSerializer,
  type ClassSerializerHandler,
  type AnyClass,
  type SerializableClass,
  type DeserializeClassFn,
} from './runtypes/classSerializerRegistry.ts';

// Type-format base machinery — the per-format types live under
// `src/formats/` (the `ts-runtypes/formats` subpath); the
// brand alias + the mock registry sit here at the root so the format
// modules can import them without a self-referential barrel cycle.
// Validation is build-time (Go); the runtime only needs the per-kind
// mock registry.
export {type TypeFormat, type TypeFormatBase, type TypeFormatParams} from './runtypes/typeFormat.ts';
export {type FormatAnnotation} from './runtypes/formatAnnotation.ts';
export {registerMockingFunction, type MockFormatFn} from './mocking/mockRegistry.ts';
export {registerFormatPattern, type FormatPattern, type StringPatternArgs} from './runtypes/formatPattern.ts';
// Reflection-kind enum mirrors (auto-generated from the Go protocol — see
// runTypeKind.generated.ts). Re-exported so concrete formats under `src/formats/` can
// declare `readonly kind = RunTypeKind.string`, and so graph consumers can key
// on kind/subKind (builtin classes project atomically: detect Date via
// `subKind === RunTypeSubKind.date`, never via `typeName === 'Date'`, which
// false-positives on user classes named Date).
export {
  RunTypeKind,
  type RunTypeKindName,
  type RunTypeKindValue,
  RunTypeSubKind,
  type RunTypeSubKindName,
  type RunTypeSubKindValue,
} from './go-generated/runTypeKind.generated.ts';

// Built-in type-format metadata (auto-generated from the Go format registry —
// see typeFormats.generated.ts). `typeFormats` is the runtime table of every
// canonical format name ts-runtypes stamps on a reflected prop's
// `formatAnnotation.name`, each with the base `RunTypeKind` it refines;
// `FormatName` is the union of those names. A consumer that maps a reflected
// format to something external (a DB column, a UI label) keys off these instead
// of re-declaring the names.
export {typeFormats, type FormatName, type TypeFormatMeta} from './go-generated/typeFormats.generated.ts';

// String JSON I/O is `createJsonEncoderFn` + `createJsonDecoderFn`. The VALUE-level
// transforms they build on — the per-strategy prepareForJson / restoreFromJson
// primitives (`pj`/`pjs`/`rj`/`sj`/`ukuw`/`cj`/`cjr`) — have NO factory: a
// framework that owns its own JSON envelope names the primitive in an
// `InjectTypeFnArgs` marker and recovers the injected slot with `getRTFunction`,
// keyed by the SAME fnKey (`getRTFunction<'pjs'>(fns?.[0])`). Its `RTFunctionByKey`
// map + the fn-type aliases are exported so the return type is inferred from the
// key.
export {
  getRTFunction,
  type RTFunctionByKey,
  type RTFunctionKey,
  // createValidateFn / createGetValidationErrorsFn are overloaded: a value-first `RunType`
  // schema as the first arg (the value a `define` builder returns) is a distinct
  // overload from the type/value reflection form — both reflect `T`.
  createValidateFn,
  type ValidateFn,
  type ValidateOptions,
  createGetValidationErrorsFn,
  type GetValidationErrorsFn,
  type RTValidationError,
  type TypeFormatError,
  type RTValidationErrorPathSegment,
  type RTPathSegment,
  createHasUnknownKeysFn,
  type HasUnknownKeysFn,
  type HasUnknownKeysOptions,
  type HasUnknownKeysCompileOptions,
  createCloneExactShapeFn,
  type CloneExactShapeFn,
  createUnknownKeyErrorsFn,
  type UnknownKeyErrorsFn,
  createFormatTransformFn,
  type FormatTransformFn,
  createJsonEncoderFn,
  type JsonEncoderFn,
  type JsonEncoderOptions,
  createJsonDecoderFn,
  type JsonDecoderFn,
  type JsonDecoderOptions,
  // The value-level JSON primitives have NO factory — they are recovered via
  // `getRTFunction<'pj'>(…)` / `getRTFunction<'rj'>(…)` / … . Their fn-type
  // aliases stay public so callers can name the shapes: `pj`/`pjs`/`cj` return
  // PrepareForJsonFn, `rj`/`cjr`/`ukuw` return RestoreFromJsonFn, `sj` returns
  // StringifyJsonFn (value → JSON string). `RTFunctionByKey` maps each fnKey to
  // its shape, so `getRTFunction<'pjs'>()`'s return type is inferred.
  type PrepareForJsonFn,
  type RestoreFromJsonFn,
  type StringifyJsonFn,
} from './createRTFunctions.ts';

// Binary I/O re-exported from a dedicated module so bundlers can drop the
// binary subtree when consumers never reference either factory.
export {
  createBinaryEncoderFn,
  type BinaryEncoderFn,
  type BinaryEncoderSizeFn,
  type BinaryEncoderIntoFn,
  type BinaryEncoderOptions,
  createBinarySizerFn,
  type BinarySizerFn,
  createBinaryDecoderFn,
  type BinaryDecoderFn,
  type BinaryDecoderOptions,
  type ToBinaryFn,
  type FromBinaryFn,
} from './createRTFBinary.ts';

// Per-type custom function overrides — the WRITE side of the createX routing.
// Registers a custom pure function for one T; every createX<T>() then returns
// it. Declared after createRTFunctions / createRTFBinary so the Fn aliases they
// export are initialized first.
export {
  overrideValidate,
  overrideGetValidationErrors,
  overrideHasUnknownKeys,
  overrideCloneExactShape,
  overrideUnknownKeyErrors,
  overrideFormatTransform,
  overrideBinaryEncoder,
  overrideBinaryDecoder,
  overrideJsonEncoder,
  overrideJsonDecoder,
} from './overrideRTFunctions.ts';

// Mock-value generator re-exported from `./mocking/` so bundlers can drop the
// whole mock subtree when consumers don't reference `createMockDataFn`.
export {createMockDataFn} from './mocking/createMockData.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mocking/mockTypes.ts';
// The seeded/native random source. Exported so a custom mock fn (registered via
// `registerMockingFunction`) receives a `MockRandom` and stays reproducible
// under `createMockDataFn(..., { mock: { seed } })`.
export {MockRandom} from './mocking/mockRandom.ts';

// Standard Schema v1 adapter — re-exported from `./standard/` so bundlers can
// drop the adapter subtree when consumers never call createStandardSchema. The
// StandardSchemaV1 interface is copied in (./standard/spec.ts) to preserve the
// package's zero-runtime-dependency posture.
export {
  createStandardSchema,
  type RTStandardSchemaV1,
  type RTValidationResult,
  type RTValidationFailureResult,
} from './standard/createStandardSchema.ts';
export {runTypeErrorsToIssues, type IssueMappingOptions, type RTValidationIssue} from './standard/issueMapping.ts';
export {
  type StandardSchemaV1,
  type StandardSchemaProps,
  type StandardSchemaResult,
  type StandardSchemaSuccessResult,
  type StandardSchemaFailureResult,
  type StandardSchemaIssue,
  type StandardSchemaPathSegment,
  type StandardSchemaTypes,
  type StandardSchemaInferInput,
  type StandardSchemaInferOutput,
} from './standard/spec.ts';

// Circular-reference guard for the live-object families (validate /
// getValidationErrors / jsonEncode / binaryEncode). Armed per call with the
// COMPILE-TIME option `{rejectCircularRefs: true}` (there is no global toggle —
// it forks the factory's fnHash like any other compile flag). The encoders throw
// this error on a cycle; validate returns false and getValidationErrors records
// a `{expected: 'circular'}` issue.
export {CircularReferenceError, type CircularPath} from './runtypes/circular.ts';

// DataView helpers — exposed so consumers can pre-build a serializer /
// deserializer instance and pass it to the encoder / decoder for buffer reuse.
export {
  createDataViewSerializer,
  createDataViewDeserializer,
  setSerializationOptions,
  type CreateSerializerOptions,
  type SerializationOptions,
  type DataViewSerializer,
  type DataViewDeserializer,
  type StrictArrayBuffer,
  type BinaryInput,
} from './runtypes/dataView.ts';
