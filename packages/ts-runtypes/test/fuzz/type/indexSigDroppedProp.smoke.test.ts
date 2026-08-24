// G6 regression: an object mixing an index signature with a named property
// whose VALUE is DataOnly-stripped (`p0?: ArrayBuffer`). The projection drops
// `p0`, but the clone JSON encoder's index for-in built its "skip declared
// keys" set from the KEPT props only — so the dropped `p0` fell through and was
// copied back into the clone (`{"p0":{}}`), while binary (and the other JSON
// families) dropped it. The two wires disagreed. The skip set is now the full
// declared-name set (kept + dropped), so every family drops `p0`.
import {describe, it, expect} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, TypeShape, PropShape} from '../core/typeGen.ts';

function prop(name: string, shape: TypeShape, optional = false): PropShape {
  return {name, optional, readonly: false, method: false, shape};
}

// `{p0?: ArrayBuffer; p1: boolean; [k: number]: "red"}` — p0 is dropped, p1 and
// the numeric index keys survive. A number index leaves the string-named props
// unconstrained, so the shape is valid TypeScript.
const gen: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [prop('p0', {kind: 'arraybuffer'}, true), prop('p1', {kind: 'boolean'})],
    index: {kind: 'literal', value: 'red'},
    indexKey: ['number'],
  },
};

describe('index signature mixed with a DataOnly-stripped named prop', () => {
  (hasBinary() ? it : it.skip)('every wire drops the stripped prop and agrees', () => {
    expect(typecheckGeneratedType(gen), 'must be valid TypeScript').toEqual([]);
    const client = openClient();
    return compileType(client, gen)
      .then((compiled) => {
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const {jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
        // p0 is an ArrayBuffer (dropped); p1 + numeric index keys survive.
        const value = {p0: new ArrayBuffer(8), p1: true, 0: 'red', 5: 'red'};
        const expected = {p1: true, '0': 'red', '5': 'red'};
        // JSON-clone must drop p0 (it used to keep `"p0":{}`).
        expect(jsonDecode!(jsonEncode!(value)!)).toEqual(expected);
        // Binary already dropped p0 — both wires must now agree.
        expect(binaryDecode!(binaryEncode!(value))).toEqual(expected);
        // Cross-wire agreement — the O12 oracle that flagged it.
        expect(jsonEncode!(binaryDecode!(binaryEncode!(value)))).toBe(jsonEncode!(value));
      })
      .finally(() => client.close());
  });
});
