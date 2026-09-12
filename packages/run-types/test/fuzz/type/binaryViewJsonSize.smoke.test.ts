// `jsonMaxBytes` bounds the WIRE, so a binary view costs a dropped member and
// nothing more: DataOnly strips typed arrays, ArrayBuffer, SharedArrayBuffer
// and DataView, and the compiled encoder writes nothing for them. Raw
// `JSON.stringify` keeps a typed array as one `"<index>":<number>` pair per
// element, which no bound the type declares could cover, so the json-size fuzz
// lane's stringify oracle drops binary views before measuring (`stringifyWire`).
import {describe, it, expect} from 'vitest';
import {getRunType} from '@mionjs/run-types';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {stringifyWire} from './jsonSizeFuzzRunner.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, TypeShape, PropShape} from '../core/typeGen.ts';

function prop(name: string, shape: TypeShape): PropShape {
  return {name, optional: false, readonly: false, method: false, shape};
}
const typedArray: TypeShape = {kind: 'typedarray', name: 'Uint8Array'};

/** `{p0: Uint8Array; p1: ArrayBuffer; p2: SharedArrayBuffer; p3: DataView}` **/
const allFour: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      prop('p0', typedArray),
      prop('p1', {kind: 'arraybuffer'}),
      prop('p2', {kind: 'sharedarraybuffer'}),
      prop('p3', {kind: 'dataview'}),
    ],
  },
};
/** `[Uint8Array, boolean]` — a dropped tuple slot is `null`, the walk's `nullBytes`. **/
const inTuple: GeneratedType = {decls: [], root: {kind: 'tuple', elems: [typedArray, {kind: 'boolean'}]}};

function utf8(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

describe('jsonMaxBytes of a type carrying a binary view', () => {
  (hasBinary() ? it : it.skip)(
    'bounds the wire, and the stringify oracle agrees',
    async () => {
      expect(typecheckGeneratedType(allFour), 'must be valid TypeScript').toEqual([]);
      expect(typecheckGeneratedType(inTuple), 'must be valid TypeScript').toEqual([]);
      const client = openClient();
      try {
        const compiled = await compileType(client, allFour);
        expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
        expect(compiled.evalError, compiled.evalError).toBeUndefined();
        const bound = getRunType(undefined, compiled.sites.find((site) => !site.fnId)!.id as never).jsonMaxBytes!;
        expect(bound).toBeGreaterThan(0);

        const value = {
          p0: new Uint8Array([1, 2, 3]),
          p1: new ArrayBuffer(8),
          p2: new SharedArrayBuffer(8),
          p3: new DataView(new ArrayBuffer(8)),
        };
        // the encoder drops all four: an empty object on the wire, well under the bound
        expect(compiled.wired.jsonEncode!(value)).toBe('{}');
        // the wire-shaped stringify agrees; the raw one does not, which is the whole point
        expect(utf8(stringifyWire(value))).toBeLessThanOrEqual(bound);
        expect(utf8(JSON.stringify(value))).toBeGreaterThan(bound);
        expect(JSON.stringify(value)).toContain('"0":1');

        const tuple = await compileType(client, inTuple);
        expect(tuple.resolverError, tuple.resolverError).toBeUndefined();
        const tupleBound = getRunType(undefined, tuple.sites.find((site) => !site.fnId)!.id as never).jsonMaxBytes!;
        // `[` + `null` + `,` + `false` + `]`, the walk's own arithmetic
        expect(tupleBound).toBe(2 + 4 + 1 + 5);
        expect(stringifyWire([new Uint8Array([1, 2, 3]), true])).toBe('[null,true]');
        expect(utf8(stringifyWire([new Uint8Array([1, 2, 3]), true]))).toBeLessThanOrEqual(tupleBound);
      } finally {
        client.close();
      }
    },
    180000
  );
});
