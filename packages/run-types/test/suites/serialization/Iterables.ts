import * as TF from '@mionjs/run-types/formats';
import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import type {SerializationCase} from './types.ts';

export const ITERABLES = {
  set_string: {
    title: 'Set<string>',
    description:
      'Root `Set<string>` serializes to a JSON array via `Array.from(v)` and restores with `new Set(v)` (atomic string elements need no per-element transform).',
    serializeNotes: 'Set round-trips as a JSON array (insertion order preserved), rehydrated to a Set on decode.',
    mutateEncoder: () => createJsonEncoderFn<Set<string>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Set<string>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Set<string>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Set<string>>(),
    mutateDecoder: () => createJsonDecoderFn<Set<string>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Set<string>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.set(TF.string())),
    schemaDecoder: () => createJsonDecoderFn(RT.set(TF.string())),
    getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
  },
  set_nullable: {
    title: 'Set<number | null>',
    description: 'Root `Set<number | null>` keeps a `null` element across every strategy (serialized as the JSON null literal).',
    serializeNotes:
      'A Set builds its JSON array via `[...].join(",")` like a plain array, so a null / undefined element must emit the constant `"null"` rather than a bare value (which join would drop, shrinking the Set).',
    mutateEncoder: () => createJsonEncoderFn<Set<number | null>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Set<number | null>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Set<number | null>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Set<number | null>>(),
    mutateDecoder: () => createJsonDecoderFn<Set<number | null>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Set<number | null>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.set(RT.union([TF.number(), RT.literal(null)]))),
    schemaDecoder: () => createJsonDecoderFn(RT.set(RT.union([TF.number(), RT.literal(null)]))),
    getTestData: () => ({values: [new Set<number | null>([1, null, 2])]}),
  },
  set_void: {
    title: 'Set<void>',
    description: 'Root `Set<void>` keeps its element across every strategy (serialized as the JSON null literal).',
    serializeNotes:
      'A Set builds its JSON array via `[...].join(",")`, so a void / undefined element must emit the constant "null" rather than a bare value that join would coerce to empty and drop.',
    mutateEncoder: () => createJsonEncoderFn<Set<void>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Set<void>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Set<void>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Set<void>>(),
    mutateDecoder: () => createJsonDecoderFn<Set<void>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Set<void>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.set(RT.void())),
    schemaDecoder: () => createJsonDecoderFn(RT.set(RT.void())),
    getTestData: () => ({values: [new Set<void>([undefined])]}),
  },
  set_small_object: {
    title: 'Set<SmallObject>',
    description:
      'Root `Set<SmallObject>` whose elements carry string/number/boolean fields plus optional `Date` and `bigint` serializes to a JSON array of objects restored via `new Set(v)`, with each `Date` becoming an ISO string (restored with `new Date`) and each `bigint` a decimal string (restored with `BigInt(...)`).',
    serializeNotes: [
      'Set materialises to a JSON array of element objects, rehydrated to a Set on decode.',
      'Optional `prop4: Date` round-trips via its ISO string; optional `prop5: bigint` via a decimal string (not natively JSON-encodable).',
    ],
    mutateEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Set<SmallObject>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Set<SmallObject>>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Set<SmallObject>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Set<SmallObject>>();
    },
    mutateDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Set<SmallObject>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Set<SmallObject>>(undefined, {strategy: 'compact'});
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.set(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.set(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    getTestData: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return {
        values: [
          new Set<SmallObject>([
            {prop1: 'value1', prop2: 1, prop3: true},
            {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')},
            {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
          ]),
        ],
      };
    },
  },
  objects_with_nested_sets: {
    title: 'Nested sets',
    description:
      'Object with two `Set<{s: string; arr: number[]}>` properties where each nested set serializes to a JSON array of objects restored via `new Set(v)` (atomic-shaped elements need no value transform).',
    serializeNotes: 'Each nested Set round-trips as a JSON array, rehydrated to a Set on decode.',
    mutateEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoderFn<DeepWithSet>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoderFn<DeepWithSet>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoderFn<DeepWithSet>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoderFn<DeepWithSet>();
    },
    mutateDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoderFn<DeepWithSet>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoderFn<DeepWithSet>(undefined, {strategy: 'compact'});
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          a: TF.string(),
          b: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
          c: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          a: TF.string(),
          b: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
          c: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
        })
      ),
    getTestData: () => {
      const setB = new Set([
        {s: 'a', arr: [1, 2, 3]},
        {s: 'b', arr: [4, 5, 6]},
      ]);
      const setC = new Set([
        {s: 'a', arr: [1, 2, 3]},
        {s: 'b', arr: [4, 5, 6]},
      ]);
      return {values: [{a: 'a', b: setB, c: setC}]};
    },
  },
  map_string_number: {
    title: 'Map<string, number>',
    description:
      'Root `Map<string, number>` serializes to a JSON array of `[key, value]` pairs via `Array.from(v)` and restores with `new Map(v)` (atomic string keys and number values need no per-entry transform).',
    serializeNotes:
      'Map round-trips as a JSON array of [key, value] pairs (insertion order preserved), rehydrated to a Map on decode.',
    mutateEncoder: () => createJsonEncoderFn<Map<string, number>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Map<string, number>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Map<string, number>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Map<string, number>>(),
    mutateDecoder: () => createJsonDecoderFn<Map<string, number>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Map<string, number>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.map(TF.string(), TF.number())),
    schemaDecoder: () => createJsonDecoderFn(RT.map(TF.string(), TF.number())),
    getTestData: () => ({
      values: [
        new Map<string, number>([
          ['one', 1],
          ['two', 2],
          ['three', 3],
        ]),
      ],
    }),
  },
  map_string_small_object: {
    title: 'Map<string, SmallObject>',
    description:
      "Root `Map<string, SmallObject>` with string keys and object values carrying optional `Date` and `bigint` serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)`, with each value's `Date` becoming an ISO string and `bigint` a decimal string.",
    serializeNotes: [
      'Map materialises to a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'Value-side `prop4: Date` round-trips via its ISO string; `prop5: bigint` via a decimal string.',
    ],
    mutateEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Map<string, SmallObject>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Map<string, SmallObject>>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Map<string, SmallObject>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Map<string, SmallObject>>();
    },
    mutateDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Map<string, SmallObject>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Map<string, SmallObject>>(undefined, {strategy: 'compact'});
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.map(
          TF.string(),
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.map(
          TF.string(),
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    getTestData: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return {
        values: [
          new Map<string, SmallObject>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
            ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}],
            ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
          ]),
        ],
      };
    },
  },
  map_small_object_number: {
    title: 'Map<SmallObject, number>',
    description:
      'Root `Map<SmallObject, number>` keyed by an object with optional `Date`/`bigint` fields serializes to a JSON array of `[keyObject, value]` pairs restored via `new Map(v)`, with the key-side transform turning a `Date` field into an ISO string and a `bigint` field into a decimal string before rebuild.',
    serializeNotes: [
      'Object keys are emitted as the entry tuple key (a JSON object) and rebuilt into a fresh Map key on decode.',
      'Key-side `prop4: Date` round-trips via its ISO string; `prop5: bigint` via a decimal string.',
    ],
    mutateEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Map<SmallObject, number>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Map<SmallObject, number>>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoderFn<Map<SmallObject, number>>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Map<SmallObject, number>>();
    },
    mutateDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Map<SmallObject, number>>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoderFn<Map<SmallObject, number>>(undefined, {strategy: 'compact'});
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.map(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          }),
          TF.number()
        )
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.map(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          }),
          TF.number()
        )
      ),
    getTestData: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return {
        values: [
          new Map<SmallObject, number>([
            [{prop1: 'value1', prop2: 1, prop3: true}, 1],
            [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}, 2],
            [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
          ]),
        ],
      };
    },
  },
  objects_with_nested_maps: {
    title: 'Nested maps',
    description:
      'Object with a nested `Map<string, {sm: {s: string; arr: number[]}}>` property where the map serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)` (atomic-shaped values need no value transform).',
    serializeNotes: 'The nested Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
    mutateEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoderFn<DeepWithMap>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoderFn<DeepWithMap>(undefined, {strategy: 'clone'});
    },
    compactEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoderFn<DeepWithMap>(undefined, {strategy: 'compact'});
    },
    cloneDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoderFn<DeepWithMap>();
    },
    mutateDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoderFn<DeepWithMap>(undefined, {strategy: 'mutate'});
    },
    compactDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoderFn<DeepWithMap>(undefined, {strategy: 'compact'});
    },
    schemaEncoder: () =>
      createJsonEncoderFn(
        RT.object({
          a: TF.string(),
          b: RT.map(TF.string(), RT.object({sm: RT.object({s: TF.string(), arr: RT.array(TF.number())})})),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoderFn(
        RT.object({
          a: TF.string(),
          b: RT.map(TF.string(), RT.object({sm: RT.object({s: TF.string(), arr: RT.array(TF.number())})})),
        })
      ),
    getTestData: () => ({
      values: [
        {
          a: 'a',
          b: new Map([
            ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
            ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
          ]),
        },
      ],
    }),
  },
  map_with_bigint_keys: {
    title: 'Bigint keys',
    description:
      'Root `Map<bigint, number>` keyed by bigint with number values serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)`, with each bigint key emitted as a decimal string (not natively JSON-encodable) and rebuilt with `BigInt(...)` while number values pass through atomically.',
    serializeNotes: [
      'Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'bigint keys serialize as decimal strings and restore via BigInt(...); JSON cannot encode bigint directly.',
    ],
    mutateEncoder: () => createJsonEncoderFn<Map<bigint, number>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Map<bigint, number>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Map<bigint, number>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Map<bigint, number>>(),
    mutateDecoder: () => createJsonDecoderFn<Map<bigint, number>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Map<bigint, number>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.map(TF.bigInt(), TF.number())),
    schemaDecoder: () => createJsonDecoderFn(RT.map(TF.bigInt(), TF.number())),
    getTestData: () => ({
      values: [
        new Map<bigint, number>([
          [1n, 1],
          [2n, 2],
          [3n, 3],
        ]),
      ],
    }),
  },
  map_with_date_values: {
    title: 'Date values',
    description:
      'Root `Map<string, Date>` with string keys and `Date` values serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)`, with each `Date` value becoming an ISO string on encode and rebuilt with `new Date(...)` on decode.',
    serializeNotes: [
      'Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'Date values serialize via their ISO string and restore with new Date(...).',
    ],
    mutateEncoder: () => createJsonEncoderFn<Map<string, Date>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoderFn<Map<string, Date>>(undefined, {strategy: 'clone'}),
    compactEncoder: () => createJsonEncoderFn<Map<string, Date>>(undefined, {strategy: 'compact'}),
    cloneDecoder: () => createJsonDecoderFn<Map<string, Date>>(),
    mutateDecoder: () => createJsonDecoderFn<Map<string, Date>>(undefined, {strategy: 'mutate'}),
    compactDecoder: () => createJsonDecoderFn<Map<string, Date>>(undefined, {strategy: 'compact'}),
    schemaEncoder: () => createJsonEncoderFn(RT.map(TF.string(), TF.date())),
    schemaDecoder: () => createJsonDecoderFn(RT.map(TF.string(), TF.date())),
    getTestData: () => ({
      values: [
        new Map<string, Date>([
          ['date1', new Date('2000-08-06T02:13:00.000Z')],
          ['date2', new Date('2001-09-07T03:14:00.000Z')],
        ]),
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
