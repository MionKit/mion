// cloning / Unions: object-bearing unions throw at creation (RUK001), since with no arm discrimination a clone
// could keep unknown keys. Mirrors the serialization suite's UNIONS keys: what round-trips there throws here.

import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
import type {CloningCase} from './types.ts';

type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];

type Disjoint = {a: string} | {b: number};

export const UNIONS = {
  union: {
    title: 'Atomic union',
    description:
      'Untagged scalar union where the Date member gets a dispatch arm (fresh instance) and number, string, null and bigint fall through by value.',
    clone: () => createRemoveUnknownKeysFn<Date | number | string | null | bigint>(),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
  },
  union_array: {
    title: 'Union of arrays',
    description:
      'Union of homogeneous arrays: every input rebuilds as a fresh array whose Date elements clone fresh and whose scalar elements pass by value.',
    cloneNotes:
      'All four members are arrays, not object literals, so the RUK001 object-bearing rule does not apply — element handling dispatches per element kind, which yields a correct deep clone for every arm (and the empty [] trivially) without discriminating between them.',
    clone: () => createRemoveUnknownKeysFn<string[] | number[] | boolean[] | Date[]>(),
    getTestData: () => ({
      values: [
        ['a', 'b', 'c'],
        [1, 2, 3],
        [true, false, true],
        [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')],
        [],
      ],
    }),
  },
  with_discriminator: {
    title: 'Array of scalar union',
    description:
      'Array of an atomic scalar union rebuilds as a fresh array where each element dispatches independently — Dates clone fresh, string, bigint and boolean elements pass by value.',
    clone: () => createRemoveUnknownKeysFn<(string | bigint | boolean | Date)[]>(),
    getTestData: () => {
      const date = new Date('2000-08-06T02:13:00.000Z');
      return {
        values: [
          ['a', 'b', 'c'],
          [1n, 2n, 3n],
          [true, false, true],
          [1n, 'b', date],
        ],
      };
    },
  },
  union_object_with_discriminator: {
    title: 'Union of object shapes',
    description:
      'Untagged union of object shapes is unsupported for cloning — the factory throws at creation (RUK001) instead of guessing which shape to rebuild.',
    cloneNotes:
      'The serializers resolve these arms structurally on the flat wire by required keys; clone v1 has no runtime arm discrimination, so it cannot know which declared shape to rebuild — narrow to one arm before cloning (one factory per arm).',
    // @mion-downgrade-error RUK001
    clone: () => createRemoveUnknownKeysFn<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  union_with_discriminator_property: {
    title: 'Discriminated union',
    description:
      'A literal `type` discriminator does not help clone v1 — object-bearing unions throw at factory creation (RUK001) whether tagged or not.',
    cloneNotes:
      'The serializers dispatch on the `type` literal over the flat wire; clone v1 ships no runtime arm discrimination at all, so narrow on `type` first and clone the narrowed arm.',
    clone: () =>
      createRemoveUnknownKeysFn<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
        // @mion-downgrade-error RUK001
      >(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  union_mixed_with_discriminator: {
    title: 'Mixed arrays and objects',
    description:
      'Union mixing array members with object shapes throws at factory creation (RUK001) — the object arms poison the whole union for cloning.',
    cloneNotes:
      'The array members alone would clone via kind dispatch, but the object-literal arms need the arm discrimination clone v1 does not have (the serializers resolve them structurally on the flat wire) — split the union or narrow to one arm before cloning.',
    clone: () =>
      createRemoveUnknownKeysFn<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        // @mion-downgrade-error RUK001
      >(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  union_index_property_with_discriminator: {
    title: 'Union with index signatures',
    description:
      'Union including record-like members with index signatures throws at factory creation (RUK001) — index-signature shapes are object members like any other.',
    cloneNotes:
      'Both the fixed-shape arms and the index-signature arms are object-bearing; the serializers resolve them structurally on the flat wire, but clone v1 has no runtime arm discrimination — narrow to one arm before cloning.',
    clone: () =>
      createRemoveUnknownKeysFn<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
        // @mion-downgrade-error RUK001
      >(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  circular_union_with_discriminator: {
    title: 'Circular union',
    description:
      'Self-referential union carrying an object-literal arm throws at factory creation (RUK001) before any recursion is emitted.',
    cloneNotes:
      'The {a?: UnionC; b?: string} arm triggers the object-bearing-union rule regardless of the recursion — the serializers walk the self-reference on the flat wire, but clone v1 has no runtime arm discrimination; narrow to one arm before cloning (acyclic tree recursion itself is fine, see CIRCULAR_REFS).',
    // @mion-downgrade-error RUK001
    clone: () => createRemoveUnknownKeysFn<UnionC>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  union_with_methods: {
    title: 'Union with methods',
    description:
      'Union of method-carrying object shapes throws at factory creation (RUK001) like any other object-bearing union — the methods never come into play.',
    cloneNotes:
      'Serialization silently drops the method props and resolves the data-only shapes on the flat wire; clone v1 has no runtime arm discrimination, so the union is rejected at creation — narrow to one shape before cloning.',
    clone: () =>
      createRemoveUnknownKeysFn<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        // @mion-downgrade-error RUK001
      >(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  union_with_any: {
    title: 'Union with any',
    description:
      '`T | any` collapses to bare `any` in the checker, and `any` is an opaque unshaped value — cloning is the identity pass-through.',
    cloneNotes: [
      'TS DIVERGENCE: number | {name} | any is just `any` to the checker, so the object arm never reaches the emitter and no RUK001 rejection fires — the factory is the bare-`any` factory.',
      '`any` carries no declared shape to rebuild, so every input (objects included) returns by reference; passThrough flips the identity assert to clone(x) === x.',
    ],
    clone: () => createRemoveUnknownKeysFn<number | {name: string} | any>(),
    getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
    passThrough: true,
  },
  union_with_non_serializable: {
    title: 'Union with non-serializable member',
    description:
      'The function arm stays in the clone domain as an opaque pass-through (serialization drops it via DataOnly) — Date inputs clone fresh, number and string pass by value.',
    cloneNotes:
      'A function input would return by reference (opaque pass-through, not a dropped arm); the samples stick to the data members, mirroring the serialization suite — reference-compared function samples would have to be module-level consts.',
    clone: () => createRemoveUnknownKeysFn<Date | number | string | (() => any)>(),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello']}),
  },
  union_extra_bigint_prop_throws: {
    title: 'Extra bigint prop',
    description:
      'The extra-prop JSON.stringify contract is serialization-only — for cloning the {a} | {b} union of object shapes throws at factory creation (RUK001) before any value flows.',
    cloneNotes:
      'The serializers resolve {a} vs {b} on the flat wire; clone v1 has no runtime arm discrimination, so the extra-bigint input is unreachable — the clone-side extras story (undeclared keys dropped by construction) lives in the OBJECTS cases; narrow to one arm before cloning.',
    // @mion-downgrade-error RUK001
    clone: () => createRemoveUnknownKeysFn<{a: string} | {b: number}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  union_extra_symbol_prop_drops: {
    title: 'Extra symbol prop',
    description:
      'Same contract as the extra-bigint case on the serialization side — for cloning the object-bearing union throws at factory creation (RUK001).',
    cloneNotes:
      'A single-shape clone would drop the symbol extra by construction (undeclared keys never copy); as a union of shapes the factory throws instead — no runtime arm discrimination while the serializers dispatch on the flat wire — so narrow to one arm before cloning.',
    // @mion-downgrade-error RUK001
    clone: () => createRemoveUnknownKeysFn<{a: string} | {b: number}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  shared_prop_same_type: {
    title: 'Shared prop same type',
    description:
      'Shared-prop discriminated union of object shapes throws at factory creation (RUK001) — shared-prop dispatch subtleties never arise without runtime arm discrimination.',
    cloneNotes:
      'The serializers dispatch on `kind` over the flat wire so the shared `at: Date` transforms exactly once; clone v1 rejects the object-bearing union at creation — narrow on `kind` and clone the narrowed arm.',
    clone: () =>
      // @mion-downgrade-error RUK001
      createRemoveUnknownKeysFn<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  shared_prop_divergent_date_string: {
    title: 'Shared prop Date or string',
    description:
      'Divergent shared prop (`when: Date` vs `when: string`) is exactly the dispatch clone v1 does not have — the object-bearing union throws at factory creation (RUK001).',
    cloneNotes:
      'The serializers dispatch `when` on the `kind` literal over the flat wire; clone v1 would have to guess (a Date must rebuild fresh, a string passes by value) and refuses to — narrow on `kind` before cloning.',
    clone: () =>
      // @mion-downgrade-error RUK001
      createRemoveUnknownKeysFn<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  shared_prop_divergent_bigint_number: {
    title: 'Shared prop bigint or number',
    description:
      'Shared `id: bigint | number` under a `form` discriminator throws at factory creation (RUK001) like every object-bearing union in clone v1.',
    cloneNotes:
      'The serializers resolve `id` per arm over the flat wire; both id kinds are immutable pass-through values for cloning, but the arm shapes still differ and clone v1 has no runtime arm discrimination — narrow on `form` before cloning.',
    clone: () =>
      // @mion-downgrade-error RUK001
      createRemoveUnknownKeysFn<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
  shared_prop_no_discriminator_structural: {
    title: 'Shared prop structural',
    description:
      'Structural shared-prop union with no discriminator throws at factory creation (RUK001) — required-key dispatch exists only on the serialization side.',
    cloneNotes:
      'The serializers pick the member by required-key shape on the flat wire; clone v1 has no structural arm discrimination either — narrow by checking the divergent props yourself before cloning.',
    // @mion-downgrade-error RUK001
    clone: () => createRemoveUnknownKeysFn<{a: string; b: number} | {a: boolean; c: Date}>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },

  // ──────────────────────────────────────────────────────────────
  // Cloning-only cases below — no serialization-suite counterpart.

  primitiveMembers: {
    title: 'string | number',
    description: 'Every member is immutable — the union passes through by value.',
    clone: () => createRemoveUnknownKeysFn<string | number>(),
    getTestData: () => ({values: ['hello', 42]}),
    passThrough: true,
  },
  nullableDate: {
    title: 'Date | null',
    description: 'The Date member gets a dispatch arm (fresh instance); `null` falls through by value.',
    clone: () => createRemoveUnknownKeysFn<{at: Date | null}>(),
    getTestData: () => ({
      values: [{at: new Date('2021-05-06T07:08:09.000Z')}, {at: null}],
    }),
  },
  stringOrDate: {
    title: 'string | Date',
    description: 'Mixed union at root: a Date input clones fresh, a string input passes through by value.',
    clone: () => createRemoveUnknownKeysFn<string | Date>(),
    getTestData: () => ({values: [new Date('2021-05-06T07:08:09.000Z'), 'plain']}),
  },
  stringOrArray: {
    title: 'string | string[]',
    description: 'The array member gets an `Array.isArray` arm (fresh array); the string falls through.',
    clone: () => createRemoveUnknownKeysFn<string | string[]>(),
    getTestData: () => ({values: [['a', 'b'], 'solo']}),
  },
  objectBearing: {
    title: 'object-bearing union (unsupported)',
    description: 'Unions with object members throw at factory creation — RUK001, the house alwaysThrow convention.',
    cloneNotes:
      'Narrow to one arm before cloning (one factory per arm), or restructure into a single object with optional props.',
    // @mion-downgrade-error RUK001
    clone: () => createRemoveUnknownKeysFn<Disjoint>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
} satisfies Record<string, CloningCase>;
