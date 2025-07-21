/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTypeFunctions';
import {RunTypeError, TypeFormatError} from '@mionkit/core/src/types';
import {
    Number_Integer,
    Number_Float,
    Number_Positive,
    Number_Negative,
    Number_PositiveInteger,
    Number_NegativeInteger,
    Number_Int32,
    Number_Uint32,
    Number_Int64,
} from './defaultNumberFormats';

// #### Integer ####

it('validate Number_Integer', async () => {
    const isType = await isTypeFn<Number_Integer>();
    expect(isType(10)).toBe(true);
    expect(isType(-5)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get Number_Integer errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Integer>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(-5)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock Number_Integer', async () => {
    const mockType = await mockTypeFn<Number_Integer>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
    }
});

// #### Float ####

it('validate Number_Float', async () => {
    const isType = await isTypeFn<Number_Float>();
    expect(isType(10)).toBe(false);
    expect(isType(-5)).toBe(false);
    expect(isType(0)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(true);
});

it('get Number_Float errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Float>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['float']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(0)).toEqual([expectedError]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5.5)).toEqual([]);
});

it('mock Number_Float', async () => {
    const mockType = await mockTypeFn<Number_Float>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(false);
    }
});

// #### Positive ####

it('validate Number_Positive', async () => {
    const isType = await isTypeFn<Number_Positive>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(false);
});

it('get Number_Positive errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Positive>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock Number_Positive', async () => {
    const mockType = await mockTypeFn<Number_Positive>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### Negative ####

it('validate Number_Negative', async () => {
    const isType = await isTypeFn<Number_Negative>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(true);
    expect(isType(5.5)).toBe(false);
});

it('get Number_Negative errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Negative>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(-10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(-10.5)).toEqual([]);
    expect(typeErrors(5)).toEqual([expectedError]);
    expect(typeErrors(5.5)).toEqual([expectedError]);
});

it('mock Number_Negative', async () => {
    const mockType = await mockTypeFn<Number_Negative>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### PositiveInteger ####

it('validate Number_PositiveInteger', async () => {
    const isType = await isTypeFn<Number_PositiveInteger>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get Number_PositiveInteger errors', async () => {
    const typeErrors = await typeErrorsFn<Number_PositiveInteger>();

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
    expect(typeErrors(-5.5)).toEqual([integerError]); // Only reports first error
});

it('mock Number_PositiveInteger', async () => {
    const mockType = await mockTypeFn<Number_PositiveInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### NegativeInteger ####

it('validate Number_NegativeInteger', async () => {
    const isType = await isTypeFn<Number_NegativeInteger>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(false);
    expect(isType(5.5)).toBe(false);
});

it('get Number_NegativeInteger errors', async () => {
    const typeErrors = await typeErrorsFn<Number_NegativeInteger>();

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
    expect(typeErrors(5.5)).toEqual([integerError]); // Only reports first error
});

it('mock Number_NegativeInteger', async () => {
    const mockType = await mockTypeFn<Number_NegativeInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### Int32 ####

it('validate Number_Int32', async () => {
    const isType = await isTypeFn<Number_Int32>();
    expect(isType(0)).toBe(true);
    expect(isType(2147483647)).toBe(true);
    expect(isType(-2147483648)).toBe(true);
    expect(isType(2147483648)).toBe(false);
    expect(isType(-2147483649)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get Number_Int32 errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Int32>();

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

it('mock Number_Int32', async () => {
    const mockType = await mockTypeFn<Number_Int32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(-2147483648);
        expect(item).toBeLessThanOrEqual(2147483647);
    }
});

// #### Uint32 ####

it('validate Number_Uint32', async () => {
    const isType = await isTypeFn<Number_Uint32>();
    expect(isType(0)).toBe(true);
    expect(isType(4294967295)).toBe(true);
    expect(isType(-1)).toBe(false);
    expect(isType(4294967296)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get Number_Uint32 errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Uint32>();

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

it('mock Number_Uint32', async () => {
    const mockType = await mockTypeFn<Number_Uint32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
        expect(item).toBeLessThanOrEqual(4294967295);
    }
});

// #### Int64 ####

it('validate Number_Int64', async () => {
    const isType = await isTypeFn<Number_Int64>();
    expect(isType(0)).toBe(true);
    expect(isType(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isType(-9223372036854775808)).toBe(true);
    expect(isType(Number.MAX_SAFE_INTEGER + 1)).toBe(false); // Exceeds max
    expect(isType(10.5)).toBe(false); // Not an integer
});

it('get Number_Int64 errors', async () => {
    const typeErrors = await typeErrorsFn<Number_Int64>();

    // Min error
    const minFormat: TypeFormatError = {name: 'numberFormat', val: -9223372036854775808, formatPath: ['min']};
    const minError: RunTypeError = {expected: 'number', path: [], format: minFormat};

    // Max error
    const maxFormat: TypeFormatError = {name: 'numberFormat', val: Number.MAX_SAFE_INTEGER, formatPath: ['max']};
    const maxError: RunTypeError = {expected: 'number', path: [], format: maxFormat};

    // Integer error
    const integerFormat: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const integerError: RunTypeError = {expected: 'number', path: [], format: integerFormat};

    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(typeErrors(-9223372036854775808)).toEqual([]);
    expect(typeErrors(Number.MAX_SAFE_INTEGER + 1)).toEqual([maxError]);
    expect(typeErrors(10.5)).toEqual([integerError]);
});

it('mock Number_Int64', async () => {
    const mockType = await mockTypeFn<Number_Int64>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(-9223372036854775808);
        expect(item).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    }
});
