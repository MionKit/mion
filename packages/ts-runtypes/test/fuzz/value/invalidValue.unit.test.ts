import {describe, it, expect} from 'vitest';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import {invalidForKind, collectMutationTargets, mutateToInvalid, applyMutation} from './invalidValue.ts';

// --- tiny RunType builders (hand-built graphs; no Go binary needed) ---
let counter = 0;
const node = (kind: number, extra: Record<string, unknown> = {}): RunType =>
  ({id: 'n' + counter++, kind, ...extra}) as unknown as RunType;
const str = (): RunType => node(RunTypeKind.string);
const num = (): RunType => node(RunTypeKind.number);
const bool = (): RunType => node(RunTypeKind.boolean);
const anyN = (): RunType => node(RunTypeKind.any);
const literal = (value: unknown): RunType => node(RunTypeKind.literal, {literal: value});
const prop = (name: string, child: RunType, optional = false): RunType => node(RunTypeKind.property, {name, child, optional});
const obj = (...props: RunType[]): RunType => node(RunTypeKind.objectLiteral, {children: props});
const arr = (child: RunType): RunType => node(RunTypeKind.array, {child});
const tuple = (...members: RunType[]): RunType =>
  node(RunTypeKind.tuple, {children: members.map((m) => node(RunTypeKind.tupleMember, {child: m}))});
const union = (...children: RunType[]): RunType => node(RunTypeKind.union, {children});

describe('fuzz / invalidForKind', () => {
  it('produces a disjoint-typed, provably-invalid value per atomic kind', () => {
    expect(typeof invalidForKind(str()).value).not.toBe('string');
    expect(typeof invalidForKind(num()).value).not.toBe('number');
    expect(typeof invalidForKind(bool()).value).not.toBe('boolean');
    expect(typeof invalidForKind(node(RunTypeKind.bigint)).value).not.toBe('bigint');
    expect(typeof invalidForKind(node(RunTypeKind.symbol)).value).not.toBe('symbol');
    for (const k of [RunTypeKind.string, RunTypeKind.number, RunTypeKind.boolean, RunTypeKind.bigint]) {
      expect(invalidForKind(node(k)).proven).toBe(true);
    }
  });

  it('cannot prove an invalid value for any / unknown', () => {
    expect(invalidForKind(anyN()).proven).toBe(false);
    expect(invalidForKind(node(RunTypeKind.unknown)).proven).toBe(false);
  });

  it('mutates a literal to a different value of changed type/value', () => {
    expect(invalidForKind(literal('x')).value).not.toBe('x');
    expect(invalidForKind(literal(5)).value).not.toBe(5);
    expect(invalidForKind(literal(true)).value).toBe(false);
    expect(invalidForKind(literal('x')).proven).toBe(true);
  });

  it('produces a value outside the enum set', () => {
    const enumNode = node(RunTypeKind.enum, {values: ['RED', 'GREEN', 'BLUE']});
    const {value, proven} = invalidForKind(enumNode);
    expect(proven).toBe(true);
    expect(['RED', 'GREEN', 'BLUE']).not.toContain(value);
  });
});

describe('fuzz / collectMutationTargets', () => {
  it('finds every required object property as a target', () => {
    const schema = obj(prop('a', str()), prop('b', num()));
    const targets = collectMutationTargets(schema, {a: 'hello', b: 7});
    const paths = targets.map((t) => t.path.join('.'));
    expect(paths.sort()).toEqual(['a', 'b']);
  });

  it('descends into array elements present in the value', () => {
    const schema = obj(prop('list', arr(str())));
    const targets = collectMutationTargets(schema, {list: ['a', 'b']});
    const paths = targets.map((t) => t.path.join('.')).sort();
    expect(paths).toEqual(['list.0', 'list.1']);
  });

  it('descends into fixed tuple members', () => {
    const schema = tuple(str(), num());
    const targets = collectMutationTargets(schema, ['x', 3]);
    expect(targets.map((t) => t.path.join('.')).sort()).toEqual(['0', '1']);
  });

  it('never targets positions governed by a union (could re-accept)', () => {
    const schema = obj(prop('u', union(str(), num())));
    expect(collectMutationTargets(schema, {u: 'hello'})).toHaveLength(0);
  });

  it('never targets positions governed by any (accepts everything)', () => {
    const schema = obj(prop('x', anyN()));
    expect(collectMutationTargets(schema, {x: 5})).toHaveLength(0);
  });

  it('skips optional properties the mock omitted (undefined slot)', () => {
    const schema = obj(prop('a', str()), prop('b', num(), true));
    const targets = collectMutationTargets(schema, {a: 'hi', b: undefined});
    expect(targets.map((t) => t.path.join('.'))).toEqual(['a']);
  });
});

describe('fuzz / mutateToInvalid', () => {
  it('corrupts exactly one position and leaves the original untouched', () => {
    const schema = obj(prop('a', str()), prop('b', num()));
    const original = {a: 'hello', b: 7};
    const result = mutateToInvalid(schema, original, mulberry(1));
    expect(result).not.toBeNull();
    expect(original).toEqual({a: 'hello', b: 7}); // immutability
    const mutated = result!.value as Record<string, unknown>;
    const path = result!.target.path[0] as 'a' | 'b';
    // the corrupted field now holds a wrong-typed value
    if (path === 'a') expect(typeof mutated.a).not.toBe('string');
    if (path === 'b') expect(typeof mutated.b).not.toBe('number');
  });

  it('falls back to whole-value replacement when no deep target exists', () => {
    // object whose only property is `any` → no descendable target, but the
    // root objectLiteral itself is provably invalidatable (replace with 42).
    const schema = obj(prop('x', anyN()));
    const result = mutateToInvalid(schema, {x: 5}, mulberry(2));
    expect(result).not.toBeNull();
    expect(result!.target.path).toEqual([]);
    expect(typeof result!.value).not.toBe('object');
  });

  it('returns null when invalidity cannot be proven (any root)', () => {
    expect(mutateToInvalid(anyN(), 'anything', mulberry(3))).toBeNull();
  });

  it('returns null for an unconstrained union root', () => {
    expect(mutateToInvalid(union(str(), num()), 'hello', mulberry(4))).toBeNull();
  });
});

describe('fuzz / applyMutation', () => {
  it('deep-clones the spine without mutating the input', () => {
    const original = {outer: {inner: ['a', 'b']}};
    const mutated = applyMutation(original, ['outer', 'inner', 1], 999) as typeof original;
    expect(original.outer.inner[1]).toBe('b');
    expect(mutated.outer.inner[1]).toBe(999);
    expect(mutated.outer).not.toBe(original.outer); // spine cloned
  });

  it('replaces the whole value for an empty path', () => {
    expect(applyMutation({a: 1}, [], 42)).toBe(42);
  });
});

// local deterministic RNG so target selection is reproducible in tests
function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
