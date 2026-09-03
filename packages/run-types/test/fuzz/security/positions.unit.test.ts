// Pins the position walker over hand-built shapes + JSON trees: every wire
// position is found with the kind that picks its attacks, union envelopes and
// merged bags descend, refs resolve, and positions under a catch-all are
// marked so 'reject' expectations are not applied there.

import {describe, expect, it} from 'vitest';
import type {GeneratedType} from '../core/typeGen.ts';
import {collectPositions} from './positions.ts';
import {dictionaryAttacks, spliceAttack} from './treeMutations.ts';
import {ATTACK_DICTIONARY} from './attackDictionary.ts';

const gen: GeneratedType = {
  decls: [
    {kind: 'enum', name: 'Color', members: [{name: 'Red'}, {name: 'Green', value: 'green'}]},
    {
      kind: 'interface',
      name: 'Node',
      props: [{name: 'id', optional: false, readonly: false, method: false, shape: {kind: 'string'}}],
    },
  ],
  root: {
    kind: 'object',
    props: [
      {name: 'n', optional: false, readonly: false, method: false, shape: {kind: 'number'}},
      {name: 'when', optional: true, readonly: false, method: false, shape: {kind: 'date'}},
      {name: 'missing', optional: true, readonly: false, method: false, shape: {kind: 'string'}},
      {name: 'tags', optional: false, readonly: false, method: false, shape: {kind: 'array', elem: {kind: 'string'}}},
      {
        name: 'pair',
        optional: false,
        readonly: false,
        method: false,
        shape: {kind: 'tuple', elems: [{kind: 'boolean'}, {kind: 'bigint'}]},
      },
      {name: 'dict', optional: false, readonly: false, method: false, shape: {kind: 'record', value: {kind: 'number'}}},
      {
        name: 'lookup',
        optional: false,
        readonly: false,
        method: false,
        shape: {kind: 'map', key: {kind: 'string'}, value: {kind: 'number'}},
      },
      {name: 'color', optional: false, readonly: false, method: false, shape: {kind: 'ref', name: 'Color'}},
      {name: 'node', optional: false, readonly: false, method: false, shape: {kind: 'ref', name: 'Node'}},
      {
        name: 'either',
        optional: false,
        readonly: false,
        method: false,
        shape: {kind: 'union', members: [{kind: 'string'}, {kind: 'number'}]},
      },
      {name: 'mail', optional: false, readonly: false, method: false, shape: {kind: 'format', name: 'email'}},
      {name: 'lit', optional: false, readonly: false, method: false, shape: {kind: 'literal', value: 'on'}},
    ],
  },
};

const tree = {
  n: 1,
  when: '2024-01-01T00:00:00.000Z',
  tags: ['a', 'b'],
  pair: [true, '5'],
  dict: {k0: 1},
  lookup: [['k', 2]],
  color: 'green',
  node: {id: 'x'},
  either: [1, 42],
  mail: 'ada@example.com',
  lit: 'on',
};

describe('collectPositions over the JSON wire', () => {
  const positions = collectPositions(gen, tree);
  const at = (path: string): ReturnType<typeof collectPositions>[number] | undefined =>
    positions.find((p) => p.path.join('.') === path);

  it('finds every leaf with the kind that picks its attacks', () => {
    expect(at('')?.kind).toBe('object');
    expect(at('n')?.kind).toBe('number');
    expect(at('when')?.kind).toBe('date');
    expect(at('tags')?.kind).toBe('array');
    expect(at('tags.1')?.kind).toBe('string');
    expect(at('pair')?.kind).toBe('tuple');
    expect(at('pair.0')?.kind).toBe('boolean');
    expect(at('pair.1')?.kind).toBe('bigint');
    expect(at('dict')?.kind).toBe('record');
    expect(at('dict.k0')?.kind).toBe('number');
    expect(at('lookup')?.kind).toBe('map');
    expect(at('lookup.0.0')?.kind).toBe('string');
    expect(at('lookup.0.1')?.kind).toBe('number');
    expect(at('mail')?.kind).toBe('format-string');
    expect(at('lit')?.kind).toBe('literal');
    expect(at('lit')?.literal).toBe('on');
  });

  it('resolves refs: an enum leaf carries its values, an interface descends', () => {
    expect(at('color')?.kind).toBe('enum');
    expect(at('color')?.enumValues).toEqual([0, 'green']);
    expect(at('node')?.kind).toBe('object');
    expect(at('node.id')?.kind).toBe('string');
  });

  it('marks an absent optional property as an optional slot', () => {
    expect(at('missing')?.kind).toBe('optional');
    expect(at('missing')?.optional).toBe(true);
  });

  it('descends a union envelope and flags the member as under a catch-all', () => {
    expect(at('either')?.kind).toBe('union');
    expect(at('either')?.members).toBe(2);
    expect(at('either.1')?.kind).toBe('number');
    expect(at('either.1')?.underCatchAll).toBe(true);
    expect(at('n')?.underCatchAll).toBe(false);
  });

  it('descends a merged object bag ([-1, {…}]) over every object member', () => {
    const union: GeneratedType = {
      decls: [],
      root: {
        kind: 'union',
        members: [
          {kind: 'object', props: [{name: 'a', optional: false, readonly: false, method: false, shape: {kind: 'string'}}]},
          {kind: 'object', props: [{name: 'b', optional: false, readonly: false, method: false, shape: {kind: 'number'}}]},
        ],
      },
    };
    const found = collectPositions(union, [-1, {a: 'x', b: 1}]);
    expect(found.map((p) => `${p.path.join('.')}:${p.kind}`)).toEqual([':union', '1.a:string', '1.b:number']);
  });

  it('picks the matching member of a bare union by JSON shape', () => {
    // A 2-slot array whose first slot is an integer reads as an envelope, so
    // the bare case needs three items to be unambiguous.
    const union: GeneratedType = {
      decls: [],
      root: {kind: 'union', members: [{kind: 'string'}, {kind: 'array', elem: {kind: 'number'}}]},
    };
    const found = collectPositions(union, [1, 2, 3]);
    expect(found.map((p) => `${p.path.join('.')}:${p.kind}`)).toEqual([':union', ':array', '0:number', '1:number', '2:number']);
    expect(collectPositions(union, 'text').map((p) => `${p.path.join('.')}:${p.kind}`)).toEqual([':union', ':string']);
  });
});

describe('splicing dictionary attacks into the tree', () => {
  const positions = collectPositions(gen, tree);

  it('produces JSON text plus the re-parsed tree, and downgrades expect under a catch-all', () => {
    const number = positions.find((p) => p.path.join('.') === 'n')!;
    const entry = ATTACK_DICTIONARY.find((candidate) => candidate.id === 'number.string')!;
    const attack = spliceAttack(tree, number, entry, () => 0.5)!;
    expect(attack.expect).toBe('reject');
    expect((attack.tree as {n: unknown}).n).toBe('42');
    expect(attack.text).toContain('"n":"42"');
    const underUnion = positions.find((p) => p.path.join('.') === 'either.1')!;
    expect(spliceAttack(tree, underUnion, entry, () => 0.5)!.expect).toBe('any');
  });

  it('keeps an own __proto__ key through the text round trip', () => {
    const root = positions.find((p) => p.path.length === 0)!;
    const attacks = dictionaryAttacks(tree, root, () => 0.5);
    const proto = attacks.find((attack) => attack.id === 'object.proto-key')!;
    expect(proto.text).toContain('"__proto__":{"polluted":true}');
    expect(Object.prototype.hasOwnProperty.call(proto.tree, '__proto__')).toBe(true);
    expect((proto.tree as {polluted?: unknown}).polluted).toBeUndefined();
  });

  it('never touches the original tree', () => {
    const snapshot = JSON.stringify(tree);
    for (const position of positions) dictionaryAttacks(tree, position, () => 0.5);
    expect(JSON.stringify(tree)).toBe(snapshot);
  });
});
