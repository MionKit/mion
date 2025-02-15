/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, typeErrorsFn} from '../functions';
import {StringFormat} from '../formats/string.runtypes';

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
    expect(typeErrors('aaaaaa')).toEqual([{expected: 'maxLength', path: []}]);
});

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
    expect(typeErrors('aaaa')).toEqual([{expected: 'minLength', path: []}]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
});

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
    expect(typeErrors('aaaa')).toEqual([{expected: 'length', path: []}]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([{expected: 'length', path: []}]);
});

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
    expect(typeErrors('aaaa1')).toEqual([{expected: 'pattern', path: []}]);
});

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
    expect(typeErrors('d')).toEqual([{expected: 'allowedChars', path: []}]);
});

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
    expect(typeErrors('a')).toEqual([{expected: 'disallowedChars', path: []}]);
    expect(typeErrors('b')).toEqual([{expected: 'disallowedChars', path: []}]);
    expect(typeErrors('c')).toEqual([{expected: 'disallowedChars', path: []}]);
    expect(typeErrors('abc')).toEqual([{expected: 'disallowedChars', path: []}]);
    expect(typeErrors('baaaaccc')).toEqual([{expected: 'disallowedChars', path: []}]);
    expect(typeErrors('caaaabb')).toEqual([{expected: 'disallowedChars', path: []}]);
    expect(typeErrors('d')).toEqual([]);
    expect(typeErrors('e')).toEqual([]);
    expect(typeErrors('deporte')).toEqual([]);
});

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
    expect(typeErrors('aaaaa1')).toEqual([{expected: 'pattern', path: []}]);
    expect(typeErrors('aaaa')).toEqual([{expected: 'minLength', path: []}]);
    expect(typeErrors('aaaaa')).toEqual([]);
    expect(typeErrors('aaaaaa')).toEqual([]);
    expect(typeErrors('aaaaaaa8')).toEqual([{expected: 'pattern', path: []}]);
    expect(typeErrors('aaaaaaaabmajkdodbd')).toEqual([{expected: 'maxLength', path: []}]);
});
