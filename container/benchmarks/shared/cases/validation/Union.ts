import type {SharedCase} from '../types.ts';

export const UNION = {
  atomic_union: {
    title: 'Union of common atomic types (with Date and bigint)',
    description: 'union.spec.ts "validate union" — Atomic Union suite',
    getSamples: () => ({
      valid: [new Date(), 123, 'hello', null, 1n],
      invalid: [{}, [], true, undefined, new Date('invalid'), Infinity, Symbol(), () => null],
    }),
  },
  string_literal_union: {
    title: 'Union of string literals (case-sensitive)',
    description: 'union.spec.ts "validate union discriminator string"',
    getSamples: () => ({
      valid: ['UNO', 'DOS', 'TRES'],
      invalid: ['INVALID', 'uno', '', 42, null, undefined, true, 'Uno', {}],
    }),
  },
  large_union_eight_arms: {
    title: 'Large union (8 heterogeneous arms) — value-first infer fallback',
    description:
      'Past the 4 positional union() overloads, the value-first builder routes through the recursive UnionOf<T> infer fallback. 8 arms (literals + primitives + a {a}/{a;b} subset+superset pair) verify the fallback BOTH generates a correct validator AND converges on the type-first union id — preserving the subset/superset arms (no subtype collapse) at depth 8.',
    getSamples: () => ({
      valid: ['a', 'b', 42, true, null, {a: 'x'}, {a: 'x', b: 1}, {c: 10n}],
      invalid: ['z', 'true', undefined, [], {}, {b: 1}, {a: 1}, {c: 'x'}],
    }),
  },
  string_or_number: {
    title: 'Two-arm union of string and number',
    getSamples: () => ({
      valid: ['hello', 42, 0, ''],
      invalid: [null, undefined, true, [], {}, NaN, Infinity, BigInt(1)],
    }),
  },
  union_of_array_types: {
    title: 'Union of array types (whole-array dispatch)',
    description: 'union.spec.ts "Union Arr"',
    getSamples: () => ({
      valid: [['a'], [1], [true, false], [], ['a', 'b']],
      invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [Infinity], [null], [BigInt(1)]],
    }),
  },
  array_of_union: {
    title: 'Array whose element type is a union',
    description: 'union.spec.ts "Arr with union of types"',
    getSamples: () => ({
      valid: [[1n, 'b', new Date(), true]],
      invalid: [
        ['a', false, 2], // 2 is a number, not bigint
        null,
        undefined,
        [new Date('invalid')], // Invalid Date inside union
        [null], // null not in union
        [{}],
      ],
    }),
  },
  union_of_object_shapes: {
    title: 'Union of disjoint object shapes',
    description:
      "union.spec.ts 'Union Obj'. Object-typed union members go through the dependency-call layer with the shared `typeof === 'object' && !== null` guard lifted out of the OR-chain.",
    getSamples: () => ({
      // union.spec.ts uses loose matching — `{a, b, c}` passes
      // because `{b: number}` is satisfied. Our emit accepts any
      // object that satisfies AT LEAST one member's required props.
      valid: [{a: 'x', aa: true}, {b: 1}, {c: 1n}, {a: 'x', aa: true, b: 1}],
      invalid: [{a: 'x'}, {}, 'not object', null, [], 42, undefined, {b: 'not number'}, {c: 1}],
    }),
  },
  discriminated_union: {
    title: 'Discriminated union (shared kind literal, different payloads)',
    description:
      'union.spec.ts "Union with discriminator property" — the OR-chain is semantically correct; the discriminator-aware optimization (early-return on the discriminator literal) is a separate emit-shape concern handled later.',
    getSamples: () => ({
      valid: [
        {kind: 'a', n: 1},
        {kind: 'b', s: 'hello'},
      ],
      invalid: [
        {kind: 'c', n: 1},
        {kind: 'a', n: 'not number'},
        {n: 1},
        null,
        'not object',
        undefined,
        {kind: 'a'}, // missing n
        {kind: 'a', n: NaN},
        {kind: 'b'}, // missing s
      ],
    }),
  },
  circular_union: {
    title: 'Self-referential union via object and array arms',
    description:
      'union.spec.ts "Union circular". Handled via always-non-inlined Union + Object + Array (no IsCircular detection needed; the dependency-call layer terminates via the lazy-init two-phase cache registration).',
    getSamples: () => ({
      valid: [new Date(), 123, 'hello', {}, {a: {a: {}}}, {b: 'hello'}, [], [{a: {}}, [123, 'hello']]],
      invalid: [true, null, undefined, {a: true}, [true], new Date('invalid'), Infinity, Symbol()],
    }),
  },
  union_with_methods: {
    title: 'Union of object arms each carrying a method',
    description:
      'union.spec.ts "Union with objects containing methods" — methods are skipped from each branch via the property-emit function-skip rule (the AND chain inside each object reduces to the data-only props).',
    getSamples: () => ({
      valid: [{name: 'x', getName: () => 'x'}, {age: 1, getAge: () => 1}, {name: 'x'}, {age: 1}],
      invalid: [{}, null, 'not object', [], undefined, true, 42, {name: 1}, {age: 'x'}],
    }),
  },
  intersection_to_object: {
    title: 'Intersection of object shapes (resolved to one merged shape)',
    description:
      'intersection.spec.ts — tsgo / deepkit resolves intersections to ObjectLiteral at the type-checker level, so the cache never carries a KindIntersection that needs validation. Runtime behavior matches `{a: string; b: number}` byte-for-byte.',
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}, undefined, {a: 'x', b: NaN}, {}],
    }),
  },
  union_with_index_arm: {
    title: 'Union where one arm carries an index signature',
    description:
      "union.spec.ts 'validate an union with index property' — arm carries a named prop AND an index signature; index-typed extras are accepted alongside the named prop.",
    getSamples: () => ({
      valid: [{a: 'hello', aa: true}, {b: 123}, {c: 1n, d: 2n}],
      invalid: [
        {a: 'hello'}, // missing aa, no b, no c
        {b: 'hello'}, // wrong type for b
        {a: 'hello', d: 'extra'}, // doesn't match any arm
        {c: 1n, d: 'hello'}, // index value wrong type
        null,
        undefined,
        {}, // empty matches no arm
        {b: NaN}, // b is number but NaN fails
      ],
    }),
  },
  union_same_prop_different_types: {
    title: 'Discriminated union sharing one prop with arm-dependent type',
    description:
      "union.spec.ts 'validate union same prop with different types' — same prop name (`prop`) carries an arm-dependent value type, gated by the literal-string discriminator.",
    getSamples: () => ({
      valid: [
        {type: 'a', prop: true},
        {type: 'b', prop: 123},
        {type: 'c', prop: 'hello'},
      ],
      invalid: [
        {type: 'a', prop: 123},
        {type: 'b', prop: 'hello'},
        {type: 'c', prop: true},
        null,
        undefined,
        {type: 'a'}, // missing prop
        {prop: true}, // missing type
        {type: 'd', prop: true}, // invalid discriminator
      ],
    }),
  },
  union_mixed_arrays_and_objects: {
    title: 'Union mixing array types and object shapes',
    description:
      "union.spec.ts 'Union Mixed' — arrays and objects in the same union; the OR-chain dispatches on shape (Array.isArray vs object typeof).",
    getSamples: () => ({
      valid: [
        ['a', 'b', 'c'],
        [1, 2, 3],
        [true, false],
        {a: 'hello', aa: true},
        {b: 123, c: 123n}, // matches {b: number}, extra c allowed
      ],
      invalid: [
        [1, 'b'], // mixed-type array — no array arm matches
        {}, // empty object
        {a: 'hello', d: 'world'}, // missing aa, no other match
        null,
        undefined,
        [null],
        'not in any arm',
      ],
    }),
  },
  union_merged_property: {
    title: 'Union of shapes sharing a prop with different value types',
    description:
      "union.spec.ts 'validate union with merged properties' — single shared prop with different value types; `a` accepts boolean OR number.",
    getSamples: () => ({
      valid: [{a: true}, {a: false}, {a: 123}, {a: 0}],
      invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}, {a: NaN}],
    }),
  },
  union_mixed_with_index: {
    title: 'Union mixing arrays, plain objects, and index-signature shapes',
    description:
      "union.spec.ts 'Union mixed with index property' — arrays + objects (some with index signatures) in the same union.",
    getSamples: () => ({
      valid: [
        ['a', 'b', 'c'],
        {a: 'hello', aa: true},
        {b: 123, a: 'world'}, // matches {b: number}
        {b: 1n, c: 2n}, // matches {[k]: bigint; b: bigint}
        {a: 'hello', aa: true, j: 'extra'},
      ],
      invalid: [[1, 'b'], {}, {a: 'hello', b: 123n}, null, undefined, [null]],
    }),
  },
  union_with_any_fallback: {
    title: 'Union with an `any` arm (collapses to any)',
    description:
      "union.spec.ts 'support union with any type' — tsgo collapses `T | any` to `any`, so any value passes (the validator is effectively a no-op true).",
    getSamples: () => ({
      valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
      invalid: [],
    }),
  },
  union_with_unknown_fallback: {
    title: 'Union with an `unknown` arm (collapses to unknown)',
    description:
      "union.spec.ts 'support union with unknown type' — tsgo collapses `T | unknown` to `unknown`, so any value passes.",
    getSamples: () => ({
      valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
      invalid: [],
    }),
  },
  union_subset_small_first: {
    title: 'Union with the smaller arm declared before its superset',
    description:
      "union.spec.ts 'sortUnreachableTypes' — `{a}` defined before `{a; b}`. Both arms must be reachable: matching SmallObj must not swallow LargeObj-shaped inputs (semantically the same since either arm matching returns true, but pins the regression).",
    getSamples: () => ({
      valid: [{a: 'hello'}, {a: 'hello', b: 123}],
      // Note: `{a: 'hello', b: <anything>}` passes the SmallObj arm
      // (structural typing — extra props allowed). Only samples that
      // miss BOTH arms' required-prop sets belong here.
      invalid: [{b: 123}, {a: 123}, {}, null, undefined],
    }),
  },
  union_subset_nested_levels: {
    title: 'Union with a three-level subset chain',
    description:
      "union.spec.ts 'multiple levels of subset relationships' — three arms, each a strict superset of the previous.",
    getSamples: () => ({
      valid: [{x: 'hello'}, {x: 'hello', y: 123}, {x: 'hello', y: 123, z: true}],
      // Note: `{x: 'hello', ...}` passes the Tiny arm regardless of
      // y/z values (structural typing — extra props allowed). Only
      // samples that miss EVERY arm's required-prop set belong here.
      invalid: [{}, {y: 123}, {z: true}, {x: 1}, null, undefined],
    }),
  },
  union_subset_mixed_related_unrelated: {
    title: 'Union mixing a subset pair with a disjoint arm',
    description:
      "union.spec.ts 'mixed related and unrelated types' — Base and Extended are subset-related, Unrelated is disjoint.",
    getSamples: () => ({
      valid: [{id: '123'}, {id: '123', name: 'test'}, {value: 42}],
      invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined, {value: NaN}],
    }),
  },
} as const satisfies Record<string, SharedCase>;
