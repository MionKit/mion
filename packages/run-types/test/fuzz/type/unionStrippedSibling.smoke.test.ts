// G3 / G4 regression: when union members share a prop NAME and one member's type is DataOnly-stripped, the merge
// keeps the surviving codec, yet a stripped member's value still carries the key, so encode must DROP it. G4: a t2
// Uint8Array `f2` hit the t1 Date codec's `toISOString()` and crashed. G3: JSON must drop a t1 Promise `f0` and still
// restore a t2 Set. The bug is value-level, so the TS-validity gate cannot catch it.
import {describe, it, expect} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import {checkCrossWire, type FuzzTarget} from '../value/fuzzOracle.ts';
import type {GeneratedType, TypeShape, PropShape} from '../core/typeGen.ts';

function prop(name: string, shape: TypeShape, optional = false): PropShape {
  return {name, optional, readonly: false, method: false, shape};
}
function obj(props: PropShape[]): TypeShape {
  return {kind: 'object', props};
}
function lit(value: string): TypeShape {
  return {kind: 'literal', value};
}

const g4: GeneratedType = {
  decls: [],
  root: {
    kind: 'union',
    members: [
      obj([prop('kind', lit('t1')), prop('f2', {kind: 'date'})]),
      obj([prop('kind', lit('t2')), prop('f2', {kind: 'typedarray', name: 'Uint8Array'})]),
    ],
  },
};

const g3: GeneratedType = {
  decls: [],
  root: {
    kind: 'union',
    members: [
      obj([prop('kind', lit('t0')), prop('f0', {kind: 'null'}, true)]),
      obj([prop('kind', lit('t1')), prop('f0', {kind: 'promise', value: {kind: 'string'}})]),
      obj([prop('kind', lit('t2')), prop('f0', {kind: 'set', elem: {kind: 'number'}})]),
    ],
  },
};

// Nondata soak seed 3065189181: the oracle's value copy flattened the DataView to `{}`, kept by the object `f1` codec.
const o12: GeneratedType = {
  decls: [],
  root: {
    kind: 'array',
    elem: {
      kind: 'union',
      members: [
        obj([prop('kind', lit('t0')), prop('f1', {kind: 'dataview'})]),
        obj([prop('kind', lit('t2')), prop('f1', obj([prop('p0', {kind: 'literal', value: false}, true)]))]),
      ],
    },
  },
};

describe('flat-union merged prop with a DataOnly-stripped sibling', () => {
  (hasBinary() ? it : it.skip)('G4: drops a foreign-typed sibling instead of mis-applying the Date codec', () => {
    expect(typecheckGeneratedType(g4), 'g4 must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, g4)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode, compactEncode, compactDecode} = compiled.wired;
        // A t2 value carries f2 as a Uint8Array (the stripped member's type).
        const t2 = {kind: 't2', f2: new Uint8Array([1, 2, 3])};
        expect(jsonDecode!(jsonEncode!(t2)!)).toEqual({kind: 't2'});
        // The positional compact slot cannot drop the key: it writes the placeholder, which decodes to absent.
        expect(compactDecode!(compactEncode!(t2)!)).toEqual({kind: 't2'});
        // A t1 value's real Date still round-trips.
        const t1 = {kind: 't1', f2: new Date(1000)};
        expect(jsonDecode!(jsonEncode!(t1)!)).toEqual(t1);
      })
      .finally(() => client.close());
  });

  (hasBinary() ? it : it.skip)('G3: JSON drops a Promise sibling and restores the Set', () => {
    expect(typecheckGeneratedType(g3), 'g3 must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, g3)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode} = compiled.wired;
        const t1 = {kind: 't1', f0: Promise.resolve('x')};
        expect(jsonDecode!(jsonEncode!(t1)!)).toEqual({kind: 't1'});
        const t2 = {kind: 't2', f0: new Set([1, 2, 3])};
        expect(jsonDecode!(jsonEncode!(t2)!)).toEqual({kind: 't2', f0: new Set([1, 2, 3])});
      })
      .finally(() => client.close());
  });

  (hasBinary() ? it : it.skip)('O12: both wires drop a DataView sibling of an object member', () => {
    expect(typecheckGeneratedType(o12), 'o12 must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, o12)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode, compactEncode, compactDecode} = compiled.wired;
        const value = [
          {kind: 't0', f1: new DataView(new ArrayBuffer(8))},
          {kind: 't2', f1: {p0: false}},
        ];
        const dropped = [{kind: 't0'}, {kind: 't2', f1: {p0: false}}];
        expect(jsonDecode!(jsonEncode!(value)!)).toEqual(dropped);
        expect(compactDecode!(compactEncode!(value)!)).toEqual(dropped);
        expect(checkCrossWire(compiled.wired as FuzzTarget, value, {seed: 3065189181, phase: 'valid'})).toBeNull();
      })
      .finally(() => client.close());
  });
});
