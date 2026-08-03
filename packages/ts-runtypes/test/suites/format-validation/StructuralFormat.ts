// format-validation / STRUCTURAL_FORMAT — the JSON Schema structural
// keywords (formattedArray / formattedObject brands, the contains /
// patternProperties / propertyNames child-schema slots) and the oneOf /
// anyOf combinators, run through the full case matrix. The STATIC type
// twin of every schema-door case is the door-recovered type itself
// (FromJsonSchema<…>), so the id-integrity driver pins schema-literal ↔
// type-first convergence by construction. The value-first twins are real
// across the board since M9-P6: RT.oneOf / RT.anyOf plus RT.formattedArray /
// RT.formattedObject / RT.contains / RT.patternProperties / RT.propertyNames
// (formats/structural.ts — the door's exact sentinel twins). The two
// remaining 'not-supported' schema thunks are deliberate: bounded_items
// (the door lowers minItems to a required tuple prefix, a different
// encoding than the brand's minItems param) and closed_object (the
// closedness param is door-owned — its allowed-key list derives from the
// schema's own properties and is never hand-authored).
import * as TF from '@ts-runtypes/core/formats';
import type {FormatValidationCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
  type OneOf,
  type AnyOf,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {runTypeFromJsonSchema, type FromJsonSchema} from '@ts-runtypes/core/json-schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

type UniqueNumbers = FromJsonSchema<{
  readonly type: 'array';
  readonly items: {readonly type: 'number'};
  readonly uniqueItems: true;
}>;
type BoundedStrings = FromJsonSchema<{
  readonly type: 'array';
  readonly items: {readonly type: 'string'};
  readonly minItems: 1;
  readonly maxItems: 2;
}>;
type KeyCounted = FromJsonSchema<{readonly type: 'object'; readonly minProperties: 1; readonly maxProperties: 2}>;
type ClosedShape = FromJsonSchema<{
  readonly type: 'object';
  readonly properties: {readonly a: {readonly type: 'string'}};
  readonly required: readonly ['a'];
  readonly additionalProperties: false;
}>;
type ContainsNumber = FromJsonSchema<{
  readonly type: 'array';
  readonly contains: {readonly type: 'number'};
  readonly minContains: 1;
}>;
type PatternKeyed = FromJsonSchema<{
  readonly type: 'object';
  readonly patternProperties: {readonly '^a': {readonly type: 'number'}};
}>;
type ShortKeys = FromJsonSchema<{
  readonly type: 'object';
  readonly propertyNames: {readonly type: 'string'; readonly maxLength: 3};
}>;
interface BranchA {
  a: string;
}
interface BranchB {
  b: string;
}

export const STRUCTURAL_FORMAT = {
  unique_items: {
    title: 'uniqueItems',
    description: 'JSON Schema `uniqueItems: true` on a typed array — 2020-12 deep JSON equality, not identity.',
    validateNotes: [
      'Duplicates compare by JSON value: [1, 1] fails even though the elements are distinct number instances.',
      'Value-first twin: RT.array(TF.number(), {uniqueItems: true}).',
    ],
    validate: () => createValidateFn<UniqueNumbers>(),
    standardSchema: () => createStandardSchema<UniqueNumbers>(),
    validateReflect: () => {
      const v: UniqueNumbers = [1, 2];
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<UniqueNumbers>(),
    deserializeValidateReflect: () => {
      const v: UniqueNumbers = [1, 2];
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: UniqueNumbers = [1, 2];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<UniqueNumbers>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: UniqueNumbers = [1, 2];
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: UniqueNumbers = [1, 2];
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<UniqueNumbers>>(),
    validateSchema: () => createValidateFn(RT.array(TF.number(), {uniqueItems: true})),
    validateJsonSchema: () =>
      createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true})),
    getValidationErrors: () => createGetValidationErrorsFn<UniqueNumbers>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<UniqueNumbers>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.array(TF.number(), {uniqueItems: true})),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'array', items: {type: 'number'}, uniqueItems: true})),
    mockType: () => createMockDataFn<UniqueNumbers>(),
    getSamples: () => ({valid: [[], [1, 2, 3]], invalid: [[1, 1], ['x'], 5]}),
    expectedFormatErrors: () => [{name: 'formattedArray'}, null, null],
  },

  bounded_items: {
    title: 'minItems / maxItems',
    description: 'JSON Schema `minItems: 1` + `maxItems: 2` — exact length bounds on a typed array.',
    validateNotes: [
      'JSON Schema: the door lowers minItems to a required tuple prefix; RT.array(..., {minItems}) carries minItems as a brand param instead — same checks, different encoding (and id), so the columns stay door-authored.',
    ],
    validate: () => createValidateFn<BoundedStrings>(),
    standardSchema: () => createStandardSchema<BoundedStrings>(),
    validateReflect: () => {
      const v: BoundedStrings = ['a'];
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<BoundedStrings>(),
    deserializeValidateReflect: () => {
      const v: BoundedStrings = ['a', 'b'];
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: BoundedStrings = ['a'];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<BoundedStrings>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: BoundedStrings = ['a'];
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: BoundedStrings = ['a'];
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<BoundedStrings>>(),
    validateSchema: 'not-supported',
    validateJsonSchema: () =>
      createValidateFn(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 2})),
    getValidationErrors: () => createGetValidationErrorsFn<BoundedStrings>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<BoundedStrings>>(),
    getValidationErrorsSchema: 'not-supported',
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 2})),
    mockType: () => createMockDataFn<BoundedStrings>(),
    getSamples: () => ({valid: [['a'], ['a', 'b']], invalid: [[], ['a', 'b', 'c'], 'x']}),
    // minItems lowers to a REQUIRED TUPLE PREFIX (an under-length array
    // fails as a missing element, no format payload); only maxItems rides
    // the formattedArray brand.
    expectedFormatErrors: () => [null, {name: 'formattedArray', val: 2, formatPathTail: 'maxItems'}, null],
  },

  key_counts: {
    title: 'minProperties / maxProperties',
    description: 'JSON Schema key-count bounds on an open object — the formattedObject brand counts own keys.',
    validateNotes: ['JSON Schema: value-first twin: RT.formattedObject — author it through the schema door.'],
    validate: () => createValidateFn<KeyCounted>(),
    standardSchema: () => createStandardSchema<KeyCounted>(),
    validateReflect: () => {
      const v: KeyCounted = {a: 1};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<KeyCounted>(),
    deserializeValidateReflect: () => {
      const v: KeyCounted = {a: 1};
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: KeyCounted = {a: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<KeyCounted>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: KeyCounted = {a: 1};
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: KeyCounted = {a: 1};
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<KeyCounted>>(),
    validateSchema: () => createValidateFn(RT.record(RT.unknown(), {minProperties: 1, maxProperties: 2})),
    validateJsonSchema: () => createValidateFn(runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 2})),
    getValidationErrors: () => createGetValidationErrorsFn<KeyCounted>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<KeyCounted>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.record(RT.unknown(), {minProperties: 1, maxProperties: 2})),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'object', minProperties: 1, maxProperties: 2})),
    mockType: () => createMockDataFn<KeyCounted>(),
    getSamples: () => ({valid: [{a: 1}, {a: 1, b: 2}], invalid: [{}, {a: 1, b: 2, c: 3}, null]}),
    expectedFormatErrors: () => [{name: 'formattedObject'}, {name: 'formattedObject'}, null],
  },

  closed_object: {
    title: 'additionalProperties false',
    description: 'JSON Schema `additionalProperties: false` — the formattedObject closedness rejects undeclared keys.',
    validateNotes: [
      'Structural TS validation normally lets extra properties pass; closedness makes them a validation failure.',
      'JSON Schema: value-first twin: RT.formattedObject — author it through the schema door.',
    ],
    validate: () => createValidateFn<ClosedShape>(),
    standardSchema: () => createStandardSchema<ClosedShape>(),
    validateReflect: () => {
      const v: ClosedShape = {a: 'x'};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<ClosedShape>(),
    deserializeValidateReflect: () => {
      const v: ClosedShape = {a: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: ClosedShape = {a: 'x'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<ClosedShape>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: ClosedShape = {a: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: ClosedShape = {a: 'x'};
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<ClosedShape>>(),
    validateSchema: 'not-supported',
    validateJsonSchema: () =>
      createValidateFn(
        runTypeFromJsonSchema({
          type: 'object',
          properties: {a: {type: 'string'}},
          required: ['a'],
          additionalProperties: false,
        })
      ),
    getValidationErrors: () => createGetValidationErrorsFn<ClosedShape>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<ClosedShape>>(),
    getValidationErrorsSchema: 'not-supported',
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(
        runTypeFromJsonSchema({
          type: 'object',
          properties: {a: {type: 'string'}},
          required: ['a'],
          additionalProperties: false,
        })
      ),
    mockType: () => createMockDataFn<ClosedShape>(),
    getSamples: () => ({valid: [{a: 'x'}], invalid: [{a: 'x', b: 1}, {}, null]}),
    expectedFormatErrors: () => [{name: 'formattedObject'}, null, null],
  },

  contains: {
    title: 'contains / minContains',
    description: 'JSON Schema `contains` — at least one item validates against the child schema, whatever the item type says.',
    validateNotes: [
      'Items stay unconstrained; only the OCCURRENCE of a matching item is asserted.',
      'JSON Schema: value-first twin: RT.contains — author it through the schema door.',
    ],
    validate: () => createValidateFn<ContainsNumber>(),
    standardSchema: () => createStandardSchema<ContainsNumber>(),
    validateReflect: () => {
      const v: ContainsNumber = [1];
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<ContainsNumber>(),
    deserializeValidateReflect: () => {
      const v: ContainsNumber = ['a', 2];
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: ContainsNumber = [1];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<ContainsNumber>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: ContainsNumber = [1];
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: ContainsNumber = [1];
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<ContainsNumber>>(),
    validateSchema: () => createValidateFn(RT.array(RT.unknown(), {contains: TF.number()})),
    validateJsonSchema: () =>
      createValidateFn(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 1})),
    getValidationErrors: () => createGetValidationErrorsFn<ContainsNumber>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<ContainsNumber>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.array(RT.unknown(), {contains: TF.number()})),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'array', contains: {type: 'number'}, minContains: 1})),
    mockType: () => createMockDataFn<ContainsNumber>(),
    getSamples: () => ({valid: [[1], ['a', 2], [1, 'b', 3]], invalid: [['a'], [], 7]}),
    expectedFormatErrors: () => [{name: 'contains'}, {name: 'contains'}, null],
  },

  pattern_props: {
    title: 'patternProperties',
    description: 'JSON Schema `patternProperties` — keys matching the pattern must hold values valid against the child.',
    validateNotes: [
      'Keys NOT matching any pattern stay unconstrained.',
      'JSON Schema: value-first twin: RT.patternProperties — author it through the schema door.',
    ],
    validate: () => createValidateFn<PatternKeyed>(),
    standardSchema: () => createStandardSchema<PatternKeyed>(),
    validateReflect: () => {
      const v: PatternKeyed = {alpha: 1};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<PatternKeyed>(),
    deserializeValidateReflect: () => {
      const v: PatternKeyed = {alpha: 1};
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: PatternKeyed = {alpha: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<PatternKeyed>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: PatternKeyed = {alpha: 1};
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: PatternKeyed = {alpha: 1};
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<PatternKeyed>>(),
    validateSchema: () => createValidateFn(RT.record(RT.unknown(), {patternProperties: {'^a': TF.number()}})),
    validateJsonSchema: () =>
      createValidateFn(runTypeFromJsonSchema({type: 'object', patternProperties: {'^a': {type: 'number'}}})),
    getValidationErrors: () => createGetValidationErrorsFn<PatternKeyed>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<PatternKeyed>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.record(RT.unknown(), {patternProperties: {'^a': TF.number()}})),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'object', patternProperties: {'^a': {type: 'number'}}})),
    mockType: () => createMockDataFn<PatternKeyed>(),
    getSamples: () => ({valid: [{alpha: 1}, {}, {other: 'x'}], invalid: [{alpha: 'no'}, null]}),
    expectedFormatErrors: () => [{name: 'patternProperties'}, null],
  },

  prop_names: {
    title: 'propertyNames',
    description: 'JSON Schema `propertyNames` — every key validates as a string against the child schema.',
    validateNotes: ['JSON Schema: value-first twin: RT.propertyNames — author it through the schema door.'],
    validate: () => createValidateFn<ShortKeys>(),
    standardSchema: () => createStandardSchema<ShortKeys>(),
    validateReflect: () => {
      const v: ShortKeys = {ab: 1};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<ShortKeys>(),
    deserializeValidateReflect: () => {
      const v: ShortKeys = {ab: 1};
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: ShortKeys = {ab: 1};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<ShortKeys>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: ShortKeys = {ab: 1};
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: ShortKeys = {ab: 1};
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<ShortKeys>>(),
    validateSchema: () => createValidateFn(RT.record(RT.unknown(), {propertyNames: TF.string({maxLength: 3})})),
    validateJsonSchema: () =>
      createValidateFn(runTypeFromJsonSchema({type: 'object', propertyNames: {type: 'string', maxLength: 3}})),
    getValidationErrors: () => createGetValidationErrorsFn<ShortKeys>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<ShortKeys>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.record(RT.unknown(), {propertyNames: TF.string({maxLength: 3})})),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'object', propertyNames: {type: 'string', maxLength: 3}})),
    mockType: () => createMockDataFn<ShortKeys>(),
    getSamples: () => ({valid: [{ab: 1}, {}], invalid: [{toolong: 1}, null]}),
    expectedFormatErrors: () => [{name: 'propertyNames'}, null],
  },

  one_of: {
    title: 'oneOf — exactly one branch',
    description:
      'The exactly-one combinator across all three modes: OneOf<[…]> is the type, RT.oneOf the builder, JSON Schema oneOf the document spelling — one cached factory.',
    validateNotes: ['A value matching TWO branches fails, exactly as a strict JSON Schema validator rejects it.'],
    validate: () => createValidateFn<OneOf<[BranchA, BranchB]>>(),
    standardSchema: () => createStandardSchema<OneOf<[BranchA, BranchB]>>(),
    validateReflect: () => {
      const v: OneOf<[BranchA, BranchB]> = {a: 'x'};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<OneOf<[BranchA, BranchB]>>(),
    deserializeValidateReflect: () => {
      const v: OneOf<[BranchA, BranchB]> = {b: 'y'};
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: OneOf<[BranchA, BranchB]> = {a: 'x'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<OneOf<[BranchA, BranchB]>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: OneOf<[BranchA, BranchB]> = {a: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: OneOf<[BranchA, BranchB]> = {a: 'x'};
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<OneOf<[BranchA, BranchB]>>>(),
    validateSchema: () => createValidateFn(RT.oneOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})])),
    validateJsonSchema: () =>
      createValidateFn(
        runTypeFromJsonSchema({
          oneOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'string'}}, required: ['b']},
          ],
        })
      ),
    getValidationErrors: () => createGetValidationErrorsFn<OneOf<[BranchA, BranchB]>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<OneOf<[BranchA, BranchB]>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.oneOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})])),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(
        runTypeFromJsonSchema({
          oneOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'string'}}, required: ['b']},
          ],
        })
      ),
    mockType: () => createMockDataFn<OneOf<[BranchA, BranchB]>>(),
    getSamples: () => ({valid: [{a: 'x'}, {b: 'y'}], invalid: [{a: 'x', b: 'y'}, {}, null]}),
    expectedFormatErrors: () => [{name: 'oneOf', val: 2, formatPathTail: 'oneOf'}, null, null],
  },

  any_of: {
    title: 'anyOf — at least one branch',
    description: 'The at-least-one combinator IS the plain union: AnyOf<[…]>, RT.anyOf and JSON Schema anyOf all converge on it.',
    validateNotes: ['A value matching several branches passes — at-least-one is ordinary union validation.'],
    validate: () => createValidateFn<AnyOf<[BranchA, BranchB]>>(),
    standardSchema: () => createStandardSchema<AnyOf<[BranchA, BranchB]>>(),
    validateReflect: () => {
      const v: AnyOf<[BranchA, BranchB]> = {a: 'x'};
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<AnyOf<[BranchA, BranchB]>>(),
    deserializeValidateReflect: () => {
      const v: AnyOf<[BranchA, BranchB]> = {b: 'y'};
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: AnyOf<[BranchA, BranchB]> = {a: 'x'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<AnyOf<[BranchA, BranchB]>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: AnyOf<[BranchA, BranchB]> = {a: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: AnyOf<[BranchA, BranchB]> = {a: 'x'};
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<AnyOf<[BranchA, BranchB]>>>(),
    validateSchema: () => createValidateFn(RT.anyOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})])),
    validateJsonSchema: () =>
      createValidateFn(
        runTypeFromJsonSchema({
          anyOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'string'}}, required: ['b']},
          ],
        })
      ),
    getValidationErrors: () => createGetValidationErrorsFn<AnyOf<[BranchA, BranchB]>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<AnyOf<[BranchA, BranchB]>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.anyOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})])),
    getValidationErrorsJsonSchema: () =>
      createGetValidationErrorsFn(
        runTypeFromJsonSchema({
          anyOf: [
            {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
            {type: 'object', properties: {b: {type: 'string'}}, required: ['b']},
          ],
        })
      ),
    mockType: () => createMockDataFn<AnyOf<[BranchA, BranchB]>>(),
    getSamples: () => ({valid: [{a: 'x'}, {b: 'y'}, {a: 'x', b: 'y'}], invalid: [{}, null]}),
    expectedFormatErrors: () => [null, null],
  },
} as const satisfies Record<string, FormatValidationCase>;
