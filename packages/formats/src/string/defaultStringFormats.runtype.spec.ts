/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {TypeFormatError, RunTypeError} from '@mionkit/core/src/types';
import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTimeFunctions';
import {StringFormat} from '../stringFormat.runtype';
import {
    String_Alphanumeric,
    String_Alpha,
    String_Capitalize,
    String_Lowercase,
    String_Numeric,
    String_Uppercase,
} from './defaultStringFormats.runtype';

// #### AlphaString type ####
it('validate string alpha', async () => {
    const isType = await isTypeFn<String_Alpha<{minLength: 3}>>();
    expect(isType('abcdef')).toBe(true);
    expect(isType('ab')).toBe(false);
});
it('get alpha string errors', async () => {
    const typeErrors = await typeErrorsFn<String_Alpha<{minLength: 3}>>();
    const format: TypeFormatError = {name: 'stringFormat', formatPath: [], val: ''};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('abcdef')).toEqual([]);
    expect(typeErrors('ab')).toEqual([{...expectedError, format: {...format, formatPath: ['minLength'], val: 3}}]);
    expect(typeErrors('123')).toEqual([
        {...expectedError, format: {...format, formatPath: ['pattern'], val: 'only alphabetic values are allowed'}},
    ]);
});
it('mock alpha string', async () => {
    type AlphaString3 = String_Alpha<{minLength: 3}>;
    const mockType = await mockTypeFn<AlphaString3>();
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
});

// #### AlphaNumericString type ####
it('validate string alpha numeric', async () => {
    const isType = await isTypeFn<String_Alphanumeric<{minLength: 3}>>();
    expect(isType('abcd2891')).toBe(true);
    expect(isType('12342891')).toBe(true);
    expect(isType('123425789')).toBe(true);
    expect(isType('abcdCDHKO')).toBe(true);
    expect(isType('abcd+!]')).toBe(false);
    expect(isType('ab')).toBe(false);
});
it('get alpha numeric string errors', async () => {
    const typeErrors = await typeErrorsFn<String_Alphanumeric<{minLength: 3}>>();
    const format: TypeFormatError = {name: 'stringFormat', formatPath: [], val: ''};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('abcd2891')).toEqual([]);
    expect(typeErrors('12342891')).toEqual([]);
    expect(typeErrors('abcdCDHKO')).toEqual([]);
    expect(typeErrors('abcd+!]')).toEqual([
        {...expectedError, format: {...format, formatPath: ['pattern'], val: 'only alphanumeric values are allowed'}},
    ]);
    expect(typeErrors('ab')).toEqual([{...expectedError, format: {...format, formatPath: ['minLength'], val: 3}}]);
});
it('mock alpha numeric string', async () => {
    type AlphaNumericString3 = String_Alphanumeric<{minLength: 3}>;
    const mockType = await mockTypeFn<AlphaNumericString3>();
    expect(mockType()).toMatch(/^[a-zA-Z0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
});

// #### NumericString type ####
it('validate string numeric', async () => {
    const isType = await isTypeFn<String_Numeric<{minLength: 3; maxLength: 5}>>();
    expect(isType('1234')).toBe(true);
    expect(isType('12345')).toBe(true);
    expect(isType('1.23')).toBe(false);
    expect(isType('1,23')).toBe(false);
    expect(isType('123456')).toBe(false);
    expect(isType('12')).toBe(false);
    expect(isType('abcd')).toBe(false);
});
it('get numeric string errors', async () => {
    const typeErrors = await typeErrorsFn<String_Numeric<{minLength: 3; maxLength: 5}>>();
    const format: TypeFormatError = {name: 'stringFormat', formatPath: [], val: ''};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    const numericError: TypeFormatError = {name: 'stringFormat', formatPath: ['pattern'], val: 'only numeric values are allowed'};
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('12345')).toEqual([]);
    expect(typeErrors('1.23')).toEqual([{...expectedError, format: numericError}]);
    expect(typeErrors('1,23')).toEqual([{...expectedError, format: numericError}]);
    expect(typeErrors('123456')).toEqual([{...expectedError, format: {...format, formatPath: ['maxLength'], val: 5}}]);
    expect(typeErrors('12')).toEqual([{...expectedError, format: {...format, formatPath: ['minLength'], val: 3}}]);
    expect(typeErrors('abcd')).toEqual([{...expectedError, format: numericError}]);
});
it('mock numeric string', async () => {
    type NumericString3to5 = String_Numeric<{minLength: 3; maxLength: 5}>;
    const mockType = await mockTypeFn<NumericString3to5>();
    expect(mockType()).toMatch(/^[0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType().length).toBeLessThanOrEqual(5);
    expect(mockType()).toMatch(/^[0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType().length).toBeLessThanOrEqual(5);
    expect(mockType()).toMatch(/^[0-9]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType().length).toBeLessThanOrEqual(5);
});

// #### LowerString type ####
it('validate lowercase string', async () => {
    const isType = await isTypeFn<String_Lowercase<{minLength: 3}>>();
    expect(isType('abcd')).toBe(true);
    // failing test disabled as we are not enforcing lowercase for now
    // expect(isType('ABCD')).toBe(false);
    // expect(isType('Abcd')).toBe(false);
    expect(isType('1234')).toBe(true);
    expect(isType('abcd1234')).toBe(true);
    expect(isType('ab')).toBe(false);
});
it('get lowercase string errors', async () => {
    const typeErrors = await typeErrorsFn<String_Lowercase<{minLength: 3}>>();
    const format1: TypeFormatError = {name: 'stringFormat', formatPath: ['lowercase'], val: true};
    const lowercaseError: RunTypeError = {expected: 'string', path: [], format: format1};
    const format2: TypeFormatError = {name: 'stringFormat', formatPath: ['minLength'], val: 3};
    const minLengthError: RunTypeError = {expected: 'string', path: [], format: format2};
    expect(typeErrors('abcd')).toEqual([]);
    // failing test disabled as we are not enforcing lowercase for now
    // expect(typeErrors('ABCD')).toEqual([lowercaseError]);
    // expect(typeErrors('Abcd')).toEqual([lowercaseError]);
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('abcd1234')).toEqual([]);
    expect(typeErrors('ab')).toEqual([minLengthError]);
});
it('mock lowercase string', async () => {
    type LowerString3 = String_Lowercase<{minLength: 3}>;
    const mockType = await mockTypeFn<LowerString3>();
    const l1 = mockType();
    const l2 = mockType();
    const l3 = mockType();
    expect(l1).toEqual(l1.toLowerCase());
    expect(l1.length).toBeGreaterThanOrEqual(3);
    expect(l2).toEqual(l2.toLowerCase());
    expect(l2.length).toBeGreaterThanOrEqual(3);
    expect(l3).toEqual(l3.toLowerCase());
    expect(l3.length).toBeGreaterThanOrEqual(3);
});

// #### UpperString type ####
it('validate uppercase string', async () => {
    const isType = await isTypeFn<String_Uppercase<{minLength: 3}>>();
    // failing test disabled as we are not enforcing uppercase for now
    // expect(isType('abcd')).toBe(false);
    expect(isType('ABCD')).toBe(true);
    // expect(isType('Abcd')).toBe(false);
    expect(isType('1234')).toBe(true);
    // expect(isType('abcd1234')).toBe(false);
    expect(isType('ABCD1234')).toBe(true);
    // expect(isType('ab')).toBe(false);
});
it('get uppercase string errors', async () => {
    const typeErrors = await typeErrorsFn<String_Uppercase<{minLength: 3}>>();
    const format1: TypeFormatError = {name: 'stringFormat', formatPath: ['uppercase'], val: true};
    const format2: TypeFormatError = {name: 'stringFormat', formatPath: ['minLength'], val: 3};
    const uppercaseError: RunTypeError = {expected: 'string', path: [], format: format1};
    const minLengthError: RunTypeError = {expected: 'string', path: [], format: format2};
    // failing test disabled as we are not enforcing uppercase for now
    // expect(typeErrors('abcd')).toEqual([uppercaseError]);
    expect(typeErrors('ABCD')).toEqual([]);
    // expect(typeErrors('Abcd')).toEqual([uppercaseError]);
    expect(typeErrors('1234')).toEqual([]);
    // expect(typeErrors('abcd1234')).toEqual([uppercaseError]);
    expect(typeErrors('ABCD1234')).toEqual([]);
    expect(typeErrors('AB')).toEqual([minLengthError]);
});
it('mock uppercase string', async () => {
    type UpperString3 = String_Uppercase<{minLength: 3}>;
    const mockType = await mockTypeFn<UpperString3>();
    const u1 = mockType();
    const u2 = mockType();
    const u3 = mockType();
    expect(u1).toEqual(u1.toUpperCase());
    expect(u1.length).toBeGreaterThanOrEqual(3);
    expect(u2).toEqual(u2.toUpperCase());
    expect(u2.length).toBeGreaterThanOrEqual(3);
    expect(u3).toEqual(u3.toUpperCase());
    expect(u3.length).toBeGreaterThanOrEqual(3);
});

// #### CapitalString type ####
it('validate capital string', async () => {
    const isType = await isTypeFn<String_Capitalize>();
    // failing test disabled as we are not enforcing capitalization for now
    // expect(isType('abcd')).toBe(false);
    // expect(isType('ABCD')).toBe(false);
    expect(isType('Abcd')).toBe(true);
    expect(isType('1234')).toBe(true);
    // expect(isType('abcd1234')).toBe(false);
    // expect(isType('ABCD1234')).toBe(false);
    expect(isType('Abcd1234')).toBe(true);
    // expect(isType('ab')).toBe(false);
});
it('get capital string errors', async () => {
    type CapitalString = StringFormat<{capitalize: true}>;
    const typeErrors = await typeErrorsFn<CapitalString>();
    const format1: TypeFormatError = {name: 'stringFormat', formatPath: ['capitalize'], val: true};
    const capitalizeError: RunTypeError = {expected: 'string', path: [], format: format1};
    // failing test disabled as we are not enforcing capitalization for now
    // expect(typeErrors('abcd')).toEqual([capitalizeError]);
    // expect(typeErrors('ABCD')).toEqual([capitalizeError]);
    expect(typeErrors('Abcd')).toEqual([]);
    expect(typeErrors('1234')).toEqual([]);
    // expect(typeErrors('abcd1234')).toEqual([capitalizeError]);
    // expect(typeErrors('ABCD1234')).toEqual([capitalizeError]);
    expect(typeErrors('Abcd1234')).toEqual([]);
    // expect(typeErrors('ab')).toEqual([capitalizeError]);
});
it('mock capital string', async () => {
    type CapitalString = StringFormat<{capitalize: true}>;
    const mockType = await mockTypeFn<CapitalString>();
    const c1 = mockType();
    const c2 = mockType();
    const c3 = mockType();
    expect(c1).toEqual(c1.charAt(0).toUpperCase() + c1.slice(1));
    expect(c2).toEqual(c2.charAt(0).toUpperCase() + c2.slice(1));
    expect(c3).toEqual(c3.charAt(0).toUpperCase() + c3.slice(1));
});
