// `Not<F>` end-to-end: the resolver lifts the `__rtNot` sentinel into a
// negation node, the generated validator checks `base && !(child)`, ids fold
// the child under a `!{…}` tag, and the mock walker rejection-samples into
// the complement. Marker rule: every behaviour is pinned through BOTH
// `getRunTypeId` call shapes, with one explicit hash-equivalence pair.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, createGetValidationErrorsFn, getRunTypeId} from '@ts-runtypes/core';
import type {Email, Integer, UUIDv4, Not} from '@ts-runtypes/core/formats';
import * as TF from '@ts-runtypes/core/formats';
import * as RT from '@ts-runtypes/core/builders';

describe('Not<F> — format negation', () => {
  it('validates the complement of a named format (static form)', () => {
    const isNotEmail = createValidateFn<Not<Email>>();
    expect(isNotEmail('plain text, no address here')).toBe(true);
    expect(isNotEmail('')).toBe(true);
    expect(isNotEmail('ada@example.com')).toBe(false);
    // Still string-scoped: non-strings are rejected by the base check.
    expect(isNotEmail(42)).toBe(false);
    expect(isNotEmail(null)).toBe(false);
    expect(isNotEmail(undefined)).toBe(false);
  });

  it('validates the complement of a param format (reflection form)', () => {
    const sample = 1.5 as Not<Integer>;
    void sample; // the reflected value drives the id below
    const isNotInteger = createValidateFn<Not<Integer>>();
    expect(isNotInteger(1.5)).toBe(true);
    expect(isNotInteger(-0.25)).toBe(true);
    expect(isNotInteger(3)).toBe(false);
    expect(isNotInteger('3.5')).toBe(false);
    expect(isNotInteger(NaN)).toBe(false);
  });

  it('resolves the same id through both getRunTypeId call shapes', () => {
    const value = 'not an email' as Not<Email>;
    const staticId = getRunTypeId<Not<Email>>();
    const reflectedId = getRunTypeId(value);
    expect(staticId).toBe(reflectedId);
  });

  it('hashes apart from the un-negated format and the bare base', () => {
    expect(getRunTypeId<Not<Email>>()).not.toBe(getRunTypeId<Email>());
    expect(getRunTypeId<Not<Email>>()).not.toBe(getRunTypeId<string>());
    expect(getRunTypeId<Not<Integer>>()).not.toBe(getRunTypeId<Integer>());
  });

  it('value-first RT.not converges on the type-first factory', () => {
    const fromBuilder = createValidateFn(RT.not(TF.email()));
    const fromType = createValidateFn<Not<Email>>();
    expect(fromBuilder).toBe(fromType);
  });

  it('negates a same-base union of formats (¬(A ∨ B) = ¬A ∧ ¬B)', () => {
    const neither = createValidateFn<Not<Email | UUIDv4>>();
    expect(neither('just words')).toBe(true);
    expect(neither('ada@example.com')).toBe(false);
    expect(neither('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(false);
    expect(neither(7)).toBe(false);
  });

  it('mocks into the complement — validate(mock()) holds', () => {
    const mockNotEmail = createMockDataFn<Not<Email>>();
    const isNotEmail = createValidateFn<Not<Email>>();
    const mockNotInteger = createMockDataFn<Not<Integer>>();
    const isNotInteger = createValidateFn<Not<Integer>>();
    for (let i = 0; i < 24; i++) {
      expect(isNotEmail(mockNotEmail())).toBe(true);
      expect(isNotInteger(mockNotInteger())).toBe(true);
    }
  });

  it('reports one canonical not error when the negated format matches', () => {
    const errorsFor = createGetValidationErrorsFn<Not<Email>>();
    const clean = errorsFor('not an address');
    expect(clean).toEqual([]);
    const failing = errorsFor('ada@example.com');
    expect(failing.length).toBe(1);
    expect((failing[0] as {format?: {name?: string}}).format?.name).toBe('not');
    // The base error still wins for type mismatches.
    const wrongKind = errorsFor(42 as unknown as string);
    expect(wrongKind.length).toBe(1);
    expect((wrongKind[0] as {format?: {name?: string}}).format?.name).not.toBe('not');
  });
});

// ── Misuse contract (typecheck-time, enforced by `pnpm run lint`) ──────────
// Negation is format-only and must error AT the write site. The pins go
// through non-marker mirrors of the real constraint (same formula as
// `Not` / `TF.not`), so no marker call site exists on an error line.
import type {NotableFormat, ValidNotOperand} from '@ts-runtypes/core/formats';
import type {RunType} from '@ts-runtypes/core';

type AcceptsNot<F extends NotableFormat & ValidNotOperand<F>> = F;
declare function notBuilderPin<F extends NotableFormat & ValidNotOperand<F>>(format: RunType<F>): void;
declare const plainStringSchema: RunType<string>;
declare const objectSchema: RunType<{a: number; c: string}>;

// Valid spellings stay valid (transparency controls for the pins below).
type OkNamed = AcceptsNot<Email>;
type OkUnion = AcceptsNot<Email | UUIDv4>;

// @ts-expect-error — a bare primitive carries no format to negate
type PinBareString = AcceptsNot<string>;
// @ts-expect-error — bare number, same
type PinBareNumber = AcceptsNot<number>;
// @ts-expect-error — structural types cannot be negated (TS cannot reflect it)
type PinObject = AcceptsNot<{a: number; c: string}>;
// @ts-expect-error — mixed-base unions are unsound to negate
type PinMixedUnion = AcceptsNot<Email | Integer>;
// @ts-expect-error — no double negation; unwrap by hand
type PinDoubleNot = AcceptsNot<Not<Email>>;

function _builderMisusePins(): void {
  // @ts-expect-error — RT.not over a plain (format-less) builder
  notBuilderPin(plainStringSchema);
  // @ts-expect-error — RT.not over a structural schema
  notBuilderPin(objectSchema);
}
void _builderMisusePins;
export type {OkNamed, OkUnion, PinBareString, PinBareNumber, PinObject, PinMixedUnion, PinDoubleNot};
