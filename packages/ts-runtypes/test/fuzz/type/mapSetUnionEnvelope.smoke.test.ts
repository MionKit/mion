// G5 regression: a Map / Set whose VALUE type contains a union of object
// members. A union of objects round-trips its raw VALUES through native JSON,
// but the flat-union encoder always wraps object members in a `[-1, …]`
// envelope (for decode disambiguation). The Map/Set clone-encode fast-path
// (`Array.from(v)`) used `isJsonCompatible`, which reported the union as
// "needs no transform" and skipped the envelope on encode — while the decoder
// still unwrapped it, desyncing the round-trip ("invalid union index" / a
// dropped value). `isJsonCompatible` now reports a union with object members as
// NON-compatible (it envelopes), so the Map/Set value is transformed per-entry.
//
// Minimal shape from the soak: `Set<Map<string, Record<string, {kind:'t0'} |
// {kind:'t1'}>>>`. These are all valid TypeScript and fully serialisable.
import {describe, it, expect} from 'vitest';
import {openClient, compileType, hasBinary} from './typeFuzzHarness.ts';
import {typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, TypeShape} from '../core/typeGen.ts';

function lit(value: string): TypeShape {
  return {kind: 'literal', value};
}
function tagged(tag: string): TypeShape {
  return {kind: 'object', props: [{name: 'kind', optional: false, readonly: false, method: false, shape: lit(tag)}]};
}
const union2: TypeShape = {kind: 'union', members: [tagged('t0'), tagged('t1')]};

const cases: {title: string; root: TypeShape; value: () => unknown; expected: () => unknown}[] = [
  {
    title: 'Map<string, union>',
    root: {kind: 'map', key: {kind: 'string'}, value: union2},
    value: () => new Map([['a', {kind: 't1'}]]),
    expected: () => new Map([['a', {kind: 't1'}]]),
  },
  {
    title: 'Set<union>',
    root: {kind: 'set', elem: union2},
    value: () => new Set([{kind: 't0'}, {kind: 't1'}]),
    expected: () => new Set([{kind: 't0'}, {kind: 't1'}]),
  },
  {
    title: 'Set<Map<string, Record<string, union>>>',
    root: {
      kind: 'set',
      elem: {kind: 'map', key: {kind: 'string'}, value: {kind: 'record', value: union2}},
    },
    value: () => new Set([new Map([['x', {a: {kind: 't1'}, b: {kind: 't0'}}]])]),
    expected: () => new Set([new Map([['x', {a: {kind: 't1'}, b: {kind: 't0'}}]])]),
  },
];

describe('Map/Set value-type containing a union of object members', () => {
  for (const {title, root, value, expected} of cases) {
    (hasBinary() ? it : it.skip)(`round-trips the envelope on both wires: ${title}`, () => {
      const gen: GeneratedType = {decls: [], root};
      expect(typecheckGeneratedType(gen), `${title} must be valid TypeScript`).toEqual([]);
      const client = openClient();
      return compileType(client, gen)
        .then((compiled) => {
          expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
          expect(compiled.evalError, compiled.evalError).toBeUndefined();
          const {jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
          // JSON wire must round-trip (used to throw "invalid union index").
          expect(jsonDecode!(jsonEncode!(value())!)).toEqual(expected());
          // Binary wire must agree (used to drop the value).
          expect(binaryDecode!(binaryEncode!(value()))).toEqual(expected());
          // Cross-wire agreement — the original O12 oracle that flagged it.
          expect(jsonEncode!(binaryDecode!(binaryEncode!(value())))).toBe(jsonEncode!(value()));
        })
        .finally(() => client.close());
    });
  }
});
