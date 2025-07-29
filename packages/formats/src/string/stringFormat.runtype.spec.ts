/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types/src/runTypeFunctions';
import {RunTypeError, TypeFormatError} from '@mionkit/core/src/types';
import {FormatString} from './stringFormat.runtype';

// #### maxLength ####

it('validate string max length 2', async () => {
    type Max5 = FormatString<{maxLength: 5}>;
    const isType = await isTypeFn<Max5>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('get max length errors', async () => {
    type Max5 = FormatString<{maxLength: 5}>;
    const typeErrors = await typeErrorsFn<Max5>();
    const format: TypeFormatError = {name: 'stringFormat', val: 5, formatPath: ['maxLength']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([expectedError]);
});

it('mock max length', async () => {
    type Max5 = FormatString<{maxLength: 5}>;
    const mockType = await mockTypeFn<Max5>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.length).toBeLessThanOrEqual(5);
    }
});

// #### minLength ####

it('validate string min length', async () => {
    type Min5 = FormatString<{minLength: 5}>;
    const isType = await isTypeFn<Min5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
});

it('get min length errors', async () => {
    type Min5 = FormatString<{minLength: 5}>;
    const typeErrors = await typeErrorsFn<Min5>();
    const format: TypeFormatError = {name: 'stringFormat', val: 5, formatPath: ['minLength']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('aaaa')).toEqual([expectedError]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
});

it('mock min length', async () => {
    type Min5 = FormatString<{minLength: 5}>;
    const mockType = await mockTypeFn<Min5>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.length).toBeGreaterThanOrEqual(5);
    }
});

// #### length ####

it('validate string length', async () => {
    type Length5 = FormatString<{length: 5}>;
    const isType = await isTypeFn<Length5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('get length errors', async () => {
    type Length5 = FormatString<{length: 5}>;
    const typeErrors = await typeErrorsFn<Length5>();
    const format: TypeFormatError = {name: 'stringFormat', val: 5, formatPath: ['length']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('aaaa')).toEqual([expectedError]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([expectedError]);
});

it('mock length', async () => {
    type Length5 = FormatString<{length: 5}>;
    const mockType = await mockTypeFn<Length5>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.length).toBe(5);
    }
});

// #### pattern ####

it('validate string pattern', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaPattern = FormatString<{
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
    }>;
    const isType = await isTypeFn<AlphaPattern>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaa1')).toBe(false);
});

it('get pattern errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaPattern = FormatString<{
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
    }>;
    const format: TypeFormatError = {name: 'stringFormat', val: 'only letters allowed', formatPath: ['pattern']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    const typeErrors = await typeErrorsFn<AlphaPattern>();
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaa1')).toEqual([expectedError]);
});

it('mock pattern and samples', async () => {
    const regex = /^[a-zA-Z]+$/;
    // is not possible to automatically generate a string that matches the pattern so we need to provide a list of valid characters manually
    type AlphaPattern = FormatString<{
        minLength: 1;
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
    }>;
    const mockType = await mockTypeFn<AlphaPattern>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toMatch(/^[a-zA-Z]+$/);
    }
});

it('mock pattern and samples as list of chars', async () => {
    const regex = /^[a-zA-Z]+$/;
    // is not possible to automatically generate a string that matches the pattern so we need to provide a list of valid characters manually
    type AlphaPattern = FormatString<{
        minLength: 1;
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
    }>;
    const mockType = await mockTypeFn<AlphaPattern>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toMatch(/^[a-zA-Z]+$/);
    }
});

// #### allowedValues ####

it('validate string allowedValues', async () => {
    type AllowedValues = FormatString<{minLength: 1; allowedValues: {val: ['a', 'b', 'c']; reason: 'only a, b or c allowed'}}>;
    const isType = await isTypeFn<AllowedValues>();
    expect(isType('a')).toBe(true);
    expect(isType('b')).toBe(true);
    expect(isType('c')).toBe(true);
    expect(isType('d')).toBe(false);
    expect(isType('ab')).toBe(false);
});

it('get allowedValues errors', async () => {
    type AllowedValues = FormatString<{minLength: 1; allowedValues: {val: ['a', 'b', 'c']; reason: 'only a, b or c allowed'}}>;
    const typeErrors = await typeErrorsFn<AllowedValues>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'only a, b or c allowed', formatPath: ['allowedValues']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([]);
    expect(typeErrors('b')).toEqual([]);
    expect(typeErrors('c')).toEqual([]);
    expect(typeErrors('d')).toEqual([expectedError]);
    expect(typeErrors('ab')).toEqual([expectedError]);
});

it('mock allowedValues', async () => {
    type AllowedValues = FormatString<{minLength: 1; allowedValues: {val: ['a', 'b', 'c']; reason: 'only a, b or c allowed'}}>;
    const mockType = await mockTypeFn<AllowedValues>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toMatch(/^(a|b|c)$/);
    }
});

it('validate string allowedValues with ignoreCase', async () => {
    type AllowedValuesIgnoreCase = FormatString<{
        allowedValues: {val: ['a', 'b', 'c']; reason: 'only a, b or c allowed'; ignoreCase: true};
    }>;
    const isType = await isTypeFn<AllowedValuesIgnoreCase>();
    expect(isType('a')).toBe(true);
    expect(isType('b')).toBe(true);
    expect(isType('c')).toBe(true);
    expect(isType('A')).toBe(true); // Should match due to ignoreCase
    expect(isType('B')).toBe(true); // Should match due to ignoreCase
    expect(isType('C')).toBe(true); // Should match due to ignoreCase
    expect(isType('d')).toBe(false);
    expect(isType('ab')).toBe(false);
});

it('get allowedValues errors with ignoreCase', async () => {
    type AllowedValuesIgnoreCase = FormatString<{
        allowedValues: {val: ['a', 'b', 'c']; reason: 'only a, b or c allowed'; ignoreCase: true};
    }>;
    const typeErrors = await typeErrorsFn<AllowedValuesIgnoreCase>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'only a, b or c allowed', formatPath: ['allowedValues']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([]);
    expect(typeErrors('A')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('b')).toEqual([]);
    expect(typeErrors('B')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('c')).toEqual([]);
    expect(typeErrors('C')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('d')).toEqual([expectedError]);
    expect(typeErrors('ab')).toEqual([expectedError]);
});

it('mock allowedValues with ignoreCase', async () => {
    type AllowedValuesIgnoreCase = FormatString<{
        minLength: 1;
        allowedValues: {val: ['a', 'b', 'c']; reason: 'only a, b or c allowed'; ignoreCase: true};
    }>;
    const mockType = await mockTypeFn<AllowedValuesIgnoreCase>();
    // Since we're using ignoreCase, the mock might return uppercase or lowercase
    // We'll check that it matches the pattern regardless of case
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.toLowerCase()).toMatch(/^(a|b|c)$/);
    }
});

// #### disallowedValues ####

it('validate string disallowedValues', async () => {
    type DisallowedValues = FormatString<{
        disallowedValues: {val: ['a', 'b', 'c']; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
    const isType = await isTypeFn<DisallowedValues>();
    expect(isType('a')).toBe(false);
    expect(isType('b')).toBe(false);
    expect(isType('c')).toBe(false);
    expect(isType('d')).toBe(true);
    expect(isType('ab')).toBe(true);
});

it('get disallowedValues errors', async () => {
    type DisallowedValues = FormatString<{
        disallowedValues: {val: ['a', 'b', 'c']; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
    const typeErrors = await typeErrorsFn<DisallowedValues>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'a, b or c not allowed', formatPath: ['disallowedValues']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([expectedError]);
    expect(typeErrors('b')).toEqual([expectedError]);
    expect(typeErrors('c')).toEqual([expectedError]);
    expect(typeErrors('d')).toEqual([]);
    expect(typeErrors('ab')).toEqual([]);
});

it('mock disallowedValues', async () => {
    type DisallowedValues = FormatString<{
        minLength: 1;
        disallowedValues: {val: ['a', 'b', 'c']; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
    const mockType = await mockTypeFn<DisallowedValues>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).not.toMatch(/^(a|b|c)$/);
    }
});

it('validate string disallowedValues with ignoreCase', async () => {
    type DisallowedValuesIgnoreCase = FormatString<{
        disallowedValues: {
            val: ['a', 'b', 'c'];
            reason: 'a, b or c not allowed';
            mockSamples: 'dfgthplk98765l';
            ignoreCase: true;
        };
    }>;
    const isType = await isTypeFn<DisallowedValuesIgnoreCase>();
    expect(isType('a')).toBe(false);
    expect(isType('b')).toBe(false);
    expect(isType('c')).toBe(false);
    expect(isType('A')).toBe(false); // Should not match due to ignoreCase
    expect(isType('B')).toBe(false); // Should not match due to ignoreCase
    expect(isType('C')).toBe(false); // Should not match due to ignoreCase
    expect(isType('d')).toBe(true);
    expect(isType('ab')).toBe(true);
});

it('get disallowedValues errors with ignoreCase', async () => {
    type DisallowedValuesIgnoreCase = FormatString<{
        disallowedValues: {
            val: ['a', 'b', 'c'];
            reason: 'a, b or c not allowed';
            mockSamples: 'dfgthplk98765l';
            ignoreCase: true;
        };
    }>;
    const typeErrors = await typeErrorsFn<DisallowedValuesIgnoreCase>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'a, b or c not allowed', formatPath: ['disallowedValues']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([expectedError]);
    expect(typeErrors('A')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('b')).toEqual([expectedError]);
    expect(typeErrors('B')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('c')).toEqual([expectedError]);
    expect(typeErrors('C')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('d')).toEqual([]);
    expect(typeErrors('ab')).toEqual([]);
});

it('mock disallowedValues with ignoreCase', async () => {
    type DisallowedValuesIgnoreCase = FormatString<{
        minLength: 1;
        disallowedValues: {
            val: ['a', 'b', 'c'];
            reason: 'a, b or c not allowed';
            mockSamples: 'dfgthplk98765l';
            ignoreCase: true;
        };
    }>;
    const mockType = await mockTypeFn<DisallowedValuesIgnoreCase>();
    // Since we're using ignoreCase, we need to check that it doesn't match regardless of case
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.toLowerCase()).not.toMatch(/^(a|b|c)$/);
    }
});

// #### allowedChars ####

it('validate string allowedChars', async () => {
    type AllowedChars = FormatString<{allowedChars: {val: 'abc'; reason: 'only a, b or c allowed'}}>;
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
    type AllowedChars = FormatString<{allowedChars: {val: '!\\/.*{}[]()^$?+'; reason: 'only special chars allowed'}}>;
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
    type AllowedChars = FormatString<{allowedChars: {val: 'abc'; reason: 'only a, b or c allowed'}}>;
    const typeErrors = await typeErrorsFn<AllowedChars>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'only a, b or c allowed', formatPath: ['allowedChars']};
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
    type AllowedChars = FormatString<{allowedChars: {val: 'abc'; reason: 'only a, b or c allowed'}}>;
    const mockType = await mockTypeFn<AllowedChars>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toMatch(/^[abc]*$/);
    }
});

it('validate string allowedChars with ignoreCase', async () => {
    type AllowedCharsIgnoreCase = FormatString<{allowedChars: {val: 'abc'; reason: 'only a, b or c allowed'; ignoreCase: true}}>;
    const isType = await isTypeFn<AllowedCharsIgnoreCase>();
    expect(isType('a')).toBe(true);
    expect(isType('b')).toBe(true);
    expect(isType('c')).toBe(true);
    expect(isType('A')).toBe(true); // Should match due to ignoreCase
    expect(isType('B')).toBe(true); // Should match due to ignoreCase
    expect(isType('C')).toBe(true); // Should match due to ignoreCase
    expect(isType('abc')).toBe(true);
    expect(isType('ABC')).toBe(true); // Should match due to ignoreCase
    expect(isType('AbC')).toBe(true); // Should match due to ignoreCase
    expect(isType('bAaAaCcC')).toBe(true); // Should match due to ignoreCase
    expect(isType('cAaAaBb')).toBe(true); // Should match due to ignoreCase
    expect(isType('d')).toBe(false);
    expect(isType('ad')).toBe(false);
});

it('get allowedChars errors with ignoreCase', async () => {
    type AllowedCharsIgnoreCase = FormatString<{allowedChars: {val: 'abc'; reason: 'only a, b or c allowed'; ignoreCase: true}}>;
    const typeErrors = await typeErrorsFn<AllowedCharsIgnoreCase>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'only a, b or c allowed', formatPath: ['allowedChars']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([]);
    expect(typeErrors('A')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('b')).toEqual([]);
    expect(typeErrors('B')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('c')).toEqual([]);
    expect(typeErrors('C')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('abc')).toEqual([]);
    expect(typeErrors('ABC')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('AbC')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('bAaAaCcC')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('cAaAaBb')).toEqual([]); // Should not have errors due to ignoreCase
    expect(typeErrors('d')).toEqual([expectedError]);
    expect(typeErrors('ad')).toEqual([expectedError]);
});

it('mock allowedChars with ignoreCase', async () => {
    type AllowedCharsIgnoreCase = FormatString<{
        minLength: 1;
        allowedChars: {val: 'abc'; reason: 'only a, b or c allowed'; ignoreCase: true};
    }>;
    const mockType = await mockTypeFn<AllowedCharsIgnoreCase>();
    // Since we're using ignoreCase, the mock might return uppercase or lowercase
    // We'll check that it matches the pattern regardless of case
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.toLowerCase()).toMatch(/^[abc]*$/);
    }
});

// #### disallowedChars ####

it('validate string disallowedChars', async () => {
    type DisallowedChars = FormatString<{
        disallowedChars: {val: 'abc'; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
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
    type DisallowedChars = FormatString<{
        disallowedChars: {
            val: '!\\/.*{}[]()^$?+';
            reason: 'special chars not allowed';
            mockSamples: 'dfgthplk98765l';
        };
    }>;
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
    type DisallowedChars = FormatString<{
        disallowedChars: {val: 'abc'; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
    const typeErrors = await typeErrorsFn<DisallowedChars>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'a, b or c not allowed', formatPath: ['disallowedChars']};
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
    type DisallowedChars = FormatString<{
        minLength: 1;
        disallowedChars: {val: 'abc'; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
    const mockType = await mockTypeFn<DisallowedChars>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).not.toMatch(/[abc]+/);
    }
});

it('validate string disallowedChars with ignoreCase', async () => {
    type DisallowedCharsIgnoreCase = FormatString<{
        disallowedChars: {val: 'abc'; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'; ignoreCase: true};
    }>;
    const isType = await isTypeFn<DisallowedCharsIgnoreCase>();
    expect(isType('a')).toBe(false);
    expect(isType('b')).toBe(false);
    expect(isType('c')).toBe(false);
    expect(isType('A')).toBe(false); // Should not match due to ignoreCase
    expect(isType('B')).toBe(false); // Should not match due to ignoreCase
    expect(isType('C')).toBe(false); // Should not match due to ignoreCase
    expect(isType('abc')).toBe(false);
    expect(isType('ABC')).toBe(false); // Should not match due to ignoreCase
    expect(isType('AbC')).toBe(false); // Should not match due to ignoreCase
    expect(isType('bAaAaCcC')).toBe(false); // Should not match due to ignoreCase
    expect(isType('cAaAaBb')).toBe(false); // Should not match due to ignoreCase
    expect(isType('d')).toBe(true);
    expect(isType('e')).toBe(true);
    expect(isType('deporte')).toBe(true);
    expect(isType('ad')).toBe(false); // Contains 'a'
    expect(isType('Ad')).toBe(false); // Contains 'A' which matches 'a' with ignoreCase
});

it('get disallowedChars errors with ignoreCase', async () => {
    type DisallowedCharsIgnoreCase = FormatString<{
        disallowedChars: {val: 'abc'; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'; ignoreCase: true};
    }>;
    const typeErrors = await typeErrorsFn<DisallowedCharsIgnoreCase>();
    const format: TypeFormatError = {name: 'stringFormat', val: 'a, b or c not allowed', formatPath: ['disallowedChars']};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    expect(typeErrors('a')).toEqual([expectedError]);
    expect(typeErrors('A')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('b')).toEqual([expectedError]);
    expect(typeErrors('B')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('c')).toEqual([expectedError]);
    expect(typeErrors('C')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('abc')).toEqual([expectedError]);
    expect(typeErrors('ABC')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('AbC')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('bAaAaCcC')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('cAaAaBb')).toEqual([expectedError]); // Should have errors due to ignoreCase
    expect(typeErrors('d')).toEqual([]);
    expect(typeErrors('e')).toEqual([]);
    expect(typeErrors('deporte')).toEqual([]);
    expect(typeErrors('ad')).toEqual([expectedError]); // Contains 'a'
    expect(typeErrors('Ad')).toEqual([expectedError]); // Contains 'A' which matches 'a' with ignoreCase
});

it('mock disallowedChars with ignoreCase', async () => {
    type DisallowedCharsIgnoreCase = FormatString<{
        disallowedChars: {val: 'abc'; reason: 'a, b or c not allowed'; mockSamples: 'dfgthplk98765l'; ignoreCase: true};
    }>;
    const mockType = await mockTypeFn<DisallowedCharsIgnoreCase>();
    // Since we're using ignoreCase, we need to check that it doesn't match regardless of case
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item.toLowerCase()).not.toMatch(/[abc]+/i);
    }
});

// #### multiple params ####

it('validate string with multiple params', async () => {
    const regex = /^[a-zA-Z]+$/;
    type AlphaParams = {
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    };
    const isType = await isTypeFn<FormatString<AlphaParams>>();
    expect(isType('aaaaa1')).toBe(false); // length ok but not AlphaPattern
    expect(isType('aaaa')).toBe(false); // not min length
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
    expect(isType('aaaaaaa8')).toBe(false);
    expect(isType('aaaaaaaabmajkdodbd')).toBe(false); // not max length
});

it('get multiple params errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = FormatString<{
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
    const typeErrors = await typeErrorsFn<Multi>();
    const format: TypeFormatError = {name: 'stringFormat', formatPath: [], val: ''};
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

it('only only one error is returned by string format', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = FormatString<{
        pattern: {val: typeof regex; mockSamples: 'abcdefgABCDEFG'; reason: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
    const typeErrors = await typeErrorsFn<Multi>();
    const format: TypeFormatError = {name: 'stringFormat', formatPath: [], val: ''};
    const expectedError: RunTypeError = {expected: 'string', path: [], format};
    const alphaError: RunTypeError = {
        ...expectedError,
        format: {...format, formatPath: ['pattern'], val: 'only letters allowed'},
    };
    const maxLengthError: RunTypeError = {...expectedError, format: {...format, formatPath: ['maxLength'], val: 8}};
    // ensures only one error is thrown by format
    expect(typeErrors('aaaaaaaabmaj2')).not.toEqual([maxLengthError, alphaError]);
});

it('mock multiple params', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = FormatString<{
        pattern: {val: typeof regex; mockSamples: ['aaaaa', 'aaaBCaaa', 'DEaaac', 'aaabaaaC']; reason: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
    const mockType = await mockTypeFn<Multi>();
    const mockedItems = Array.from({length: 20}, () => mockType());
    for (const item of mockedItems) {
        expect(item).toMatch(/^[a-zA-Z]+$/);
        expect(item.length).toBeGreaterThanOrEqual(5);
        expect(item.length).toBeLessThanOrEqual(8);
    }
});

it('provided sample must match all constrains', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = FormatString<{
        pattern: {val: typeof regex; mockSamples: ['abcd']; reason: 'only letters allowed'};
        minLength: 5;
        maxLength: 8;
    }>;
    const mockType = await mockTypeFn<Multi>();
    expect(() => mockType()).toThrow(
        'Parameter pattern.mockSamples "abcd" does not satisfies "minLength" in type Multi.mockSamples'
    );
});

it('Generated regexp should be scaped for allowedValues', async () => {
    type AllowedVals = FormatString<{
        allowedValues: {val: ['hello/.+?>^[a-z-A-Z]', 'a.b.c', '^(?:rome|paris)$']; reason: 'values not allowed'};
    }>;
    const isType = await isTypeFn<AllowedVals>();
    const typeErrors = await typeErrorsFn<AllowedVals>();
    const err: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'stringFormat', formatPath: ['allowedValues'], val: 'values not allowed'},
    };
    // allowed vals
    expect(isType('hello/.+?>^[a-z-A-Z]')).toBe(true);
    expect(isType('a.b.c')).toBe(true);
    expect(isType('^(?:rome|paris)$')).toBe(true);
    // extra chars so not allowed
    expect(isType('not-hello/.+?>^[a-z-A-Z]')).toBe(false);
    expect(isType('not-a.b.c')).toBe(false);
    expect(isType('not_^(?:rome|paris)$')).toBe(false);

    // allowed vals
    expect(typeErrors('hello/.+?>^[a-z-A-Z]')).toEqual([]);
    expect(typeErrors('a.b.c')).toEqual([]);
    expect(typeErrors('^(?:rome|paris)$')).toEqual([]);
    // extra chars so not allowed
    expect(typeErrors('not-hello/.+?>^[a-z-A-Z]')).toEqual([err]);
    expect(typeErrors('not-a.b.c')).toEqual([err]);
    expect(typeErrors('not_^(?:rome|paris)$')).toEqual([err]);
});

it('Generated regexp should be scaped for disallowedValues', async () => {
    type DisAllowedVals = FormatString<{
        disallowedValues: {
            val: ['hello/.+?>^[a-z-A-Z]', 'a.b.c', '^(?:rome|paris)$'];
            reason: 'values not allowed';
            mockSamples: ['lorem', 'ipsum', 'dolor'];
        };
    }>;
    const isType = await isTypeFn<DisAllowedVals>();
    const typeErrors = await typeErrorsFn<DisAllowedVals>();
    const err: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'stringFormat', formatPath: ['disallowedValues'], val: 'values not allowed'},
    };
    // not allowed vals
    expect(isType('hello/.+?>^[a-z-A-Z]')).not.toBe(true);
    expect(isType('a.b.c')).not.toBe(true);
    expect(isType('^(?:rome|paris)$')).not.toBe(true);
    // extra chars so  allowed
    expect(isType('not-hello/.+?>^[a-z-A-Z]')).not.toBe(false);
    expect(isType('not-a.b.c')).not.toBe(false);
    expect(isType('not_^(?:rome|paris)$')).not.toBe(false);

    // not allowed vals
    expect(typeErrors('hello/.+?>^[a-z-A-Z]')).not.toEqual([]);
    expect(typeErrors('a.b.c')).not.toEqual([]);
    expect(typeErrors('^(?:rome|paris)$')).not.toEqual([]);
    // extra chars so  allowed
    expect(typeErrors('not-hello/.+?>^[a-z-A-Z]')).not.toEqual([err]);
    expect(typeErrors('not-a.b.c')).not.toEqual([err]);
    expect(typeErrors('not_^(?:rome|paris)$')).not.toEqual([err]);
});

it('Generated regexp should be scaped for allowedChars', async () => {
    type AllowedChars = FormatString<{
        allowedChars: {val: '!\\/.*{}[]()^$?+'; reason: 'only special chars allowed'; mockSamples: '!\\/.*{}[]()^$?+'};
    }>;
    const isType = await isTypeFn<AllowedChars>();
    const typeErrors = await typeErrorsFn<AllowedChars>();
    const err: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'stringFormat', formatPath: ['allowedChars'], val: 'only special chars allowed'},
    };
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
    expect(isType('!')).toBe(true);
    expect(isType('a')).not.toBe(true);
    expect(isType('b')).not.toBe(true);
    expect(isType('c')).not.toBe(true);

    expect(typeErrors('!')).toEqual([]);
    expect(typeErrors('\\')).toEqual([]);
    expect(typeErrors('/')).toEqual([]);
    expect(typeErrors('.')).toEqual([]);
    expect(typeErrors('*')).toEqual([]);
    expect(typeErrors('{')).toEqual([]);
    expect(typeErrors('}')).toEqual([]);
    expect(typeErrors('[')).toEqual([]);
    expect(typeErrors(']')).toEqual([]);
    expect(typeErrors('(')).toEqual([]);
    expect(typeErrors(')')).toEqual([]);
    expect(typeErrors('^')).toEqual([]);
    expect(typeErrors('$')).toEqual([]);
    expect(typeErrors('?')).toEqual([]);
    expect(typeErrors('+')).toEqual([]);
    expect(typeErrors('!')).toEqual([]);
    expect(typeErrors('a')).toEqual([err]);
    expect(typeErrors('b')).toEqual([err]);
    expect(typeErrors('c')).toEqual([err]);
});

it('Generated regexp should be scaped for disallowedChars', async () => {
    type DisAllowedChars = FormatString<{
        disallowedChars: {val: '!\\/.*{}[]()^$?+'; reason: 'only special chars allowed'; mockSamples: 'dfgthplk98765l'};
    }>;
    const isType = await isTypeFn<DisAllowedChars>();
    const typeErrors = await typeErrorsFn<DisAllowedChars>();
    const err: RunTypeError = {
        expected: 'string',
        path: [],
        format: {name: 'stringFormat', formatPath: ['disallowedChars'], val: 'only special chars allowed'},
    };
    expect(isType('!')).not.toBe(true);
    expect(isType('\\')).not.toBe(true);
    expect(isType('/')).not.toBe(true);
    expect(isType('.')).not.toBe(true);
    expect(isType('*')).not.toBe(true);
    expect(isType('{')).not.toBe(true);
    expect(isType('}')).not.toBe(true);
    expect(isType('[')).not.toBe(true);
    expect(isType(']')).not.toBe(true);
    expect(isType('(')).not.toBe(true);
    expect(isType(')')).not.toBe(true);
    expect(isType('^')).not.toBe(true);
    expect(isType('$')).not.toBe(true);
    expect(isType('?')).not.toBe(true);
    expect(isType('+')).not.toBe(true);
    expect(isType('!')).not.toBe(true);
    expect(isType('a')).toBe(true);
    expect(isType('b')).toBe(true);
    expect(isType('c')).toBe(true);

    expect(typeErrors('!')).toEqual([err]);
    expect(typeErrors('\\')).toEqual([err]);
    expect(typeErrors('/')).toEqual([err]);
    expect(typeErrors('.')).toEqual([err]);
    expect(typeErrors('*')).toEqual([err]);
    expect(typeErrors('{')).toEqual([err]);
    expect(typeErrors('}')).toEqual([err]);
    expect(typeErrors('[')).toEqual([err]);
    expect(typeErrors(']')).toEqual([err]);
    expect(typeErrors('(')).toEqual([err]);
    expect(typeErrors(')')).toEqual([err]);
    expect(typeErrors('^')).toEqual([err]);
    expect(typeErrors('$')).toEqual([err]);
    expect(typeErrors('?')).toEqual([err]);
    expect(typeErrors('+')).toEqual([err]);
    expect(typeErrors('!')).toEqual([err]);
    expect(typeErrors('a')).toEqual([]);
    expect(typeErrors('b')).toEqual([]);
    expect(typeErrors('c')).toEqual([]);
});
