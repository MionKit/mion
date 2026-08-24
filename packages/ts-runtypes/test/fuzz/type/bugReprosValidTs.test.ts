// Double-check that every bug the fuzzer found is reachable from VALID
// TypeScript, not an artifact of the generator emitting non-compilable input
// (tsgo is lenient and still produces a RunType for invalid types, so a "bug"
// found on one is a false positive). Each entry is the minimal repro for a fixed
// bug; all must compile clean. The negative control confirms the checker really
// does reject the invalid index-signature form that the gate now filters.
import {describe, it, expect} from 'vitest';
import {typecheckSource} from './tsValidate.ts';

// NOTE on the index-signature repros (F1, G1): they use a NUMBER index. A
// `[k: string]` index would force every named prop to the index value type
// (TS2411); a named prop of a different type only compiles under `[k: number]`,
// which constrains numeric-keyed props only. That is the valid form of the
// "named prop mixed with an index of a different value type" shape.
const VALID_REPROS: Record<string, string> = {
  'F1 binary index-sig + named prop': 'type T = { p0?: Record<string, number>; [k: number]: string };',
  'K2 union object member with a symbol prop': 'type T = Date | { b: symbol };',
  'F2/F2b callable interface (root + propagating)':
    'interface N0 { (a0: DataView): 1; p0?: string }\ntype T = N0;\ntype U = Array<N0>;',
  'F3 symbol-valued property (dropped)': 'type T = { a: symbol; b: number };',
  'F3 Promise-valued property (dropped)': 'type T = { a: Promise<number>; b: number };',
  'F3 typed-array-valued property (dropped)': 'type T = { a: Int8Array; b: number };',
  'F3 symbol[] property (structural, fails)': 'type T = { a: symbol[]; b: number };',
  'G1 number index + differently-typed number prop': 'type T = { p0: number; [k: number]: bigint };',
  'G1 number index + Date metadata prop': 'type T = { name: string; [id: number]: Date };',
};

describe('found-bug repros are valid TypeScript', () => {
  for (const [name, src] of Object.entries(VALID_REPROS)) {
    it(`${name} compiles clean`, () => {
      expect(typecheckSource(src), `${name}: unexpected TS errors`).toEqual([]);
    });
  }

  it('negative control: the invalid [k: string] mixed object is rejected (TS2411)', () => {
    const errs = typecheckSource('type T = { p0: number; [k: string]: bigint };');
    expect(errs.length, 'the checker must flag the invalid form').toBeGreaterThan(0);
    expect(errs.join(' ')).toContain('2411');
  });
});
