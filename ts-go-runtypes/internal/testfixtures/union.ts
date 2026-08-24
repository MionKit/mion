import {getRunTypeId} from '@ts-runtypes/core';

export {};

// 1 — Primitive union (no objects, no discriminator, no safe-order
// reordering — primitives stay in declaration order).
type Primitives = string | number | boolean;
const primitives = getRunTypeId<Primitives>();

// 1b — Reflect form for the primitive union.
declare const primitivesValue: Primitives;
const primitivesReflect = getRunTypeId(primitivesValue);

// 2 — Subset hazard: {a} is a structural subset of {a, b}; safe-order
// must surface the 2-prop member first.
type SubsetHazard = {a: string} | {a: string; b: number};
const subsetHazard = getRunTypeId<SubsetHazard>();

// 3 — Deep subset chain: 3-prop > 2-prop > 1-prop in safe order.
type DeepChain = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
const deepChain = getRunTypeId<DeepChain>();

// 4 — Unrelated objects keep declaration order in safe order.
type Unrelated = {a: string} | {b: number};
const unrelated = getRunTypeId<Unrelated>();

// 5 — Named discriminator: every object member has a 'kind' property
// with a distinct literal type. Discriminator pass marks both kind
// properties as IsUnionDiscriminator.
type Discriminated = {kind: 'a'; x: number} | {kind: 'b'; y: string};
const discriminated = getRunTypeId<Discriminated>();

// 6 — Less-complex discriminator wins: k1 is a literal pair, k2 is a
// nested object pair. Both qualify as shared-name discriminators with
// distinct types; the simpler one (k1) is picked.
type LeastComplex = {k1: 'a'; k2: {nested: {deep: 1}}; x: number} | {k1: 'b'; k2: {nested: {deep: 2}}; y: string};
const leastComplex = getRunTypeId<LeastComplex>();

// 7 — No shared name → unique-prop fallback. `a` is unique to first
// member, `b` to second; both get marked.
type UniqueProp = {a: string} | {b: number};
const uniqueProp = getRunTypeId<UniqueProp>();

// 8 — Shared name with matching type is NOT a discriminator: both
// members share `kind: string` (same type-id), so it can't disambiguate.
type SharedSameType = {kind: string; x: 1} | {kind: string; y: 2};
const sharedSameType = getRunTypeId<SharedSameType>();

// 9 — Weak type (all-optional). Each member is all-optional, so loose
// matching needs at-least-one-own-prop logic at the runtype layer; we
// just verify the shape survives serialization here.
type Weak = {a?: string; b?: number} | {c?: boolean; d?: string};
const weak = getRunTypeId<Weak>();

// 10 — Union with null and undefined members.
type Nullable = string | null | undefined;
const nullable = getRunTypeId<Nullable>();

// 11 — Union of arrays (no merging — each member tested as its own
// array type).
type ArrayUnion = string[] | number[];
const arrayUnion = getRunTypeId<ArrayUnion>();

// 12 — Nested union flattens via Distributed(): inner literals get
// hoisted to a single 3-member union, no nesting.
type Inner = 'a' | 'b';
type Nested = Inner | 'c';
const nested = getRunTypeId<Nested>();

// 13 — Literal union with mixed bases (string + number).
type MixedLiteral = 'one' | 1 | true;
const mixedLiteral = getRunTypeId<MixedLiteral>();

// 14 — Union with index-signature member alongside an atomic member.
type IndexSigUnion = string | {[k: string]: number};
const indexSigUnion = getRunTypeId<IndexSigUnion>();

export const __sites = {
  primitives,
  primitivesReflect,
  subsetHazard,
  deepChain,
  unrelated,
  discriminated,
  leastComplex,
  uniqueProp,
  sharedSameType,
  weak,
  nullable,
  arrayUnion,
  nested,
  mixedLiteral,
  indexSigUnion,
};
