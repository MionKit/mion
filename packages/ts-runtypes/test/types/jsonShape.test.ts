// Type-level contract for `JSONShape<T>` — the RunTypes JSON wire twin of
// DataOnly. Each leaf mapping mirrors the Go serializer emitters
// (internal/cachegen/typefunctions/json_prepare.go / json_restore.go), and the
// pins here are the TS half of that agreement; the runtime half lives in
// test/features/jsonShapeWire.test.ts, which encodes real values and matches
// them against literals typed as JSONShape<T> — the two files meet at the same
// hand-derived table, so a drift on either side reds one of them.
//
// Same shape as structural.test.ts / typesafety.test.ts: each `assertions…`
// function body is a type-only test, referenced so esbuild keeps it but never
// invoked. `Equals` pins EXACT types (mutual conditional identity);
// assignment pins cover the looser one-way claims.

import {describe, expect, test} from 'vitest';
import type {JSONShape} from '../../src/index.ts';
import * as TF from '../../src/formats/index.ts';

type Equals<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type Expect<C extends true> = C;

describe('JSONShape<T> — type-only assertions', () => {
  test('assertion bodies are referenced (no runtime work here)', () => {
    expect(typeof assertionsLeafMappings).toBe('function');
    expect(typeof assertionsContainers).toBe('function');
    expect(typeof assertionsUnions).toBe('function');
    expect(typeof assertionsObjectsAndBrands).toBe('function');
  });
});

// ── Leaves: the JS-only types and their wire spellings ──
function assertionsLeafMappings() {
  type _date = Expect<Equals<JSONShape<Date>, string>>;
  type _regexp = Expect<Equals<JSONShape<RegExp>, string>>;
  type _bigint = Expect<Equals<JSONShape<bigint>, `${bigint}`>>;
  // A bigint literal keeps its exact digits on the wire.
  type _bigintLit = Expect<Equals<JSONShape<5n>, '5'>>;
  // undefined / void leaves are null on the wire (json_stringify.go).
  type _undef = Expect<Equals<JSONShape<undefined>, null>>;
  type _void = Expect<Equals<JSONShape<void>, null>>;
  type _null = Expect<Equals<JSONShape<null>, null>>;
  // JSON-native primitives and literals pass through.
  type _str = Expect<Equals<JSONShape<string>, string>>;
  type _lit = Expect<Equals<JSONShape<'active'>, 'active'>>;
  type _num = Expect<Equals<JSONShape<number>, number>>;
  type _numLit = Expect<Equals<JSONShape<7>, 7>>;
  type _bool = Expect<Equals<JSONShape<boolean>, boolean>>;
  type _true = Expect<Equals<JSONShape<true>, true>>;
  // any / unknown keep the broad kind.
  type _unknown = Expect<Equals<JSONShape<unknown>, unknown>>;
  // Non-data kinds never reach the wire.
  type _fn = Expect<Equals<JSONShape<() => void>, never>>;
  type _sym = Expect<Equals<JSONShape<symbol>, never>>;
  type _promise = Expect<Equals<JSONShape<Promise<string>>, never>>;
  type _buffer = Expect<Equals<JSONShape<Uint8Array>, never>>;
  return [] as unknown as [
    _date,
    _regexp,
    _bigint,
    _bigintLit,
    _undef,
    _void,
    _null,
    _str,
    _lit,
    _num,
    _numLit,
    _bool,
    _true,
    _unknown,
    _fn,
    _sym,
    _promise,
    _buffer,
  ];
}

// ── Containers: Map / Set entries form, arrays, tuples, slot nulls ──
function assertionsContainers() {
  type _map = Expect<Equals<JSONShape<Map<string, Date>>, [string, string][]>>;
  type _roMap = Expect<Equals<JSONShape<ReadonlyMap<number, bigint>>, [number, `${bigint}`][]>>;
  type _set = Expect<Equals<JSONShape<Set<Date>>, string[]>>;
  type _roSet = Expect<Equals<JSONShape<ReadonlySet<'a' | 'b'>>, ('a' | 'b')[]>>;
  type _arr = Expect<Equals<JSONShape<Date[]>, string[]>>;
  type _roArr = Expect<Equals<JSONShape<readonly bigint[]>, `${bigint}`[]>>;
  // Tuples keep slot structure; a Date slot becomes its ISO string.
  type _tuple = Expect<Equals<JSONShape<[string, Date]>, [string, string]>>;
  // A slot that can hold undefined spells null on the wire (the tuple emitter
  // replaces undefined slots with null to preserve array length).
  type _optSlot = Expect<Equals<JSONShape<[string, string?]>, [string, (string | null)?]>>;
  type _undefElement = Expect<Equals<JSONShape<(string | undefined)[]>, (string | null)[]>>;
  // A structurally-branded plain array recovers its element wire, brand gone.
  type _branded = Expect<Equals<JSONShape<TF.FormattedArray<Date[], {uniqueItems: true}>>, string[]>>;
  return [] as unknown as [_map, _roMap, _set, _roSet, _arr, _roArr, _tuple, _optSlot, _undefElement, _branded];
}

// ── Unions: raw when every member is JSON-natural, else the flat envelope ──
function assertionsUnions() {
  // JSON-natural unions round-trip raw — no envelope.
  type _litUnion = Expect<Equals<JSONShape<'a' | 'b'>, 'a' | 'b'>>;
  type _mixedNatural = Expect<Equals<JSONShape<string | number>, string | number>>;
  type _nullable = Expect<Equals<JSONShape<string | null>, string | null>>;
  // A declared undefined member stays spelled (absent-able optional slot).
  type _undefMember = Expect<Equals<JSONShape<string | undefined>, string | undefined>>;
  // Any JS-only member forces the all-or-nothing [index, value] envelope.
  type _dateUnion = Expect<Equals<JSONShape<Date | string>, [number, string]>>;
  type _dateNull = Expect<Equals<JSONShape<Date | null>, [number, string | null]>>;
  type _bigintUnion = Expect<Equals<JSONShape<bigint | boolean>, [number, `${bigint}` | boolean]>>;
  // Object members ride the same envelope ([-1, merged] approximated by the
  // union of the members' own wire shapes).
  type Shape = {kind: 'circle'; r: Date} | {kind: 'square'; n: bigint};
  type _objUnion = Expect<Equals<JSONShape<Shape>, [number, {kind: 'circle'; r: string} | {kind: 'square'; n: `${bigint}`}]>>;
  return [] as unknown as [_litUnion, _mixedNatural, _nullable, _undefMember, _dateUnion, _dateNull, _bigintUnion, _objUnion];
}

// ── Objects: modifiers survive, non-data members drop, brands widen ──
function assertionsObjectsAndBrands() {
  interface Order {
    readonly id: string;
    total: bigint;
    placed: Date;
    note?: string;
    tags: Set<string>;
    onShip(): void; // non-data — dropped
  }
  type OrderWire = JSONShape<Order>;
  type _id = Expect<Equals<OrderWire['id'], string>>;
  type _total = Expect<Equals<OrderWire['total'], `${bigint}`>>;
  type _placed = Expect<Equals<OrderWire['placed'], string>>;
  type _tags = Expect<Equals<OrderWire['tags'], string[]>>;
  type _noMethod = Expect<Equals<Extract<keyof OrderWire, 'onShip'>, never>>;
  // `?` and `readonly` survive the homomorphic map.
  const modifiers: {readonly id: string; note?: string | undefined} = null as unknown as Pick<OrderWire, 'id' | 'note'>;
  // Format-branded primitives widen to their base on the wire.
  type _email = Expect<Equals<JSONShape<TF.Email>, string>>;
  type _emailField = Expect<Equals<JSONShape<{contact: TF.Email}>, {contact: string}>>;
  // A circular type resolves finitely under the depth budget.
  interface LinkedNode {
    value: Date;
    next?: LinkedNode;
  }
  type _circular = JSONShape<LinkedNode>;
  const circularValue: _circular = {value: '2026-01-01T00:00:00.000Z'};
  return [modifiers, circularValue] as unknown as [_id, _total, _placed, _tags, _noMethod, _email, _emailField];
}
