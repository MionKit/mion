// format-validation / STRUCTURAL_FORMAT — the structural constraint
// keywords (formattedArray / formattedObject brands, the contains /
// patternProperties / propertyNames child-schema slots) and the anyOf
// combinator, run through the full case matrix. Every case pairs the
// type-first spelling (TF.FormattedArray / TF.FormattedObject over the
// shared params bag) with its value-first twin (RT.array / RT.record /
// RT.anyOf — formats/structural.ts, the same sentinel encoding), so the
// id-integrity driver pins type-first ↔ value-first convergence by
// construction. bounded_items rides bare minItems on the brand param —
// TF.FormattedArray<…, {minItems}> and RT.array({minItems}) share one
// encoding and one id.
import * as TF from '@mionjs/run-types/formats';
import type {FormatValidationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
  type AnyOf,
} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

type UniqueNumbers = TF.FormattedArray<number[], {uniqueItems: true}>;
type BoundedStrings = TF.FormattedArray<string[], {minItems: 1; maxItems: 2}>;
type KeyCounted = TF.FormattedObject<Record<string, unknown>, {minProperties: 1; maxProperties: 2}>;
type ContainsNumber = TF.FormattedArray<unknown[], {contains: number}>;
type PatternKeyed = TF.FormattedObject<Record<string, unknown>, {patternProperties: {'^a': number}}>;
type ShortKeys = TF.FormattedObject<Record<string, unknown>, {propertyNames: TF.String<{maxLength: 3}>}>;
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
    getValidationErrors: () => createGetValidationErrorsFn<UniqueNumbers>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<UniqueNumbers>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.array(TF.number(), {uniqueItems: true})),
    mockType: () => createMockDataFn<UniqueNumbers>(),
    getSamples: () => ({valid: [[], [1, 2, 3]], invalid: [[1, 1], ['x'], 5]}),
    expectedFormatErrors: () => [{name: 'formattedArray'}, null, null],
  },

  bounded_items: {
    title: 'minItems / maxItems',
    description: 'JSON Schema `minItems: 1` + `maxItems: 2` — exact length bounds on a typed array.',
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
    validateSchema: () => createValidateFn(RT.array(TF.string(), {minItems: 1, maxItems: 2})),
    getValidationErrors: () => createGetValidationErrorsFn<BoundedStrings>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<BoundedStrings>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.array(TF.string(), {minItems: 1, maxItems: 2})),
    mockType: () => createMockDataFn<BoundedStrings>(),
    getSamples: () => ({valid: [['a'], ['a', 'b']], invalid: [[], ['a', 'b', 'c'], 'x']}),
    // Both bounds ride the formattedArray brand now — an under-length array
    // fails with the minItems format payload, exactly like the over-length
    // one fails with maxItems.
    expectedFormatErrors: () => [
      {name: 'formattedArray', val: 1, formatPathTail: 'minItems'},
      {name: 'formattedArray', val: 2, formatPathTail: 'maxItems'},
      null,
    ],
  },

  key_counts: {
    title: 'minProperties / maxProperties',
    description: 'JSON Schema key-count bounds on an open object — the formattedObject brand counts own keys.',
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
    getValidationErrors: () => createGetValidationErrorsFn<KeyCounted>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<KeyCounted>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.record(RT.unknown(), {minProperties: 1, maxProperties: 2})),
    mockType: () => createMockDataFn<KeyCounted>(),
    getSamples: () => ({valid: [{a: 1}, {a: 1, b: 2}], invalid: [{}, {a: 1, b: 2, c: 3}, null]}),
    expectedFormatErrors: () => [{name: 'formattedObject'}, {name: 'formattedObject'}, null],
  },

  contains: {
    title: 'contains / minContains',
    description: 'JSON Schema `contains` — at least one item validates against the child schema, whatever the item type says.',
    validateNotes: ['Items stay unconstrained; only the OCCURRENCE of a matching item is asserted.'],
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
    getValidationErrors: () => createGetValidationErrorsFn<ContainsNumber>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<ContainsNumber>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.array(RT.unknown(), {contains: TF.number()})),
    mockType: () => createMockDataFn<ContainsNumber>(),
    getSamples: () => ({valid: [[1], ['a', 2], [1, 'b', 3]], invalid: [['a'], [], 7]}),
    expectedFormatErrors: () => [{name: 'contains'}, {name: 'contains'}, null],
  },

  pattern_props: {
    title: 'patternProperties',
    description: 'JSON Schema `patternProperties` — keys matching the pattern must hold values valid against the child.',
    validateNotes: ['Keys NOT matching any pattern stay unconstrained.'],
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
    getValidationErrors: () => createGetValidationErrorsFn<PatternKeyed>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<PatternKeyed>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.record(RT.unknown(), {patternProperties: {'^a': TF.number()}})),
    mockType: () => createMockDataFn<PatternKeyed>(),
    getSamples: () => ({valid: [{alpha: 1}, {}, {other: 'x'}], invalid: [{alpha: 'no'}, null]}),
    expectedFormatErrors: () => [{name: 'patternProperties'}, null],
  },

  prop_names: {
    title: 'propertyNames',
    description: 'JSON Schema `propertyNames` — every key validates as a string against the child schema.',
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
    getValidationErrors: () => createGetValidationErrorsFn<ShortKeys>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<ShortKeys>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.record(RT.unknown(), {propertyNames: TF.string({maxLength: 3})})),
    mockType: () => createMockDataFn<ShortKeys>(),
    getSamples: () => ({valid: [{ab: 1}, {}], invalid: [{toolong: 1}, null]}),
    expectedFormatErrors: () => [{name: 'propertyNames'}, null],
  },

  any_of: {
    title: 'anyOf — at least one branch',
    description: 'The at-least-one combinator IS the plain union: AnyOf<[…]> and RT.anyOf converge on it.',
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
    getValidationErrors: () => createGetValidationErrorsFn<AnyOf<[BranchA, BranchB]>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<AnyOf<[BranchA, BranchB]>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.anyOf([RT.object({a: TF.string()}), RT.object({b: TF.string()})])),
    mockType: () => createMockDataFn<AnyOf<[BranchA, BranchB]>>(),
    getSamples: () => ({valid: [{a: 'x'}, {b: 'y'}, {a: 'x', b: 'y'}], invalid: [{}, null]}),
    expectedFormatErrors: () => [null, null],
  },
} as const satisfies Record<string, FormatValidationCase>;
