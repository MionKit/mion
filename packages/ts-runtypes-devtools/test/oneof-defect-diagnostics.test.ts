// OOF001 — an exclusive union (oneOf) whose exclusivity the engine cannot
// honour is REFUSED at build time rather than approximated.
//
// `OneOf<[A, B]>` checks exclusivity by counting how many branches a value
// matches, and that count decides the whole union. So there is nowhere to put a
// member that is not one of the branches: `OneOf<[A, B]> | C` would never check
// the `| C` arm, and used to reject a perfectly valid `C`. Two carriers in one
// union are worse still — they collapse to a plain union, losing BOTH
// constraints and colliding with `A | B | C | D` on the type id.
//
// The refusal is build-time only, by design: OOF001 is severity Error, so the
// build fails at the call site (the failOnError contract). There is deliberately
// no runtime alwaysThrow backstop.
//
// What is NOT refused matters as much as what is. A `oneOf` written beside
// other KEYWORDS in a JSON Schema (`{anyOf: […], oneOf: […]}`) is untouched —
// the official 2020-12 suite tests that shape ("allOf combined with anyOf,
// oneOf") and it goes through the door's push-in, not this path.
import {describe, expect, it} from 'vitest';
import {Family, Severity, type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function oneOfDefectsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.RunType && d.code === 'OOF001');
}

const ARMS = `import {createValidateFn, type OneOf} from '@ts-runtypes/core';
interface ArmA { a: string }
interface ArmB { b: string }
interface ArmC { c: string }
interface ArmD { d: string }
`;

describe('@ts-runtypes/devtools / OOF001 — exclusive union beside other members', () => {
  const register = hasBinary() ? it : it.skip;

  register('refuses a oneOf sitting beside an ordinary union arm', async () => {
    const sources = {'arm.ts': ARMS + `export const _ = createValidateFn<OneOf<[ArmA, ArmB]> | number>();\n`};
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const diags = oneOfDefectsOf(response);
      expect(diags, JSON.stringify(response.diagnostics, null, 2)).toHaveLength(1);
      expect(diags[0].severity).toBe(Severity.Error);
      expect(diags[0].site.filePath).toContain('arm.ts');
      expect(diags[0].args).toEqual(['an exclusive union (oneOf) beside ordinary union members']);
    });
  });

  register('refuses the nullable spelling — `| null` is an arm, not a branch', async () => {
    // The realistic one. A nullish BRANCH carries no sentinel by construction,
    // so `OneOf<[A, null]>` and `OneOf<[A, B]> | null` look alike at a glance;
    // the branch tuple is what tells them apart.
    const sources = {'nullable.ts': ARMS + `export const _ = createValidateFn<OneOf<[ArmA, ArmB]> | null>();\n`};
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const diags = oneOfDefectsOf(response);
      expect(diags, JSON.stringify(response.diagnostics, null, 2)).toHaveLength(1);
      expect(diags[0].severity).toBe(Severity.Error);
    });
  });

  register('refuses two exclusive unions in one union', async () => {
    const sources = {
      'two.ts': ARMS + `export const _ = createValidateFn<OneOf<[ArmA, ArmB]> | OneOf<[ArmC, ArmD]>>();\n`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const diags = oneOfDefectsOf(response);
      expect(diags, JSON.stringify(response.diagnostics, null, 2)).toHaveLength(1);
      expect(diags[0].args).toEqual(['two exclusive unions (oneOf) in one union']);
    });
  });

  register('accepts every shape where the exclusive union IS the whole union', async () => {
    // Each of these was checked against the detector: a plain oneOf, a NULLISH
    // BRANCH (in the tuple, so covered), a nested oneOf whose inner level is
    // claimed by the outer tuple, and a union-valued branch carrying a nullish
    // member — the last is the shape the official suite's nullable-via-anyOf
    // case uses, and an earlier cut of the detector wrongly flagged it.
    const sources = {
      'ok.ts':
        ARMS +
        `import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
export const _1 = createValidateFn<OneOf<[ArmA, ArmB]>>();
export const _2 = createValidateFn<OneOf<[ArmA, null]>>();
export const _3 = createValidateFn<OneOf<[OneOf<[ArmA, ArmB]>, ArmC]>>();
export const _4 = createValidateFn(
  runTypeFromJsonSchema({
    oneOf: [
      {type: 'object', properties: {a: {type: 'string'}}, required: ['a']},
      {anyOf: [{type: 'object', properties: {b: {type: 'string'}}, required: ['b']}, {type: 'null'}]},
    ],
  } as const)
);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      expect(oneOfDefectsOf(response), 'no shape here is defective').toEqual([]);
    });
  });
});
