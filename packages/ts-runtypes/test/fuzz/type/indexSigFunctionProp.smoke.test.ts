// G6 regression, function-typed twin of indexSigDroppedProp.smoke.test.ts.
// That test fixed the skip set for a prop whose VALUE is DataOnly-stripped
// (`p0?: ArrayBuffer`), but FUNCTION-typed props were still excluded from the
// set, so their key stayed in the index signature's for-in sweep and the index
// signature's own value encoder ran over the function: binary reached
// serString(undefined) and threw an uncontrolled TypeError, while JSON silently
// serialized the function as its source text. Found by the nondata fuzz soak
// (`{p0: (…) => number; p1: Date; p2: DataView; [k: number]: RegExp}`).
// The skip set is now every declared name, so every family drops `p0`.
import {describe, it, expect} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, TypeShape, PropShape} from '../core/typeGen.ts';

function prop(name: string, shape: TypeShape, optional = false): PropShape {
  return {name, optional, readonly: false, method: false, shape};
}

// `{p0: () => number; p1: boolean; [k: number]: RegExp}` — p0 is dropped, p1 and
// the numeric index keys survive. A number index leaves the string-named props
// unconstrained, so the shape is valid TypeScript.
//
// The index VALUE must be a type whose encoder dereferences the value (RegExp →
// `serString(value.source)`). A literal index value would make this test pass
// with or without the fix: its encoder writes a constant and never touches the
// swept function, so the bug stays invisible.
const gen: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [prop('p0', {kind: 'function', params: [], ret: {kind: 'number'}}), prop('p1', {kind: 'boolean'})],
    index: {kind: 'regexp'},
    indexKey: ['number'],
  },
};

describe('index signature mixed with a function-typed named prop', () => {
  (hasBinary() ? it : it.skip)('every wire drops the function prop and agrees', () => {
    expect(typecheckGeneratedType(gen), 'must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, gen)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
        const value = {p0: () => 1, p1: true, 0: /ab+c/, 5: /[A-Z]\d/};
        const expected = {p1: true, '0': /ab+c/, '5': /[A-Z]\d/};
        // binaryEncode used to throw `Cannot read properties of undefined
        // (reading 'length')` here — the index sig's RegExp/string value encoder
        // running over the function.
        expect(binaryDecode!(binaryEncode!(value))).toEqual(expected);
        // JSON used to emit the function's source text under "p0".
        expect(jsonDecode!(jsonEncode!(value)!)).toEqual(expected);
        // Cross-wire agreement — the O14 oracle that flagged it.
        expect(jsonEncode!(binaryDecode!(binaryEncode!(value)))).toBe(jsonEncode!(value));
      })
      .finally(() => client.close());
  });
});
