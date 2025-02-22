/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockType, typeErrorsFn} from '../functions';
import {StringFormat} from './string.runtypes';

// #### maxLength ####

// maxLength isType
it('validate string max length 2', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const isType = await isTypeFn<Max5>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

// maxLength typeErrors
it('get max length errors', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const typeErrors = await typeErrorsFn<Max5>();
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([{expected: 'string', path: [], info: {format: 'maxLength', typeName: 'Max5'}}]);
});

// maxLength mock
it('mock max length', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    expect(mockType<Max5>().length).toBeLessThanOrEqual(5);
    expect(mockType<Max5>().length).toBeLessThanOrEqual(5);
    expect(mockType<Max5>().length).toBeLessThanOrEqual(5);
    expect(mockType<Max5>().length).toBeLessThanOrEqual(5);
    expect(mockType<Max5>().length).toBeLessThanOrEqual(5);
});

// #### minLength ####

// minLength isType
it('validate string min length', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const isType = await isTypeFn<Min5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
});

// minLength typeErrors
it('get min length errors', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const typeErrors = await typeErrorsFn<Min5>();
    expect(typeErrors('aaaa')).toEqual([{expected: 'string', path: [], info: {format: 'minLength', typeName: 'Min5'}}]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
});

// minLength mock
it('mock min length', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    expect(mockType<Min5>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Min5>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Min5>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Min5>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Min5>().length).toBeGreaterThanOrEqual(5);
});

// #### length ####

// length isType
it('validate string length', async () => {
    type Length5 = StringFormat<{length: 5}>;
    const isType = await isTypeFn<Length5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

// minLength typeErrors
it('get length errors', async () => {
    type Length5 = StringFormat<{length: 5}>;
    const typeErrors = await typeErrorsFn<Length5>();
    const expectedError = {expected: 'string', path: [], info: {format: 'length', typeName: 'Length5'}};
    expect(typeErrors('aaaa')).toEqual([expectedError]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([expectedError]);
});

// length mock
it('mock length', async () => {
    type Length5 = StringFormat<{length: 5}>;
    expect(mockType<Length5>().length).toBe(5);
    expect(mockType<Length5>().length).toBe(5);
    expect(mockType<Length5>().length).toBe(5);
    expect(mockType<Length5>().length).toBe(5);
    expect(mockType<Length5>().length).toBe(5);
});

// #### pattern ####

// pattern isType
it('validate string pattern', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Alpha = StringFormat<{pattern: typeof regex}>;
    const isType = await isTypeFn<Alpha>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaa1')).toBe(false);
});

// pattern typeErrors
it('get pattern errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Alpha = StringFormat<{pattern: typeof regex}>;
    const typeErrors = await typeErrorsFn<Alpha>();
    expect(typeErrors('aaaa')).toEqual([]);
    expect(typeErrors('aaaa1')).toEqual([{expected: 'string', path: [], info: {format: 'pattern', typeName: 'Alpha'}}]);
});

// pattern mock
it('mock pattern', async () => {
    const regex = /^[a-zA-Z]+$/;
    const samples = ['aaaanckjs', 'aaaXdKol'];
    // is not possible to automatically generate a string that matches the pattern so we need to provide samples manually
    type Alpha = StringFormat<{pattern: typeof regex; samples: ['aaaanckjs', 'aaaXdKol']}>;
    expect(mockType<Alpha>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Alpha>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Alpha>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Alpha>()).toMatch(/^[a-zA-Z]+$/);
    expect(samples).toContain(mockType<Alpha>());
    expect(samples).toContain(mockType<Alpha>());
    expect(samples).toContain(mockType<Alpha>());
    expect(samples).toContain(mockType<Alpha>());
});

it('mock pattern should throw if no samples afe provided', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Alpha = StringFormat<{pattern: typeof regex}>;
    expect(() => mockType<Alpha>()).toThrow("'samples' must be provided when 'pattern' is defined for type Alpha");
});

// #### allowedChars ####

// allowedChars isType
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

// allowedChars typeErrors
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
    expect(mockType<AllowedChars>()).toMatch(/[abc]+/);
    expect(mockType<AllowedChars>()).toMatch(/[abc]+/);
    expect(mockType<AllowedChars>()).toMatch(/[abc]+/);
    expect(mockType<AllowedChars>()).toMatch(/[abc]+/);
    expect(mockType<AllowedChars>()).toMatch(/[abc]+/);
});

// #### disallowedChars ####

// disallowedChars isType
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

// disallowedChars typeErrors
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
    expect(mockType<DisallowedChars>()).not.toMatch(/[abc]+/);
    expect(mockType<DisallowedChars>()).not.toMatch(/[abc]+/);
    expect(mockType<DisallowedChars>()).not.toMatch(/[abc]+/);
    expect(mockType<DisallowedChars>()).not.toMatch(/[abc]+/);
    expect(mockType<DisallowedChars>()).not.toMatch(/[abc]+/);
});

// #### multiple params ####

// multiple params isType
it('validate string with multiple params', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{pattern: typeof regex; minLength: 5; maxLength: 8}>;
    const isType = await isTypeFn<Multi>();
    expect(isType('aaaaa1')).toBe(false); // length ok but not alpha
    expect(isType('aaaa')).toBe(false); // not min length
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
    expect(isType('aaaaaaa8')).toBe(false);
    expect(isType('aaaaaaaabmajkdodbd')).toBe(false); // not max length
});

// multiple params typeErrors
it('get multiple params errors', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Multi = StringFormat<{pattern: typeof regex; minLength: 5; maxLength: 8}>;
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
    expect(mockType<Multi>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Multi>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Multi>().length).toBeLessThanOrEqual(8);
    expect(mockType<Multi>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Multi>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Multi>().length).toBeLessThanOrEqual(8);
    expect(mockType<Multi>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Multi>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Multi>().length).toBeLessThanOrEqual(8);
    expect(mockType<Multi>()).toMatch(/^[a-zA-Z]+$/);
    expect(mockType<Multi>().length).toBeGreaterThanOrEqual(5);
    expect(mockType<Multi>().length).toBeLessThanOrEqual(8);
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
    expect(() => mockType<Multi>()).toThrow('provided sample [abcd] does not match all the constraints for type Multi');
});
