// Regression (roundtrip soak, seed 0xd179ff0b / per-type seed 2792797093): a
// union of JSON-compatible object members round-trips raw on the keyed JSON
// strategies (no envelope, identity decode). The compact strategy reused that
// rule while positionalizing every NESTED object, so
// `{kind: 't1', f0: [{"with\"quote": true}]}` came back as `{kind: 't1', f0: [[true]]}`
// on the compact lane only. The quote is incidental: any nested object inside a
// member of such a union broke the same way. Compact now keeps the union
// envelope whenever a member positionalizes something, so all five lanes agree.
import {describe, it, expect} from 'vitest';
import {compileCodecs, openClient, hasBinary, ALL_LANES} from '../roundtrip/roundtripHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, TypeShape, PropShape} from '../core/typeGen.ts';

function lit(value: string): TypeShape {
  return {kind: 'literal', value};
}
function prop(name: string, shape: TypeShape): PropShape {
  return {name, optional: false, readonly: false, method: false, shape};
}
function obj(...props: PropShape[]): TypeShape {
  return {kind: 'object', props};
}
const bool: TypeShape = {kind: 'boolean'};
const tagged = (tag: string, ...props: PropShape[]): TypeShape => obj(prop('kind', lit(tag)), ...props);

const cases: {title: string; root: TypeShape; values: unknown[]}[] = [
  {
    title: 'the soak shape: tuple of a quoted-key object inside a tagged union',
    root: {
      kind: 'union',
      members: [
        tagged('t0'),
        tagged('t1', prop('f0', {kind: 'tuple', elems: [obj(prop('with"quote', bool))]})),
        tagged('t2'),
        tagged('t3'),
      ],
    },
    values: [{kind: 't1', f0: [{'with"quote': true}]}, {kind: 't0'}, {kind: 't3'}],
  },
  {
    title: 'array of objects inside a tagged union',
    root: {kind: 'union', members: [tagged('t0'), tagged('t1', prop('f0', {kind: 'array', elem: obj(prop('a', bool))}))]},
    values: [
      {kind: 't1', f0: [{a: true}, {a: false}]},
      {kind: 't1', f0: []},
    ],
  },
  {
    title: 'nested object inside a tagged union',
    root: {kind: 'union', members: [tagged('t0'), tagged('t1', prop('f0', obj(prop('a', bool))))]},
    values: [{kind: 't1', f0: {a: true}}, {kind: 't0'}],
  },
  {
    title: 'string | object with a nested object',
    root: {kind: 'union', members: [{kind: 'string'}, tagged('t1', prop('f0', obj(prop('a', bool))))]},
    values: [{kind: 't1', f0: {a: true}}, 'plain'],
  },
  {
    title: 'record of objects | tagged object',
    root: {kind: 'union', members: [{kind: 'record', value: obj(prop('a', bool))}, tagged('t1')]},
    values: [{x: {a: true}}, {kind: 't1'}],
  },
  {
    title: 'array of objects | string (no object member at all)',
    root: {kind: 'union', members: [{kind: 'array', elem: obj(prop('a', bool))}, {kind: 'string'}]},
    values: [[{a: true}], 'plain'],
  },
  {
    title: 'same-named prop with two different object types',
    root: {
      kind: 'union',
      members: [tagged('t0', prop('f', obj(prop('a', bool)))), tagged('t1', prop('f', obj(prop('b', {kind: 'number'}))))],
    },
    values: [
      {kind: 't1', f: {b: 2}},
      {kind: 't0', f: {a: false}},
    ],
  },
];

describe('compact strategy: union members holding nested objects', () => {
  for (const {title, root, values} of cases) {
    (hasBinary() ? it : it.skip)(`every lane round-trips and agrees with clone: ${title}`, async () => {
      const gen: GeneratedType = {decls: [], root};
      expect(typecheckGeneratedType(gen), `${title} must be valid TypeScript`).toEqual([]);
      const client = openClient();
      try {
        const compiled = await compileCodecs(client, gen);
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        expect(compiled.errorDiagnostics).toEqual([]);
        for (const value of values) {
          const cloneWire = compiled.codecs.clone!.encode(value);
          for (const lane of ALL_LANES) {
            const codec = compiled.codecs[lane];
            expect(codec, `${lane} codec wired`).toBeDefined();
            const back = codec!.decode(codec!.encode(value));
            expect(back, `${lane} round-trip`).toEqual(value);
            expect(compiled.validate!(back), `${lane} decoded value validates`).toBe(true);
            // Cross-lane agreement: re-encoding the decoded value on the clone
            // lane yields the clone wire of the original.
            expect(compiled.codecs.clone!.encode(back), `${lane} agrees with clone`).toBe(cloneWire);
          }
        }
      } finally {
        client.close();
      }
    });
  }
});
