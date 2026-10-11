// Negative controls for the typed-emit lane: each rule is broken on purpose and must fire (red = real bug).
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verdictViolation} from './typedEmitFuzz.ts';
import {stripParityViolation, strictestTypeCheck, typeModuleViolation} from '../../../../devtools/test/helpers/typedEmit.ts';

const BOTH = `import {__rt_Eq2V_b} from './Eq2V_b.js';
export const __rt_Eq2V_a=['val',()=>[__rt_Eq2V_b],,'Eq2V_a','A','function Eq2V_a(v){return v === 1}return Eq2V_a',,,,function g_Eq2V_a(utl){function Eq2V_a(v){return v === 1}return Eq2V_a}];
`;
const TYPED = `import type {FnTypeTuple, RTUtils} from '@mionjs/run-types/runtime';
import {__rt_Eq2V_b} from './Eq2V_b.ts';
import type {T_a} from './t/a.ts';
export const __rt_Eq2V_a: any=['val',()=>[__rt_Eq2V_b],undefined,'Eq2V_a','A','function Eq2V_a(v){return v === 1}return Eq2V_a',,,,function g_Eq2V_a(_utl: RTUtils): (v: unknown) => v is T_a{function Eq2V_a(v: any): v is T_a{return v === 1}return Eq2V_a}] satisfies FnTypeTuple;
`;

describe('typed-emit lane rules', () => {
  it('TE1 holds on a typed module and its both twin, and fires on a changed body or code string', () => {
    expect(stripParityViolation('Eq2V_a', TYPED, BOTH)).toBeNull();
    expect(
      stripParityViolation('Eq2V_a', TYPED.replace('{return v === 1}return Eq2V_a}]', '{return v === 2}return Eq2V_a}]'), BOTH)
    ).toMatch(/differs/);
    expect(
      stripParityViolation(
        'Eq2V_a',
        TYPED.replace("'function Eq2V_a(v){return v === 1}", "'function Eq2V_a(v){return v !== 1}"),
        BOTH
      )
    ).toMatch(/differs/);
  });

  it('TE1 holds on a type module and fires on one that would run code', () => {
    expect(typeModuleViolation('t/a', "import type {T_b} from './b.ts';\n/** A */\nexport type T_a = {b: T_b};\n")).toBeNull();
    expect(typeModuleViolation('t/a', 'export type T_a = string;\nexport const leaked = 1;\n')).toMatch(/runtime code/);
  });

  it('TE2 holds on agreeing validators and fires on the first disagreement', () => {
    const trusted = (value: unknown) => value === 1;
    expect(verdictViolation(trusted, trusted, [1, 2, 'x'])).toBeNull();
    expect(verdictViolation(() => true, trusted, [1, 2])).toMatch(/says true, emitMode both says false/);
  });

  it('TE3 passes typed code and fires on an implicit any', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-typed-emit-unit-'));
    try {
      fs.mkdirSync(path.join(dir, 'seed-1'));
      fs.writeFileSync(path.join(dir, 'seed-1', 'ok.ts'), 'export function ok(v: unknown): unknown {\n  return v;\n}\n');
      expect(strictestTypeCheck(dir, ['seed-*/**/*.ts'])).toBe('');
      fs.writeFileSync(path.join(dir, 'seed-1', 'bad.ts'), 'export function bad(v) {\n  return v;\n}\n');
      expect(strictestTypeCheck(dir, ['seed-*/**/*.ts'])).toMatch(/seed-1\/bad\.ts.*error TS7006/);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
