/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTypeFunctions';
import {RunTypeError, TypeFormatError} from '@mionkit/core/src/types';
import {BigIntFormat} from './bigIntFormat.runtype';

// #### max ####

it('validate bigint max', async () => {
    type Max10 = BigIntFormat<{max: 10n}>;
    const isType = await isTypeFn<Max10>();
    expect(isType(9n)).toBe(true);
    expect(isType(10n)).toBe(true);
    expect(isType(11n)).toBe(false);
});

it('validate bigint max + errors', async () => {
    type Max10 = BigIntFormat<{max: 10n}>;
    const typeErrors = await typeErrorsFn<Max10>();
    expect(typeErrors(9n)).toEqual([]);
    expect(typeErrors(10n)).toEqual([]);

    // Max error
    const maxFormat: TypeFormatError = {name: 'bigintFormat', val: 10n, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'bigint', path: [], format: maxFormat};
    expect(typeErrors(11n)).toEqual([maxError]);
});

it('mock bigint max', async () => {
    type Max10 = BigIntFormat<{max: 10n}>;
    const mockType = await mockTypeFn<Max10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(10n);
    }
});

// #### min ####

it('validate bigint min', async () => {
    type Min10 = BigIntFormat<{min: 10n}>;
    const isType = await isTypeFn<Min10>();
    expect(isType(9n)).toBe(false);
    expect(isType(10n)).toBe(true);
    expect(isType(11n)).toBe(true);
});

it('validate bigint min + errors', async () => {
    type Min10 = BigIntFormat<{min: 10n}>;
    const typeErrors = await typeErrorsFn<Min10>();
    expect(typeErrors(10n)).toEqual([]);
    expect(typeErrors(11n)).toEqual([]);

    // Min error
    const minFormat: TypeFormatError = {name: 'bigintFormat', val: 10n, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'bigint', path: [], format: minFormat};
    expect(typeErrors(9n)).toEqual([minError]);
});

it('mock bigint min', async () => {
    type Min10 = BigIntFormat<{min: 10n}>;
    const mockType = await mockTypeFn<Min10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(10n);
    }
});

// #### lt ####

it('validate bigint lt', async () => {
    type Lt10 = BigIntFormat<{lt: 10n}>;
    const isType = await isTypeFn<Lt10>();
    expect(isType(9n)).toBe(true);
    expect(isType(10n)).toBe(false);
    expect(isType(11n)).toBe(false);
});

it('validate bigint lt + errors', async () => {
    type Lt10 = BigIntFormat<{lt: 10n}>;
    const typeErrors = await typeErrorsFn<Lt10>();
    expect(typeErrors(9n)).toEqual([]);

    // Lt error
    const ltFormat: TypeFormatError = {name: 'bigintFormat', val: 10n, formatPath: ['lt']};
    const ltError: RunTypeError = {expected: 'bigint', path: [], format: ltFormat};
    expect(typeErrors(10n)).toEqual([ltError]);
    expect(typeErrors(11n)).toEqual([ltError]);
});

it('mock bigint lt', async () => {
    type Lt10 = BigIntFormat<{lt: 10n}>;
    const mockType = await mockTypeFn<Lt10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThan(10n);
    }
});

// #### gt ####

it('validate bigint gt', async () => {
    type Gt10 = BigIntFormat<{gt: 10n}>;
    const isType = await isTypeFn<Gt10>();
    expect(isType(9n)).toBe(false);
    expect(isType(10n)).toBe(false);
    expect(isType(11n)).toBe(true);
});

it('validate bigint gt + errors', async () => {
    type Gt10 = BigIntFormat<{gt: 10n}>;
    const typeErrors = await typeErrorsFn<Gt10>();
    expect(typeErrors(11n)).toEqual([]);

    // Gt error
    const gtFormat: TypeFormatError = {name: 'bigintFormat', val: 10n, formatPath: ['gt']};
    const gtError: RunTypeError = {expected: 'bigint', path: [], format: gtFormat};
    expect(typeErrors(9n)).toEqual([gtError]);
    expect(typeErrors(10n)).toEqual([gtError]);
});

it('mock bigint gt', async () => {
    type Gt10 = BigIntFormat<{gt: 10n}>;
    const mockType = await mockTypeFn<Gt10>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThan(10n);
    }
});

// #### multipleOf ####

it('validate bigint multipleOf', async () => {
    type MultipleOf5 = BigIntFormat<{multipleOf: 5n}>;
    const isType = await isTypeFn<MultipleOf5>();
    expect(isType(0n)).toBe(true);
    expect(isType(5n)).toBe(true);
    expect(isType(10n)).toBe(true);
    expect(isType(-5n)).toBe(true);
    expect(isType(-10n)).toBe(true);
    expect(isType(1n)).toBe(false);
    expect(isType(6n)).toBe(false);
    expect(isType(-1n)).toBe(false);
    expect(isType(-6n)).toBe(false);
});

it('validate bigint multipleOf + errors', async () => {
    type MultipleOf5 = BigIntFormat<{multipleOf: 5n}>;
    const typeErrors = await typeErrorsFn<MultipleOf5>();
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(5n)).toEqual([]);
    expect(typeErrors(10n)).toEqual([]);
    expect(typeErrors(-5n)).toEqual([]);
    expect(typeErrors(-10n)).toEqual([]);

    // MultipleOf error
    const multipleOfFormat: TypeFormatError = {name: 'bigintFormat', val: 5n, formatPath: ['multipleOf']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format: multipleOfFormat};
    expect(typeErrors(1n)).toEqual([expectedError]);
    expect(typeErrors(6n)).toEqual([expectedError]);
    expect(typeErrors(-1n)).toEqual([expectedError]); // Negative non-multiples should have errors
    expect(typeErrors(-6n)).toEqual([expectedError]); // Negative non-multiples should have errors
});

it('mock bigint multipleOf', async () => {
    type MultipleOf5 = BigIntFormat<{multipleOf: 5n}>;
    const mockType = await mockTypeFn<MultipleOf5>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item % 5n).toBe(0n);
    }
});

// #### combined constraints ####

it('validate combined constraints', async () => {
    type Combined = BigIntFormat<{min: 0n; max: 100n; multipleOf: 5n}>;
    const isType = await isTypeFn<Combined>();
    expect(isType(0n)).toBe(true);
    expect(isType(5n)).toBe(true);
    expect(isType(100n)).toBe(true);
    expect(isType(-5n)).toBe(false); // Below min
    expect(isType(105n)).toBe(false); // Above max
    expect(isType(7n)).toBe(false); // Not a multiple of 5
});

it('validate combined constraints + errors', async () => {
    type Combined = BigIntFormat<{min: 0n; max: 100n; multipleOf: 5n}>;
    const typeErrors = await typeErrorsFn<Combined>();
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(5n)).toEqual([]);
    expect(typeErrors(100n)).toEqual([]);

    // Min error
    const minFormat: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'bigint', path: [], format: minFormat};
    expect(typeErrors(-5n)).toEqual([minError]);

    // Max error
    const maxFormat: TypeFormatError = {name: 'bigintFormat', val: 100n, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'bigint', path: [], format: maxFormat};
    expect(typeErrors(105n)).toEqual([maxError]);

    // MultipleOf error
    const multipleOfFormat: TypeFormatError = {name: 'bigintFormat', val: 5n, formatPath: ['multipleOf']};
    const multipleOfError: RunTypeError = {expected: 'bigint', path: [], format: multipleOfFormat};
    expect(typeErrors(7n)).toEqual([multipleOfError]);
});

it('mock combined constraints', async () => {
    type Combined = BigIntFormat<{min: 0n; max: 100n; multipleOf: 5n}>;
    const mockType = await mockTypeFn<Combined>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0n);
        expect(item).toBeLessThanOrEqual(100n);
        expect(item % 5n).toBe(0n);
    }
});

// #### large bigint values ####

it('validate large bigint values', async () => {
    // Test with values beyond Number.MAX_SAFE_INTEGER
    const largeValue = BigInt(Number.MAX_SAFE_INTEGER) * 10n;

    type LargeBigInt = BigIntFormat<{min: 0n}>;
    const isType = await isTypeFn<LargeBigInt>();
    expect(isType(largeValue)).toBe(true);
    expect(isType(-1n)).toBe(false);
});
