/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {createValidate, createGetValidationErrors, createMockData} from '@mionjs/run-types';
import {RunTypeError, TypeFormatError} from '@mionjs/core';
import {
    FormatInteger,
    FormatFloat,
    FormatPositive,
    FormatNegative,
    FormatPositiveInt,
    FormatNegativeInt,
    FormatInt32,
    FormatUInt32,
} from '../../NumberFormats.ts';

// #### Integer ####

it('validate FormatInteger', async () => {
    const isType = createValidate<FormatInteger>();
    expect(isType(10)).toBe(true);
    expect(isType(-5)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get FormatInteger errors', async () => {
    const typeErrors = createGetValidationErrors<FormatInteger>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(-5)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock FormatInteger', async () => {
    const mockType = createMockData<FormatInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
    }
});

// #### Float ####

it('validate FormatFloat', async () => {
    const isType = createValidate<FormatFloat>();
    expect(isType(10)).toBe(false);
    expect(isType(-5)).toBe(false);
    expect(isType(0)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(true);
});

it('get FormatFloat errors', async () => {
    const typeErrors = createGetValidationErrors<FormatFloat>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['float']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(0)).toEqual([expectedError]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5.5)).toEqual([]);
});

it('mock FormatFloat', async () => {
    const mockType = createMockData<FormatFloat>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(false);
    }
});

// #### Positive ####

it('validate FormatPositive', async () => {
    const isType = createValidate<FormatPositive>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(false);
});

it('get FormatPositive errors', async () => {
    const typeErrors = createGetValidationErrors<FormatPositive>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock FormatPositive', async () => {
    const mockType = createMockData<FormatPositive>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### Negative ####

it('validate FormatNegative', async () => {
    const isType = createValidate<FormatNegative>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(true);
    expect(isType(5.5)).toBe(false);
});

it('get FormatNegative errors', async () => {
    const typeErrors = createGetValidationErrors<FormatNegative>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(-10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(-10.5)).toEqual([]);
    expect(typeErrors(5)).toEqual([expectedError]);
    expect(typeErrors(5.5)).toEqual([expectedError]);
});

it('mock FormatNegative', async () => {
    const mockType = createMockData<FormatNegative>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### PositiveInteger ####

it('validate FormatPositiveInteger', async () => {
    const isType = createValidate<FormatPositiveInt>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get FormatPositiveInteger errors', async () => {
    const typeErrors = createGetValidationErrors<FormatPositiveInt>();

    // Min error
    const minFormat: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'number', path: [], format: minFormat};

    // Integer error
    const integerFormat: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const integerError: RunTypeError = {expected: 'number', path: [], format: integerFormat};

    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(-5)).toEqual([minError]);
    expect(typeErrors(10.5)).toEqual([integerError]);
    expect(typeErrors(-5.5)).toEqual([integerError, minError]); // Now reports multiple errors
});

it('mock FormatPositiveInteger', async () => {
    const mockType = createMockData<FormatPositiveInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### NegativeInteger ####

it('validate FormatNegativeInteger', async () => {
    const isType = createValidate<FormatNegativeInt>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(false);
    expect(isType(5.5)).toBe(false);
});

it('get FormatNegativeInteger errors', async () => {
    const typeErrors = createGetValidationErrors<FormatNegativeInt>();

    // Max error
    const maxFormat: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'number', path: [], format: maxFormat};

    // Integer error
    const integerFormat: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const integerError: RunTypeError = {expected: 'number', path: [], format: integerFormat};

    expect(typeErrors(-10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(5)).toEqual([maxError]);
    expect(typeErrors(-10.5)).toEqual([integerError]);
    expect(typeErrors(5.5)).toEqual([integerError, maxError]); // Now reports multiple errors
});

it('mock FormatNegativeInteger', async () => {
    const mockType = createMockData<FormatNegativeInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### Int32 ####

it('validate FormatInt32', async () => {
    const isType = createValidate<FormatInt32>();
    expect(isType(0)).toBe(true);
    expect(isType(2147483647)).toBe(true);
    expect(isType(-2147483648)).toBe(true);
    expect(isType(2147483648)).toBe(false);
    expect(isType(-2147483649)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get FormatInt32 errors', async () => {
    const typeErrors = createGetValidationErrors<FormatInt32>();

    // Min error
    const minFormat: TypeFormatError = {name: 'numberFormat', val: -2147483648, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'number', path: [], format: minFormat};

    // Max error
    const maxFormat: TypeFormatError = {name: 'numberFormat', val: 2147483647, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'number', path: [], format: maxFormat};

    // Integer error
    const integerFormat: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const integerError: RunTypeError = {expected: 'number', path: [], format: integerFormat};

    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(2147483647)).toEqual([]);
    expect(typeErrors(-2147483648)).toEqual([]);
    expect(typeErrors(2147483648)).toEqual([maxError]);
    expect(typeErrors(-2147483649)).toEqual([minError]);
    expect(typeErrors(10.5)).toEqual([integerError]);
});

it('mock FormatInt32', async () => {
    const mockType = createMockData<FormatInt32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(-2147483648);
        expect(item).toBeLessThanOrEqual(2147483647);
    }
});

// #### Uint32 ####

it('validate NumUint32', async () => {
    const isType = createValidate<FormatUInt32>();
    expect(isType(0)).toBe(true);
    expect(isType(4294967295)).toBe(true);
    expect(isType(-1)).toBe(false);
    expect(isType(4294967296)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get NumUint32 errors', async () => {
    const typeErrors = createGetValidationErrors<FormatUInt32>();

    // Min error
    const minFormat: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'number', path: [], format: minFormat};

    // Max error
    const maxFormat: TypeFormatError = {name: 'numberFormat', val: 4294967295, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'number', path: [], format: maxFormat};

    // Integer error
    const integerFormat: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const integerError: RunTypeError = {expected: 'number', path: [], format: integerFormat};

    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(4294967295)).toEqual([]);
    expect(typeErrors(-1)).toEqual([minError]);
    expect(typeErrors(4294967296)).toEqual([maxError]);
    expect(typeErrors(10.5)).toEqual([integerError]);
});

it('mock NumUint32', async () => {
    const mockType = createMockData<FormatUInt32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
        expect(item).toBeLessThanOrEqual(4294967295);
    }
});
