// F1 regression: binaryEncode used to apply the index-signature value encoder
// to NAMED properties on objects that mix an index signature with named props,
// crashing (`The "src" argument must be of type string`, `reading 'size' of
// undefined`). JSON handled it; the cross-wire rule flagged the divergence.
// These shapes must now round-trip on the binary wire and agree with JSON.
//
// The index uses a NUMBER key (`[k: number]`), the valid form for a mixed
// object: a `[k: string]` index would force every named prop to the index value
// type (TS2411), so a named prop of a different type only compiles under a
// number index (which constrains numeric-keyed props only). The test also
// typechecks each shape so it can't silently drift back to invalid TypeScript.
import {describe, it, expect} from 'vitest';
import {hasBinary, openClient, compileType} from '../type/typeFuzzHarness.ts';
import {typecheckGeneratedType} from '../type/tsValidate.ts';
import type {GeneratedType, TypeShape} from '../core/typeGen.ts';

function prop(name: string, shape: TypeShape, optional = false) {
  return {name, optional, readonly: false, method: false, shape};
}

// `{p0?: Record<string, number>; [k: number]: string}` and
// `{n0?: Set<number>; [k: number]: Map<string, Date>}` — the two soak crashers
// (`indexKey: ['number']` keeps a differently-typed named prop valid).
const cases: {title: string; gen: GeneratedType}[] = [
  {
    title: '{p0?: Record<string, number>; [k: number]: string}',
    gen: {
      decls: [],
      root: {
        kind: 'object',
        props: [prop('p0', {kind: 'record', value: {kind: 'number'}}, true)],
        index: {kind: 'string'},
        indexKey: ['number'],
      },
    },
  },
  {
    title: '{n0?: Set<number>; [k: number]: Map<string, Date>}',
    gen: {
      decls: [],
      root: {
        kind: 'object',
        props: [prop('n0', {kind: 'set', elem: {kind: 'number'}}, true)],
        index: {kind: 'map', key: {kind: 'string'}, value: {kind: 'date'}},
        indexKey: ['number'],
      },
    },
  },
];

describe('F1 — binary index signature + named properties', () => {
  for (const {title, gen} of cases) {
    (hasBinary() ? it : it.skip)(`round-trips and agrees across wires: ${title}`, () => {
      // The shape must be valid TypeScript — otherwise the round-trip below is
      // meaningless (the pipeline's behaviour on invalid input is undefined).
      expect(typecheckGeneratedType(gen), `${title} must be valid TypeScript`).toEqual([]);
      const client = openClient();
      return compileType(client, gen)
        .then((compiled) => {
          expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
          expect(compiled.evalError, compiled.evalError).toBeUndefined();
          const {mock, jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
          expect(
            mock && jsonEncode && jsonDecode && binaryEncode && binaryDecode,
            JSON.stringify(compiled.wireErrors)
          ).toBeTruthy();
          for (let i = 0; i < 25; i++) {
            const value = mock!();
            // Binary must not crash and must round-trip byte-stably.
            const b1 = binaryEncode!(value);
            const b2 = binaryEncode!(binaryDecode!(binaryEncode!(value)));
            expect([...b2], `binary not stable for ${title}`).toEqual([...b1]);
            // JSON and binary must agree on the decoded value.
            const viaJson = jsonEncode!(value);
            const viaBinary = jsonEncode!(binaryDecode!(binaryEncode!(value)));
            expect(viaBinary, `wires disagree for ${title}`).toBe(viaJson);
          }
        })
        .finally(() => client.close());
    });
  }
});
