// multipleOf on number formats: validation, error list, tolerance, integer formats and mocks, over real types.
// The oracle counts whole units of the step's last decimal, never dividing floats: `19.99 / 0.01` is 1998.9999999999998.
import {describe, it, expect} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import * as TFB from '@mionjs/run-types/formats';
import * as RT from '@mionjs/run-types/builders';
import {createValidateFn, createGetValidationErrorsFn, type RTValidationError} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

const DRAWS = 500;

const decimalsOf = (step: number): number => (String(step).split('.')[1] ?? '').length;

// True when `value` is written with at most the step's decimals and is a whole count of steps.
function isExactMultiple(value: unknown, step: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const scale = 10 ** decimalsOf(step);
  const units = Math.round(value * scale);
  return Number((units / scale).toFixed(decimalsOf(step))) === value && units % Math.round(step * scale) === 0;
}

// Every value with one more decimal than the step, from -limit to +limit: multiples and near misses.
function candidates(step: number, limit: number): number[] {
  const digits = decimalsOf(step) + 1;
  const scale = 10 ** digits;
  const values: number[] = [];
  for (let units = -limit * scale; units <= limit * scale; units++) values.push(Number((units / scale).toFixed(digits)));
  return values;
}

function expectMatchesOracle(step: number, limit: number, isValid: (value: unknown) => boolean) {
  const wrong = candidates(step, limit).filter((value) => isValid(value) !== isExactMultiple(value, step));
  expect(wrong, `values the validator got wrong for multipleOf ${step}`).toEqual([]);
}

const multipleOfErrors = (errors: RTValidationError[]) =>
  errors.filter((error) => error.format?.formatPath?.at(-1) === 'multipleOf');
const draw = (mock: () => unknown): unknown[] => Array.from({length: DRAWS}, () => mock());
const notMultiples = (values: unknown[], step: number) => values.filter((value) => !isExactMultiple(value, step));

describe('validate a decimal multipleOf', () => {
  it('0.01: static and value-first validators match the oracle', () => {
    type Cents = TF.Number<{multipleOf: 0.01}>;
    const price: Cents = 19.99;
    expectMatchesOracle(0.01, 200, createValidateFn<Cents>());
    expectMatchesOracle(0.01, 200, createValidateFn(price));
  });

  it('0.1, 0.05, 0.25 and 0.0001 match the oracle', () => {
    expectMatchesOracle(0.1, 2000, createValidateFn<TF.Number<{multipleOf: 0.1}>>());
    expectMatchesOracle(0.05, 200, createValidateFn<TF.Number<{multipleOf: 0.05}>>());
    expectMatchesOracle(0.25, 200, createValidateFn<TF.Number<{multipleOf: 0.25}>>());
    expectMatchesOracle(0.0001, 1, createValidateFn<TF.Number<{multipleOf: 0.0001}>>());
  });

  it('Currency with multipleOf 0.01 matches the oracle', () => {
    type Price = TF.Currency<{min: 0; multipleOf: 0.01}>;
    const price: Price = 9.99;
    const isPrice = createValidateFn<Price>();
    const isPriceFromValue = createValidateFn(price);
    const wrong = candidates(0.01, 200).filter((value) => {
      const expected = value >= 0 && isExactMultiple(value, 0.01);
      return isPrice(value) !== expected || isPriceFromValue(value) !== expected;
    });
    expect(wrong).toEqual([]);
  });

  it('the error list reports multipleOf exactly when validate fails', () => {
    type Cents = TF.Number<{multipleOf: 0.01}>;
    const price: Cents = 19.99;
    for (const getErrors of [createGetValidationErrorsFn<Cents>(), createGetValidationErrorsFn(price)]) {
      expect(getErrors(19.99)).toEqual([]);
      expect(getErrors(0.3)).toEqual([]);
      expect(multipleOfErrors(getErrors(19.995))).toHaveLength(1);
      expect(multipleOfErrors(getErrors(0.001))[0]?.format?.val).toBe(0.01);
    }
  });

  it('multipleOfTolerance widens what counts as a multiple', () => {
    type Loose = TF.Number<{multipleOf: 0.01; multipleOfTolerance: 1e-9}>;
    const loose: Loose = 19.99;
    for (const isLoose of [createValidateFn<Loose>(), createValidateFn(loose)]) {
      expect(isLoose(19.99000001)).toBe(true);
      expect(isLoose(19.995)).toBe(false);
    }
    expect(createValidateFn<TF.Number<{multipleOf: 0.01}>>()(19.99000001)).toBe(false);
    const getErrors = createGetValidationErrorsFn<Loose>();
    expect(getErrors(19.99000001)).toEqual([]);
    expect(multipleOfErrors(getErrors(19.995))).toHaveLength(1);
  });
});

describe('validate a whole multipleOf', () => {
  it('on a plain number, rejects fractions and non-multiples', () => {
    type Fives = TF.Number<{multipleOf: 5}>;
    const five: Fives = 5;
    for (const isFive of [createValidateFn<Fives>(), createValidateFn(five)]) {
      expect([0, 5, -15, 1e20].map(isFive)).toEqual([true, true, true, true]);
      expect([7, 7.5, 2.5].map(isFive)).toEqual([false, false, false]);
    }
  });

  it('on an integer format, reports integer and multipleOf separately', () => {
    type ByteOfFives = TF.Number<{integer: true; min: 0; max: 255; multipleOf: 5}>;
    const five: ByteOfFives = 5;
    for (const isByteOfFives of [createValidateFn<ByteOfFives>(), createValidateFn(five)]) {
      expect([0, 5, 250, 255].map(isByteOfFives)).toEqual([true, true, true, true]);
      expect([7, 2.5, 260].map(isByteOfFives)).toEqual([false, false, false]);
    }
    const getErrors = createGetValidationErrorsFn<ByteOfFives>();
    const tails = (value: number) => getErrors(value).map((error) => error.format?.formatPath?.at(-1));
    expect(tails(7)).toEqual(['multipleOf']);
    expect(tails(2.5)).toEqual(['integer', 'multipleOf']);
  });
});

describe('invalid multipleOf params', () => {
  // Each line is an FMT002 build error; the comment keeps it from halting this run, and an unused one prints DWN001.
  it('an integer format with a fractional step, and a misplaced multipleOfTolerance', () => {
    // @mion-downgrade-error FMT002
    const halfSteps = createValidateFn<TF.Number<{integer: true; multipleOf: 0.5}>>();
    // @mion-downgrade-error FMT002
    const wholeStepTolerance = createValidateFn<TF.Number<{multipleOf: 5; multipleOfTolerance: 1e-9}>>();
    // @mion-downgrade-error FMT002
    const toleranceTooBig = createValidateFn<TF.Number<{multipleOf: 0.01; multipleOfTolerance: 1}>>();
    for (const validate of [halfSteps, wholeStepTolerance, toleranceTooBig]) expect(validate).toBeTypeOf('function');
  });
});

describe('mock a number format with multipleOf', () => {
  it('0.01: static and value-first mocks are whole cents', () => {
    type Cents = TF.Number<{multipleOf: 0.01}>;
    const price: Cents = 19.99;
    const isCents = createValidateFn<Cents>();
    for (const mock of [createMockDataFn<Cents>(), createMockDataFn(price)]) {
      const values = draw(mock);
      expect(notMultiples(values, 0.01)).toEqual([]);
      expect(values.filter((value) => !isCents(value))).toEqual([]);
    }
  });

  it('decimal steps inside bounds stay in bounds', () => {
    type Price = TF.Number<{min: 1; max: 50; multipleOf: 0.05}>;
    const price: Price = 1;
    for (const mock of [createMockDataFn<Price>(), createMockDataFn(price)]) {
      const values = draw(mock);
      expect(notMultiples(values, 0.05)).toEqual([]);
      expect(values.filter((value) => (value as number) < 1 || (value as number) > 50)).toEqual([]);
    }
  });

  it('tiny and quarter steps', () => {
    expect(notMultiples(draw(createMockDataFn<TF.Number<{multipleOf: 0.0001}>>()), 0.0001)).toEqual([]);
    expect(notMultiples(draw(createMockDataFn<TF.Number<{multipleOf: 0.25}>>()), 0.25)).toEqual([]);
  });

  it('a Currency with a decimal step', () => {
    type Price = TF.Currency<{min: 0; multipleOf: 0.01}>;
    const price: Price = 9.99;
    for (const mock of [createMockDataFn<Price>(), createMockDataFn(price)]) {
      const values = draw(mock);
      expect(notMultiples(values, 0.01)).toEqual([]);
      expect(values.filter((value) => (value as number) < 0)).toEqual([]);
    }
  });

  it('multipleOfTolerance does not loosen the mocks', () => {
    type Loose = TF.Number<{multipleOf: 0.01; multipleOfTolerance: 1e-9}>;
    const loose: Loose = 19.99;
    for (const mock of [createMockDataFn<Loose>(), createMockDataFn(loose)]) expect(notMultiples(draw(mock), 0.01)).toEqual([]);
  });

  it('an integer format with a whole step', () => {
    type ByteOfFives = TF.Number<{integer: true; min: 0; max: 255; multipleOf: 5}>;
    const five: ByteOfFives = 5;
    for (const mock of [createMockDataFn<ByteOfFives>(), createMockDataFn(five)]) {
      const values = draw(mock);
      expect(notMultiples(values, 5)).toEqual([]);
      expect(values.filter((value) => !Number.isInteger(value) || (value as number) < 0 || (value as number) > 255)).toEqual([]);
    }
  });

  it('an array that must contain cent values', () => {
    // `contains` makes the walker test candidates against the child type, the other reader of multipleOf.
    const schema = RT.array(RT.unknown(), {contains: TFB.number({multipleOf: 0.01}), minContains: 2});
    const mock = createMockDataFn(schema);
    const isValid = createValidateFn(schema);
    for (const value of draw(mock)) {
      expect(isValid(value)).toBe(true);
      expect((value as unknown[]).filter((item) => isExactMultiple(item, 0.01)).length).toBeGreaterThanOrEqual(2);
    }
  });
});
