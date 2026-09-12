// format-validation / STRUCTURAL_FORMAT — the structural constraint
// keywords (formattedArray / formattedObject / formattedSet / formattedMap
// brands, the contains / patternProperties / propertyNames child-schema
// slots) and the anyOf
// combinator, run through the full case matrix. Every case pairs the
// type-first spelling (TF.FormattedArray / TF.FormattedSet / TF.FormattedMap
// over the ONE collection params bag, TF.FormattedObject over the object one)
// with its value-first twin (RT.array / RT.set / RT.map / RT.record /
// RT.anyOf — formats/structural.ts, the same sentinel encoding), so the
// id-integrity driver pins type-first ↔ value-first convergence by
// construction. bounded_items rides bare minItems on the brand param —
// TF.FormattedArray<…, {minItems}> and RT.array({minItems}) share one
// encoding and one id. A Map's ENTRY is its `[key, value]` pair, so its
// `contains` child is a tuple and its `uniqueItems` compares pairs.
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
type SmallSet = TF.FormattedSet<Set<string>, {minItems: 1; maxItems: 2}>;
type UniqueSet = TF.FormattedSet<Set<{id: number}>, {uniqueItems: true}>;
type NumberSomewhere = TF.FormattedSet<Set<unknown>, {contains: number}>;
type SmallMap = TF.FormattedMap<Map<string, number>, {minItems: 1; maxItems: 2}>;
type UniqueMap = TF.FormattedMap<Map<{id: number}, string>, {uniqueItems: true}>;
type AdminSomewhere = TF.FormattedMap<Map<string, number>, {contains: ['admin', unknown]}>;
type OnePerfectScore = TF.FormattedMap<Map<string, number>, {contains: [unknown, 100]; maxContains: 1}>;
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

  set_bounds: {
    title: 'FormattedSet minItems / maxItems',
    description:
      'The collection count bounds on a Set, read off `.size`: a Set is an array on the wire, so it takes the same bag an array does.',
    validateNotes: ['Value-first twin: RT.set(TF.string(), {minItems: 1, maxItems: 2}).'],
    validate: () => createValidateFn<SmallSet>(),
    standardSchema: () => createStandardSchema<SmallSet>(),
    validateReflect: () => {
      const v: SmallSet = new Set(['a']) as SmallSet;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<SmallSet>(),
    deserializeValidateReflect: () => {
      const v: SmallSet = new Set(['a']) as SmallSet;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: SmallSet = new Set(['a']) as SmallSet;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<SmallSet>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: SmallSet = new Set(['a']) as SmallSet;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: SmallSet = new Set(['a']) as SmallSet;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<SmallSet>>(),
    validateSchema: () => createValidateFn(RT.set(TF.string(), {minItems: 1, maxItems: 2})),
    getValidationErrors: () => createGetValidationErrorsFn<SmallSet>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<SmallSet>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.set(TF.string(), {minItems: 1, maxItems: 2})),
    mockType: () => createMockDataFn<SmallSet>(),
    getSamples: () => ({
      valid: [new Set(['a']), new Set(['a', 'b'])],
      invalid: [new Set(), new Set(['a', 'b', 'c']), ['a']],
    }),
    expectedFormatErrors: () => [
      {name: 'formattedSet', val: 1, formatPathTail: 'minItems'},
      {name: 'formattedSet', val: 2, formatPathTail: 'maxItems'},
      null,
    ],
  },

  set_unique: {
    title: 'FormattedSet uniqueItems',
    description:
      'Deep JSON equality over the members: a Set of objects may hold two structurally equal members, the keyword rejects that.',
    validateNotes: ['Value-first twin: RT.set(RT.object({id: TF.number()}), {uniqueItems: true}).'],
    validate: () => createValidateFn<UniqueSet>(),
    standardSchema: () => createStandardSchema<UniqueSet>(),
    validateReflect: () => {
      const v: UniqueSet = new Set([{id: 1}, {id: 2}]) as UniqueSet;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<UniqueSet>(),
    deserializeValidateReflect: () => {
      const v: UniqueSet = new Set([{id: 1}, {id: 2}]) as UniqueSet;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: UniqueSet = new Set([{id: 1}, {id: 2}]) as UniqueSet;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<UniqueSet>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: UniqueSet = new Set([{id: 1}, {id: 2}]) as UniqueSet;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: UniqueSet = new Set([{id: 1}, {id: 2}]) as UniqueSet;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<UniqueSet>>(),
    validateSchema: () => createValidateFn(RT.set(RT.object({id: TF.number()}), {uniqueItems: true})),
    getValidationErrors: () => createGetValidationErrorsFn<UniqueSet>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<UniqueSet>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.set(RT.object({id: TF.number()}), {uniqueItems: true})),
    mockType: () => createMockDataFn<UniqueSet>(),
    getSamples: () => ({
      valid: [new Set(), new Set([{id: 1}, {id: 2}])],
      invalid: [new Set([{id: 1}, {id: 1}]), [{id: 1}]],
    }),
    expectedFormatErrors: () => [{name: 'formattedSet', val: true, formatPathTail: 'uniqueItems'}, null],
  },

  set_contains: {
    title: 'FormattedSet contains',
    description: 'At least one member matches the contains type; the check walks the Set with for…of.',
    validateNotes: ['Value-first twin: RT.set(RT.unknown(), {contains: TF.number()}).'],
    validate: () => createValidateFn<NumberSomewhere>(),
    standardSchema: () => createStandardSchema<NumberSomewhere>(),
    validateReflect: () => {
      const v: NumberSomewhere = new Set(['a', 1]) as NumberSomewhere;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<NumberSomewhere>(),
    deserializeValidateReflect: () => {
      const v: NumberSomewhere = new Set(['a', 1]) as NumberSomewhere;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: NumberSomewhere = new Set(['a', 1]) as NumberSomewhere;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<NumberSomewhere>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: NumberSomewhere = new Set(['a', 1]) as NumberSomewhere;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: NumberSomewhere = new Set(['a', 1]) as NumberSomewhere;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<NumberSomewhere>>(),
    validateSchema: () => createValidateFn(RT.set(RT.unknown(), {contains: TF.number()})),
    getValidationErrors: () => createGetValidationErrorsFn<NumberSomewhere>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<NumberSomewhere>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.set(RT.unknown(), {contains: TF.number()})),
    mockType: () => createMockDataFn<NumberSomewhere>(),
    getSamples: () => ({
      valid: [new Set([1]), new Set(['a', 2])],
      invalid: [new Set(), new Set(['a']), [1]],
    }),
    expectedFormatErrors: () => [
      {name: 'contains', val: 1, formatPathTail: 'minContains'},
      {name: 'contains', val: 1, formatPathTail: 'minContains'},
      null,
    ],
  },

  map_bounds: {
    title: 'FormattedMap minItems / maxItems',
    description: 'The array count bounds on a Map (an array of pairs on the wire), read off `.size`.',
    validateNotes: ['Value-first twin: RT.map(TF.string(), TF.number(), {minItems: 1, maxItems: 2}).'],
    validate: () => createValidateFn<SmallMap>(),
    standardSchema: () => createStandardSchema<SmallMap>(),
    validateReflect: () => {
      const v: SmallMap = new Map([['a', 1]]) as SmallMap;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<SmallMap>(),
    deserializeValidateReflect: () => {
      const v: SmallMap = new Map([['a', 1]]) as SmallMap;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: SmallMap = new Map([['a', 1]]) as SmallMap;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<SmallMap>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: SmallMap = new Map([['a', 1]]) as SmallMap;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: SmallMap = new Map([['a', 1]]) as SmallMap;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<SmallMap>>(),
    validateSchema: () => createValidateFn(RT.map(TF.string(), TF.number(), {minItems: 1, maxItems: 2})),
    getValidationErrors: () => createGetValidationErrorsFn<SmallMap>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<SmallMap>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.map(TF.string(), TF.number(), {minItems: 1, maxItems: 2})),
    mockType: () => createMockDataFn<SmallMap>(),
    getSamples: () => ({
      valid: [
        new Map([['a', 1]]),
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ],
      invalid: [
        new Map(),
        new Map([
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ]),
        {a: 1},
      ],
    }),
    expectedFormatErrors: () => [
      {name: 'formattedMap', val: 1, formatPathTail: 'minItems'},
      {name: 'formattedMap', val: 2, formatPathTail: 'maxItems'},
      null,
    ],
  },

  map_unique: {
    title: 'FormattedMap uniqueItems',
    description:
      'Deep JSON equality over the `[key, value]` pairs: a Map dedupes keys by identity, so two object keys equal by content are two entries, and the keyword rejects that when their values match too.',
    validateNotes: [
      'Two content-equal keys with DIFFERENT values are two different pairs and pass.',
      'Value-first twin: RT.map(RT.object({id: TF.number()}), TF.string(), {uniqueItems: true}).',
    ],
    validate: () => createValidateFn<UniqueMap>(),
    standardSchema: () => createStandardSchema<UniqueMap>(),
    validateReflect: () => {
      const v: UniqueMap = new Map([[{id: 1}, 'a']]) as UniqueMap;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<UniqueMap>(),
    deserializeValidateReflect: () => {
      const v: UniqueMap = new Map([[{id: 1}, 'a']]) as UniqueMap;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: UniqueMap = new Map([[{id: 1}, 'a']]) as UniqueMap;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<UniqueMap>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: UniqueMap = new Map([[{id: 1}, 'a']]) as UniqueMap;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: UniqueMap = new Map([[{id: 1}, 'a']]) as UniqueMap;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<UniqueMap>>(),
    validateSchema: () => createValidateFn(RT.map(RT.object({id: TF.number()}), TF.string(), {uniqueItems: true})),
    getValidationErrors: () => createGetValidationErrorsFn<UniqueMap>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<UniqueMap>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.map(RT.object({id: TF.number()}), TF.string(), {uniqueItems: true})),
    mockType: () => createMockDataFn<UniqueMap>(),
    getSamples: () => ({
      valid: [
        new Map([
          [{id: 1}, 'a'],
          [{id: 1}, 'b'],
        ]),
        new Map([
          [{id: 1}, 'a'],
          [{id: 2}, 'a'],
        ]),
      ],
      invalid: [
        new Map([
          [{id: 1}, 'a'],
          [{id: 1}, 'a'],
        ]),
        {a: 'b'},
      ],
    }),
    expectedFormatErrors: () => [{name: 'formattedMap', val: true, formatPathTail: 'uniqueItems'}, null],
  },

  map_contains: {
    title: 'FormattedMap contains',
    description:
      "At least one entry matches the contains type. A Map's entry is its `[key, value]` pair, so the contains child is a TUPLE and `unknown` in a slot skips that half.",
    validateNotes: [
      "Value-first twin: RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]})}).",
    ],
    validate: () => createValidateFn<AdminSomewhere>(),
    standardSchema: () => createStandardSchema<AdminSomewhere>(),
    validateReflect: () => {
      const v: AdminSomewhere = new Map([['admin', 1]]) as AdminSomewhere;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<AdminSomewhere>(),
    deserializeValidateReflect: () => {
      const v: AdminSomewhere = new Map([['admin', 1]]) as AdminSomewhere;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: AdminSomewhere = new Map([['admin', 1]]) as AdminSomewhere;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<AdminSomewhere>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: AdminSomewhere = new Map([['admin', 1]]) as AdminSomewhere;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: AdminSomewhere = new Map([['admin', 1]]) as AdminSomewhere;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<AdminSomewhere>>(),
    validateSchema: () =>
      createValidateFn(RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]})})),
    getValidationErrors: () => createGetValidationErrorsFn<AdminSomewhere>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<AdminSomewhere>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]})})
      ),
    mockType: () => createMockDataFn<AdminSomewhere>(),
    getSamples: () => ({
      valid: [
        new Map([['admin', 1]]),
        new Map([
          ['user', 2],
          ['admin', 3],
        ]),
      ],
      invalid: [new Map(), new Map([['user', 1]]), {admin: 1}],
    }),
    expectedFormatErrors: () => [
      {name: 'contains', val: 1, formatPathTail: 'minContains'},
      {name: 'contains', val: 1, formatPathTail: 'minContains'},
      null,
    ],
  },

  map_contains_value: {
    title: 'FormattedMap contains with maxContains',
    description:
      'The contains tuple can pin the VALUE half instead: `[unknown, 100]` with `maxContains: 1` asks for exactly one perfect score.',
    validateNotes: [
      'Value-first twin: RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.unknown(), RT.literal(100)]}), maxContains: 1}).',
    ],
    validate: () => createValidateFn<OnePerfectScore>(),
    standardSchema: () => createStandardSchema<OnePerfectScore>(),
    validateReflect: () => {
      const v: OnePerfectScore = new Map([['ada', 100]]) as OnePerfectScore;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<OnePerfectScore>(),
    deserializeValidateReflect: () => {
      const v: OnePerfectScore = new Map([['ada', 100]]) as OnePerfectScore;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: OnePerfectScore = new Map([['ada', 100]]) as OnePerfectScore;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<OnePerfectScore>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: OnePerfectScore = new Map([['ada', 100]]) as OnePerfectScore;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: OnePerfectScore = new Map([['ada', 100]]) as OnePerfectScore;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<OnePerfectScore>>(),
    validateSchema: () =>
      createValidateFn(
        RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.unknown(), RT.literal(100)]}), maxContains: 1})
      ),
    getValidationErrors: () => createGetValidationErrorsFn<OnePerfectScore>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<OnePerfectScore>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.unknown(), RT.literal(100)]}), maxContains: 1})
      ),
    mockType: () => createMockDataFn<OnePerfectScore>(),
    getSamples: () => ({
      valid: [
        new Map([['ada', 100]]),
        new Map([
          ['ada', 100],
          ['bob', 50],
        ]),
      ],
      invalid: [
        new Map(),
        new Map([
          ['ada', 100],
          ['bob', 100],
        ]),
        [['ada', 100]],
      ],
    }),
    expectedFormatErrors: () => [
      {name: 'contains', val: 1, formatPathTail: 'minContains'},
      {name: 'contains', val: 1, formatPathTail: 'maxContains'},
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
