/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTypeFunctions';
import {RunTypeError, TypeFormatError} from '@mionkit/core/src/types';
import {
    FormatInteger,
    FormatFloat,
    FormatPositive,
    FormatNegative,
    FormatPositiveInteger,
    FormatNegativeInteger,
    FormatInt32,
    FormatUint32,
    FormatInt64,
} from './defaultNumberFormats';

// #### Integer ####

it('validate FormatInteger', async () => {
    const isType = await isTypeFn<FormatInteger>();
    expect(isType(10)).toBe(true);
    expect(isType(-5)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get FormatInteger errors', async () => {
    const typeErrors = await typeErrorsFn<FormatInteger>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['integer']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(-5)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock FormatInteger', async () => {
    const mockType = await mockTypeFn<FormatInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
    }
});

// #### Float ####

it('validate FormatFloat', async () => {
    const isType = await isTypeFn<FormatFloat>();
    expect(isType(10)).toBe(false);
    expect(isType(-5)).toBe(false);
    expect(isType(0)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(true);
});

it('get FormatFloat errors', async () => {
    const typeErrors = await typeErrorsFn<FormatFloat>();
    const format: TypeFormatError = {name: 'numberFormat', val: true, formatPath: ['float']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([expectedError]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(0)).toEqual([expectedError]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5.5)).toEqual([]);
});

it('mock FormatFloat', async () => {
    const mockType = await mockTypeFn<FormatFloat>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(false);
    }
});

// #### Positive ####

it('validate FormatPositive', async () => {
    const isType = await isTypeFn<FormatPositive>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(true);
    expect(isType(-5.5)).toBe(false);
});

it('get FormatPositive errors', async () => {
    const typeErrors = await typeErrorsFn<FormatPositive>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['min']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(10.5)).toEqual([]);
    expect(typeErrors(-5)).toEqual([expectedError]);
    expect(typeErrors(-5.5)).toEqual([expectedError]);
});

it('mock FormatPositive', async () => {
    const mockType = await mockTypeFn<FormatPositive>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### Negative ####

it('validate FormatNegative', async () => {
    const isType = await isTypeFn<FormatNegative>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(true);
    expect(isType(5.5)).toBe(false);
});

it('get FormatNegative errors', async () => {
    const typeErrors = await typeErrorsFn<FormatNegative>();
    const format: TypeFormatError = {name: 'numberFormat', val: 0, formatPath: ['max']};
    const expectedError: RunTypeError = {expected: 'number', path: [], format};
    expect(typeErrors(-10)).toEqual([]);
    expect(typeErrors(0)).toEqual([]);
    expect(typeErrors(-10.5)).toEqual([]);
    expect(typeErrors(5)).toEqual([expectedError]);
    expect(typeErrors(5.5)).toEqual([expectedError]);
});

it('mock FormatNegative', async () => {
    const mockType = await mockTypeFn<FormatNegative>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### PositiveInteger ####

it('validate FormatPositiveInteger', async () => {
    const isType = await isTypeFn<FormatPositiveInteger>();
    expect(isType(10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(-5)).toBe(false);
    expect(isType(10.5)).toBe(false);
    expect(isType(-5.5)).toBe(false);
});

it('get FormatPositiveInteger errors', async () => {
    const typeErrors = await typeErrorsFn<FormatPositiveInteger>();

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

it('mock FormatPositiveInteger', async () => {
    const mockType = await mockTypeFn<FormatPositiveInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
    }
});

// #### NegativeInteger ####

it('validate FormatNegativeInteger', async () => {
    const isType = await isTypeFn<FormatNegativeInteger>();
    expect(isType(-10)).toBe(true);
    expect(isType(0)).toBe(true);
    expect(isType(5)).toBe(false);
    expect(isType(-10.5)).toBe(false);
    expect(isType(5.5)).toBe(false);
});

it('get FormatNegativeInteger errors', async () => {
    const typeErrors = await typeErrorsFn<FormatNegativeInteger>();

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

it('mock FormatNegativeInteger', async () => {
    const mockType = await mockTypeFn<FormatNegativeInteger>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeLessThanOrEqual(0);
    }
});

// #### Int32 ####

it('validate FormatInt32', async () => {
    const isType = await isTypeFn<FormatInt32>();
    expect(isType(0)).toBe(true);
    expect(isType(2147483647)).toBe(true);
    expect(isType(-2147483648)).toBe(true);
    expect(isType(2147483648)).toBe(false);
    expect(isType(-2147483649)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get FormatInt32 errors', async () => {
    const typeErrors = await typeErrorsFn<FormatInt32>();

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
    const mockType = await mockTypeFn<FormatInt32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(-2147483648);
        expect(item).toBeLessThanOrEqual(2147483647);
    }
});

// #### Uint32 ####

it('validate FormatUint32', async () => {
    const isType = await isTypeFn<FormatUint32>();
    expect(isType(0)).toBe(true);
    expect(isType(4294967295)).toBe(true);
    expect(isType(-1)).toBe(false);
    expect(isType(4294967296)).toBe(false);
    expect(isType(10.5)).toBe(false);
});

it('get FormatUint32 errors', async () => {
    const typeErrors = await typeErrorsFn<FormatUint32>();

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

it('mock FormatUint32', async () => {
    const mockType = await mockTypeFn<FormatUint32>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(0);
        expect(item).toBeLessThanOrEqual(4294967295);
    }
});

// #### Int64 ####

it('validate FormatInt64', async () => {
    const isType = await isTypeFn<FormatInt64>();
    expect(isType(0)).toBe(true);
    expect(isType(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isType(-9223372036854775808)).toBe(true);
    expect(isType(Number.MAX_SAFE_INTEGER + 1)).toBe(false); // Exceeds max
    expect(isType(10.5)).toBe(false); // Not an integer
});

it('get FormatInt64 errors', async () => {
    const typeErrors = await typeErrorsFn<FormatInt64>();

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

it('mock FormatInt64', async () => {
    const mockType = await mockTypeFn<FormatInt64>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(Number.isInteger(item)).toBe(true);
        expect(item).toBeGreaterThanOrEqual(-9223372036854775808);
        expect(item).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    }
});
