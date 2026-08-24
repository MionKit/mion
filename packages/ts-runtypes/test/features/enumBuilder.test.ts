// Value-first enum builder — `RT.enum(...)` accepts a TS `enum` OR an enum-like
// record, and carries the value-UNION (`E[keyof E]`). It validates exactly the
// enum's values, but resolves to a UNION (kind union), NOT the named `KindEnum`,
// so it does NOT converge with the type-first `createValidateFn<Enum>()` — by design
// (a value-first builder can't reconstruct the nominal enum's member-name
// metadata; the enum id-integrity cases are flagged `idDivergent`). See the
// builder doc in src/builders/atomic.ts.
//
// `createValidateFn` returns the cached factory for a structural id, so `toBe`
// (reference identity) is a same-id assertion and `not.toBe` is a different-id
// assertion.

import {describe, expect, it} from 'vitest';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

enum Mixed {
  Red,
  Green = 'green',
  Blue = 2,
}

describe('value-first enum builder', () => {
  it('enum-object form validates the enum values (numeric + string members)', () => {
    const isMixed = createValidateFn(RT.enum(Mixed));
    // Numeric members (`Red = 0`, `Blue = 2`) must validate too — regression guard
    // for the numeric-enum-literal value projection (it used to emit the member
    // NAME, so `isMixed(0)` wrongly returned false).
    for (const v of [Mixed.Red, Mixed.Green, Mixed.Blue, 0, 'green', 2]) expect(isMixed(v), `accept ${String(v)}`).toBe(true);
    for (const v of ['Red', 'Green', 1, 3, 4, true, null, {}]) expect(isMixed(v), `reject ${String(v)}`).toBe(false);
  });

  it('enum-like record form validates the same values', () => {
    const isRec = createValidateFn(RT.enum({Red: 0, Green: 'green', Blue: 2}));
    for (const v of [0, 'green', 2]) expect(isRec(v), `accept ${String(v)}`).toBe(true);
    for (const v of [1, 3, 'Red', true, null]) expect(isRec(v), `reject ${String(v)}`).toBe(false);
  });

  it('both forms ARE the value-union — converge with the equivalent literal union', () => {
    const literalUnion = createValidateFn(RT.union([RT.literal(0), RT.literal('green'), RT.literal(2)]));
    // Enum-object and record forms resolve to the SAME cached factory as the
    // hand-written literal union (the numeric-enum-literal value fix makes
    // `Mixed.Red`'s id match plain `0`).
    expect(createValidateFn(RT.enum(Mixed)), 'enum-object form').toBe(literalUnion);
    expect(createValidateFn(RT.enum({Red: 0, Green: 'green', Blue: 2})), 'record form').toBe(literalUnion);
  });

  it('does NOT converge with the type-first KindEnum (idDivergent by design)', () => {
    expect(createValidateFn(RT.enum(Mixed))).not.toBe(createValidateFn<Mixed>());
  });

  it('InferType recovers a type assignment-equivalent to the enum', () => {
    const rtMixed = RT.enum(Mixed);
    type Recovered = InferType<typeof rtMixed>;
    const fromEnum: Recovered = Mixed.Red; // enum value -> recovered type
    const toEnum: Mixed = fromEnum; // recovered type -> enum
    expect([fromEnum, toEnum]).toBeDefined();
  });
});
