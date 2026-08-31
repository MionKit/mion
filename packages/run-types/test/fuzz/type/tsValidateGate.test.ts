// Proves the runner's TS-validity gate (fuzzOneType → isValidTypeScript) makes
// the right call on a GENERATED type, including the residual invalid shape the
// generator's render can't avoid: a numeric weird-key (`'9'`) under the number
// index it emits for mixed objects. The gate drops violations on such types so
// the lane only reports real bugs on valid TypeScript.
import {describe, it, expect} from 'vitest';
import {isValidTypeScript, typecheckGeneratedType} from './tsValidate.ts';
import type {GeneratedType, TypeShape} from '../core/typeGen.ts';

function mixedObject(propName: string, propShape: TypeShape, indexValue: TypeShape): GeneratedType {
  return {
    decls: [],
    root: {
      kind: 'object',
      props: [{name: propName, optional: false, readonly: false, method: false, shape: propShape}],
      index: indexValue,
      indexKey: ['number'],
    },
  };
}

describe('TS-validity gate on generated types', () => {
  it('keeps a valid mixed object (string-named prop under a number index)', () => {
    // Renders `{p0: string; [k: number]: bigint}` — p0 is string-keyed, so the
    // number index does not constrain it. Valid → the gate keeps any violation.
    const gen = mixedObject('p0', {kind: 'string'}, {kind: 'bigint'});
    expect(typecheckGeneratedType(gen)).toEqual([]);
    expect(isValidTypeScript(gen)).toBe(true);
  });

  it('flags an invalid mixed object (numeric weird-key prop under a number index)', () => {
    // Renders `{'9': string; [k: number]: bigint}` — '9' is a numeric key, so the
    // number index DOES constrain it (string ≠ bigint → TS2411). Invalid → the
    // gate drops the violation as a false positive.
    const gen = mixedObject('9', {kind: 'string'}, {kind: 'bigint'});
    const errors = typecheckGeneratedType(gen);
    expect(errors.length, errors.join(' ')).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain('2411');
    expect(isValidTypeScript(gen)).toBe(false);
  });
});
