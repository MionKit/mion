// Pins the dictionary's shape: every entry has a kind, a class and a payload
// builder that runs; every vulnerability class has at least one entry; the
// wrong-type matrix covers every kind; and the own-key helper really yields an
// own `__proto__` that survives a JSON round trip.

import {describe, expect, it} from 'vitest';
import {
  ATTACK_DICTIONARY,
  ATTACK_CLASSES,
  attacksFor,
  wrongTypeEntries,
  expectWrongType,
  defineOwn,
  isEnvelope,
  WRONG_TYPE_SAMPLES,
  type AttackKind,
} from './attackDictionary.ts';

const KINDS: AttackKind[] = [
  'string',
  'number',
  'bigint',
  'boolean',
  'date',
  'regexp',
  'literal',
  'enum',
  'union',
  'array',
  'tuple',
  'object',
  'record',
  'map',
  'set',
  'any',
  'optional',
  'format-string',
  'format-number',
  'temporal',
];

describe('the vulnerability dictionary', () => {
  it('has unique ids and a payload builder that runs for every entry', () => {
    const ids = new Set<string>();
    for (const entry of ATTACK_DICTIONARY) {
      expect(ids.has(entry.id), `duplicate id ${entry.id}`).toBe(false);
      ids.add(entry.id);
      expect(entry.json, `${entry.id} has no json payload`).toBeDefined();
      // Must not throw for any node shape.
      for (const node of [undefined, 1, 'x', [0, 'v'], {kind: 'a', payload: 1}, [1, 2, 3]]) {
        entry.json!({rng: () => 0.5, node, members: 3, literal: 'lit', enumValues: [0, 1]});
      }
    }
  });

  it('covers every vulnerability class', () => {
    for (const cls of ATTACK_CLASSES) {
      const covered =
        ATTACK_DICTIONARY.some((entry) => entry.class === cls) || wrongTypeEntries('string').some((entry) => entry.class === cls);
      expect(covered, `no entry for class ${cls}`).toBe(true);
    }
  });

  it('has listed attacks for every kind the position walker can yield', () => {
    for (const kind of KINDS)
      expect(attacksFor(kind).length, `no attacks for ${kind}`).toBeGreaterThan(Object.keys(WRONG_TYPE_SAMPLES).length);
  });

  it('the wrong-type matrix tries every sample kind at every position', () => {
    for (const kind of KINDS) {
      const entries = wrongTypeEntries(kind);
      expect(entries.map((entry) => entry.id.split('.').pop())).toEqual(Object.keys(WRONG_TYPE_SAMPLES));
    }
  });

  it('the wrong-type expectations are conservative where a decoder coerces', () => {
    expect(expectWrongType('number', 'string')).toBe('reject');
    expect(expectWrongType('string', 'number')).toBe('reject');
    expect(expectWrongType('boolean', 'number')).toBe('reject');
    expect(expectWrongType('date', 'number')).toBe('reject'); // only the ISO string form is restored
    expect(expectWrongType('date', 'dateString')).toBe('any');
    expect(expectWrongType('date', 'string')).toBe('reject'); // 'wrong' → Invalid Date
    expect(expectWrongType('bigint', 'boolean')).toBe('reject'); // only the decimal string form is restored
    expect(expectWrongType('bigint', 'undefined')).toBe('any'); // a dropped key, legal for an optional slot
    expect(expectWrongType('union', 'string')).toBe('any');
    expect(expectWrongType('any', 'array')).toBe('any');
  });

  it('union entries build envelopes and bare values from the current node', () => {
    const byId = new Map(ATTACK_DICTIONARY.map((entry) => [entry.id, entry]));
    const ctx = {rng: () => 0.5, node: [1, {kind: 'k1', payload: 'p'}], members: 3};
    expect(byId.get('union.index-outside')!.json!(ctx)).toEqual([3, {kind: 'k1', payload: 'p'}]);
    expect(byId.get('union.index-string-true')!.json!(ctx)).toEqual(['true', {kind: 'k1', payload: 'p'}]);
    expect(byId.get('union.bare-value')!.json!(ctx)).toEqual({kind: 'k1', payload: 'p'});
    expect(byId.get('union.envelope-short')!.json!(ctx)).toEqual([1]);
    expect(byId.get('union.other-arm-payload')!.json!(ctx)).toEqual([2, {kind: 'k1', payload: 'p'}]);
    expect(byId.get('union.discriminant-missing')!.json!(ctx)).toEqual([1, {payload: 'p'}]);
    expect(byId.get('union.discriminant-array')!.json!(ctx)).toEqual([1, {kind: ['k1'], payload: 'p'}]);
  });

  it('isEnvelope recognises the flat-union wire and nothing else', () => {
    expect(isEnvelope([0, 'v'])).toBe(true);
    expect(isEnvelope([-1, {}])).toBe(true);
    expect(isEnvelope([1.5, 'v'])).toBe(false);
    expect(isEnvelope(['0', 'v'])).toBe(false);
    expect(isEnvelope([0])).toBe(false);
    expect(isEnvelope({0: 0, 1: 'v'})).toBe(false);
  });

  it('defineOwn yields an own __proto__ key that survives a JSON round trip', () => {
    const obj = defineOwn({a: 1}, '__proto__', {polluted: true});
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
    expect(Object.keys(obj)).toEqual(['a', '__proto__']);
    const text = JSON.stringify(obj);
    expect(text).toBe('{"a":1,"__proto__":{"polluted":true}}');
    const back = JSON.parse(text) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(back, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype);
    expect((back as {polluted?: unknown}).polluted).toBeUndefined();
  });

  it('the proto-key object attack keeps the original props beside the own key', () => {
    const entry = ATTACK_DICTIONARY.find((candidate) => candidate.id === 'object.proto-key')!;
    const out = entry.json!({rng: () => 0, node: {a: 1, b: 'x'}}) as Record<string, unknown>;
    expect(JSON.stringify(out)).toBe('{"a":1,"b":"x","__proto__":{"polluted":true}}');
  });
});
