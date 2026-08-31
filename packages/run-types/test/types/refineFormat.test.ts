// MergeFormat / RefinableParamsOf / FormatBaseOf contract — the type-level
// format-refinement utilities in formats/refineFormat.ts: a refinement MERGES
// into the captured params (and wins on a shared key), the base and family
// never change, only format-carrying types are refinable, and FormatBaseOf
// completes the FormatNameOf/FormatParamsOf introspection trio.
//
// TYPE-LEVEL guarantees: the `Expect<Equal<…>>` aliases below are enforced by
// the `typecheck:test` pass (vitest erases types); the single runtime `it`
// keeps the file in the normal suite.

import {describe, it, expect} from 'vitest';
import type {FormatBaseOf, MergeFormat, RefinableParamsOf, StringParams, NumberParams} from '@mionjs/run-types/formats';
import type {Date as RTDate, Email, Integer, Number as RTNumber, String as Str} from '@mionjs/run-types/formats';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Merge: the refinement is ADDED beside the captured param...
type _merges = Expect<Equal<MergeFormat<Str<{maxLength: 100}>, {minLength: 10}>, Str<{maxLength: 100; minLength: 10}>>>;
// ...and WINS on a shared key.
type _refinementWins = Expect<
  Equal<MergeFormat<RTNumber<{integer: true; min: 0}>, {min: 18}>, RTNumber<{integer: true; min: 18}>>
>;
// Base and family are preserved (a string format can never become a number one).
type _keepsBase = Expect<Equal<FormatBaseOf<MergeFormat<Email, {maxLength: 50}>>, string>>;

// RefinableParamsOf: the family's params for a formatted type, never for a bare primitive.
type _stringRefinable = Expect<Equal<RefinableParamsOf<Str>, Partial<StringParams>>>;
type _numberRefinable = Expect<Equal<RefinableParamsOf<Integer>, Partial<NumberParams>>>;
type _bareNotRefinable = Expect<Equal<RefinableParamsOf<string>, never>>;
type _booleanNotRefinable = Expect<Equal<RefinableParamsOf<boolean>, never>>;

// FormatBaseOf completes the introspection trio.
type _stringBase = Expect<Equal<FormatBaseOf<Email>, string>>;
type _numberBase = Expect<Equal<FormatBaseOf<Integer>, number>>;
type _dateBase = Expect<Equal<FormatBaseOf<RTDate>, Date>>;

export type _RefineFormatPins = [
  _merges,
  _refinementWins,
  _keepsBase,
  _stringRefinable,
  _numberRefinable,
  _bareNotRefinable,
  _booleanNotRefinable,
  _stringBase,
  _numberBase,
  _dateBase,
];

describe('formats/refineFormat type utilities', () => {
  it('type pins above are enforced by typecheck:test; this keeps the file in the suite', () => {
    expect(true).toBe(true);
  });
});
