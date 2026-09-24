// Public entry point for mion RunTypes.
export {
  type InjectRunTypeId,
  type InjectTypeFnArgs,
  type InjectPureFnId,
  type InjectBatchId,
  type InjectApiMetadata,
  type InjectBuildVersion,
  type CompTimeArgs,
  type CompTimeFnArgs,
  type CompTimeHints,
  type PureFunction,
  type PureFunctionFactory,
  getRunTypeId,
} from './markers.ts';

// Evaluated BEFORE `./createRTFunctions.ts`: it pulls in rtUtils, which cache modules call through
// `initCache(getRTUtils())` at module top level across any ESM cycle.
// getRunType stays on the main entry: the build reads value-use of a builder through it, and on a
// subpath that builder is left with no instantiable row (elision fuzz: E2-value-missing-reflection).
export {getRunType} from './getRunType.ts';

// The wire surface for compiled RT functions: send the closure-free `CompiledFnData` (its `code` is
// the factory body), restore it with `buildFactoryFromCode` (on the `./runtime` subpath), write back
// through `RTUtils.addToRTCache` / `.addPureFn`, then call via `getRTUtils().getRT(hash)`.
export {
  type CompiledFnData,
  type CompiledTypeFn,
  type InitializedTypeFn,
  type CompiledFnArgs,
  type CompiledPureFunction,
  type PureFunctionData,
  type AnyFn,
} from './runtypes/types.ts';

// The value-first surface: builders return `RunType<T>`, `InferType<typeof schema>` maps back to the
// source TS type it carries.
export {type RunType} from './runtypes/types.ts';
export {type DataOnly} from './runtypes/dataOnly.ts';
export {type StripRunTypeMeta, type JsonValue} from './runtypes/stripRunTypeMeta.ts';
// `JSONShape<T>` — the JSON wire twin of `DataOnly<T>` (what createJsonEncoderFn writes /
// createJsonDecoderFn reads). Annotation-grade: never reflect it.
export {type JSONShape} from './runtypes/jsonShape.ts';
export {type InferType, type AnyOf} from './builders/static.ts';

// AI enrichment — type-keyed, committed maps validated against `T` at scan time (see
// docs/AI_ENRICHMENT.md). `FriendlyText<T>` is labels + error templates; `MockData<T>` is the sample
// pools/ranges feeding `createMockDataFn`.
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
// `createFriendlyTextI18n` is the locale-selecting wrapper over the same walk — the source map is
// the source language + terminal fallback, translations are same-tree per-locale consts, plurals
// select via Intl.PluralRules, and `$[val]` renders type-driven (an isCurrency-marked bound via the
// app-supplied `currency` option, date-family bounds via Intl.DateTimeFormat).
export {
  createFriendlyText,
  createFriendlyTextI18n,
  resolveLocale,
  type FriendlyMessage,
  type FriendlyRenderer,
  type FriendlyI18nOptions,
} from './enrich/createFriendlyText.ts';

// Side-effect import: registers the package's own pure fns (newRunTypeErr, getUnknownKeysFromArray, …),
// which MUST evaluate before any materialised factory reaches one.
import './runtypes/pure-fns-utils.ts';

// Per-format types live on the `/formats` subpath; the brand alias stays at root so a format module
// can import it without a self-referential barrel cycle.
export {
  type TypeFormat,
  type TypeFormatBase,
  type TypeFormatParams,
  type FormatNameOf,
  type FormatParamsOf,
  type FormatBrandNameOf,
  // The named brand carriers, public because DECLARATION EMIT needs them to be: a downstream
  // exported type that expands a format structurally (a mion router's public API does) can only be
  // written to a `.d.ts` if the emitter can name what it is printing.
  type FormatBrand,
  type NominalBrand,
} from './runtypes/typeFormat.ts';
// The format sentinel KEYS, type-only: `typeof __rtFormatName extends keyof T` is
// the only sound format detection downstream (the symbols are nominal — a local
// re-declaration only helps the Go scanner, never TS type matching). Zero runtime
// footprint: `declare const` emits nothing and type-only exports are elided.
export type {__rtFormatName, __rtFormatParams} from './runtypes/sentinelKeys.ts';
// The typed format-error union a validator for `T` reports (what
// `createGetValidationErrorsFn<T>()` returns); the per-format mode unions it
// is built from live on the `/formats` subpath next to their params.
export type {FormatErrorsOf} from './runtypes/formatErrors.ts';
// Plain type transforms that keep format fidelity in the derived payload shapes (used by the
// drizzle-orm packages).
export type {InsertModel, SelectModel, UpdateModel} from './modelTypes.ts';
export {type FormatAnnotation} from './runtypes/formatAnnotation.ts';
export {registerFormatPattern, type FormatPattern, type StringPatternArgs} from './runtypes/formatPattern.ts';
// Reflection-kind enum mirrors (auto-generated from the Go protocol). Re-exported so formats under
// `src/formats/` can declare `readonly kind = RunTypeKind.string` and graph consumers can key on
// kind/subKind: detect a builtin like Date via `subKind === RunTypeSubKind.date`, never via
// `typeName === 'Date'`, which false-positives on user classes named Date.
export {
  RunTypeKind,
  type RunTypeKindName,
  type RunTypeKindValue,
  RunTypeSubKind,
  type RunTypeSubKindName,
  type RunTypeSubKindValue,
} from './go-generated/runTypeKind.generated.ts';

export {
  // createValidateFn / createGetValidationErrorsFn are overloaded: a value-first `RunType` schema as
  // the first arg is a distinct overload from the type/value reflection form — both reflect `T`.
  createValidateFn,
  type ValidateFn,
  type ValidateOptions,
  createGetValidationErrorsFn,
  type GetValidationErrorsFn,
  type RTValidationError,
  type TypeFormatError,
  type RTValidationErrorPathSegment,
  type RTPathSegment,
  createRemoveUnknownKeysFn,
  type RemoveUnknownKeysFn,
  createFormatTransformFn,
  type FormatTransformFn,
  createJsonEncoderFn,
  type JsonEncoderFn,
  type JsonEncoderOptions,
  type JsonEncoderStrategy,
  createJsonDecoderFn,
  type JsonDecoderFn,
  type JsonDecoderOptions,
  type JsonDecoderStrategy,
  // The value-level JSON transforms, no string step; several of them in ONE wrapper marker
  // resolve through `getRTFunction` instead.
  createPrepareForJsonFn,
  type PrepareForJsonFn,
  type PrepareForJsonOptions,
  createRestoreFromJsonFn,
  type RestoreFromJsonFn,
  type RestoreFromJsonOptions,
  type JsonValueStrategy,
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

// Per-type custom function overrides — the WRITE side of the createX routing. Declared after
// createRTFunctions / createRTFBinary so the Fn aliases they export are initialized first.
export {
  overrideValidate,
  overrideGetValidationErrors,
  overrideRemoveUnknownKeys,
  overrideFormatTransform,
  overrideBinaryEncoder,
  overrideBinaryDecoder,
  overrideJsonEncoder,
  overrideJsonDecoder,
} from './overrideRTFunctions.ts';

// Mock generation lives on the `@mionjs/run-types/mocking` subpath, so a bundle never carries it unasked.

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
  type StandardJSONSchemaV1,
  type StandardJSONSchemaProps,
  type StandardJSONSchemaConverter,
  type StandardJSONSchemaOptions,
} from './standard/spec.ts';
// The StandardJSONSchemaV1 document half: createStandardSchema's `~standard.jsonSchema` converter
// serves the same document this per-type fn returns.
export {createJsonSchemaFn, type JsonSchemaFn} from './standard/createJsonSchemaFn.ts';
export {
  stripDialect,
  buildJsonSchemaConverter,
  JSON_SCHEMA_TARGET,
  JSON_SCHEMA_DIALECT_KEYWORDS,
  type JsonSchemaDocFn,
} from './standard/jsonSchemaDoc.ts';

// Circular-reference guard for the live-object families (validate / getValidationErrors /
// jsonEncode / binaryEncode). Armed per call with the COMPILE-TIME option
// `{rejectCircularRefs: true}`; there is no global toggle, it forks the factory's fnHash like any
// other compile flag. The encoders throw this error on a cycle; validate returns false and
// getValidationErrors records a `{expected: 'circular'}` issue.
export {CircularReferenceError, type CircularPath} from './runtypes/circular.ts';

// DataView helpers — exposed so consumers can pre-build a serializer /
// deserializer instance and pass it to the encoder / decoder for buffer reuse.
export {
  createDataViewSerializer,
  createDataViewDeserializer,
  BinaryDecodeError,
  UNSAFE_PROPERTY_NAME_MESSAGE,
  MAX_ZERO_BYTE_ITEMS,
  setSerializationOptions,
  type CreateSerializerOptions,
  type SerializationOptions,
  type DataViewSerializer,
  type DataViewDeserializer,
  type StrictArrayBuffer,
  type BinaryInput,
} from './runtypes/dataView.ts';
