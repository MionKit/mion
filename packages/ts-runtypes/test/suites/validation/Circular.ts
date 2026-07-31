import * as TF from '@ts-runtypes/core/formats';
import type {ValidationCase} from './types.ts';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const CIRCULAR = {
  object_full_mion_shape: {
    title: 'Self-referential object',
    description:
      "Full fixture (number + string + optional self-ref + Date) exercising the same self-recursive dependency call as OBJECT.circular_interface but pinning the exact 'Circular object' shape.",
    validateNotes:
      'Self-referential shapes are validated recursively. Atomic rules apply at every level (NaN at `n`, Invalid Date at `d`, etc.).',
    validate: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createValidateFn<Circular>();
    },
    standardSchema: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createStandardSchema<Circular>();
    },
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected string', path: ['c', 's'], expected: 'string'}],
      [{message: 'Expected string', path: ['c', 's'], expected: 'string'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected objectLiteral', path: [], expected: 'objectLiteral'}],
      [{message: 'Expected number', path: ['n'], expected: 'number'}],
      [{message: 'Expected date', path: ['d'], expected: 'date'}],
      [{message: 'Expected date', path: ['d'], expected: 'date'}],
      [
        {message: 'Expected number', path: ['n'], expected: 'number'},
        {message: 'Expected string', path: ['s'], expected: 'string'},
      ],
    ],
    validateDataOnly: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createValidateFn<DataOnly<Circular>>();
    },
    validateSchema: () => {
      const cir = RT.circular(
        RT.object({
          n: TF.number(),
          s: TF.string(),
          c: RT.optional(RT.self()),
          d: RT.optional(TF.date()),
        })
      );
      return createValidateFn(cir);
    },
    deserializeValidate: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return deserializeValidate<Circular>();
    },
    validateReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createGetValidationErrorsFn<Circular>();
    },
    getValidationErrorsDataOnly: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createGetValidationErrorsFn<DataOnly<Circular>>();
    },
    getValidationErrorsSchema: () => {
      const cir = RT.circular(
        RT.object({
          n: TF.number(),
          s: TF.string(),
          c: RT.optional(RT.self()),
          d: RT.optional(TF.date()),
        })
      );
      return createGetValidationErrorsFn(cir);
    },
    deserializeGetValidationErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return deserializeGetValidationErrors<Circular>();
    },
    getValidationErrorsReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createMockDataFn<Circular>();
    },
    mockTypeReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {n: 1, s: 'hello', c: {n: 2, s: 'world'}},
        {n: 2, s: 'world'},
        {n: 3, s: 'foo', c: {n: 3, s: 'foo'}},
      ],
      invalid: [
        {n: 1, s: 'hello', c: {n: 2, s: 123}}, // c.s wrong type
        {n: 1, s: 'hello', c: {n: 2}}, // c.s missing
        null,
        undefined,
        {n: NaN, s: 'x'}, // NaN at n
        {n: 1, s: 'x', d: new Date('invalid')}, // Invalid Date in optional d
        {n: 1, s: 'x', d: 'not date'},
        {}, // missing required n and s
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['c', 's'], expected: 'string'}],
      [{path: ['c', 's'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['n'], expected: 'number'}],
      [{path: ['d'], expected: 'date'}],
      [{path: ['d'], expected: 'date'}],
      [
        {path: ['n'], expected: 'number'},
        {path: ['s'], expected: 'string'},
      ],
    ],
  },

  array_of_union_with_self_ref: {
    title: 'Self-referential array union',
    description:
      "Self-recursive array whose union element type includes the array itself, closing the cycle via Array to Union to Array ('Circular array + union').",
    validateNotes:
      'The union check is a boolean delegation that does NOT recurse into per-arm error paths: when a nested-array element fails, getValidationErrors reports a single `expected: "union"` at the outer index, not the deep path of the inner failure.',
    validateSchema: () => {
      const cu = RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])));
      return createValidateFn(cu);
    },
    validate: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createValidateFn<CuArray>();
    },
    standardSchema: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createStandardSchema<CuArray>();
    },
    validateDataOnly: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createValidateFn<DataOnly<CuArray>>();
    },
    deserializeValidate: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return deserializeValidate<CuArray>();
    },
    validateReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createGetValidationErrorsFn<CuArray>();
    },
    getValidationErrorsDataOnly: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createGetValidationErrorsFn<DataOnly<CuArray>>();
    },
    getValidationErrorsSchema: () => {
      const cu = RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])));
      return createGetValidationErrorsFn(cu);
    },
    deserializeGetValidationErrors: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return deserializeGetValidationErrors<CuArray>();
    },
    getValidationErrorsReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createMockDataFn<CuArray>();
    },
    mockTypeReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return createMockDataFn(v);
    },
    getSamples: () => {
      const date = new Date();
      const cu1: any = [date, 123, 'hello', ['a', 'b', 'c']];
      const cu2: any = [date, 123, 'hello', ['a', 2, 'c'], cu1];
      const cu3: any = [];
      return {
        valid: [cu1, cu2, cu3],
        invalid: [
          [date, 123, 'hello', ['a', 2, 'c'], {a: 1, b: 2}], // {} not in union
          ['hello', 123, [{a: 1, b: 2}]],
          {},
          null,
          undefined,
          [true], // boolean not in union
          [new Date('invalid')], // Invalid Date inside
          [NaN], // NaN as number
        ],
      };
    },
    getExpectedErrors: () => [
      // index 4 is {a:1, b:2} which isn't in the union.
      [{path: [4], expected: 'union'}],
      // index 2 is [{a,b}] — the inner array fails the union check
      // (its element doesn't match any arm), so the OUTER union
      // reports one error at index 2 (union emit doesn't recurse —
      // it's a boolean delegation to validate per the reference semantics).
      [{path: [2], expected: 'union'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
    ],
  },

  object_with_tuple_prop: {
    title: 'Circular tuple property',
    description:
      "Self-referential object whose cycle closes via a tuple-typed property, sending the recursion through an object to tuple boundary like TUPLE.tuple_circular ('Circular object with tuple').",
    validate: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createValidateFn<CircularTuple>();
    },
    standardSchema: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createStandardSchema<CircularTuple>();
    },
    validateDataOnly: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createValidateFn<DataOnly<CircularTuple>>();
    },
    validateSchema: () => {
      const ct = RT.circular(RT.object({tuple: RT.tuple([TF.bigInt()], [RT.self()])}));
      return createValidateFn(ct);
    },
    deserializeValidate: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return deserializeValidate<CircularTuple>();
    },
    validateReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createGetValidationErrorsFn<CircularTuple>();
    },
    getValidationErrorsDataOnly: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createGetValidationErrorsFn<DataOnly<CircularTuple>>();
    },
    getValidationErrorsSchema: () => {
      const ct = RT.circular(RT.object({tuple: RT.tuple([TF.bigInt()], [RT.self()])}));
      return createGetValidationErrorsFn(ct);
    },
    deserializeGetValidationErrors: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return deserializeGetValidationErrors<CircularTuple>();
    },
    getValidationErrorsReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createMockDataFn<CircularTuple>();
    },
    mockTypeReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]}, {tuple: [1n, {tuple: [2n]}]}, {tuple: [1n]}],
      invalid: [
        {tuple: [1n, {tuple: 'hello'}]}, // inner `tuple` not an array
        {tuple: [1n, {tuple: []}]}, // empty inner tuple — missing required bigint
        [],
        null,
        undefined,
        {tuple: ['not bigint']},
        {tuple: [1n, 'not object']}, // second slot wrong type
        {}, // missing required tuple prop
      ],
    }),
    getExpectedErrors: () => [
      // {tuple: [1n, {tuple: 'hello'}]} — inner.tuple is not an array.
      [{path: ['tuple', 1, 'tuple'], expected: 'tuple'}],
      // {tuple: [1n, {tuple: []}]} — inner tuple [] has slot 0 missing.
      [{path: ['tuple', 1, 'tuple', 0], expected: 'bigint'}],
      // [] — typeof === 'object' && !== null passes (arrays are objects);
      // descends to check `tuple` prop. v.tuple is undefined → tuple
      // check fails at ['tuple'].
      [{path: ['tuple'], expected: 'tuple'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {tuple: ['not bigint']} — slot 0 wrong type.
      [{path: ['tuple', 0], expected: 'bigint'}],
      // {tuple: [1n, 'not object']} — slot 1 is non-undefined but not an object.
      [{path: ['tuple', 1], expected: 'objectLiteral'}],
      // {} — missing required tuple prop → tuple defaults to undefined.
      [{path: ['tuple'], expected: 'tuple'}],
    ],
  },

  object_with_index_prop: {
    title: 'Circular index signature',
    description:
      "Self-referential object whose cycle closes via an index-signature value type, exercising the index-signature for-in loop calling back into the same validator ('Circular Object with index property').",
    validateNotes:
      'A `Date` (or any non-null object) passes the `typeof === "object"` guard, then fails because it lacks the required `index` property (`expected: "objectLiteral"` at `["index"]`).',
    validate: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createValidateFn<CircularIndex>();
    },
    standardSchema: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createStandardSchema<CircularIndex>();
    },
    validateDataOnly: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createValidateFn<DataOnly<CircularIndex>>();
    },
    validateSchema: () => {
      const ci = RT.circular(RT.object({index: RT.record(RT.self())}));
      return createValidateFn(ci);
    },
    deserializeValidate: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return deserializeValidate<CircularIndex>();
    },
    validateReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createGetValidationErrorsFn<CircularIndex>();
    },
    getValidationErrorsDataOnly: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createGetValidationErrorsFn<DataOnly<CircularIndex>>();
    },
    getValidationErrorsSchema: () => {
      const ci = RT.circular(RT.object({index: RT.record(RT.self())}));
      return createGetValidationErrorsFn(ci);
    },
    deserializeGetValidationErrors: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return deserializeGetValidationErrors<CircularIndex>();
    },
    getValidationErrorsReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createMockDataFn<CircularIndex>();
    },
    mockTypeReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
      invalid: [
        {index: {a: 1234}}, // value not an object
        {index: {a: {index: 'hello'}}}, // nested `index` wrong type
        new Date(), // missing `index` property
        null,
        undefined,
        {}, // missing required index prop
        {index: 'not object'},
        {index: {a: null}},
      ],
    }),
    getExpectedErrors: () => [
      // {index: {a: 1234}} — index['a'] is not a CircularIndex object.
      [{path: ['index', 'a'], expected: 'objectLiteral'}],
      // {index: {a: {index: 'hello'}}} — nested .index is not an object.
      [{path: ['index', 'a', 'index'], expected: 'objectLiteral'}],
      // new Date() — Date doesn't have an `index` prop matching the shape.
      // It IS a plain `typeof === 'object' && !== null` — but
      // missing `index` prop → validationErrors at ['index'].
      [{path: ['index'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['index'], expected: 'objectLiteral'}],
      [{path: ['index'], expected: 'objectLiteral'}],
      [{path: ['index', 'a'], expected: 'objectLiteral'}],
    ],
  },

  object_deeply_nested: {
    title: 'Deeply nested cycle',
    description:
      "Self-referential object with the cycle buried four levels deep in an anonymous-shape chain, stressing the dependency-call layer when the self-ref is deeply nested ('Circular Object with deep nested properties').",
    validate: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createValidateFn<CircularDeep>();
    },
    standardSchema: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createStandardSchema<CircularDeep>();
    },
    validateDataOnly: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createValidateFn<DataOnly<CircularDeep>>();
    },
    validateSchema: () => {
      const cd = RT.circular(
        RT.object({
          deep1: RT.object({
            deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})}),
          }),
        })
      );
      return createValidateFn(cd);
    },
    deserializeValidate: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return deserializeValidate<CircularDeep>();
    },
    validateReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createGetValidationErrorsFn<CircularDeep>();
    },
    getValidationErrorsDataOnly: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createGetValidationErrorsFn<DataOnly<CircularDeep>>();
    },
    getValidationErrorsSchema: () => {
      const cd = RT.circular(
        RT.object({
          deep1: RT.object({
            deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})}),
          }),
        })
      );
      return createGetValidationErrorsFn(cd);
    },
    deserializeGetValidationErrors: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return deserializeGetValidationErrors<CircularDeep>();
    },
    getValidationErrorsReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createMockDataFn<CircularDeep>();
    },
    mockTypeReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      invalid: [
        {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: 1234}}}}}}},
        {deep1: {}},
        {deep1: {deep2: {deep3: 12435}}},
        {deep1: {deep2: {deep3: {deep4: 'hello'}}}},
        'hello',
        null,
        undefined,
        {}, // missing deep1
        {deep1: null},
        {deep1: {deep2: null}},
      ],
    }),
    getExpectedErrors: () => [
      // deep4.deep1.deep2.deep3 = 1234 → not an object.
      [{path: ['deep1', 'deep2', 'deep3', 'deep4', 'deep1', 'deep2', 'deep3'], expected: 'objectLiteral'}],
      // {deep1: {}} — deep1 missing deep2.
      [{path: ['deep1', 'deep2'], expected: 'objectLiteral'}],
      // deep1.deep2.deep3 = 12435.
      [{path: ['deep1', 'deep2', 'deep3'], expected: 'objectLiteral'}],
      // deep1.deep2.deep3.deep4 = 'hello' — optional but non-undefined → recurse → not object.
      [{path: ['deep1', 'deep2', 'deep3', 'deep4'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — missing deep1.
      [{path: ['deep1'], expected: 'objectLiteral'}],
      // {deep1: null} — deep1 is null, fails object check.
      [{path: ['deep1'], expected: 'objectLiteral'}],
      // {deep1: {deep2: null}} — deep2 is null.
      [{path: ['deep1', 'deep2'], expected: 'objectLiteral'}],
    ],
  },

  circular_child_under_literal_root: {
    title: 'Circular child under flat root',
    description:
      "RootNotCircular is a flat shape (literal discriminator + one prop) whose ciChild property is a self-referential ICircularDeep, pinning the case where the dependency-call layer kicks in below the root rather than at it ('Interface with nested circular type where root is not the circular ref').",
    validateNotes:
      'The root is a flat (non-recursive) shape; recursion lives only in the `ciChild` subtree, so the dependency-call layer is exercised below the root rather than at it.',
    validate: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createValidateFn<RootNotCircular>();
    },
    standardSchema: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createStandardSchema<RootNotCircular>();
    },
    validateDataOnly: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createValidateFn<DataOnly<RootNotCircular>>();
    },
    validateSchema: () => {
      // The recursive child is a `circular(...)`; the non-circular root is a plain
      // schema referencing it — no hand-written types at all.
      const icd = RT.circular(
        RT.object({
          name: TF.string(),
          big: TF.bigInt(),
          embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
        })
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createValidateFn(root);
    },
    deserializeValidate: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return deserializeValidate<RootNotCircular>();
    },
    validateReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createGetValidationErrorsFn<RootNotCircular>();
    },
    getValidationErrorsDataOnly: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createGetValidationErrorsFn<DataOnly<RootNotCircular>>();
    },
    getValidationErrorsSchema: () => {
      const icd = RT.circular(
        RT.object({
          name: TF.string(),
          big: TF.bigInt(),
          embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
        })
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createGetValidationErrorsFn(root);
    },
    deserializeGetValidationErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return deserializeGetValidationErrors<RootNotCircular>();
    },
    getValidationErrorsReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createMockDataFn<RootNotCircular>();
    },
    mockTypeReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
          },
        },
      ],
      invalid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // embedded.hello wrong type
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
          },
        }, // deep embedded.hello wrong type
        {
          isRoot: false, // not the literal true
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}},
        },
        {isRoot: true, ciChild: {name: 'hello', big: 1n}}, // missing embedded
        {isRoot: true}, // missing ciChild
        null,
        undefined,
        {},
      ],
    }),
    getExpectedErrors: () => [
      // ciChild.embedded.hello wrong type (123 not string).
      [{path: ['ciChild', 'embedded', 'hello'], expected: 'string'}],
      // ciChild.embedded.child.embedded.hello wrong type.
      [{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}],
      // isRoot=false fails literal; child=123 is not an object (recurses
      // through optional, fails object check at the next ICircularDeep).
      [
        {path: ['isRoot'], expected: 'literal'},
        {path: ['ciChild', 'embedded', 'child'], expected: 'objectLiteral'},
      ],
      // ciChild missing `embedded` → fails object check at ['ciChild', 'embedded'].
      [{path: ['ciChild', 'embedded'], expected: 'objectLiteral'}],
      // {isRoot: true} — missing ciChild.
      [{path: ['ciChild'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — both required props missing.
      [
        {path: ['isRoot'], expected: 'literal'},
        {path: ['ciChild'], expected: 'objectLiteral'},
      ],
    ],
  },

  multiple_circular_types_cross_referenced: {
    title: 'Cross-referenced circular types',
    description:
      "RootCircular carries an optional self-ref plus two distinct circular siblings (ICircularDeep, ICircularDate) where ICircularDate also references ICircularDeep, stressing the resolver when several crossing recursive types are in flight at once ('Interface with nested circular + multiple circular').",
    validate: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createValidateFn<RootCircular>();
    },
    standardSchema: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createStandardSchema<RootCircular>();
    },
    validateDataOnly: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createValidateFn<DataOnly<RootCircular>>();
    },
    validateSchema: () => {
      // Mutual recursion, no types: each type's OWN back-edge uses `self`;
      // cross-references to an already-declared run-type are plain const refs.
      const icd = RT.circular(
        RT.object({
          name: TF.string(),
          big: TF.bigInt(),
          embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
        })
      );
      const icDate = RT.circular(
        RT.object({
          date: TF.date(),
          month: TF.number(),
          year: TF.number(),
          embedded: RT.optional(RT.self()),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular(
        RT.object({
          isRoot: RT.literal(true),
          ciChild: icd,
          ciRoort: RT.optional(RT.self()),
          ciDate: icDate,
        })
      );
      return createValidateFn(root);
    },
    deserializeValidate: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return deserializeValidate<RootCircular>();
    },
    validateReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createGetValidationErrorsFn<RootCircular>();
    },
    getValidationErrorsDataOnly: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createGetValidationErrorsFn<DataOnly<RootCircular>>();
    },
    getValidationErrorsSchema: () => {
      const icd = RT.circular(
        RT.object({
          name: TF.string(),
          big: TF.bigInt(),
          embedded: RT.object({hello: TF.string(), child: RT.optional(RT.self())}),
        })
      );
      const icDate = RT.circular(
        RT.object({
          date: TF.date(),
          month: TF.number(),
          year: TF.number(),
          embedded: RT.optional(RT.self()),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular(
        RT.object({
          isRoot: RT.literal(true),
          ciChild: icd,
          ciRoort: RT.optional(RT.self()),
          ciDate: icDate,
        })
      );
      return createGetValidationErrorsFn(root);
    },
    deserializeGetValidationErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return deserializeGetValidationErrors<RootCircular>();
    },
    getValidationErrorsReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createMockDataFn<RootCircular>();
    },
    mockTypeReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {
            date: new Date(),
            month: 1,
            year: 2021,
            embedded: {date: new Date(), month: 1, year: 2021},
          },
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciRoort: {
            isRoot: true,
            ciChild: {name: 'inner', big: 2n, embedded: {hello: 'world'}},
            ciDate: {date: new Date(), month: 6, year: 2022},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
      ],
      invalid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // missing ciDate, embedded.hello wrong type
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        }, // deep embedded.hello wrong type
        {
          isRoot: false, // not the literal true
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: 'not date', month: 1, year: 2021}, // ciDate.date wrong type
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021, embedded: true}, // ciDate.embedded wrong type
        },
        null,
        undefined,
        {},
      ],
    }),
    getExpectedErrors: () => [
      // missing ciDate + ciChild.embedded.hello wrong type → 2 errors.
      [
        {path: ['ciChild', 'embedded', 'hello'], expected: 'string'},
        {path: ['ciDate'], expected: 'objectLiteral'},
      ],
      // deep embedded.hello wrong type.
      [{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}],
      // isRoot=false fails literal.
      [{path: ['isRoot'], expected: 'literal'}],
      // ciDate.date wrong type.
      [{path: ['ciDate', 'date'], expected: 'date'}],
      // ciDate.embedded is true (boolean), optional but non-undefined →
      // recurses into ICircularDate check, which fails the object guard.
      [{path: ['ciDate', 'embedded'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — all 3 required props missing.
      [
        {path: ['isRoot'], expected: 'literal'},
        {path: ['ciChild'], expected: 'objectLiteral'},
        {path: ['ciDate'], expected: 'objectLiteral'},
      ],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
