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
// ── Measured and REJECTED (do not re-try without new evidence) ───────
//
// Each of these was implemented and measured against this suite. They are
// recorded so the next person does not spend the experiment again.
//
//   ExactParams fast paths. Three cheaper spellings of the excess-key guard
//     (`[Exclude<keyof P, keyof Allowed>] extends [never] ? P : …`, the
//     `keyof P extends keyof Allowed` form, and a mapped-type form). ALL were
//     more expensive than the current `P & Record<Exclude<…>, never>` — the
//     guard costs more to test than the Record it avoids building.
//
//   Two-overload scalar leaves. Folding the brand overload into an optional
//     second parameter saves 21 at the first call site but costs 2 MORE per
//     call after it. A net loss for any file with more than a handful of
//     fields, which is the case that matters.
//
//   Single-scan ObjectType. Three encodings (a marker union via `infer`, a
//     "has any modifier at all" short-circuit probe, and a `keyof M` union)
//     each roughly halved the all-required arm (10 per field to 6-7) and made
//     EVERY modifier profile worse by about 6 per field. Real schemas have
//     optional fields, so the trade is backwards. The existing two-probe
//     dispatch is the best of the four measured.
//
//   Cheaper utility-builder capture. `partial` / `required` / `readonly` /
//     `pick` / `omit` / `nonNullable` each cost a flat ~690 over their inner
//     schema, and it is NOT the utility type: a pass-through wrapper that does
//     nothing costs the same, and the figure does not move with field count.
//     The cost is inferring `T` by unifying the argument against
//     `CompTimeArgs<RunType<T>>`. Capturing the RunType itself with a free `M`
//     and reading it back through `InferType<M>` halves it (690 to 349) and is
//     type-identical, but it stops REJECTING a non-RunType argument, and a
//     conditional return guard only turns the result into `never` instead of
//     erroring at the call site. Both are behaviour changes. `M extends RunType`
//     keeps the rejection and the full cost. `intersection` pays the same cost
//     for the same reason, once per positional member.
//
//   A cheaper child-schema constraint (RunTypeArg). Replacing
//     `<T>(child: CompTimeArgs<RunType<T>>)` with
//     `<M extends {id: string; kind: unknown}>(child: CompTimeArgs<M>)` and reading
//     the type back with `InferType<M>` skips the expensive unification. The
//     constraint is NOT weaker — `id` and `kind` are the only members `RunType`
//     requires, so the two are mutually assignable and reject the same inputs — and
//     the per-case numbers looked decisive: `array(object)` 899 to 569,
//     `partial(object)` 905 to 575, a nested object 361 to 26.
//     It is still a LOSS. The whole-module case above went 1723 to 1861. Two
//     reasons: a leaf child costs a flat ~16 MORE (`array(string())` 73 to 89), and
//     the per-call marginal rose (`partial` 77 to 92, `required` 127 to 148). The
//     headline win only materialises when the call site resolves a brand-new object
//     type, which is an artefact of how the per-case snippets are written — real
//     code names its schemas and passes the name, so the child is already resolved.
//     Applying it to the utility wrappers alone (whose children are always objects)
//     still measured 1736, worse than doing nothing.
//
//   Override as a single mapped type. `{[K in Exclude<keyof Params, Pinned>]?:
//     Params[K]}` instead of `Omit<Partial<Params>, Pinned>` saved 2 per call on
//     an overridden preset but cost 3 on a BARE preset, which is the more common
//     spelling.
//
//   Hand-deduplicating FormattedObject. `ObjectLiteralPart<P>` appears twice in
//     `FormattedObject` (the emptiness probe and the brand payload). Binding it
//     once and passing it to a helper measured NO cheaper, and slightly worse on
//     two shapes: TypeScript already memoises identical instantiations within a
//     check, so a repeated type reference is not a repeated cost.
//
//   Single-pass ObjectParamsType. Collapsing `Flatten<Pick<…> & … & …>` into one
//     mapped pass is dramatically cheaper (18 per call to 4) but DROPS the
//     `readonly` on the `patternProperties` / `propertyNames` slots, so the
//     value-first type stops matching the type-first spelling. A
//     readonly-preserving two-pass variant is type-identical and cheaper on the
//     shapes carrying those slots (30 to 18) but neutral on the literals-only
//     shape, which is the common one.
//
// ── Every body must consume its result ───────────────────────────────
//
// Reading the builder's type back through `InferType` into an annotated const is
// load-bearing. A bare declaration measures nothing: the checker stays lazy and
// the case looks free.

import {describe, it, expect, afterAll} from 'vitest';
import * as ts from 'typescript';
import {measureCall, measureMembers, measureSnippet} from './builderCostHarness.ts';
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
  /** Override the two sample points when the builder changes regime partway —
   *  see `measureMembers`. **/
  low?: number;
  high?: number;
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
  // The optional `transform` key every string-family params bag carries costs a
  // handful of instantiations per preset call (measured +3 to +5), paid once.
  {
    group: 'string-preset',
    label: 'email()',
    fixed: 126,
    marginal: 9,
    mk: (i) => `const s${i} = TF.email(); type S${i} = InferType<typeof s${i}>; const vs${i}: S${i} = 'a@b.c';`,
  },
  {
    group: 'string-preset',
    label: 'email({maxLength})',
    fixed: 284,
    marginal: 46,
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
    fixed: 274,
    marginal: 46,
    mk: (i) => `const s${i} = TF.url({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'ip({allowLocalHost})',
    fixed: 269,
    marginal: 46,
    mk: (i) => `const s${i} = TF.ip({allowLocalHost: ${i % 2 === 0}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'domain({maxLength})',
    fixed: 299,
    marginal: 46,
    mk: (i) => `const s${i} = TF.domain({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'alpha({maxLength})',
    fixed: 358,
    marginal: 49,
    mk: (i) => `const s${i} = TF.alpha({maxLength: ${i + 10}}); type S${i} = InferType<typeof s${i}>;`,
  },
  {
    group: 'string-preset',
    label: 'base64({maxLength})',
    fixed: 361,
    marginal: 49,
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

  // ── Structural params (the `FormattedArray` / `FormattedObject` path) ──
  // Passing a params bag to a container is far more expensive than the bare
  // container: `object` goes from 198 to 715 at the first call site.
  {
    group: 'structural',
    label: 'array(item, {params})',
    fixed: 474,
    marginal: 99,
    mk: (i) => `const a${i} = RT.array(TF.string(), {minItems: ${i}}); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'structural',
    label: 'record(value, {params})',
    fixed: 571,
    marginal: 118,
    mk: (i) => `const a${i} = RT.record(TF.number(), {minProperties: ${i}}); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'structural',
    label: 'object(config, {params})',
    fixed: 715,
    marginal: 194,
    mk: (i) => `const a${i} = RT.object({k: TF.string()}, {minProperties: ${i}}); type A${i} = InferType<typeof a${i}>;`,
  },
  {
    group: 'structural',
    label: 'intersection(a, b)',
    fixed: 954,
    marginal: 123,
    mk: (i) =>
      `const x${i} = RT.intersection(RT.object({a${i}: TF.string()}), RT.object({b: TF.number()})); type X${i} = InferType<typeof x${i}>;`,
  },
  {
    group: 'datetime',
    label: 'temporal.instant({min})',
    fixed: 162,
    marginal: 37,
    mk: (i) => `const t${i} = TFT.instant({min: '2020-01-0${(i % 9) + 1}T00:00:00Z'}); type T${i} = InferType<typeof t${i}>;`,
  },
  {
    group: 'refine',
    label: 'MergeFormat<Email, P>',
    fixed: 211,
    marginal: 21,
    mk: (i) => `type M${i} = TF.MergeFormat<TF.Email, {maxLength: ${i + 10}}>; declare const v${i}: M${i}; const y${i} = v${i};`,
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
    fixed: 140,
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

/** A realistic schema module, measured as ONE total.
 *
 *  This case exists because the per-call cases can LIE by construction. Each of
 *  them wraps a FRESH inner schema, so a builder that gets cheaper at resolving a
 *  brand-new object type looks like a big win. Real code does not author that way:
 *  you name your schemas and pass the name (`RT.partial(User)`), so the child type
 *  is already resolved and the saving never arrives — while any per-call
 *  regression the same change introduced arrives in full.
 *
 *  A rewrite that improves per-call numbers and moves this one UP is a loss. That
 *  is not hypothetical: it is exactly how the RunTypeArg experiment recorded below
 *  was caught, after the per-case numbers said it halved the cost. **/
const WHOLE_MODULE = `
const Address = RT.object({street: TF.string(), city: TF.string(), zip: TF.string({minLength: 4}), country: TF.string()});
const Tag = RT.object({name: TF.string(), slug: TF.string()});
const User = RT.object({
  id: TF.uuid(),
  email: TF.email(),
  name: TF.string({minLength: 1, maxLength: 80}),
  age: RT.optional(TF.number({min: 0})),
  address: Address,
  tags: RT.array(Tag),
  aliases: RT.array(TF.string()),
  meta: RT.optional(RT.record(TF.string())),
});
const UserPatch = RT.partial(User);
type U = InferType<typeof User>; declare const u: U; const x = u;
type P = InferType<typeof UserPatch>; declare const p2: P; const y = p2;
`;

const WHOLE_MODULE_BUDGET = 1723;

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
  // `union` changes regime at 8 members: up to 8 it resolves a fixed-arity
  // overload that brands `A | B | …` directly, past 8 it falls back to
  // `UnionOf<T>`. The two regimes cost differently, so each is sampled INSIDE
  // its own — a slope read across the boundary would measure the one-off cost
  // of crossing it and call that a per-member cost.
  {
    group: 'container-scale',
    label: 'union, N members (arity overloads)',
    base: 66,
    perMember: 26.5,
    low: 2,
    high: 8,
    mk: (n) =>
      `const u = RT.union([${rep(n, (i) => `RT.literal(${i})`)}]); type U = InferType<typeof u>; declare const vu: U; const x = vu;`,
  },
  {
    group: 'container-scale',
    label: 'union, N members (UnionOf fallback)',
    base: 414,
    perMember: 17,
    low: 12,
    high: 20,
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
        const r = measureMembers(c.mk, c.low, c.high);
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

  it('whole schema module, authored the way real code is', () => {
    const r = measureSnippet(WHOLE_MODULE);
    expect(r.errors, `module should type-check cleanly → ${r.errors.join('\n  ')}`).toEqual([]);
    expect(
      r.netInstantiations,
      `whole-module instantiations (${r.netInstantiations}) exceeded budget (${WHOLE_MODULE_BUDGET})`
    ).toBeLessThanOrEqual(WHOLE_MODULE_BUDGET);
  });

  // The report is committed, so a cost change nobody accounted for shows up as a
  // diff in the pull request rather than only in a console line nobody read.
  afterAll(() => {
    if (callRows.length !== CALL_CASES.length || memberRows.length !== MEMBER_CASES.length) return;
    writeBuilderCostReport({typescript: ts.version, calls: callRows, members: memberRows});
  });
});
