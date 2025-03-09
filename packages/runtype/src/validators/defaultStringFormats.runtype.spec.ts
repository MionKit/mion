/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../functions';
import {StringFormat} from './string.runtype';
import {
    ALPHA_REGEX,
    ALPHANUMERIC_REGEX,
    AlphaNumericString,
    AlphaString,
    CapitalString,
    LowerString,
    NUMERIC_REGEX,
    NumericString,
    UpperString,
} from './defaultStringFormats.runtype';

// #### AlphaString type ####
it('validate string alpha', async () => {
    const isType = await isTypeFn<AlphaString<{minLength: 3}>>();
    expect(isType('abcdef')).toBe(true);
    expect(isType('ab')).toBe(false);
});
it('get alpha string errors', async () => {
    const typeErrors = await typeErrorsFn<AlphaString<{minLength: 3}>>();
    const format = {name: 'string'};
    const expectedError = {expected: 'string', path: [], format};
    expect(typeErrors('abcdef')).toEqual([]);
    expect(typeErrors('ab')).toEqual([{...expectedError, format: {...format, invalid: {minLength: 3}}}]);
    expect(typeErrors('123')).toEqual([{...expectedError, format: {...format, invalid: {pattern: ALPHA_REGEX.toString()}}}]);
});
it('mock alpha string', async () => {
    type AlphaString3 = AlphaString<{minLength: 3}>;
    const mockType = mockTypeFn<AlphaString3>();
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(3);
});

// #### AlphaNumericString type ####
it('validate string alpha numeric', async () => {
    const isType = await isTypeFn<AlphaNumericString<{minLength: 3}>>();
    expect(isType('abcd2891')).toBe(true);
    expect(isType('12342891')).toBe(true);
    expect(isType('123425789')).toBe(true);
    expect(isType('abcdCDHKO')).toBe(true);
    expect(isType('abcd+!]')).toBe(false);
    expect(isType('ab')).toBe(false);
});
it('get alpha numeric string errors', async () => {
    const typeErrors = await typeErrorsFn<AlphaNumericString<{minLength: 3}>>();
    const format = {name: 'string'};
    const expectedError = {expected: 'string', path: [], format};
    expect(typeErrors('abcd2891')).toEqual([]);
    expect(typeErrors('12342891')).toEqual([]);
    expect(typeErrors('abcdCDHKO')).toEqual([]);
    expect(typeErrors('abcd+!]')).toEqual([
        {...expectedError, format: {...format, invalid: {pattern: ALPHANUMERIC_REGEX.toString()}}},
    ]);
    expect(typeErrors('ab')).toEqual([{...expectedError, format: {...format, invalid: {minLength: 3}}}]);
});
it('mock alpha numeric string', async () => {
    type AlphaNumericString3 = AlphaNumericString<{minLength: 3}>;
    const mockType = mockTypeFn<AlphaNumericString3>();
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
    const isType = await isTypeFn<NumericString<{minLength: 3; maxLength: 5}>>();
    expect(isType('1234')).toBe(true);
    expect(isType('12345')).toBe(true);
    expect(isType('1.23')).toBe(false);
    expect(isType('1,23')).toBe(false);
    expect(isType('123456')).toBe(false);
    expect(isType('12')).toBe(false);
    expect(isType('abcd')).toBe(false);
});
it('get numeric string errors', async () => {
    const typeErrors = await typeErrorsFn<NumericString<{minLength: 3; maxLength: 5}>>();
    const format = {name: 'string'};
    const expectedError = {expected: 'string', path: [], format};
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('12345')).toEqual([]);
    expect(typeErrors('1.23')).toEqual([{...expectedError, format: {...format, invalid: {pattern: NUMERIC_REGEX.toString()}}}]);
    expect(typeErrors('1,23')).toEqual([{...expectedError, format: {...format, invalid: {pattern: NUMERIC_REGEX.toString()}}}]);
    expect(typeErrors('123456')).toEqual([{...expectedError, format: {...format, invalid: {maxLength: 5}}}]);
    expect(typeErrors('12')).toEqual([{...expectedError, format: {...format, invalid: {minLength: 3}}}]);
    expect(typeErrors('abcd')).toEqual([{...expectedError, format: {...format, invalid: {pattern: NUMERIC_REGEX.toString()}}}]);
});
it('mock numeric string', async () => {
    type NumericString3to5 = NumericString<{minLength: 3; maxLength: 5}>;
    const mockType = mockTypeFn<NumericString3to5>();
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
    const isType = await isTypeFn<LowerString<{minLength: 3}>>();
    expect(isType('abcd')).toBe(true);
    expect(isType('ABCD')).toBe(false);
    expect(isType('Abcd')).toBe(false);
    expect(isType('1234')).toBe(true);
    expect(isType('abcd1234')).toBe(true);
    expect(isType('ab')).toBe(false);
});
it('get lowercase string errors', async () => {
    const typeErrors = await typeErrorsFn<LowerString<{minLength: 3}>>();
    const format1 = {name: 'string', invalid: {lowercase: true}};
    const format2 = {name: 'string', invalid: {minLength: 3}};
    const lowercaseError = {expected: 'string', path: [], format: format1};
    const minLengthError = {expected: 'string', path: [], format: format2};
    expect(typeErrors('abcd')).toEqual([]);
    expect(typeErrors('ABCD')).toEqual([lowercaseError]);
    expect(typeErrors('Abcd')).toEqual([lowercaseError]);
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('abcd1234')).toEqual([]);
    expect(typeErrors('ab')).toEqual([minLengthError]);
});
it('mock lowercase string', async () => {
    type LowerString3 = LowerString<{minLength: 3}>;
    const mockType = mockTypeFn<LowerString3>();
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
    const isType = await isTypeFn<UpperString<{minLength: 3}>>();
    expect(isType('abcd')).toBe(false);
    expect(isType('ABCD')).toBe(true);
    expect(isType('Abcd')).toBe(false);
    expect(isType('1234')).toBe(true);
    expect(isType('abcd1234')).toBe(false);
    expect(isType('ABCD1234')).toBe(true);
    expect(isType('ab')).toBe(false);
});
it('get uppercase string errors', async () => {
    const typeErrors = await typeErrorsFn<UpperString<{minLength: 3}>>();
    const info1 = {name: 'string', invalid: {uppercase: true}};
    const info2 = {name: 'string', invalid: {minLength: 3}};
    const uppercaseError = {expected: 'string', path: [], format: info1};
    const minLengthError = {expected: 'string', path: [], format: info2};
    expect(typeErrors('abcd')).toEqual([uppercaseError]);
    expect(typeErrors('ABCD')).toEqual([]);
    expect(typeErrors('Abcd')).toEqual([uppercaseError]);
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('abcd1234')).toEqual([uppercaseError]);
    expect(typeErrors('ABCD1234')).toEqual([]);
    expect(typeErrors('AB')).toEqual([minLengthError]);
});
it('mock uppercase string', async () => {
    type UpperString3 = UpperString<{minLength: 3}>;
    const mockType = mockTypeFn<UpperString3>();
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
    const isType = await isTypeFn<CapitalString>();
    expect(isType('abcd')).toBe(false);
    expect(isType('ABCD')).toBe(false);
    expect(isType('Abcd')).toBe(true);
    expect(isType('1234')).toBe(true);
    expect(isType('abcd1234')).toBe(false);
    expect(isType('ABCD1234')).toBe(false);
    expect(isType('Abcd1234')).toBe(true);
    expect(isType('ab')).toBe(false);
});
it('get capital string errors', async () => {
    type CapitalString = StringFormat<{capitalize: true}>;
    const typeErrors = await typeErrorsFn<CapitalString>();
    const format = {name: 'string', invalid: {capitalize: true}};
    const capitalizeError = {expected: 'string', path: [], format};
    expect(typeErrors('abcd')).toEqual([capitalizeError]);
    expect(typeErrors('ABCD')).toEqual([capitalizeError]);
    expect(typeErrors('Abcd')).toEqual([]);
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('abcd1234')).toEqual([capitalizeError]);
    expect(typeErrors('ABCD1234')).toEqual([capitalizeError]);
    expect(typeErrors('Abcd1234')).toEqual([]);
    expect(typeErrors('ab')).toEqual([capitalizeError]);
});
it('mock capital string', async () => {
    type CapitalString = StringFormat<{capitalize: true}>;
    const mockType = mockTypeFn<CapitalString>();
    const c1 = mockType();
    const c2 = mockType();
    const c3 = mockType();
    expect(c1).toEqual(c1.charAt(0).toUpperCase() + c1.slice(1));
    expect(c2).toEqual(c2.charAt(0).toUpperCase() + c2.slice(1));
    expect(c3).toEqual(c3.charAt(0).toUpperCase() + c3.slice(1));
});
