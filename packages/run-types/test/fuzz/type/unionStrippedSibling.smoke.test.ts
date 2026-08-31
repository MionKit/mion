// G3 / G4 regression: a discriminated union whose members share a property
// NAME where one member's version is DataOnly-stripped (symbol / Promise /
// non-serialisable native) and another's survives. The flat-union merge
// collapses the prop to its surviving candidate, but a value belonging to the
// STRIPPED member still carries the key at runtime — so the encode must guard
// the surviving codec and DROP the key, not mis-apply the codec to a foreign
// value.
//
//   - G4 (single surviving candidate): `{kind:'t1'; f2: Date} | {kind:'t2';
//     f2: Uint8Array}`. A t2 value's `f2` is a Uint8Array; the Date codec used
//     to run `f2.toISOString()` on it and crash.
//   - G3 (multi surviving candidate): `{kind:'t0'; f0?: null} | {kind:'t1';
//     f0: Promise<string>} | {kind:'t2'; f0: Set<number>}`. A t1 value's `f0`
//     is a Promise; binary set the optional-prop bitmap bit while writing no
//     bytes, desyncing the decoder ("invalid union index" / DataView overrun).
//
// Both shapes are valid TypeScript (typechecked below) — the bug is value-
// level (the mock builds a value carrying the stripped member's prop), which
// the TS-validity gate does not catch, so these are real findings.
import {describe, it, expect} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
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

describe('flat-union merged prop with a DataOnly-stripped sibling', () => {
  (hasBinary() ? it : it.skip)('G4: drops a foreign-typed sibling instead of mis-applying the Date codec', () => {
    expect(typecheckGeneratedType(g4), 'g4 must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, g4)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
        // A t2 value carries f2 as a Uint8Array (the stripped member's type).
        const t2 = {kind: 't2', f2: new Uint8Array([1, 2, 3])};
        expect(jsonDecode!(jsonEncode!(t2)!)).toEqual({kind: 't2'});
        expect(binaryDecode!(binaryEncode!(t2))).toEqual({kind: 't2'});
        // A t1 value's real Date still round-trips.
        const t1 = {kind: 't1', f2: new Date(1000)};
        expect(jsonDecode!(jsonEncode!(t1)!)).toEqual(t1);
        expect(binaryDecode!(binaryEncode!(t1))).toEqual(t1);
      })
      .finally(() => client.close());
  });

  (hasBinary() ? it : it.skip)('G3: binary drops a Promise sibling instead of desyncing the decoder', () => {
    expect(typecheckGeneratedType(g3), 'g3 must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, g3)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
        // A t1 value carries f0 as a Promise (the stripped member's type).
        const t1 = {kind: 't1', f0: Promise.resolve('x')};
        expect(jsonDecode!(jsonEncode!(t1)!)).toEqual({kind: 't1'});
        expect(binaryDecode!(binaryEncode!(t1))).toEqual({kind: 't1'});
        // A t2 value's real Set still round-trips on both wires (restored as a Set).
        const t2 = {kind: 't2', f0: new Set([1, 2, 3])};
        expect(jsonDecode!(jsonEncode!(t2)!)).toEqual({kind: 't2', f0: new Set([1, 2, 3])});
        expect(binaryDecode!(binaryEncode!(t2))).toEqual({kind: 't2', f0: new Set([1, 2, 3])});
      })
      .finally(() => client.close());
  });
});
