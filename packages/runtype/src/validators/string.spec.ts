/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn} from '../functions';
import {StringFormat} from '../formats/string.runtypes';

it('validate string max length 2', async () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const isType = await isTypeFn<Max5>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('validate string min length', async () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const isType = await isTypeFn<Min5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(true);
});

it('validate string length', async () => {
    type Length5 = StringFormat<{length: 5}>;
    const isType = await isTypeFn<Length5>();
    expect(isType('aaaa')).toBe(false);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('validate string pattern', async () => {
    const regex = /^[a-zA-Z]+$/;
    type Alpha = StringFormat<{pattern: typeof regex}>;
    const isType = await isTypeFn<Alpha>();
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaa1')).toBe(false);
});

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
