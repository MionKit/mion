/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createValidate, createGetValidationErrors, createMockData} from '@mionjs/run-types';
import {RunTypeError, TypeFormatError} from '@mionjs/core';
import {
    FormatBigPositive,
    FormatBigNegative,
    FormatBigPositiveInt,
    FormatBigNegativeInt,
    FormatBigInt64,
} from '../../BigintFormats.ts';

// #### Positive ####

it('validate FormatBigPositive', async () => {
    const isType = createValidate<FormatBigPositive>();
    expect(isType(10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(-5n)).toBe(false);
});

it('get FormatBigPositive errors', async () => {
    const typeErrors = createGetValidationErrors<FormatBigPositive>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(-5n)).toEqual([expectedError]);
});

it('mock FormatBigPositive', async () => {
    const mockType = createMockData<FormatBigPositive>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0n);
    }
});

// #### Negative ####

it('validate FormatBigNegative', async () => {
    const isType = createValidate<FormatBigNegative>();
    expect(isType(-10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(5n)).toBe(false);
});

it('get FormatBigNegative errors', async () => {
    const typeErrors = createGetValidationErrors<FormatBigNegative>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(-10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(5n)).toEqual([expectedError]);
});

it('mock FormatBigNegative', async () => {
    const mockType = createMockData<FormatBigNegative>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0n);
    }
});

// #### PositiveInteger ####

it('validate FormatBigPositiveInteger', async () => {
    const isType = createValidate<FormatBigPositiveInt>();
    expect(isType(10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(-5n)).toBe(false);
});

it('get FormatBigPositiveInteger errors', async () => {
    const typeErrors = createGetValidationErrors<FormatBigPositiveInt>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(-5n)).toEqual([expectedError]);
});

it('mock FormatBigPositiveInteger', async () => {
    const mockType = createMockData<FormatBigPositiveInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0n);
    }
});

// #### NegativeInteger ####

it('validate FormatBigNegativeInteger', async () => {
    const isType = createValidate<FormatBigNegativeInt>();
    expect(isType(-10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(5n)).toBe(false);
});

it('get FormatBigNegativeInteger errors', async () => {
    const typeErrors = createGetValidationErrors<FormatBigNegativeInt>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(-10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(5n)).toEqual([expectedError]);
});

it('mock FormatBigNegativeInteger', async () => {
    const mockType = createMockData<FormatBigNegativeInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0n);
    }
});

// #### Int64 ####

it('validate FormatBigInt64', async () => {
    const isType = createValidate<FormatBigInt64>();
    expect(isType(-9223372036854775808n)).toBe(true);
    expect(isType(9223372036854775807n)).toBe(true);
    expect(isType(-9223372036854775809n)).toBe(false);
    expect(isType(9223372036854775808n)).toBe(false);
});

it('get FormatBigInt64 errors', async () => {
    const typeErrors = createGetValidationErrors<FormatBigInt64>();
    const minFormat: TypeFormatError = {name: 'bigintFormat', val: -9223372036854775808n, formatPath: ['min']};
    const maxFormat: TypeFormatError = {name: 'bigintFormat', val: 9223372036854775807n, formatPath: ['max']};
    const minError: RunTypeError = {expected: 'bigint', path: [], format: minFormat};
    const maxError: RunTypeError = {expected: 'bigint', path: [], format: maxFormat};
    expect(typeErrors(-9223372036854775808n)).toEqual([]);
    expect(typeErrors(9223372036854775807n)).toEqual([]);
    expect(typeErrors(-9223372036854775809n)).toEqual([minError]);
    expect(typeErrors(9223372036854775808n)).toEqual([maxError]);
});

it('mock FormatBigInt64', async () => {
    const mockType = createMockData<FormatBigInt64>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(-9223372036854775808n);
        expect(item).toBeLessThanOrEqual(9223372036854775807n);
    }
});
