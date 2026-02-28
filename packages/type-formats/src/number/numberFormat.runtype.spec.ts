/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createIsTypeFn, createMockTypeFn, createTypeErrorsFn} from '@mionkit/run-types';
import {RunTypeError, TypeFormatError} from '@mionkit/core';
import {FormatNumber} from './numberFormat.runtype';

// #### max ####

it('validate number max', async () => {
    type Max10 = FormatNumber<{max: 10}>;
    const isType = await createIsTypeFn<Max10>();
    expect(isType(9)).toBe(true);
    expect(isType(10)).toBe(true);
    expect(isType(11)).toBe(false);
});

it('validate number max with zero', async () => {
    type Max0 = FormatNumber<{max: 0}>;
    const isType = await createIsTypeFn<Max0>();
    expect(isType(-1)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(1)).toBe(false);
});

it('get max errors', async () => {
    type Max10 = FormatNumber<{max: 10}>;
    const typeErrors = await createTypeErrorsFn<Max10>();
    const format: TypeFormatError = {name: 'numberFormat', val: 10, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(9)).toEqual([]);
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(11)).toEqual([expectedError]);
});

it('mock max', async () => {
    type Max10 = FormatNumber<{max: 10}>;
    const mockType = await createMockTypeFn<Max10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(10);
    }
});

// #### min ####

it('validate number min', async () => {
    type Min10 = FormatNumber<{min: 10}>;
    const isType = await createIsTypeFn<Min10>();
    expect(isType(9)).toBe(false);
    expect(isType(10)).toBe(true);
    expect(isType(11)).toBe(true);
});

it('validate number min with zero', async () => {
    type Min0 = FormatNumber<{min: 0}>;
    const isType = await createIsTypeFn<Min0>();
    expect(isType(-1)).toBe(false);
    expect(isType(0)).toBe(true);
    expect(isType(1)).toBe(true);
});

it('get min errors', async () => {
    type Min10 = FormatNumber<{min: 10}>;
    const typeErrors = await createTypeErrorsFn<Min10>();
    const format: TypeFormatError = {name: 'numberFormat', val: 10, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(9)).toEqual([expectedError]);
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(11)).toEqual([]);
});

it('mock min', async () => {
    type Min10 = FormatNumber<{min: 10}>;
    const mockType = await createMockTypeFn<Min10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(10);
    }
});

// #### lt (less than) ####

it('validate number lt', async () => {
    type Lt10 = FormatNumber<{lt: 10}>;
    const isType = await createIsTypeFn<Lt10>();
    expect(isType(9)).toBe(true);
    expect(isType(10)).toBe(false);
    expect(isType(11)).toBe(false);
});

it('validate number lt with zero', async () => {
    type Lt0 = FormatNumber<{lt: 0}>;
    const isType = await createIsTypeFn<Lt0>();
    expect(isType(-1)).toBe(true);
    expect(isType(0)).toBe(false);
    expect(isType(1)).toBe(false);
});

it('get lt errors', async () => {
    type Lt10 = FormatNumber<{lt: 10}>;
    const typeErrors = await createTypeErrorsFn<Lt10>();
    const format: TypeFormatError = {name: 'numberFormat', val: 10, formatPath: ['lt']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(9)).toEqual([]);
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(11)).toEqual([expectedError]);
});

it('mock lt', async () => {
    type Lt10 = FormatNumber<{lt: 10}>;
    const mockType = await createMockTypeFn<Lt10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThan(10);
    }
});

// #### gt (greater than) ####

it('validate number gt', async () => {
    type Gt10 = FormatNumber<{gt: 10}>;
    const isType = await createIsTypeFn<Gt10>();
    expect(isType(9)).toBe(false);
    expect(isType(10)).toBe(false);
    expect(isType(11)).toBe(true);
});

it('validate number gt with zero', async () => {
    type Gt0 = FormatNumber<{gt: 0}>;
    const isType = await createIsTypeFn<Gt0>();
    expect(isType(-1)).toBe(false);
    expect(isType(0)).toBe(false);
    expect(isType(1)).toBe(true);
});

it('get gt errors', async () => {
    type Gt10 = FormatNumber<{gt: 10}>;
    const typeErrors = await createTypeErrorsFn<Gt10>();
    const format: TypeFormatError = {name: 'numberFormat', val: 10, formatPath: ['gt']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(9)).toEqual([expectedError]);
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(11)).toEqual([]);
});

it('mock gt', async () => {
    type Gt10 = FormatNumber<{gt: 10}>;
    const mockType = await createMockTypeFn<Gt10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThan(10);
    }
});

// #### integer ####

it('validate integer', async () => {
    type IntegerNumber = FormatNumber<{integer: true}>;
    const isType = await createIsTypeFn<IntegerNumber>();
    expect(isType(10)).toBe(true);
    expect(isType(-5)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get integer errors', async () => {
    type IntegerNumber = FormatNumber<{integer: true}>;
    const typeErrors = await createTypeErrorsFn<IntegerNumber>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(-5)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock integer', async () => {
    type IntegerNumber = FormatNumber<{integer: true}>;
    const mockType = await createMockTypeFn<IntegerNumber>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
    }
});

// #### float ####

it('validate float', async () => {
    type FloatNumber = FormatNumber<{float: true}>;
    const isType = await createIsTypeFn<FloatNumber>();
    expect(isType(10)).toBe(false);
    expect(isType(-5)).toBe(false);
    expect(isType(0)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(true);
});

it('get float errors', async () => {
    type FloatNumber = FormatNumber<{float: true}>;
    const typeErrors = await createTypeErrorsFn<FloatNumber>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['float']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(0)).toEqual([expectedError]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5.5)).toEqual([]);
});

it('mock float', async () => {
    type FloatNumber = FormatNumber<{float: true}>;
    const mockType = await createMockTypeFn<FloatNumber>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(false);
    }
});

// #### multipleOf ####

it('validate multipleOf', async () => {
    type MultipleOf5 = FormatNumber<{multipleOf: 5}>;
    const isType = await createIsTypeFn<MultipleOf5>();
    expect(isType(0)).toBe(true); // Zero is a multiple of any number
    expect(isType(-0)).toBe(true); // Negative zero is also a multiple
    expect(isType(+0)).toBe(true); // Explicit positive zero
    expect(isType(5)).toBe(true);
    expect(isType(10)).toBe(true);
    expect(isType(15)).toBe(true);
    expect(isType(-5)).toBe(true); // Negative multiples should work
    expect(isType(-10)).toBe(true); // Negative multiples should work
    expect(isType(1)).toBe(false);
    expect(isType(6)).toBe(false);
    expect(isType(11)).toBe(false);
    expect(isType(-1)).toBe(false); // Negative non-multiples should fail
    expect(isType(-6)).toBe(false); // Negative non-multiples should fail
});

it('validate multipleOf with 1', async () => {
    type MultipleOf1 = FormatNumber<{multipleOf: 1}>;
    const isType = await createIsTypeFn<MultipleOf1>();
    expect(isType(0)).toBe(true); // Zero is a multiple of any number
    expect(isType(-0)).toBe(true); // Negative zero is also a multiple
    expect(isType(+0)).toBe(true); // Explicit positive zero
    expect(isType(1)).toBe(true);
    expect(isType(2)).toBe(true);
    expect(isType(-1)).toBe(true); // Negative multiples should work
    expect(isType(-2)).toBe(true); // Negative multiples should work
    expect(isType(1.5)).toBe(false);
    expect(isType(-1.5)).toBe(false); // Negative non-multiples should fail
});

it('get multipleOf errors', async () => {
    type MultipleOf5 = FormatNumber<{multipleOf: 5}>;
    const typeErrors = await createTypeErrorsFn<MultipleOf5>();
    const format: TypeFormatError = {name: 'numberFormat', val: 5, formatPath: ['multipleOf']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(0)).toEqual([]); // Zero is a multiple of any number
    expect(typeErrors(-0)).toEqual([]); // Negative zero is also a multiple
    expect(typeErrors(+0)).toEqual([]); // Explicit positive zero
    expect(typeErrors(5)).toEqual([]);
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(-5)).toEqual([]); // Negative multiples should have no errors
    expect(typeErrors(-10)).toEqual([]); // Negative multiples should have no errors
    expect(typeErrors(1)).toEqual([expectedError]);
    expect(typeErrors(6)).toEqual([expectedError]);
    expect(typeErrors(-1)).toEqual([expectedError]); // Negative non-multiples should have errors
    expect(typeErrors(-6)).toEqual([expectedError]); // Negative non-multiples should have errors
});

it('mock multipleOf', async () => {
    type MultipleOf5 = FormatNumber<{multipleOf: 5}>;
    const mockType = await createMockTypeFn<MultipleOf5>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Math.abs(item % 5)).toBe(0);
    }
});

// #### Combined Constraints ####

it('validate combined constraints', async () => {
    type Combined = FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>;
    const isType = await createIsTypeFn<Combined>();
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(true);
    expect(isType(10)).toBe(true);
    expect(isType(100)).toBe(true);
    expect(isType(-5)).toBe(false); // below min
    expect(isType(105)).toBe(false); // above max
    expect(isType(7)).toBe(false); // not multiple of 5
    expect(isType(5.5)).toBe(false); // not an integer
});

it('get combined constraints errors', async () => {
    type Combined = FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>;
    const typeErrors = await createTypeErrorsFn<Combined>();

    // Valid values should have no errors
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(5)).toEqual([]);
    expect(typeErrors(100)).toEqual([]);

    // Below min error
    const minFormat: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'number', path: [], format: minFormat};
    expect(typeErrors(-5)).toEqual([minError]);

    // Above max error
    const maxFormat: TypeFormatError = {name: 'numberFormat', val: 100, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'number', path: [], format: maxFormat};
    expect(typeErrors(105)).toEqual([maxError]);

    // Not multiple of 5 error
    const multipleOfFormat: TypeFormatError = {name: 'numberFormat', val: 5, formatPath: ['multipleOf']};
    const multipleOfError: RunTypeError = {expected: 'number', path: [], format: multipleOfFormat};
    expect(typeErrors(7)).toEqual([multipleOfError]);

    // Not an integer error
    const integerFormat: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const integerError: RunTypeError = {expected: 'number', path: [], format: integerFormat};
    expect(typeErrors(5.5)).toEqual([integerError, multipleOfError]);
});

it('mock combined constraints', async () => {
    type Combined = FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>;
    const mockType = await createMockTypeFn<Combined>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0);
        expect(item).toBeLessThanOrEqual(100);
        expect(Number.isInteger(item)).toBe(true);
        expect(item % 5).toBe(0);
    }
});

// #### Validation Errors ####

it('throws error when both min and gt are specified', async () => {
    type InvalidType = FormatNumber<{min: 10; gt: 5}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow();
});

it('throws error when both max and lt are specified', async () => {
    type InvalidType = FormatNumber<{max: 10; lt: 15}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow();
});

it('throws error when min > max', async () => {
    type InvalidType = FormatNumber<{min: 20; max: 10}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow();
});

it('throws error when gt >= lt', async () => {
    type InvalidType = FormatNumber<{gt: 10; lt: 10}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow();
});

it('throws error when multipleOf <= 0', async () => {
    type InvalidType = FormatNumber<{multipleOf: -1}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow();
});

it('throws error when multipleOf is not an integer', async () => {
    type InvalidType = FormatNumber<{multipleOf: 1.5}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow(
        /multipleOf must be an integer to avoid floating-point precision issues/
    );
});

it('throws error when float is true and multipleOf is used', async () => {
    type InvalidType = FormatNumber<{float: true; multipleOf: 2}>;
    await expect(createIsTypeFn<InvalidType>()).rejects.toThrow(
        /multipleOf cannot be used with float constraint as multipleOf must be an integer/
    );
});

it('validate integer multipleOf works correctly', async () => {
    // Test with integer multipleOf values - these should work fine
    type MultipleOf5 = FormatNumber<{multipleOf: 5}>;
    const isType = await createIsTypeFn<MultipleOf5>();

    // Valid integer multiples
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(true);
    expect(isType(10)).toBe(true);
    expect(isType(-5)).toBe(true);
    expect(isType(-10)).toBe(true);

    // Invalid values
    expect(isType(1)).toBe(false);
    expect(isType(6)).toBe(false);
    expect(isType(4.5)).toBe(false); // Non-integer values should fail
    expect(isType(5.1)).toBe(false); // Non-integer values should fail
});

it('demonstrates solution for account balance in cents', async () => {
    // For account balances, store values in cents (integers) instead of dollars (decimals)
    // This avoids floating-point precision issues entirely

    // Account balance in cents (e.g., 123 cents = $1.23)
    type AccountBalanceInCents = FormatNumber<{multipleOf: 1; min: 0}>; // Positive integers only
    const isValidBalance = await createIsTypeFn<AccountBalanceInCents>();

    // Valid balances in cents
    expect(isValidBalance(0)).toBe(true); // $0.00
    expect(isValidBalance(1)).toBe(true); // $0.01
    expect(isValidBalance(123)).toBe(true); // $1.23
    expect(isValidBalance(9999)).toBe(true); // $99.99

    // Invalid balances
    expect(isValidBalance(-1)).toBe(false); // Negative balance
    expect(isValidBalance(1.5)).toBe(false); // Fractional cents

    // The original problematic case: exampleUser.accountBalance % 0.01 === 0
    // Now becomes: exampleUser.accountBalanceInCents % 1 === 0 (always true for integers)
    const exampleUserBalanceInCents = 123; // $1.23 stored as 123 cents
    expect(isValidBalance(exampleUserBalanceInCents)).toBe(true);
});
