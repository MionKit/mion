import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoderFn, createBinaryEncoderFn, createJsonDecoderFn, createJsonEncoderFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const TUPLES = {
  tuple: {
    title: 'tuple',
    description:
      'Fixed-length mixed tuple [Date, number, string, null, string[], bigint] where the Date slot encodes to an ISO string and the bigint slot to a decimal string, while number, string, null and the string[] slot pass through unchanged.',
    serializeNotes:
      'Per-slot wire transforms: Date↔ISO string and bigint↔decimal string; the decoder restores each slot from its scalar form.',
    mutateEncoder: () => createJsonEncoderFn<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<[Date, number, string, null, string[], bigint]>(),
    preserveDecoder: () => createJsonDecoderFn<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<[Date, number, string, null, string[], bigint]>(),
    binaryDecoder: () => createBinaryDecoderFn<[Date, number, string, null, string[], bigint]>(),
    schemaEncoder: () =>
      createJsonEncoderFn(RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])),
    schemaDecoder: () =>
      createJsonDecoderFn(RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(
        RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(
        RT.tuple([TF.date(), TF.number(), TF.string(), RT.literal(null), RT.array(TF.string()), TF.bigInt()])
      ),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
    }),
  },
  tuple_with_optional: {
    title: 'tuple with optionals',
    description:
      'Tuple [number, bigint?, boolean?, number?] with one required leading slot and three trailing optional slots that may be absent and round-trip symmetrically across JSON and binary.',
    serializeNotes:
      'Samples cover the optional bigint slot both present (exercising the bigint-to-decimal-string transform in a tuple slot) and absent; all round-trip with no shape asymmetry.',
    mutateEncoder: () => createJsonEncoderFn<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<[number, bigint?, boolean?, number?]>(),
    preserveDecoder: () => createJsonDecoderFn<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<[number, bigint?, boolean?, number?]>(),
    binaryDecoder: () => createBinaryDecoderFn<[number, bigint?, boolean?, number?]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.number()], [TF.bigInt(), RT.boolean(), TF.number()])),
    getTestData: () => ({
      values: [
        [3, undefined, true, 4],
        [446, undefined, undefined, undefined],
        [7, 9007199254740993n, false, 2],
      ],
    }),
  },
  tuple_rest_parameter: {
    title: 'tuple rest',
    description:
      'Tuple [number, ...bigint[]] with one fixed number slot and a possibly-empty trailing bigint rest segment, where each rest bigint encodes to a decimal string and rebuilds with BigInt(...) on decode.',
    serializeNotes:
      'Rest bigint elements serialize to decimal strings on the JSON wire and rebuild to bigints on decode; samples cover the rest segment populated and empty.',
    mutateEncoder: () => createJsonEncoderFn<[number, ...bigint[]]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<[number, ...bigint[]]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<[number, ...bigint[]]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<[number, ...bigint[]]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<[number, ...bigint[]]>(),
    preserveDecoder: () => createJsonDecoderFn<[number, ...bigint[]]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<[number, ...bigint[]]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<[number, ...bigint[]]>(),
    binaryDecoder: () => createBinaryDecoderFn<[number, ...bigint[]]>(),
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.number()], TF.bigInt())),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.number()], TF.bigInt())),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.number()], TF.bigInt())),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.number()], TF.bigInt())),
    getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
  },
  tuple_with_non_serializable: {
    title: 'tuple non-serializable slot',
    description:
      'Function-typed tuple slots are unsupported at every serialization family because tuple positions are structural, so rather than silently dropping to lossy null/undefined output the factory is rendered as alwaysThrow.',
    mutateEncoder: () => createJsonEncoderFn<[number, () => any]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<[number, () => any]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoderFn<[number, () => any]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoderFn<[number, () => any]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoderFn<[number, () => any]>(),
    preserveDecoder: () => createJsonDecoderFn<[number, () => any]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoderFn<[number, () => any]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoderFn<[number, () => any]>(),
    binaryDecoder: () => createBinaryDecoderFn<[number, () => any]>(),
    // Expressible value-first (mirrors validation TUPLE.tuple_with_non_serializable),
    // but a function-typed tuple slot resolves the same alwaysThrow factory — each
    // thunk throws like the type-first form (factoryThrows below); adapter asserts it.
    schemaEncoder: () => createJsonEncoderFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
    schemaDecoder: () => createJsonDecoderFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
    schemaBinaryEncoder: () => createBinaryEncoderFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
    schemaBinaryDecoder: () => createBinaryDecoderFn(RT.tuple([TF.number(), RT.func([], RT.any())])),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  tuple_circular: {
    title: 'tuple circular',
    description:
      'Self-referential root tuple [Date, number, string, null, string[], bigint, TupleCircular?] whose last optional slot recurses into the same tuple, with the Date slot encoding to an ISO string, the bigint slot to a decimal string, and the nested tuple round-tripping recursively across JSON and binary.',
    serializeNotes:
      'A root-level recursive tuple cannot be authored value-first, so all four schema variants are marked not-supported (the object-to-tuple cycle is covered value-first by interface_circular_tuple); the type-first path round-trips with Date-to-ISO-string and bigint-to-decimal-string per-slot transforms.',
    mutateEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoderFn<TupleCircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoderFn<TupleCircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoderFn<TupleCircular>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoderFn<TupleCircular>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonDecoderFn<TupleCircular>();
    },
    preserveDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonDecoderFn<TupleCircular>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonDecoderFn<TupleCircular>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createBinaryEncoderFn<TupleCircular>();
    },
    binaryDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createBinaryDecoderFn<TupleCircular>();
    },
    // A ROOT-level recursive tuple can't be authored value-first — `circular(self =>
    // tuple([...], [self]))` hits TS2589 (TS can't build a recursive tuple type via
    // the mapping). Covered type-first here; the object→tuple cycle is covered
    // value-first by interface_circular_tuple. Mirrors validation TUPLE.tuple_circular.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const tDeep: TupleCircular = [
        new Date('2000-08-06T02:13:00.000Z'),
        456,
        'world',
        null,
        ['x', 'y', 'z'],
        BigInt(456),
        undefined,
      ];
      const typeValue: TupleCircular = [
        new Date('2000-08-06T02:13:00.000Z'),
        123,
        'hello',
        null,
        ['a', 'b', 'c'],
        BigInt(123),
        tDeep,
      ];
      return {values: [typeValue]};
    },
  },
  interface_circular_tuple: {
    title: 'interface circular tuple',
    description:
      'Recursive interface whose optional `parent` is a [string, ICircularTuple] tuple forming an object-to-tuple cycle where every slot is serializable, so the whole graph round-trips symmetrically across JSON and binary with the value-first schema mirroring the type via RT.circular.',
    mutateEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoderFn<ICircularTuple>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoderFn<ICircularTuple>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoderFn<ICircularTuple>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoderFn<ICircularTuple>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonDecoderFn<ICircularTuple>();
    },
    preserveDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonDecoderFn<ICircularTuple>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonDecoderFn<ICircularTuple>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createBinaryEncoderFn<ICircularTuple>();
    },
    binaryDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createBinaryDecoderFn<ICircularTuple>();
    },
    schemaEncoder: () =>
      createJsonEncoderFn(RT.circular(RT.object({name: TF.string(), parent: RT.optional(RT.tuple([TF.string(), RT.self()]))}))),
    schemaDecoder: () =>
      createJsonDecoderFn(RT.circular(RT.object({name: TF.string(), parent: RT.optional(RT.tuple([TF.string(), RT.self()]))}))),
    schemaBinaryEncoder: () =>
      createBinaryEncoderFn(RT.circular(RT.object({name: TF.string(), parent: RT.optional(RT.tuple([TF.string(), RT.self()]))}))),
    schemaBinaryDecoder: () =>
      createBinaryDecoderFn(RT.circular(RT.object({name: TF.string(), parent: RT.optional(RT.tuple([TF.string(), RT.self()]))}))),
    getTestData: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
      const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
      return {values: [obj1, obj2]};
    },
  },
} as const satisfies Record<string, SerializationCase>;
