// Pins the unknown-key position walker against hand-built runtype graphs: no
// Go binary, no compiled functions. The integration lane proves the emitters
// agree with each other; this proves the walker actually REACHES each position
// they are supposed to agree at, so a green lane is not green because the
// generator never went there.

import {describe, it, expect} from 'vitest';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import {
  collectUnknownKeyPositions,
  containsKeyedShape,
  plantUnknownKey,
  wireKeyAdmitted,
  atPath,
  pathKey,
  UNKNOWN_KEY_PREFIX,
} from './unknownKeyPositions.ts';
import {unreachedKeyedTargets, type FuzzTarget} from './fuzzOracle.ts';

// --- tiny RunType builders (mirrors invalidValue.unit.test.ts) ---
let counter = 0;
const node = (kind: number, extra: Record<string, unknown> = {}): RunType =>
  ({id: 'n' + counter++, kind, ...extra}) as unknown as RunType;
const str = (): RunType => node(RunTypeKind.string);
const num = (): RunType => node(RunTypeKind.number);
const anyType = (): RunType => node(RunTypeKind.any);
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

  it('descends a union through the one member that could have produced the value', () => {
    const schema = union(arr(obj(prop('a', str()))), num());
    expect(keys(schema, [{a: 'x'}])).toEqual(['0:flagged']);
    expect(keys(schema, 5)).toEqual([]);
  });

  it('keeps a carve-out found under the one member, next to the flagged slots beside it', () => {
    // an index signature inside an array or tuple member carves out that object alone: the emitters
    // sweep the member object by object, and only a member that IS an index-signature object makes
    // the whole union answer clean
    expect(keys(union(arr(indexed(num())), num()), [{x: 1}])).toEqual(['0:carveOut']);
    const schema = union(tuple(obj(prop('a', str())), indexed(num())), num());
    expect(keys(schema, [{a: 'x'}, {k: 1}])).toEqual(['0:flagged', '1:carveOut']);
  });

  it('refuses a union where two members share a coarse class, or one member matches anything', () => {
    // two array members: the fused validator follows the branch it matched while the unknown-key
    // families read the merged allowlist, so a deeper key has two honest answers
    expect(keys(union(arr(obj(prop('a', str()))), arr(obj(prop('b', num())))), [{a: 'x'}])).toEqual([]);
    expect(keys(union(arr(obj(prop('a', str()))), anyType()), [{a: 'x'}])).toEqual([]);
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

describe('fuzz / wireKeyAdmitted', () => {
  const planted = UNKNOWN_KEY_PREFIX + 'wire';

  it('admits a key wherever the container declares every key', () => {
    expect(wireKeyAdmitted(union(arr(indexed(num())), num()), [0, planted])).toBe(true);
    expect(wireKeyAdmitted(mapOf(str(), indexed(num())), [{key: 0, failed: 'mapValue'}, planted])).toBe(true);
    expect(wireKeyAdmitted(anyType(), [planted])).toBe(true);
    expect(wireKeyAdmitted(obj(prop('bag', anyType())), ['bag', 'deeper', planted])).toBe(true);
    expect(wireKeyAdmitted(union(obj(prop('kind', str())), indexed(num())), [planted])).toBe(true);
    expect(wireKeyAdmitted(obj(prop('name', str()), prop('bag', indexed(num()))), ['bag', planted])).toBe(true);
  });

  it('refuses a key on a shape that declares its keys by name', () => {
    expect(wireKeyAdmitted(obj(prop('a', str())), [planted])).toBe(false);
    expect(wireKeyAdmitted(arr(obj(prop('a', str()))), [0, planted])).toBe(false);
    expect(wireKeyAdmitted(union(tuple(obj(prop('a', str())), indexed(num())), num()), [0, planted])).toBe(false);
    expect(wireKeyAdmitted(union(tuple(obj(prop('a', str())), indexed(num())), num()), [1, planted])).toBe(true);
    expect(wireKeyAdmitted(obj(prop('name', str()), prop('bag', indexed(num()))), [planted])).toBe(false);
    expect(wireKeyAdmitted(mapOf(obj(prop('k', str())), num()), [{key: 0, failed: 'mapKey'}, planted])).toBe(false);
    expect(wireKeyAdmitted(setOf(obj(prop('n', num()))), [{key: 0, failed: 'setKey'}, planted])).toBe(false);
  });

  it('admits a key inside a union once the wire no longer validates, and nowhere else', () => {
    // a union arm runs only on a value its member validates, so an invalid wire may leave it alone
    const tupleUnion = union(tuple(obj(prop('a', str())), indexed(num())), num());
    expect(wireKeyAdmitted(tupleUnion, [0, planted], true)).toBe(true);
    expect(wireKeyAdmitted(obj(prop('u', union(arr(obj(prop('a', str()))), num()))), ['u', 0, planted], true)).toBe(true);
    expect(wireKeyAdmitted(union(obj(prop('kind', str())), num()), [planted], true)).toBe(true);
    expect(wireKeyAdmitted(obj(prop('name', str()), prop('bag', indexed(num()))), [planted], true)).toBe(false);
    expect(wireKeyAdmitted(arr(obj(prop('a', str()))), [0, planted], true)).toBe(false);
  });
});

describe('fuzz / containsKeyedShape', () => {
  const keyed = obj(prop('a', str()));

  it('sees a keyed shape through an array, a tuple, a union, a Map and a Set', () => {
    expect(containsKeyedShape(arr(keyed))).toBe(true);
    expect(containsKeyedShape(tuple(str(), keyed))).toBe(true);
    expect(containsKeyedShape(union(num(), keyed))).toBe(true);
    expect(containsKeyedShape(mapOf(str(), keyed))).toBe(true);
    expect(containsKeyedShape(setOf(keyed))).toBe(true);
  });

  it('answers false when nothing in the tree declares keys', () => {
    expect(containsKeyedShape(arr(str()))).toBe(false);
  });
});

describe('fuzz / unreachedKeyedTargets (O27)', () => {
  const target = (title: string, schema: RunType): FuzzTarget => ({
    title,
    schema,
    mock: () => null,
    validate: () => true,
    getValidationErrors: () => [],
  });

  it('names a keyed target the walker never planted in, and nothing else', () => {
    const targets = [
      target('keyed', obj(prop('a', str()))),
      target('reached', arr(obj(prop('b', num())))),
      target('atomic', arr(str())),
    ];
    const positionsByTarget = new Map([
      ['reached', 3],
      ['atomic', 0],
    ]);
    expect(unreachedKeyedTargets(targets, positionsByTarget)).toEqual(['keyed']);
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
