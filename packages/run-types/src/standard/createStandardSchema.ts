// `createStandardSchema<T>()` — adapts RunTypes validation to the Standard
// Schema v1 interop contract (https://github.com/standard-schema/standard-schema).
// A thin layer over the existing validators: it carries ONE trailing
// `InjectTypeFnArgs<T, 'val', 'verr'>` marker, so the plugin injects an array
// of two entry tuples (the cheap boolean validator + getValidationErrors) for
// the same `T`. The produced `validate` is two-tier and synchronous: run the
// boolean validator first, and only on failure compute + map issues.
//
// The returned object is a Standard Schema (structurally assignable to
// StandardSchemaV1), but its `validate` advertises the richer RTValidationResult
// — the failure issues are RTValidationIssue, which carry the structured
// `expected` / `format` and the full path segments alongside the spec
// `message`/`path`. So generic consumers see a plain Standard Schema while
// RunTypes-aware consumers get the structured data with no extra call.

import {isRunTypeValue} from '../runtypes/rtUtils.ts';
import {entryTupleAt, resolveEntryTupleFn} from '../runtypes/entryTuple.ts';
import type {RunType} from '../runtypes/types.ts';
import type {DataOnly} from '../runtypes/dataOnly.ts';
import type {ValidateFn, GetValidationErrorsFn, ValidateOptions} from '../createRTFunctions.ts';
import type {FormatErrorsOf} from '../runtypes/formatErrors.ts';
import type {CompTimeFnArgs, InjectTypeFnArgs} from '../markers.ts';
import {runTypeErrorsToIssues} from './issueMapping.ts';
import type {RTValidationIssue} from './issueMapping.ts';
import type {StandardSchemaSuccessResult, StandardSchemaProps, StandardJSONSchemaConverter} from './spec.ts';
import {buildJsonSchemaConverter} from './jsonSchemaDoc.ts';
import type {JsonSchemaDocFn} from './jsonSchemaDoc.ts';
import {jsonSchemaDocFallback} from './createJsonSchemaFn.ts';

/** Failure result whose issues are the richer RTValidationIssue. Assignable to
 *  the spec FailureResult since RTValidationIssue extends StandardSchemaIssue. **/
export interface RTValidationFailureResult {
  readonly issues: ReadonlyArray<RTValidationIssue>;
}

/** createStandardSchema's `validate` result: `{value}` on success, the richer
 *  `{issues: RTValidationIssue[]}` on failure. Structurally a Standard Schema
 *  Result<Output>. **/
export type RTValidationResult<Output> = StandardSchemaSuccessResult<Output> | RTValidationFailureResult;

/** The createStandardSchema return type: a Standard Schema whose `validate`
 *  returns the richer RTValidationResult, carrying the StandardJSONSchemaV1
 *  converter beside it — ONE object satisfying both interfaces. Structurally
 *  assignable to StandardSchemaV1<Input, Output> (the validate return is
 *  assignable to the spec's) and to StandardJSONSchemaV1, so it interops with
 *  any spec consumer while exposing the structured issue data at the type
 *  level. **/
export interface RTStandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': Omit<StandardSchemaProps<Input, Output>, 'validate'> & {
    readonly validate: (value: unknown) => RTValidationResult<Output> | Promise<RTValidationResult<Output>>;
    readonly jsonSchema: StandardJSONSchemaConverter;
  };
}

// Identity fallbacks for the no-plugin case (mirror createValidateFn /
// createGetValidationErrorsFn): a boolean validator that accepts everything and an
// error collector that finds nothing.
const validateFallback = (() => true) as unknown as ValidateFn;
const errorsFallback: GetValidationErrorsFn<never> = () => [];

/** Returns a Standard Schema v1 object for `T`. `validate` returns `{value}` on
 *  success (the input, narrowed to `DataOnly<T>` — RunTypes validates the
 *  serialisable projection) or the richer `{issues}` on failure. Synchronous,
 *  `vendor: 'mion'`. Accepts either a value-first `RunType` schema or the
 *  type/value reflection form, mirroring `createValidateFn`. **/
export function createStandardSchema<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  ids?: InjectTypeFnArgs<T, 'val', 'verr', 'jsonSchema'>
): RTStandardSchemaV1<DataOnly<T>>;
export function createStandardSchema<T>(
  val?: T,
  options?: CompTimeFnArgs<ValidateOptions>,
  ids?: InjectTypeFnArgs<T, 'val', 'verr', 'jsonSchema'>
): RTStandardSchemaV1<DataOnly<T>>;
export function createStandardSchema<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  ids?: InjectTypeFnArgs<T, 'val', 'verr', 'jsonSchema'>
): RTStandardSchemaV1<DataOnly<T>> {
  // A value-first schema's runtime `.id` overrides the injected type id for both
  // lookups (correct even for recursive schemas).
  const runTypeId = isRunTypeValue(valOrSchema) ? valOrSchema.id : undefined;
  // The marker injects `[valTuple, verrTuple, jscTuple]` in the Fn-arg order
  // 'val','verr','jsonSchema'.
  const valInjected = entryTupleAt(ids, 0);
  const verrInjected = entryTupleAt(ids, 1);
  const jscInjected = entryTupleAt(ids, 2);
  // Resolve each under its own family fnName. The circular-reference guard is
  // compile-time: `{rejectCircularRefs: true}` forked each family's fnHash, so
  // the armed tuples self-guard (validate -> false on a cycle;
  // getValidationErrors -> a `{expected:'circular'}` issue).
  const validate = resolveEntryTupleFn<ValidateFn<T>>(
    'createValidateFn',
    validateFallback as ValidateFn<T>,
    runTypeId,
    valInjected
  );
  const getErrors = resolveEntryTupleFn<GetValidationErrorsFn<FormatErrorsOf<T>>>(
    'createGetValidationErrorsFn',
    errorsFallback,
    runTypeId,
    verrInjected
  );
  const docFn = resolveEntryTupleFn<JsonSchemaDocFn>('createJsonSchemaFn', jsonSchemaDocFallback, runTypeId, jscInjected);
  const props: RTStandardSchemaV1<DataOnly<T>>['~standard'] = {
    version: 1,
    vendor: 'mion',
    // The StandardJSONSchemaV1 converter — one document for both sides (the
    // standard keywords describe the JSON wire; the dialect rows annotate the
    // JS shape; see jsonSchemaDoc.ts).
    jsonSchema: buildJsonSchemaConverter(docFn),
    // Two-tier: cheap boolean first (zero allocation on the valid path), and
    // only on failure compute + map the issues.
    validate(value: unknown): RTValidationResult<DataOnly<T>> {
      if (validate(value)) return {value: value as DataOnly<T>};
      return {issues: runTypeErrorsToIssues(getErrors(value))};
    },
    // `types` is PHANTOM — intentionally never assigned at runtime; the declared
    // return type carries the input/output types for inference.
  };
  return {'~standard': props};
}
