/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createIsTypeFn, createMockTypeFn, createTypeErrorsFn} from '@mionkit/run-types';
import {RunTypeError, TypeFormatError} from '@mionkit/core';
import {BigNumPositive, BigNumNegative, BigNumPositiveInt, BigNumNegativeInt, BigNumInt64} from './defaultBigNumberFormats.ts';

// #### Positive ####

it('validate BigNumPositive', async () => {
    const isType = await createIsTypeFn<BigNumPositive>();
    expect(isType(10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(-5n)).toBe(false);
});

it('get BigNumPositive errors', async () => {
    const typeErrors = await createTypeErrorsFn<BigNumPositive>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(-5n)).toEqual([expectedError]);
});

it('mock BigNumPositive', async () => {
    const mockType = await createMockTypeFn<BigNumPositive>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0n);
    }
});

// #### Negative ####

it('validate BigNumNegative', async () => {
    const isType = await createIsTypeFn<BigNumNegative>();
    expect(isType(-10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(5n)).toBe(false);
});

it('get BigNumNegative errors', async () => {
    const typeErrors = await createTypeErrorsFn<BigNumNegative>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(-10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(5n)).toEqual([expectedError]);
});

it('mock BigNumNegative', async () => {
    const mockType = await createMockTypeFn<BigNumNegative>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0n);
    }
});

// #### PositiveInteger ####

it('validate BigNumPositiveInteger', async () => {
    const isType = await createIsTypeFn<BigNumPositiveInt>();
    expect(isType(10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(-5n)).toBe(false);
});

it('get BigNumPositiveInteger errors', async () => {
    const typeErrors = await createTypeErrorsFn<BigNumPositiveInt>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(-5n)).toEqual([expectedError]);
});

it('mock BigNumPositiveInteger', async () => {
    const mockType = await createMockTypeFn<BigNumPositiveInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0n);
    }
});

// #### NegativeInteger ####

it('validate BigNumNegativeInteger', async () => {
    const isType = await createIsTypeFn<BigNumNegativeInt>();
    expect(isType(-10n)).toBe(true);
    expect(isType(0n)).toBe(true);
    expect(isType(5n)).toBe(false);
});

it('get BigNumNegativeInteger errors', async () => {
    const typeErrors = await createTypeErrorsFn<BigNumNegativeInt>();
    const format: TypeFormatError = {name: 'bigintFormat', val: 0n, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'bigint', path: [], format};
    expect(typeErrors(-10n)).toEqual([]);
    expect(typeErrors(0n)).toEqual([]);
    expect(typeErrors(5n)).toEqual([expectedError]);
});

it('mock BigNumNegativeInteger', async () => {
    const mockType = await createMockTypeFn<BigNumNegativeInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0n);
    }
});

// #### Int64 ####

it('validate BigNumInt64', async () => {
    const isType = await createIsTypeFn<BigNumInt64>();
    expect(isType(-9223372036854775808n)).toBe(true);
    expect(isType(9223372036854775807n)).toBe(true);
    expect(isType(-9223372036854775809n)).toBe(false);
    expect(isType(9223372036854775808n)).toBe(false);
});

it('get BigNumInt64 errors', async () => {
    const typeErrors = await createTypeErrorsFn<BigNumInt64>();
    const minFormat: TypeFormatError = {name: 'bigintFormat', val: -9223372036854775808n, formatPath: ['min']};
    const maxFormat: TypeFormatError = {name: 'bigintFormat', val: 9223372036854775807n, formatPath: ['max']};
    const minError: RunTypeError = {expected: 'bigint', path: [], format: minFormat};
    const maxError: RunTypeError = {expected: 'bigint', path: [], format: maxFormat};
    expect(typeErrors(-9223372036854775808n)).toEqual([]);
    expect(typeErrors(9223372036854775807n)).toEqual([]);
    expect(typeErrors(-9223372036854775809n)).toEqual([minError]);
    expect(typeErrors(9223372036854775808n)).toEqual([maxError]);
});

it('mock BigNumInt64', async () => {
    const mockType = await createMockTypeFn<BigNumInt64>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(-9223372036854775808n);
        expect(item).toBeLessThanOrEqual(9223372036854775807n);
    }
});
