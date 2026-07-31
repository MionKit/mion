import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const CIRCULAR_REFS = {
  circular_types: {
    title: 'Circular object',
    description:
      'Self-referential `{name: string; child?: CircularObject}` (a node with an optional child of its own type) exercises recursive object walking and the value-first `RT.circular` builder, with samples nesting one level deep.',
    mutateEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoderFn<CircularObject>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoderFn<CircularObject>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoderFn<CircularObject>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoderFn<CircularObject>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoderFn<CircularObject>();
    },
    preserveDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoderFn<CircularObject>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoderFn<CircularObject>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createBinaryEncoderFn<CircularObject>();
    },
    binaryDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createBinaryDecoderFn<CircularObject>();
    },
    schemaEncoder: () => createJsonEncoderFn(RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}))),
    schemaDecoder: () => createJsonDecoderFn(RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.circular(RT.object({name: TF.string(), child: RT.optional(RT.self())}))),
    getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
  },
  circular_union_array: {
    title: 'Circular union array',
    description:
      'Recursive `type CuArray = (CuArray | Date | number | string)[]` is an array whose elements are itself, Date, number, or string, exercising a recursive union element with a mix of scalar and Date members nested several levels deep.',
    serializeNotes:
      'The decoder selects each element by trying the union members (Date arrives as an ISO string and is revived to a Date); the recursive `CuArray` branch lets the array contain further arrays of the same union.',
    mutateEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoderFn<CuArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoderFn<CuArray>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoderFn<CuArray>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoderFn<CuArray>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoderFn<CuArray>();
    },
    preserveDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoderFn<CuArray>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoderFn<CuArray>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createBinaryEncoderFn<CuArray>();
    },
    binaryDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createBinaryDecoderFn<CuArray>();
    },
    schemaEncoder: () => createJsonEncoderFn(RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])))),
    schemaDecoder: () => createJsonDecoderFn(RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])))),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])))),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(RT.circular(RT.array(RT.union([RT.self(), TF.date(), TF.number(), TF.string()])))),
    getTestData: () => {
      const date = new Date('2000-08-06T02:13:00.000Z');
      return {
        values: [
          [date, 123, 'hello', ['a', 'b', 'c']],
          [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]],
          [],
        ],
      };
    },
  },
  circular_tuple: {
    title: 'Circular tuple',
    description:
      'Recursive `interface CircularTuple { list: [bigint, CircularTuple?] }` is an object holding a tuple of a bigint and an optional self, exercising an object-to-tuple recursion cycle.',
    serializeNotes:
      'The leading tuple slot is a bigint, so each `list[0]` JSON-encodes to a decimal string and rebuilds with `BigInt(...)`; the optional trailing slot recurses into the same shape.',
    mutateEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoderFn<CircularTuple>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoderFn<CircularTuple>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoderFn<CircularTuple>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoderFn<CircularTuple>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoderFn<CircularTuple>();
    },
    preserveDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoderFn<CircularTuple>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoderFn<CircularTuple>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createBinaryEncoderFn<CircularTuple>();
    },
    binaryDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createBinaryDecoderFn<CircularTuple>();
    },
    schemaEncoder: () => createJsonEncoderFn(RT.circular(RT.object({list: RT.tuple([TF.bigInt()], [RT.self()])}))),
    schemaDecoder: () => createJsonDecoderFn(RT.circular(RT.object({list: RT.tuple([TF.bigInt()], [RT.self()])}))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.circular(RT.object({list: RT.tuple([TF.bigInt()], [RT.self()])}))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.circular(RT.object({list: RT.tuple([TF.bigInt()], [RT.self()])}))),
    getTestData: () => ({
      values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
    }),
  },
  circular_index: {
    title: 'Circular index',
    description:
      'Recursive `interface CircularIndex { index: {[key: string]: CircularIndex} }` is a node whose `index` is a record of further nodes, exercising an object-to-record recursion cycle, with samples nesting several levels and bottoming out in an empty record.',
    mutateEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoderFn<CircularIndex>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoderFn<CircularIndex>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoderFn<CircularIndex>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoderFn<CircularIndex>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoderFn<CircularIndex>();
    },
    preserveDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoderFn<CircularIndex>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoderFn<CircularIndex>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createBinaryEncoderFn<CircularIndex>();
    },
    binaryDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createBinaryDecoderFn<CircularIndex>();
    },
    schemaEncoder: () => createJsonEncoderFn(RT.circular(RT.object({index: RT.record(RT.self())}))),
    schemaDecoder: () => createJsonDecoderFn(RT.circular(RT.object({index: RT.record(RT.self())}))),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.circular(RT.object({index: RT.record(RT.self())}))),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.circular(RT.object({index: RT.record(RT.self())}))),
    getTestData: () => ({
      values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
    }),
  },
  circular_deep: {
    title: 'Circular deep',
    description:
      'Recursive `interface CircularDeep { deep1: {deep2: {deep3: {deep4?: CircularDeep}}} }` places the self-reference four plain-object levels down behind an optional `deep4`, exercising a recursion cycle that only re-enters after deep nesting.',
    mutateEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoderFn<CircularDeep>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoderFn<CircularDeep>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoderFn<CircularDeep>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoderFn<CircularDeep>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoderFn<CircularDeep>();
    },
    preserveDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoderFn<CircularDeep>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoderFn<CircularDeep>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createBinaryEncoderFn<CircularDeep>();
    },
    binaryDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createBinaryDecoderFn<CircularDeep>();
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.circular(RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})})})}))
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.circular(RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})})})}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.circular(RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})})})}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.circular(RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(RT.self())})})})}))
      ),
    getTestData: () => ({
      values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
    }),
  },
  circular_tuple_complex: {
    title: 'Root circular tuple',
    description:
      'ROOT-level recursive tuple `type CircularTupleComplex = [bigint, CircularTupleComplex?]` is a tuple of a bigint and an optional self where each bigint slot JSON-encodes to a decimal string and the optional tail recurses, with samples nesting several levels deep.',
    serializeNotes:
      'A root recursive tuple cannot be authored value-first (`circular` over a tuple hits TS2589), so the schema thunks opt out; the object→tuple cycle is covered value-first by `circular_tuple`.',
    mutateEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoderFn<CircularTupleComplex>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoderFn<CircularTupleComplex>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoderFn<CircularTupleComplex>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoderFn<CircularTupleComplex>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoderFn<CircularTupleComplex>();
    },
    preserveDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoderFn<CircularTupleComplex>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoderFn<CircularTupleComplex>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createBinaryEncoderFn<CircularTupleComplex>();
    },
    binaryDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createBinaryDecoderFn<CircularTupleComplex>();
    },
    // A ROOT-level recursive tuple can't be authored value-first — `circular(self =>
    // tuple([bigint()], [self]))` hits TS2589 (TS can't build a recursive tuple type
    // via the mapping). Covered type-first here; the object→tuple cycle is covered
    // value-first by circular_tuple. Mirrors validation TUPLE.tuple_circular.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
  },
  object_with_circular_array: {
    title: 'Object with circular array',
    description:
      'Recursive `{a: string; deep?: {b: string; c: number}; d?: ObjCircularArr[]}` is an object with a scalar, an optional plain nested object, and an optional array of itself, exercising an object-to-array-of-self recursion cycle alongside non-recursive sibling props.',
    mutateEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoderFn<ObjCircularArr>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoderFn<ObjCircularArr>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoderFn<ObjCircularArr>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoderFn<ObjCircularArr>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoderFn<ObjCircularArr>();
    },
    preserveDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoderFn<ObjCircularArr>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoderFn<ObjCircularArr>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createBinaryEncoderFn<ObjCircularArr>();
    },
    binaryDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createBinaryDecoderFn<ObjCircularArr>();
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.circular(
          RT.object({
            a: TF.string(),
            deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
            d: RT.optional(RT.array(RT.self())),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.circular(
          RT.object({
            a: TF.string(),
            deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
            d: RT.optional(RT.array(RT.self())),
          })
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.circular(
          RT.object({
            a: TF.string(),
            deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
            d: RT.optional(RT.array(RT.self())),
          })
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.circular(
          RT.object({
            a: TF.string(),
            deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
            d: RT.optional(RT.array(RT.self())),
          })
        )
      ),
    getTestData: () => ({
      values: [
        // Base case: leaf with neither the optional `deep` nor the recursive `d`.
        {a: 'leaf'},
        {
          a: 'hello',
          deep: {b: 'world', c: 123},
          d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
        },
        // Two levels of array-of-self recursion, with a leaf at the bottom.
        {
          a: 'top',
          d: [
            {a: 'mid', d: [{a: 'bottom'}]},
            {a: 'sibling', deep: {b: 'sd', c: 9}},
          ],
        },
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
