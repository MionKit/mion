// Per-branch correctness + instantiation-budget test for `StripRunTypeMeta<T>`
// — the annotation-grade projection (sentinels stripped, NEVER reflected).
//
// Each `it` compiles a representative snippet for ONE branch of the walker
// (src/runtypes/stripRunTypeMeta.ts) through the real TypeScript compiler and
// asserts (1) the projection is exactly what we expect and (2) the NET
// instantiation count stays under the branch's budget. Each budget IS the
// branch's current net count — a one-way RATCHET that may only ever be
// lowered; the update protocol is documented in dataonly.compile.test.ts
// (same rules apply here verbatim).
//
// The sentinel shapes below mirror the SHIPPED encodings: the wide brand
// ({[__rtFormatName]?, [__rtFormatParams]?} — TypeFormat and StructuralBrand
// share it), the required nominal brand, and the slot sentinels the door and
// the value-first builders emit.

import {describe, it, expect} from 'vitest';
import {measureStripMeta} from './stripMetaHarness.ts';

function check(snippet: string, budget: number): number {
  const r = measureStripMeta(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // eslint-disable-next-line no-console
  // console.log(`    net=${String(r.netInstantiations).padStart(5)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible StripRunTypeMeta cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

const BRAND_PREAMBLE = `
type Wide<Base, Name extends string, P> = Base & {readonly [__rtFormatName]?: Name; readonly [__rtFormatParams]?: P};
type Email = Wide<string, 'email', {maxLength: 64}>;
type Bounded = Wide<number, 'numberFormat', {min: 0; max: 10}>;
type BigFmt = Wide<bigint, 'bigintFormat', {min: 0n}>;
type StampFmt = Wide<Date, 'nativeDate', {min: '2020-01-01'}>;
type Nominal = string & {readonly [__rtFormatBrand]: 'CustomerId'};
`;

describe('StripRunTypeMeta<T> — per-branch correctness + instantiation budget', () => {
  it('primitives, literals and the broad kinds pass through', () => {
    check(
      `
      type _01 = Expect<Equal<StripRunTypeMeta<string>, string>>;
      type _02 = Expect<Equal<StripRunTypeMeta<number>, number>>;
      type _03 = Expect<Equal<StripRunTypeMeta<'a'>, 'a'>>;
      type _04 = Expect<Equal<StripRunTypeMeta<7>, 7>>;
      type _05 = Expect<Equal<StripRunTypeMeta<true>, true>>;
      type _06 = Expect<Equal<StripRunTypeMeta<null>, null>>;
      type _07 = Expect<Equal<StripRunTypeMeta<unknown>, unknown>>;
      type _08 = Expect<Equal<StripRunTypeMeta<string | number | null>, string | number | null>>;
      `,
      546
    );
  });

  it('wide format brands collapse to their base; nominal brands collapse too', () => {
    check(
      BRAND_PREAMBLE +
        `
      type _01 = Expect<Equal<StripRunTypeMeta<Email>, string>>;
      type _02 = Expect<Equal<StripRunTypeMeta<Bounded>, number>>;
      type _03 = Expect<Equal<StripRunTypeMeta<BigFmt>, bigint>>;
      type _04 = Expect<Equal<StripRunTypeMeta<StampFmt>, Date>>;
      // Mutual assignability with the full type — the wide brand's sentinels
      // are optional, so base and branded type admit the same values.
      type _05 = Expect<Assignable<Email, StripRunTypeMeta<Email>>>;
      type _06 = Expect<Assignable<StripRunTypeMeta<Email>, Email>>;
      // The REQUIRED nominal brand collapses one-way: branded → clean holds,
      // clean → branded does not (that is the point of a nominal brand).
      type _07 = Expect<Equal<StripRunTypeMeta<Nominal>, string>>;
      type _08 = Expect<Assignable<Nominal, StripRunTypeMeta<Nominal>>>;
      type _09 = ExpectFalse<Assignable<StripRunTypeMeta<Nominal>, Nominal>>;
      `,
      265
    );
  });

  it('branded plain arrays recover their element; unbranded array-likes recurse', () => {
    check(
      BRAND_PREAMBLE +
        `
      type Branded = number[] & {readonly [__rtFormatName]?: 'formattedArray'; readonly [__rtFormatParams]?: {minItems: 1}};
      type _01 = Expect<Equal<StripRunTypeMeta<Branded>, number[]>>;
      type _02 = Expect<Equal<StripRunTypeMeta<Email[]>, string[]>>;
      type _03 = Expect<Equal<StripRunTypeMeta<readonly Email[]>, readonly string[]>>;
      type _04 = Expect<Equal<StripRunTypeMeta<[Email, number]>, [string, number]>>;
      type _05 = Expect<Equal<StripRunTypeMeta<[Email?, ...Bounded[]]>, [string?, ...number[]]>>;
      // A contains slot rides the array base and strips with it.
      type WithContains = unknown[] & {readonly [__rtContains]?: {readonly rt$child: Email; readonly rt$min: 1}};
      type _06 = Expect<Equal<StripRunTypeMeta<WithContains>, unknown[]>>;
      `,
      2042
    );
  });

  it('branded TUPLES subtract their brand and keep their slot structure', () => {
    check(
      BRAND_PREAMBLE +
        `
      // The shipped FormattedArray encoding: the literal bounds ride the
      // structural brand, contains rides its own slot. Element inference would
      // collapse the slots, so the tuple path subtracts instead.
      type ArrBrand<P> = {readonly [__rtFormatName]?: 'formattedArray'; readonly [__rtFormatParams]?: P};
      type UniqPair = [boolean?, boolean?] & ArrBrand<{uniqueItems: true}>;
      type _01 = Expect<Equal<StripRunTypeMeta<UniqPair>, [boolean?, boolean?]>>;
      // Elements strip too, which is what proves the recursion was wired and
      // not just the outer subtraction.
      type BrandedElems = [Email, Bounded] & ArrBrand<{minItems: 2}>;
      type _02 = Expect<Equal<StripRunTypeMeta<BrandedElems>, [string, number]>>;
      // Nested one level down.
      type _03 = Expect<Equal<StripRunTypeMeta<{pair: UniqPair}>, {pair: [boolean?, boolean?]}>>;
      // BOUNDARY, unchanged by the subtraction: a VARIADIC branded tuple has a
      // number-typed length, so it takes the plain-array element-inference arm
      // and still flattens. Only fixed-length tuples reach the subtraction.
      // Pinned so the split is deliberate rather than discovered later.
      type WithRest = [Email, ...Bounded[]] & ArrBrand<{minItems: 1}>;
      type _04 = Expect<Equal<StripRunTypeMeta<WithRest>, (string | number)[]>>;
      // Every structural slot subtracts, stacked on one tuple.
      type Stacked = [string, number] &
        ArrBrand<{minItems: 2}> &
        {readonly [__rtContains]?: {readonly rt$child: Email; readonly rt$min: 1}};
      type _05 = Expect<Equal<StripRunTypeMeta<Stacked>, [string, number]>>;
      // A readonly tuple keeps its modifier.
      type RoPair = readonly [Email, Email] & ArrBrand<{minItems: 2}>;
      type _06 = Expect<Equal<StripRunTypeMeta<RoPair>, readonly [string, string]>>;
      // Plain arrays still take the element-inference arm, unchanged.
      type _07 = Expect<Equal<StripRunTypeMeta<number[] & ArrBrand<{minItems: 1}>>, number[]>>;
      `,
      5586
    );
  });

  it('objects drop sentinel keys and recurse members, modifiers preserved', () => {
    check(
      BRAND_PREAMBLE +
        `
      type Slotted = {a: Email; readonly b?: Bounded} & {readonly [__rtPropNames]?: Email};
      type _01 = Expect<Equal<StripRunTypeMeta<Slotted>, {a: string; readonly b?: number}>>;
      type _02 = Expect<Equal<StripRunTypeMeta<{u: {v: Email}}>, {u: {v: string}}>>;
      type RecordSlotted = Record<string, Email> & {readonly [__rtPropNames]?: Email};
      type _03 = Expect<Equal<StripRunTypeMeta<RecordSlotted>, {[x: string]: string}>>;
      `,
      724
    );
  });

  it('residual policy: branded literals and tuples are recovered, branded booleans have their own rule', () => {
    check(
      BRAND_PREAMBLE +
        `
      // A branded string/number literal RECOVERS its bare literal — the brand
      // is subtracted by inference (StripMetaUnbrandLit), not by an operator.
      type BrandedLit = 'active' & {readonly [__rtFormatName]?: 'stringFormat'};
      type _01 = Expect<Equal<StripRunTypeMeta<BrandedLit>, 'active'>>;
      type BrandedNum = 5 & {readonly [__rtFormatName]?: 'numberFormat'};
      type _02 = Expect<Equal<StripRunTypeMeta<BrandedNum>, 5>>;
      // Boolean literals survive their brand — two extends-tests recover them.
      type BrandedTrue = true & {readonly [__rtFormatName]?: 'boolFormat'};
      type _03 = Expect<Equal<StripRunTypeMeta<BrandedTrue>, true>>;
      // Branded TUPLES subtract their brand too (see the dedicated case below).
      type BrandedTuple = [string, number] & {readonly [__rtFormatName]?: 'formattedArray'};
      type _04 = Expect<Equal<StripRunTypeMeta<BrandedTuple>, [string, number]>>;
      type _05 = Expect<Equal<StripRunTypeMeta<() => Email>, () => Email>>;
      type _06 = Expect<Equal<StripRunTypeMeta<Map<string, Email>>, Map<string, Email>>>;
      `,
      2061
    );
  });

  it('brand subtraction: branded literal union arms keep their literals', () => {
    check(
      BRAND_PREAMBLE +
        `
      // A format brand riding literal union arms subtracts per constituent.
      type IfBrand = {readonly [__rtFormatName]?: 'stringFormat'; readonly [__rtFormatParams]?: {maxLength: 4}};
      type Five = ('a' | 'b' | 'c' | 'd' | 'e') & IfBrand;
      type _01 = Expect<Equal<StripRunTypeMeta<Five>, 'a' | 'b' | 'c' | 'd' | 'e'>>;
      // Nested in an object, and across a wider union.
      type _02 = Expect<Equal<StripRunTypeMeta<{a: Five; b: {c: Five}}>, {a: 'a' | 'b' | 'c' | 'd' | 'e'; b: {c: 'a' | 'b' | 'c' | 'd' | 'e'}}>>;
      // Degradation, not regression: a sentinel the residual does not model
      // leaves the arm branded, so it widens exactly as it did before.
      type Unmodelled = 'x' & {readonly [__rtPropNames]?: string};
      type _03 = Expect<Equal<StripRunTypeMeta<Unmodelled>, string>>;
      // WIDE brands still collapse to the base — nothing to recover there.
      type _04 = Expect<Equal<StripRunTypeMeta<Email>, string>>;
      type _05 = Expect<Equal<StripRunTypeMeta<Nominal>, string>>;
      type _06 = Expect<Equal<StripRunTypeMeta<never>, never>>;
      `,
      2152
    );
  });

  it('all-optional objects strip their members too (no weak-type escape)', () => {
    check(
      BRAND_PREAMBLE +
        `
      // 'object extends T' is true of every all-optional object, so a naive
      // broad-object escape kept weak types (and the metadata inside them)
      // verbatim. The keyof probe strips them like any other object.
      type Weak = {alpha?: Bounded; beta?: Email};
      type _01 = Expect<Equal<StripRunTypeMeta<Weak>, {alpha?: number; beta?: string}>>;
      `,
      280
    );
  });

  it('an index signature beside named properties widens so mixed valid data assigns', () => {
    check(
      BRAND_PREAMBLE +
        `
      // The mixed form (properties + schema-valued additionalProperties):
      // TypeScript cannot spell "boolean for every key EXCEPT foo", so the
      // exact index would reject valid data mixing the two value families.
      type Mixed = {foo?: Email; bar?: Email} & Record<string, boolean>;
      type _01 = Expect<Assignable<{foo: 'x'; quux: true}, StripRunTypeMeta<Mixed>>>;
      // An index signature standing ALONE keeps its exact value type.
      type Alone = Record<string, boolean>;
      type _02 = Expect<Equal<StripRunTypeMeta<Alone>, {[x: string]: boolean}>>;
      type _03 = ExpectFalse<Assignable<{k: 'nope'}, StripRunTypeMeta<Alone>>>;
      `,
      620
    );
  });

  it('the any-JSON domain canonicalises to JsonValue; structured unions keep their arms', () => {
    check(
      BRAND_PREAMBLE +
        `
      type RawAny = string | number | boolean | unknown[] | {[key: string]: unknown} | null;
      type _01 = Expect<Equal<StripRunTypeMeta<RawAny>, JsonValue>>;
      // Brand dressing / arm order do not matter — value-equivalence decides.
      type Dressed = Email | number | boolean | {[key: string]: unknown} | unknown[] | null;
      type _02 = Expect<Equal<StripRunTypeMeta<Dressed>, JsonValue>>;
      // A union that is value-equivalent but carries STRUCTURED object arms
      // keeps them — the arms document.
      type Split = string | number | boolean | unknown[] | {bar: string; [key: string]: unknown} | {bar?: undefined; [key: string]: unknown} | null;
      type _03 = ExpectFalse<Equal<StripRunTypeMeta<Split>, JsonValue>>;
      `,
      589
    );
  });

  it('depth discipline: circular types resolve finitely, floor widens to unknown', () => {
    check(
      BRAND_PREAMBLE +
        `
      type Node = {value: Email; next?: Node};
      type Stripped = StripRunTypeMeta<Node>;
      type _01 = Expect<Equal<Stripped['value'], string>>;
      type _02 = Expect<Assignable<{value: 'a'; next: {value: 'b'}}, Stripped>>;
      `,
      258
    );
  });
});
