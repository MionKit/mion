// Instantiation-budget test for the value-first BUILDER and FORMAT call sites —
// what a consumer's editor and every `tsc` run pay to type-check a schema.
//
// The existing compile-budget suites here cover the type-level WALKERS (DataOnly,
// StripRunTypeMeta, SubstituteSelf, FriendlyText, MockData). Nothing covered the
// call sites themselves, which is what a consumer actually writes, so a cost
// regression in a builder signature or a format alias could land unnoticed. This
// suite closes that gap across every builder and every format family.
//
// ── Two numbers per case, and why ────────────────────────────────────
//
// See builderCostHarness.ts for the full reasoning. Short version: a single
// call's count is dominated by a ONE-TIME cost the file pays once, so it is the
// wrong thing to optimise. `TF.string({minLength: 5, maxLength: 20})` costs 225
// at the first call site and 29 at every one after it. A real schema file is one
// import and many calls, so `marginal` is the number that scales.
//
//   fixed     net instantiations at the first call site
//   marginal  net instantiations each additional call adds
//
// Containers also get a PER-MEMBER slope, because their cost grows with the
// schema's shape rather than with the number of call sites. `object` is measured
// across all four modifier profiles separately: the profiles have very different
// costs (10 per field all-required vs 52 per field mixed optional+readonly) and a
// change that helps one can regress another. Measuring only one profile is how a
// regression ships looking like a win.
//
// ── Tuning workflow ──────────────────────────────────────────────────
//
// Budgets are the branch's current measurement and may only ever be LOWERED,
// the same one-way ratchet dataonly.compile.test.ts documents. To retune, run
//   pnpm exec vitest run builderCost
// and read the printed table (or `reports/builder-cost.md`, which this suite
// rewrites on every run and which is COMMITTED so a cost change shows up in the
// pull request diff). Raising a budget needs a reviewed reason in the commit
// message, exactly like the drizzle extraConfig case on main.
//
// For a drill-down when a budget trips, `tsc --generateTrace` plus
// `@typescript/analyze-trace` is the tool; this suite stays cheap counters
// (about 3 seconds for all cases).
//
// ── Every body must consume its result ───────────────────────────────
//
// Reading the builder's type back through `InferType` into an annotated const is
// load-bearing. A bare declaration measures nothing: the checker stays lazy and
// the case looks free.

import {describe, it, expect, afterAll} from 'vitest';
import * as ts from 'typescript';
import {measureCall, measureMembers} from './builderCostHarness.ts';
import {writeBuilderCostReport, type CallRow, type MemberRow} from './builderCostReport.ts';

interface CallCase {
  group: string;
  label: string;
  /** Renders call number `i`. Binds a distinct name per `i` and varies a param
   *  value, so repeated calls are not deduplicated into one cached
   *  instantiation. **/
  mk: (i: number) => string;
  fixed: number;
  marginal: number;
}

interface MemberCase {
  group: string;
  label: string;
  /** Renders ONE call holding `count` members. **/
  mk: (count: number) => string;
  base: number;
  perMember: number;
}

const CALL_CASES: CallCase[] = [
  // ── Atomic builders (no format params) ──
  {
    group: 'atomic',
    label: 'boolean()',
    fixed: 30,
    marginal: 9,
    mk: (i) => `const b${i} = RT.boolean(); type B${i} = InferType<typeof b${i}>; const vb${i}: B${i} = true;`,
  },
  {
    group: 'atomic',
    label: 'literal()',
    fixed: 33,
    marginal: 15,
    mk: (i) => `const l${i} = RT.literal(${i}); type L${i} = InferType<typeof l${i}>; const vl${i}: L${i} = ${i};`,
  },
  {
    group: 'atomic',
    label: 'regexp()',
    fixed: 30,
    marginal: 9,
    mk: (i) => `const g${i} = RT.regexp(); type G${i} = InferType<typeof g${i}>; const vg${i}: G${i} = /a/;`,
  },
  {
    group: 'atomic',
    label: 'any()',
    fixed: 30,
    marginal: 9,
    mk: (i) => `const a${i} = RT.any(); type A${i} = InferType<typeof a${i}>; const va${i}: A${i} = 1;`,
  },
  {
    group: 'atomic',
    label: 'unknown()',
    fixed: 18,
    marginal: 9,
    mk: (i) => `const u${i} = RT.unknown(); type U${i} = InferType<typeof u${i}>; const vu${i}: U${i} = 1;`,
  },
  {
    group: 'atomic',
    label: 'voidType()',
    fixed: 30,
    marginal: 9,
    mk: (i) => `const o${i} = RT.void(); type O${i} = InferType<typeof o${i}>; const vo${i}: O${i} = undefined;`,
  },
  {
    group: 'atomic',
    label: 'enumType()',
    fixed: 41,
    marginal: 17,
    mk: (i) =>
      `const e${i} = RT.enum({A${i}: ${i}, B: 'b'} as const); type E${i} = InferType<typeof e${i}>; const ve${i}: E${i} = ${i};`,
  },
  {
    group: 'atomic',
    label: 'classType()',
    fixed: 35,
    marginal: 16,
    mk: (i) =>
      `class C${i} { x = ${i}; }\nconst c${i} = RT.classType(C${i}); type T${i} = InferType<typeof c${i}>; const vc${i}: T${i} = new C${i}();`,
  },

  // ── Scalar leaf builders (the three-overload shape) ──
  {
    group: 'scalar',
    label: 'string()',
    fixed: 30,
    marginal: 9,
    mk: (i) => `const s${i} = TF.string(); type S${i} = InferType<typeof s${i}>; const vs${i}: S${i} = 'x${i}';`,
  },
  {
    group: 'scalar',
    label: 'string({params})',
    fixed: 225,
    marginal: 29,
    mk: (i) =>
      `const s${i} = TF.string({minLength: ${i + 1}, maxLength: 20}); type S${i} = InferType<typeof s${i}>; const vs${i}: S${i} = 'x';`,
  },
  {
    group: 'scalar',
    label: 'string({params}, brand)',
    fixed: 293,
    marginal: 63,
    mk: (i) => `const s${i} = TF.string({minLength: ${i + 1}}, TF.brand('Id${i}')); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'scalar',
    label: 'number()',
    fixed: 30,
    marginal: 9,
    mk: (i) => `const n${i} = TF.number(); type N${i} = InferType<typeof n${i}>; const vn${i}: N${i} = ${i};`,
  },
  {
    group: 'scalar',
    label: 'number({params})',
    fixed: 140,
    marginal: 29,
    mk: (i) => `const n${i} = TF.number({min: ${i}, max: 99}); type N${i} = InferType<typeof n${i}>; const vn${i}: N${i} = ${i};`,
  },
  {
    group: 'scalar',
    label: 'currency({params})',
    fixed: 170,
    marginal: 35,
    mk: (i) => `const n${i} = TF.currency({min: ${i}}); type N${i} = InferType<typeof n${i}>;`,
  },
  {
    group: 'scalar',
    label: 'bigInt({params})',
    fixed: 132,
    marginal: 29,
    mk: (i) => `const g${i} = TF.bigInt({min: ${i}n}); type G${i} = InferType<typeof g${i}>;`,
  },
  {
    group: 'scalar',
    label: 'date({params})',
    fixed: 134,
    marginal: 31,
    mk: (i) => `const d${i} = TF.date({max: 'now'}); type D${i} = InferType<typeof d${i}>; const vd${i}: D${i} = new Date(${i});`,
  },

  // ── String preset formats (PresetFormat / FormatDefaults / Override) ──
  {
    group: 'string-preset',
    label: 'email()',
    fixed: 123,
    marginal: 9,
    mk: (i) => `const s${i} = TF.email(); type S${i} = InferType<typeof s${i}>; const vs${i}: S${i} = 'a@b.c';`,
  },
  {
    group: 'string-preset',
    label: 'email({maxLength})',
    fixed: 340,
    marginal: 52,
    mk: (i) =>
      `const s${i} = TF.email({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>; const vs${i}: S${i} = 'a@b.c';`,
  },
  {
    group: 'string-preset',
    label: 'uuid()',
    fixed: 41,
    marginal: 9,
    mk: (i) => `const s${i} = TF.uuid(); type S${i} = InferType<typeof s${i}>; const vs${i}: S${i} = 'u';`,
  },
  {
    group: 'string-preset',
    label: 'url({maxLength})',
    fixed: 327,
    marginal: 52,
    mk: (i) => `const s${i} = TF.url({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'ip({allowLocalHost})',
    fixed: 322,
    marginal: 52,
    mk: (i) => `const s${i} = TF.ip({allowLocalHost: ${i % 2 === 0}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'domain({maxLength})',
    fixed: 355,
    marginal: 52,
    mk: (i) => `const s${i} = TF.domain({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'alpha({maxLength})',
    fixed: 416,
    marginal: 57,
    mk: (i) => `const s${i} = TF.alpha({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'base64({maxLength})',
    fixed: 419,
    marginal: 57,
    mk: (i) => `const s${i} = TF.base64({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },

  // ── Number / bigint preset formats ──
  {
    group: 'number-preset',
    label: 'integer()',
    fixed: 50,
    marginal: 9,
    mk: (i) => `const n${i} = TF.integer(); type N${i} = InferType<typeof n${i}>; const vn${i}: N${i} = ${i};`,
  },
  {
    group: 'number-preset',
    label: 'positive()',
    fixed: 50,
    marginal: 9,
    mk: (i) => `const n${i} = TF.positive(); type N${i} = InferType<typeof n${i}>; const vn${i}: N${i} = ${i};`,
  },
  {
    group: 'number-preset',
    label: 'int32()',
    fixed: 50,
    marginal: 9,
    mk: (i) => `const n${i} = TF.int32(); type N${i} = InferType<typeof n${i}>; const vn${i}: N${i} = ${i};`,
  },
  {
    group: 'number-preset',
    label: 'bigInt64()',
    fixed: 50,
    marginal: 9,
    mk: (i) => `const n${i} = TF.bigInt64(); type N${i} = InferType<typeof n${i}>;`,
  },

  // ── Datetime string formats ──
  {
    group: 'datetime',
    label: 'stringDate()',
    fixed: 41,
    marginal: 9,
    mk: (i) => `const s${i} = TF.stringDate(); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'datetime',
    label: 'stringDateTime()',
    fixed: 41,
    marginal: 9,
    mk: (i) => `const s${i} = TF.stringDateTime(); type S${i} = InferType<typeof s${i}>;`,
  },

  // ── Container builders, per call site ──
  {
    group: 'container',
    label: 'array(string())',
    fixed: 73,
    marginal: 9,
    mk: (i) => `const a${i} = RT.array(TF.string()); type A${i} = InferType<typeof a${i}>; const va${i}: A${i} = ['x'];`,
  },
  {
    group: 'container',
    label: 'set(string())',
    fixed: 72,
    marginal: 9,
    mk: (i) => `const a${i} = RT.set(TF.string()); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'container',
    label: 'map(string, number)',
    fixed: 106,
    marginal: 9,
    mk: (i) => `const a${i} = RT.map(TF.string(), TF.number()); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'container',
    label: 'promise(string())',
    fixed: 72,
    marginal: 9,
    mk: (i) => `const a${i} = RT.promise(TF.string()); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'container',
    label: 'record(number())',
    fixed: 77,
    marginal: 9,
    mk: (i) => `const a${i} = RT.record(TF.number()); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'container',
    label: 'object({optional(...)})',
    fixed: 261,
    marginal: 91,
    mk: (i) => `const a${i} = RT.object({k${i}: RT.optional(TF.string())}); type A${i} = InferType<typeof a${i}>;`,
  },

  // ── Utility-type builders ──
  {
    group: 'utility',
    label: 'partial(object)',
    fixed: 905,
    marginal: 77,
    mk: (i) => `const p${i} = RT.partial(RT.object({a: TF.string(), b${i}: TF.number()})); type P${i} = InferType<typeof p${i}>;`,
  },
  {
    group: 'utility',
    label: 'required(object)',
    fixed: 966,
    marginal: 127,
    mk: (i) =>
      `const p${i} = RT.required(RT.object({a: RT.optional(TF.string()), b${i}: TF.number()})); type P${i} = InferType<typeof p${i}>;`,
  },
  {
    group: 'utility',
    label: 'readonly(object)',
    fixed: 905,
    marginal: 77,
    mk: (i) =>
      `const p${i} = RT.readonly(RT.object({a: TF.string(), b${i}: TF.number()})); type P${i} = InferType<typeof p${i}>;`,
  },
  {
    group: 'utility',
    label: 'nonNullable(union)',
    fixed: 144,
    marginal: 56,
    mk: (i) =>
      `const p${i} = RT.nonNullable(RT.union([TF.string(), RT.literal(null), RT.literal(${i})])); type P${i} = InferType<typeof p${i}>;`,
  },

  // ── Misc composers ──
  {
    group: 'misc',
    label: 'templateLiteral()',
    fixed: 211,
    marginal: 52,
    mk: (i) => `const t${i} = RT.templateLiteral(['id${i}-', TF.string()]); type T${i} = InferType<typeof t${i}>;`,
  },
  {
    group: 'misc',
    label: 'func()',
    fixed: 122,
    marginal: 45,
    mk: (i) =>
      `const f${i} = RT.func({params: [TF.string(), RT.literal(${i})], ret: TF.string()}); type F${i} = InferType<typeof f${i}>;`,
  },
  {
    group: 'misc',
    label: 'circular(self())',
    fixed: 1359,
    marginal: 331,
    mk: (i) =>
      `const c${i} = RT.circular(RT.object({v: TF.number(), next${i}: RT.optional(RT.self())})); type C${i} = InferType<typeof c${i}>;`,
  },
];

const MEMBER_CASES: MemberCase[] = [
  // The four `ObjectType` modifier profiles. They dispatch to different arms and
  // cost very differently, so each carries its own budget.
  {group: 'object-profile', label: 'all required', base: 242, perMember: 10, mk: (n) => objectCase(n, () => 'TF.string()')},
  {
    group: 'object-profile',
    label: 'half optional',
    base: 426,
    perMember: 23,
    mk: (n) => objectCase(n, (i) => (i % 2 ? 'RT.optional(TF.string())' : 'TF.string()')),
  },
  {
    group: 'object-profile',
    label: 'all optional',
    base: 422,
    perMember: 23,
    mk: (n) => objectCase(n, () => 'RT.optional(TF.string())'),
  },
  {
    group: 'object-profile',
    label: 'readonly only',
    base: 600,
    perMember: 41,
    mk: (n) => objectCase(n, () => 'RT.propMod({readonly: true}, TF.string())'),
  },
  {
    group: 'object-profile',
    label: 'mixed optional + readonly',
    base: 780,
    perMember: 52,
    mk: (n) => objectCase(n, (i) => (i % 2 ? 'RT.optional(TF.string())' : 'RT.propMod({readonly: true}, TF.string())')),
  },

  // Other containers, scaled by member count / nesting depth.
  {
    group: 'container-scale',
    label: 'tuple, N items',
    base: 229,
    perMember: 11,
    mk: (n) =>
      `const t = RT.tuple({required: [${rep(n, () => 'TF.string()')}]}); type T = InferType<typeof t>; declare const vt: T; const x = vt;`,
  },
  {
    group: 'container-scale',
    label: 'union, N members',
    base: 225,
    perMember: 103.375,
    mk: (n) =>
      `const u = RT.union([${rep(n, (i) => `RT.literal(${i})`)}]); type U = InferType<typeof u>; declare const vu: U; const x = vu;`,
  },
  {
    group: 'container-scale',
    label: 'array, N deep',
    base: 373,
    perMember: 9,
    mk: (n) =>
      `const a = ${'RT.array('.repeat(n)}TF.string()${')'.repeat(n)}; type A = InferType<typeof a>; declare const va: A; const x = va;`,
  },
];

function rep(n: number, mk: (i: number) => string): string {
  return Array.from({length: n}, (_, i) => mk(i)).join(', ');
}

function objectCase(n: number, field: (i: number) => string): string {
  const fields = Array.from({length: n}, (_, i) => `k${i}: ${field(i)}`).join(', ');
  return `const o = RT.object({${fields}}); type O = InferType<typeof o>; declare const vo: O; const x = vo;`;
}

const callRows: CallRow[] = [];
const memberRows: MemberRow[] = [];

describe('builder + format call-site instantiation budgets', () => {
  describe('per call site', () => {
    for (const c of CALL_CASES) {
      it(`${c.group}: ${c.label}`, () => {
        const r = measureCall(c.mk);
        expect(r.errors, `case should type-check cleanly:\n${c.mk(0)}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
        callRows.push({
          group: c.group,
          label: c.label,
          fixed: r.fixed,
          fixedBudget: c.fixed,
          marginal: r.marginal,
          marginalBudget: c.marginal,
        });
        expect(r.fixed, `first-call instantiations (${r.fixed}) exceeded budget (${c.fixed}) for ${c.label}`).toBeLessThanOrEqual(
          c.fixed
        );
        expect(
          r.marginal,
          `per-call instantiations (${r.marginal}) exceeded budget (${c.marginal}) for ${c.label}`
        ).toBeLessThanOrEqual(c.marginal);
      });
    }
  });

  describe('per member', () => {
    for (const c of MEMBER_CASES) {
      it(`${c.group}: ${c.label}`, () => {
        const r = measureMembers(c.mk);
        expect(r.errors, `case should type-check cleanly:\n${c.mk(2)}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
        memberRows.push({
          group: c.group,
          label: c.label,
          base: r.base,
          baseBudget: c.base,
          perMember: r.perMember,
          perMemberBudget: c.perMember,
        });
        expect(r.base, `base instantiations (${r.base}) exceeded budget (${c.base}) for ${c.label}`).toBeLessThanOrEqual(c.base);
        expect(
          r.perMember,
          `per-member instantiations (${r.perMember}) exceeded budget (${c.perMember}) for ${c.label}`
        ).toBeLessThanOrEqual(c.perMember);
      });
    }
  });

  // The report is committed, so a cost change nobody accounted for shows up as a
  // diff in the pull request rather than only in a console line nobody read.
  afterAll(() => {
    if (callRows.length !== CALL_CASES.length || memberRows.length !== MEMBER_CASES.length) return;
    writeBuilderCostReport({typescript: ts.version, calls: callRows, members: memberRows});
  });
});
