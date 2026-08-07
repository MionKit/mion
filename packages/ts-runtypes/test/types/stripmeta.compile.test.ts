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
      358
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
      224
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
      // A contains/unevaluated slot rides the array base and strips with it.
      type WithContains = unknown[] & {readonly [__rtContains]?: {readonly rt$child: Email; readonly rt$min: 1}};
      type _06 = Expect<Equal<StripRunTypeMeta<WithContains>, unknown[]>>;
      `,
      1944
    );
  });

  it('objects drop sentinel keys and recurse members, modifiers preserved', () => {
    check(
      BRAND_PREAMBLE +
        `
      type Slotted = {a: Email; readonly b?: Bounded} & {readonly [__rtPropNames]?: Email} & {readonly [__rtNot]?: 'x'};
      type _01 = Expect<Equal<StripRunTypeMeta<Slotted>, {a: string; readonly b?: number}>>;
      type _02 = Expect<Equal<StripRunTypeMeta<{u: {v: Email}}>, {u: {v: string}}>>;
      type RecordSlotted = Record<string, Email> & {readonly [__rtUnevaluated]?: {value: unknown}};
      type _03 = Expect<Equal<StripRunTypeMeta<RecordSlotted>, {[x: string]: string}>>;
      // The oneOf carrier strips off each union arm.
      type Carrier = {a: string} & {readonly [__rtOneOf]?: [unknown, unknown]};
      type _04 = Expect<Equal<StripRunTypeMeta<Carrier | number>, {a: string} | number>>;
      `,
      586
    );
  });

  it('documented residuals keep verbatim: branded literals, branded tuples, functions', () => {
    check(
      BRAND_PREAMBLE +
        `
      type BrandedLit = 'active' & {readonly [__rtFormatName]?: 'stringFormat'};
      type _01 = Expect<Equal<StripRunTypeMeta<BrandedLit>, BrandedLit>>;
      type BrandedTuple = [string, number] & {readonly [__rtFormatName]?: 'formattedArray'};
      type _02 = Expect<Equal<StripRunTypeMeta<BrandedTuple>, BrandedTuple>>;
      type _03 = Expect<Equal<StripRunTypeMeta<() => Email>, () => Email>>;
      type _04 = Expect<Equal<StripRunTypeMeta<Map<string, Email>>, Map<string, Email>>>;
      `,
      730
    );
  });

  it('depth discipline: circular types resolve finitely, floor keeps verbatim', () => {
    check(
      BRAND_PREAMBLE +
        `
      type Node = {value: Email; next?: Node};
      type Stripped = StripRunTypeMeta<Node>;
      type _01 = Expect<Equal<Stripped['value'], string>>;
      type _02 = Expect<Assignable<{value: 'a'; next: {value: 'b'}}, Stripped>>;
      `,
      215
    );
  });
});
