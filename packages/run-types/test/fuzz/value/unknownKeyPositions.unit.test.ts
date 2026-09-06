// Pins the unknown-key position walker against hand-built runtype graphs: no
// Go binary, no compiled functions. The integration lane proves the emitters
// agree with each other; this proves the walker actually REACHES each position
// they are supposed to agree at, so a green lane is not green because the
// generator never went there.

import {describe, it, expect} from 'vitest';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import {collectUnknownKeyPositions, plantUnknownKey, atPath, pathKey, UNKNOWN_KEY_PREFIX} from './unknownKeyPositions.ts';

// --- tiny RunType builders (mirrors invalidValue.unit.test.ts) ---
let counter = 0;
const node = (kind: number, extra: Record<string, unknown> = {}): RunType =>
  ({id: 'n' + counter++, kind, ...extra}) as unknown as RunType;
const str = (): RunType => node(RunTypeKind.string);
const num = (): RunType => node(RunTypeKind.number);
const prop = (name: string, child: RunType): RunType => node(RunTypeKind.property, {name, child});
const obj = (...props: RunType[]): RunType => node(RunTypeKind.objectLiteral, {children: props});
const indexed = (child: RunType): RunType =>
  node(RunTypeKind.objectLiteral, {children: [node(RunTypeKind.indexSignature, {child})]});
const cls = (...props: RunType[]): RunType => node(RunTypeKind.class, {subKind: RunTypeSubKind.none, children: props});
const arr = (child: RunType): RunType => node(RunTypeKind.array, {child});
const tuple = (...members: RunType[]): RunType =>
  node(RunTypeKind.tuple, {children: members.map((m) => node(RunTypeKind.tupleMember, {child: m}))});
const union = (...children: RunType[]): RunType => node(RunTypeKind.union, {children});
const mapOf = (key: RunType, value: RunType): RunType =>
  node(RunTypeKind.class, {
    subKind: RunTypeSubKind.map,
    arguments: [node(RunTypeKind.parameter, {child: key}), node(RunTypeKind.parameter, {child: value})],
  });
const setOf = (item: RunType): RunType =>
  node(RunTypeKind.class, {subKind: RunTypeSubKind.set, arguments: [node(RunTypeKind.parameter, {child: item})]});

const keys = (runType: RunType, value: unknown): string[] =>
  collectUnknownKeyPositions(runType, value).map((p) => `${pathKey(p.path) || '<root>'}:${p.kind}`);

describe('fuzz / collectUnknownKeyPositions', () => {
  it('finds the root object and every nested property', () => {
    const schema = obj(prop('id', num()), prop('meta', obj(prop('count', num()))));
    expect(keys(schema, {id: 1, meta: {count: 2}})).toEqual(['<root>:flagged', 'meta:flagged']);
  });

  it('finds an array item and a fixed tuple slot', () => {
    expect(keys(arr(obj(prop('n', num()))), [{n: 1}, {n: 2}])).toEqual(['0:flagged', '1:flagged']);
    expect(keys(tuple(str(), obj(prop('n', num()))), ['a', {n: 1}])).toEqual(['1:flagged']);
  });

  it('finds a Map key, a Map value and a Set member, spelled the way unknownKeyErrors spells them', () => {
    const mapSchema = mapOf(obj(prop('k', str())), obj(prop('v', num())));
    const map = new Map([[{k: 'a'}, {v: 1}]]);
    expect(keys(mapSchema, map)).toEqual(['mapKey[0]:flagged', 'mapValue[0]:flagged']);
    expect(keys(setOf(obj(prop('n', num()))), new Set([{n: 1}, {n: 2}]))).toEqual(['setKey[0]:flagged', 'setKey[1]:flagged']);
  });

  it('finds a union member without descending into the arm', () => {
    const schema = union(str(), obj(prop('kind', str()), prop('meows', str())));
    // the union node IS the position; a deeper key could be declared by a sibling arm
    expect(keys(schema, {kind: 'cat', meows: 'yes'})).toEqual(['<root>:flagged']);
    // a matched arm that is not a keyed shape offers nothing
    expect(keys(schema, 'a string')).toEqual([]);
  });

  it('finds a named class the same way it finds an object literal', () => {
    expect(keys(cls(prop('type', str())), {type: 'x'})).toEqual(['<root>:flagged']);
    expect(keys(obj(prop('err', cls(prop('type', str())))), {err: {type: 'x'}})).toEqual(['<root>:flagged', 'err:flagged']);
  });

  it('labels an index-signature object a carve-out and does not walk under it', () => {
    expect(keys(indexed(obj(prop('n', num()))), {a: {n: 1}})).toEqual(['<root>:carveOut']);
    expect(keys(obj(prop('lookup', indexed(num()))), {lookup: {a: 1}})).toEqual(['<root>:flagged', 'lookup:carveOut']);
  });

  it('labels the WHOLE union a carve-out when any member carries an index signature', () => {
    const schema = union(obj(prop('kind', str())), indexed(num()));
    expect(keys(schema, {kind: 'cat'})).toEqual(['<root>:carveOut']);
  });

  it('offers no position for an atomic root or a native instance', () => {
    expect(keys(str(), 'a')).toEqual([]);
    expect(keys(obj(prop('n', num())), new Date())).toEqual([]);
    expect(keys(arr(num()), [1, 2])).toEqual([]);
  });
});

describe('fuzz / plantUnknownKey', () => {
  const rng = (): number => 0.5;

  it('plants one key at the reported path and leaves the input untouched', () => {
    const schema = obj(prop('id', num()), prop('meta', obj(prop('count', num()))));
    const value = {id: 1, meta: {count: 2}};
    const planted = plantUnknownKey(schema, value, rng);
    expect(planted).not.toBeNull();
    expect(planted!.key.startsWith(UNKNOWN_KEY_PREFIX)).toBe(true);
    expect(planted!.kind).toBe('flagged');
    // the reported path resolves to the planted value, and nothing else changed
    expect(atPath(planted!.value, planted!.path)).toBe('fz');
    expect(value).toEqual({id: 1, meta: {count: 2}});
  });

  it('plants inside a Set member and the path resolves back to it', () => {
    const schema = setOf(obj(prop('n', num())));
    const planted = plantUnknownKey(schema, new Set([{n: 1}]), rng);
    expect(planted).not.toBeNull();
    expect(pathKey(planted!.path)).toBe(`setKey[0].${planted!.key}`);
    expect(atPath(planted!.value, planted!.path)).toBe('fz');
  });

  it('returns null when the type offers no position', () => {
    expect(plantUnknownKey(str(), 'a', rng)).toBeNull();
    expect(plantUnknownKey(arr(num()), [1], rng)).toBeNull();
  });
});
