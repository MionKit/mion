/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../functions';
import {AlphaNumericString, AlphaString, LowerString, NumericString, StringFormat, UpperString} from './string.runtypes';

// #### maxLength ####

it('validate string max length 2', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const isType = await isTypeFn<Max5>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('get max length errors', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const typeErrors = await typeErrorsFn<Max5>();
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([{expected: 'string', path: [], info: {format: 'maxLength', typeName: 'Max5'}}]);
});

it('mock max length', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const mockType = mockTypeFn<Max5>();
    expect(mockType().length).toBeLessThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(5);
});

// #### minLength ####

it('validate string min length', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const isType = await isTypeFn<Min5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
});

it('get min length errors', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const typeErrors = await typeErrorsFn<Min5>();
    expect(typeErrors('aaaa')).toEqual([{expected: 'string', path: [], info: {format: 'minLength', typeName: 'Min5'}}]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
});

it('mock min length', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const mockType = mockTypeFn<Min5>();
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
});

// #### length ####

it('validate string length', async () => {
    type Length5 = StringFormat<{length: 5}>;
    const isType = await isTypeFn<Length5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('get length errors', async () => {
    type Length5 = StringFormat<{length: 5}>;
    const typeErrors = await typeErrorsFn<Length5>();
    const expectedError = {expected: 'string', path: [], info: {format: 'length', typeName: 'Length5'}};
    expect(typeErrors('aaaa')).toEqual([expectedError]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([expectedError]);
});

it('mock length', async () => {
    type Length5 = StringFormat<{length: 5}>;
    const mockType = mockTypeFn<Length5>();
    expect(mockType().length).toBe(5);
    expect(mockType().length).toBe(5);
    expect(mockType().length).toBe(5);
    expect(mockType().length).toBe(5);
    expect(mockType().length).toBe(5);
});

// #### pattern ####

it('validate string pattern', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaPattern = StringFormat<{pattern: typeof regex; sampleChars: 'abcdefgABCDEFG'}>;
    const isType = await isTypeFn<AlphaPattern>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaa1')).toBe(false);
});

it('get pattern errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaPattern = StringFormat<{pattern: typeof regex; sampleChars: 'abcdefgABCDEFG'}>;
    const typeErrors = await typeErrorsFn<AlphaPattern>();
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaa1')).toEqual([{expected: 'string', path: [], info: {format: 'pattern', typeName: 'AlphaPattern'}}]);
});

it('mock pattern and samples', async () => {
    const regex = /^[a-zA-Z]+$/;
    const samples = ['aaaanckjs', 'aaaXdKol'];
    // is not possible to automatically generate a string that matches the pattern so we need to provide samples manually
    type AlphaPattern = StringFormat<{pattern: typeof regex; samples: ['aaaanckjs', 'aaaXdKol']}>;
    const mockType = mockTypeFn<AlphaPattern>();
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(samples).toContain(mockType());
    expect(samples).toContain(mockType());
    expect(samples).toContain(mockType());
    expect(samples).toContain(mockType());
});

it('mock pattern and sampleChars', async () => {
    const regex = /^[a-zA-Z]+$/;
    // is not possible to automatically generate a string that matches the pattern so we need to provide a list of valid characters manually
    type AlphaPattern = StringFormat<{pattern: typeof regex; sampleChars: 'abcdefgABCDEFG'}>;
    const mockType = mockTypeFn<AlphaPattern>();
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
});

it('pattern should throw if no samples or sampleChars are provided', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaPattern = StringFormat<{pattern: typeof regex}>;
    const mockType = mockTypeFn<AlphaPattern>();
    const error = "'samples' or 'sampleChars' must be provided when 'pattern' is defined for type AlphaPattern";
    await expect(() => isTypeFn<AlphaPattern>()).rejects.toThrow(error);
    await expect(() => typeErrorsFn<AlphaPattern>()).rejects.toThrow(error);
    expect(() => mockType()).toThrow(error);
});

// #### allowedChars ####

it('validate string allowedChars', async () => {
    type AllowedChars = StringFormat<{allowedChars: 'abc'}>;
    const isType = await isTypeFn<AllowedChars>();
    expect(isType('a')).toBe(true);
    expect(isType('b')).toBe(true);
    expect(isType('c')).toBe(true);
    expect(isType('abc')).toBe(true);
    expect(isType('baaaaccc')).toBe(true);
    expect(isType('caaaabb')).toBe(true);
    expect(isType('d')).toBe(false);
});

it('get allowedChars errors', async () => {
    type AllowedChars = StringFormat<{allowedChars: 'abc'}>;
    const typeErrors = await typeErrorsFn<AllowedChars>();
    expect(typeErrors('a')).toEqual([]);
    expect(typeErrors('b')).toEqual([]);
    expect(typeErrors('c')).toEqual([]);
    expect(typeErrors('abc')).toEqual([]);
    expect(typeErrors('baaaaccc')).toEqual([]);
    expect(typeErrors('caaaabb')).toEqual([]);
    expect(typeErrors('d')).toEqual([{expected: 'string', path: [], info: {format: 'allowedChars', typeName: 'AllowedChars'}}]);
});

it('mock allowedChars', async () => {
    type AllowedChars = StringFormat<{allowedChars: 'abc'}>;
    const mockType = mockTypeFn<AllowedChars>();
    expect(mockType()).toMatch(/^[abc]*$/);
    expect(mockType()).toMatch(/^[abc]*$/);
    expect(mockType()).toMatch(/^[abc]*$/);
    expect(mockType()).toMatch(/^[abc]*$/);
    expect(mockType()).toMatch(/^[abc]*$/);
});

// #### disallowedChars ####

it('validate string disallowedChars', async () => {
    type DisallowedChars = StringFormat<{disallowedChars: 'abc'}>;
    const isType = await isTypeFn<DisallowedChars>();
    expect(isType('a')).toBe(false);
    expect(isType('b')).toBe(false);
    expect(isType('c')).toBe(false);
    expect(isType('abc')).toBe(false);
    expect(isType('baaaaccc')).toBe(false);
    expect(isType('caaaabb')).toBe(false);
    expect(isType('d')).toBe(true);
    expect(isType('e')).toBe(true);
    expect(isType('deporte')).toBe(true);
});

it('get disallowedChars errors', async () => {
    type DisallowedChars = StringFormat<{disallowedChars: 'abc'}>;
    const typeErrors = await typeErrorsFn<DisallowedChars>();
    const expectedError = {expected: 'string', path: [], info: {format: 'disallowedChars', typeName: 'DisallowedChars'}};
    expect(typeErrors('a')).toEqual([expectedError]);
    expect(typeErrors('b')).toEqual([expectedError]);
    expect(typeErrors('c')).toEqual([expectedError]);
    expect(typeErrors('abc')).toEqual([expectedError]);
    expect(typeErrors('baaaaccc')).toEqual([expectedError]);
    expect(typeErrors('caaaabb')).toEqual([expectedError]);
    expect(typeErrors('d')).toEqual([]);
    expect(typeErrors('e')).toEqual([]);
    expect(typeErrors('deporte')).toEqual([]);
});

it('mock disallowedChars', async () => {
    type DisallowedChars = StringFormat<{disallowedChars: 'abc'}>;
    const mockType = mockTypeFn<DisallowedChars>();
    expect(mockType()).not.toMatch(/[abc]+/);
    expect(mockType()).not.toMatch(/[abc]+/);
    expect(mockType()).not.toMatch(/[abc]+/);
    expect(mockType()).not.toMatch(/[abc]+/);
    expect(mockType()).not.toMatch(/[abc]+/);
});

// #### multiple params ####

it('validate string with multiple params', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{pattern: typeof regex; sampleChars: 'abcdefgABCDEFG'; minLength: 5; maxLength: 8}>;
    const isType = await isTypeFn<Multi>();
    expect(isType('aaaaa1')).toBe(false); // length ok but not AlphaPattern
    expect(isType('aaaa')).toBe(false); // not min length
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
    expect(isType('aaaaaaa8')).toBe(false);
    expect(isType('aaaaaaaabmajkdodbd')).toBe(false); // not max length
});

it('get multiple params errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{pattern: typeof regex; sampleChars: 'abcdefgABCDEFG'; minLength: 5; maxLength: 8}>;
    const typeErrors = await typeErrorsFn<Multi>();
    expect(typeErrors('aaaaa1')).toEqual([{expected: 'string', path: [], info: {format: 'pattern', typeName: 'Multi'}}]);
    expect(typeErrors('aaaa')).toEqual([{expected: 'string', path: [], info: {format: 'minLength', typeName: 'Multi'}}]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
    expect(typeErrors('aaaaaaa8')).toEqual([{expected: 'string', path: [], info: {format: 'pattern', typeName: 'Multi'}}]);
    expect(typeErrors('aaaaaaaabmajk')).toEqual([{expected: 'string', path: [], info: {format: 'maxLength', typeName: 'Multi'}}]);
});

it('mock multiple params', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{
        pattern: typeof regex;
        minLength: 5;
        maxLength: 8;
        //
        samples: ['aaaaa', 'aaaBCaaa', 'DEaaac', 'aaabaaaC'];
    }>;
    const mockType = mockTypeFn<Multi>();
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(8);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(8);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(8);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType().length).toBeGreaterThanOrEqual(5);
    expect(mockType().length).toBeLessThanOrEqual(8);
});

it('provided sample must match all constrains', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{
        pattern: typeof regex;
        minLength: 5;
        maxLength: 8;
        // provided sample match pattern but not min length or max length, so mock will throw error
        samples: ['abcd'];
    }>;
    const mockType = mockTypeFn<Multi>();
    expect(() => mockType()).toThrow('provided sample [abcd] does not match all the constraints for type Multi');
});

// #### AlphaString type ####

it('validate string alpha', async () => {
    const isType = await isTypeFn<AlphaString<{minLength: 3}>>();
    expect(isType('abcdef')).toBe(true);
    expect(isType('ab')).toBe(false);
});

it('get alpha string errors', async () => {
    const typeErrors = await typeErrorsFn<AlphaString<{minLength: 3}>>();
    expect(typeErrors('abcdef')).toEqual([]);
    expect(typeErrors('ab')).toEqual([{expected: 'string', path: [], info: {format: 'minLength', typeName: 'AlphaString'}}]);
    expect(typeErrors('123')).toEqual([{expected: 'string', path: [], info: {format: 'pattern', typeName: 'AlphaString'}}]);
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
    expect(typeErrors('abcd2891')).toEqual([]);
    expect(typeErrors('12342891')).toEqual([]);
    expect(typeErrors('abcdCDHKO')).toEqual([]);
    expect(typeErrors('abcd+!]')).toEqual([
        {expected: 'string', path: [], info: {format: 'pattern', typeName: 'AlphaNumericString'}},
    ]);
    expect(typeErrors('ab')).toEqual([
        {expected: 'string', path: [], info: {format: 'minLength', typeName: 'AlphaNumericString'}},
    ]);
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
    const patternError = {expected: 'string', path: [], info: {format: 'pattern', typeName: 'NumericString'}};
    const maxLengthError = {expected: 'string', path: [], info: {format: 'maxLength', typeName: 'NumericString'}};
    const minLengthError = {expected: 'string', path: [], info: {format: 'minLength', typeName: 'NumericString'}};
    expect(typeErrors('1234')).toEqual([]);
    expect(typeErrors('12345')).toEqual([]);
    expect(typeErrors('1.23')).toEqual([patternError]);
    expect(typeErrors('1,23')).toEqual([patternError]);
    expect(typeErrors('123456')).toEqual([maxLengthError]);
    expect(typeErrors('12')).toEqual([minLengthError]);
    expect(typeErrors('abcd')).toEqual([patternError]);
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
    const lowercaseError = {expected: 'string', path: [], info: {format: 'lowercase', typeName: 'LowerString'}};
    const minLengthError = {expected: 'string', path: [], info: {format: 'minLength', typeName: 'LowerString'}};
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
    const uppercaseError = {expected: 'string', path: [], info: {format: 'uppercase', typeName: 'UpperString'}};
    const minLengthError = {expected: 'string', path: [], info: {format: 'minLength', typeName: 'UpperString'}};
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
    type CapitalString = StringFormat<{capitalize: true}>;
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
    const capitalizeError = {expected: 'string', path: [], info: {format: 'capitalize', typeName: 'CapitalString'}};
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
