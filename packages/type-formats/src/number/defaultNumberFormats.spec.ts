/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {createIsTypeFn, createMockTypeFn, createTypeErrorsFn} from '@mionkit/run-types';
import {RunTypeError, TypeFormatError} from '@mionkit/core';
import {
    NumInteger,
    NumFloat,
    NumPositive,
    NumNegative,
    NumPositiveInt,
    NumNegativeInt,
    NumInt32,
    NumUInt32,
} from './defaultNumberFormats.ts';

// #### Integer ####

it('validate NumInteger', async () => {
    const isType = await createIsTypeFn<NumInteger>();
    expect(isType(10)).toBe(true);
    expect(isType(-5)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get NumInteger errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumInteger>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(-5)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock NumInteger', async () => {
    const mockType = await createMockTypeFn<NumInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
    }
});

// #### Float ####

it('validate NumFloat', async () => {
    const isType = await createIsTypeFn<NumFloat>();
    expect(isType(10)).toBe(false);
    expect(isType(-5)).toBe(false);
    expect(isType(0)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(true);
});

it('get NumFloat errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumFloat>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['float']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(0)).toEqual([expectedError]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5.5)).toEqual([]);
});

it('mock NumFloat', async () => {
    const mockType = await createMockTypeFn<NumFloat>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(false);
    }
});

// #### Positive ####

it('validate NumPositive', async () => {
    const isType = await createIsTypeFn<NumPositive>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(false);
});

it('get NumPositive errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumPositive>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock NumPositive', async () => {
    const mockType = await createMockTypeFn<NumPositive>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### Negative ####

it('validate NumNegative', async () => {
    const isType = await createIsTypeFn<NumNegative>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(true);
    expect(isType(5.5)).toBe(false);
});

it('get NumNegative errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumNegative>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(-10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(-10.5)).toEqual([]);
    expect(typeErrors(5)).toEqual([expectedError]);
    expect(typeErrors(5.5)).toEqual([expectedError]);
});

it('mock NumNegative', async () => {
    const mockType = await createMockTypeFn<NumNegative>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### PositiveInteger ####

it('validate NumPositiveInteger', async () => {
    const isType = await createIsTypeFn<NumPositiveInt>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get NumPositiveInteger errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumPositiveInt>();

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

it('mock NumPositiveInteger', async () => {
    const mockType = await createMockTypeFn<NumPositiveInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### NegativeInteger ####

it('validate NumNegativeInteger', async () => {
    const isType = await createIsTypeFn<NumNegativeInt>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(false);
    expect(isType(5.5)).toBe(false);
});

it('get NumNegativeInteger errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumNegativeInt>();

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

it('mock NumNegativeInteger', async () => {
    const mockType = await createMockTypeFn<NumNegativeInt>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### Int32 ####

it('validate NumInt32', async () => {
    const isType = await createIsTypeFn<NumInt32>();
    expect(isType(0)).toBe(true);
    expect(isType(2147483647)).toBe(true);
    expect(isType(-2147483648)).toBe(true);
    expect(isType(2147483648)).toBe(false);
    expect(isType(-2147483649)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get NumInt32 errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumInt32>();

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

it('mock NumInt32', async () => {
    const mockType = await createMockTypeFn<NumInt32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(-2147483648);
        expect(item).toBeLessThanOrEqual(2147483647);
    }
});

// #### Uint32 ####

it('validate NumUint32', async () => {
    const isType = await createIsTypeFn<NumUInt32>();
    expect(isType(0)).toBe(true);
    expect(isType(4294967295)).toBe(true);
    expect(isType(-1)).toBe(false);
    expect(isType(4294967296)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get NumUint32 errors', async () => {
    const typeErrors = await createTypeErrorsFn<NumUInt32>();

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
    const mockType = await createMockTypeFn<NumUInt32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
        expect(item).toBeLessThanOrEqual(4294967295);
    }
});
