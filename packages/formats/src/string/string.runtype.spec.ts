/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '../../../runtype/src/functions';
import {RunTypeError, TypeFormatError} from '../../../runtype/src/types';
import {StringFormat} from './string.runtype';

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
    const format: TypeFormatError = {name: 'strFormat', val: 5, formatPath: ['maxLength']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([expectedError]);
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
    const format: TypeFormatError = {name: 'strFormat', val: 5, formatPath: ['minLength']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('aaaa')).toEqual([expectedError]);
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
    const format: TypeFormatError = {name: 'strFormat', val: 5, formatPath: ['length']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
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
    type AlphaPattern = StringFormat<{
        pattern: {regexp: typeof regex; sampleChars: 'abcdefgABCDEFG'; message: 'only letters allowed'};
    }>;
    const isType = await isTypeFn<AlphaPattern>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaa1')).toBe(false);
});

it('get pattern errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaPattern = StringFormat<{
        pattern: {regexp: typeof regex; sampleChars: 'abcdefgABCDEFG'; message: 'only letters allowed'};
    }>;
    const format: TypeFormatError = {name: 'strFormat', val: 'only letters allowed', formatPath: ['pattern']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    const typeErrors = await typeErrorsFn<AlphaPattern>();
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaa1')).toEqual([expectedError]);
});

it('mock pattern and samples', async () => {
    const regex = /^[a-zA-Z]+$/;
    const samples = ['aaaanckjs', 'aaaXdKol'];
    // is not possible to automatically generate a string that matches the pattern so we need to provide samples manually
    type AlphaPattern = StringFormat<{
        pattern: {regexp: typeof regex; samples: ['aaaanckjs', 'aaaXdKol']; message: 'only letters allowed'};
    }>;
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
    type AlphaPattern = StringFormat<{
        pattern: {regexp: typeof regex; sampleChars: 'abcdefgABCDEFG'; message: 'only letters allowed'};
    }>;
    const mockType = mockTypeFn<AlphaPattern>();
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType()).toMatch(/^[a-zA-Z]+$/);
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
    expect(isType('ad')).toBe(false);
});

it('validate string allowedChars that include characters that needs to be escaped in regexp', async () => {
    type AllowedChars = StringFormat<{allowedChars: '!\\/.*{}[]()^$?+'}>;
    const isType = await isTypeFn<AllowedChars>();
    expect(isType('!')).toBe(true);
    expect(isType('\\')).toBe(true);
    expect(isType('/')).toBe(true);
    expect(isType('.')).toBe(true);
    expect(isType('*')).toBe(true);
    expect(isType('{')).toBe(true);
    expect(isType('}')).toBe(true);
    expect(isType('[')).toBe(true);
    expect(isType(']')).toBe(true);
    expect(isType('(')).toBe(true);
    expect(isType(')')).toBe(true);
    expect(isType('^')).toBe(true);
    expect(isType('$')).toBe(true);
    expect(isType('?')).toBe(true);
    expect(isType('+')).toBe(true);
    expect(isType('a')).toBe(false);
    expect(isType('a?')).toBe(false);
});

it('get allowedChars errors', async () => {
    type AllowedChars = StringFormat<{allowedChars: 'abc'}>;
    const typeErrors = await typeErrorsFn<AllowedChars>();
    const format: TypeFormatError = {name: 'strFormat', val: 'abc', formatPath: ['allowedChars']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([]);
    expect(typeErrors('b')).toEqual([]);
    expect(typeErrors('c')).toEqual([]);
    expect(typeErrors('abc')).toEqual([]);
    expect(typeErrors('baaaaccc')).toEqual([]);
    expect(typeErrors('caaaabb')).toEqual([]);
    expect(typeErrors('d')).toEqual([expectedError]);
    expect(typeErrors('ad')).toEqual([expectedError]);
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
    expect(isType('ad')).toBe(false);
});

it('validate string disallowedChars that include characters that needs to be escaped in regexp', async () => {
    type DisallowedChars = StringFormat<{disallowedChars: '!\\/.*{}[]()^$?+'}>;
    const isType = await isTypeFn<DisallowedChars>();
    expect(isType('!')).toBe(false);
    expect(isType('\\')).toBe(false);
    expect(isType('/')).toBe(false);
    expect(isType('.')).toBe(false);
    expect(isType('*')).toBe(false);
    expect(isType('{')).toBe(false);
    expect(isType('}')).toBe(false);
    expect(isType('[')).toBe(false);
    expect(isType(']')).toBe(false);
    expect(isType('(')).toBe(false);
    expect(isType(')')).toBe(false);
    expect(isType('^')).toBe(false);
    expect(isType('$')).toBe(false);
    expect(isType('?')).toBe(false);
    expect(isType('+')).toBe(false);
    expect(isType('a')).toBe(true);
    expect(isType('a?')).toBe(false);
});

it('get disallowedChars errors', async () => {
    type DisallowedChars = StringFormat<{disallowedChars: 'abc'}>;
    const typeErrors = await typeErrorsFn<DisallowedChars>();
    const format: TypeFormatError = {name: 'strFormat', val: 'abc', formatPath: ['disallowedChars']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([expectedError]);
    expect(typeErrors('b')).toEqual([expectedError]);
    expect(typeErrors('c')).toEqual([expectedError]);
    expect(typeErrors('abc')).toEqual([expectedError]);
    expect(typeErrors('baaaaccc')).toEqual([expectedError]);
    expect(typeErrors('caaaabb')).toEqual([expectedError]);
    expect(typeErrors('d')).toEqual([]);
    expect(typeErrors('e')).toEqual([]);
    expect(typeErrors('deporte')).toEqual([]);
    expect(typeErrors('ad')).toEqual([expectedError]);
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
    type Multi = StringFormat<{
        pattern: {regexp: typeof regex; sampleChars: 'abcdefgABCDEFG'; message: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
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
    type Multi = StringFormat<{
        pattern: {regexp: typeof regex; sampleChars: 'abcdefgABCDEFG'; message: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
    const typeErrors = await typeErrorsFn<Multi>();
    const format: TypeFormatError = {name: 'strFormat', formatPath: []};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    const alphaError: RunTypeError = {
        ...expectedError,
        format: {...format, formatPath: ['pattern'], val: 'only letters allowed'},
    };
    const minLengthError: RunTypeError = {...expectedError, format: {...format, formatPath: ['minLength'], val: 5}};
    const maxLengthError: RunTypeError = {...expectedError, format: {...format, formatPath: ['maxLength'], val: 8}};
    expect(typeErrors('aaaaa1')).toEqual([alphaError]);
    expect(typeErrors('aaaa')).toEqual([minLengthError]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
    expect(typeErrors('aaaaaaa8')).toEqual([alphaError]);
    expect(typeErrors('aaaaaaaabmaj2')).toEqual([maxLengthError]);
});

it('mock multiple params', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{
        pattern: {regexp: typeof regex; samples: ['aaaaa', 'aaaBCaaa', 'DEaaac', 'aaabaaaC']; message: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
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
        pattern: {regexp: typeof regex; samples: ['abcd']; message: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
    const mockType = mockTypeFn<Multi>();
    expect(() => mockType()).toThrow('sample "abcd" fails constraints in type Multi');
});
