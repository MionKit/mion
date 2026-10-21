// `createStandardSchema<T>()` — adapts RunTypes validation to the Standard Schema v1 interop contract
// (https://github.com/standard-schema/standard-schema). A thin layer over the existing validators: ONE
// trailing marker injects an entry tuple per family for the same `T`, and the produced `validate` is
// synchronous and two-tier, running the cheap boolean validator first. The returned object is
// structurally a Standard Schema, but its `validate` advertises the richer RTValidationResult, so a
// generic consumer sees the plain spec shape while a RunTypes-aware one gets the structured issue
// data with no extra call.

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

/** Assignable to the spec FailureResult, since RTValidationIssue extends StandardSchemaIssue. **/
export interface RTValidationFailureResult {
  readonly issues: ReadonlyArray<RTValidationIssue>;
}

/** Structurally a Standard Schema Result<Output>, with the richer issues on the failure side. **/
export type RTValidationResult<Output> = StandardSchemaSuccessResult<Output> | RTValidationFailureResult;

/** ONE object satisfying both spec interfaces: structurally assignable to StandardSchemaV1 and to
 *  StandardJSONSchemaV1, while exposing the structured issue data at the type level. **/
export interface RTStandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': Omit<StandardSchemaProps<Input, Output>, 'validate'> & {
    readonly validate: (value: unknown) => RTValidationResult<Output> | Promise<RTValidationResult<Output>>;
    readonly jsonSchema: StandardJSONSchemaConverter;
  };
}

// Fallbacks for the no-plugin case, mirroring createValidateFn / createGetValidationErrorsFn.
const validateFallback = (() => true) as unknown as ValidateFn;
const errorsFallback: GetValidationErrorsFn<never> = () => [];

/** Returns a Standard Schema v1 object for `T`, synchronous and `vendor: 'mion'`. On success the input
 *  is narrowed to `DataOnly<T>`, since RunTypes validates the serialisable projection. Accepts either a
 *  value-first `RunType` schema or the type/value reflection form, mirroring `createValidateFn`. **/
export function createStandardSchema<T>(
  runType: RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  ids?: InjectTypeFnArgs<T, 'validate', 'validationErrors', 'jsonSchema'>
): RTStandardSchemaV1<DataOnly<T>>;
export function createStandardSchema<T>(
  val?: T,
  options?: CompTimeFnArgs<ValidateOptions>,
  ids?: InjectTypeFnArgs<T, 'validate', 'validationErrors', 'jsonSchema'>
): RTStandardSchemaV1<DataOnly<T>>;
export function createStandardSchema<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeFnArgs<ValidateOptions>,
  ids?: InjectTypeFnArgs<T, 'validate', 'validationErrors', 'jsonSchema'>
): RTStandardSchemaV1<DataOnly<T>> {
  // A value-first schema's runtime `.id` overrides the injected type id, correct even for recursive schemas.
  const runTypeId = isRunTypeValue(valOrSchema) ? valOrSchema.id : undefined;
  // The marker injects the tuples in the Fn-arg order 'validate', 'validationErrors', 'jsonSchema'.
  const valInjected = entryTupleAt(ids, 0);
  const verrInjected = entryTupleAt(ids, 1);
  const jscInjected = entryTupleAt(ids, 2);
  // Resolve each under its own family fnName. The circular-reference guard is compile-time:
  // `{rejectCircularRefs: true}` forked each family's fnHash, so the armed tuples self-guard.
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
    // One document for both sides (see jsonSchemaDoc.ts).
    jsonSchema: buildJsonSchemaConverter(docFn),
    // Cheap boolean first: zero allocation on the valid path.
    validate(value: unknown): RTValidationResult<DataOnly<T>> {
      if (validate(value)) return {value: value as DataOnly<T>};
      return {issues: runTypeErrorsToIssues(getErrors(value))};
    },
    // `types` is PHANTOM: never assigned at runtime, the declared return type carries it for inference.
  };
  return {'~standard': props};
}
