// A fractional multipleOf is checked with a tolerance: `19.99 / 0.01` is 1998.9999999999998, so an exact
// Number.isInteger check rejects valid prices. Pins the runtime twin, the child matcher using it, and the
// generated validator over every cent value.
import {describe, it, expect} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';
import {isMultipleOf, DEFAULT_MULTIPLE_OF_TOLERANCE} from '../../../src/mocking/isMultipleOf.ts';
import {childSchemaMatches} from '../../../src/mocking/childMatch.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind} from '../../../src/go-generated/runTypeKind.generated.ts';

const centsNode = (params: Record<string, unknown>) =>
  ({kind: RunTypeKind.number, formatAnnotation: {name: 'numberFormat', params}}) as unknown as RunType;

describe('isMultipleOf', () => {
  it('accepts decimal multiples a float division gets slightly wrong', () => {
    for (const value of [0, 9.99, 19.99, 0.3, -19.99, 1e20]) expect(isMultipleOf(value, 0.01), String(value)).toBe(true);
    expect(isMultipleOf(0.0075, 0.0001)).toBe(true);
  });

  it('rejects values that are not multiples', () => {
    for (const value of [19.995, 0.001, 1e-20, Infinity, NaN]) expect(isMultipleOf(value, 0.01), String(value)).toBe(false);
  });

  it('keeps the exact modulo for a whole step', () => {
    expect(isMultipleOf(15, 5)).toBe(true);
    expect(isMultipleOf(7, 5)).toBe(false);
  });

  it('uses a custom tolerance when given', () => {
    expect(isMultipleOf(19.99000001, 0.01)).toBe(false);
    expect(isMultipleOf(19.99000001, 0.01, 1e-9)).toBe(true);
    expect(DEFAULT_MULTIPLE_OF_TOLERANCE).toBe(4 * Number.EPSILON);
  });
});

describe('childSchemaMatches with a fractional multipleOf', () => {
  it('matches decimal multiples and honours multipleOfTolerance', () => {
    expect(childSchemaMatches(19.99, centsNode({multipleOf: 0.01}))).toBe(true);
    expect(childSchemaMatches(19.995, centsNode({multipleOf: 0.01}))).toBe(false);
    expect(childSchemaMatches(19.99000001, centsNode({multipleOf: 0.01}))).toBe(false);
    expect(childSchemaMatches(19.99000001, centsNode({multipleOf: 0.01, multipleOfTolerance: 1e-9}))).toBe(true);
  });
});

describe('generated validator with multipleOf: 0.01', () => {
  it('accepts every cent value in ±1000.00 and rejects every half cent', () => {
    const isCents = createValidateFn<TF.Number<{multipleOf: 0.01}>>();
    const rejected: number[] = [];
    const accepted: number[] = [];
    for (let cents = -100000; cents <= 100000; cents++) {
      const value = Number((cents / 100).toFixed(2));
      if (!isCents(value)) rejected.push(value);
      const halfCent = Number((cents / 100 + 0.005).toFixed(3));
      if (isCents(halfCent)) accepted.push(halfCent);
    }
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([]);
  });

  it('resolves the same check from a value', () => {
    const price: TF.Number<{multipleOf: 0.01}> = 19.99;
    const isCents = createValidateFn(price);
    expect(isCents(19.99)).toBe(true);
    expect(isCents(0.3)).toBe(true);
    expect(isCents(19.995)).toBe(false);
  });
});
