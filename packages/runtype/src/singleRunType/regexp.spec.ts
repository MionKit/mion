/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    getJitJsonEncodeFn,
    getJitJsonDecodeFn,
    getValidateJitFunction,
    getJitValidateWithErrorsFn,
    getJitMockFn,
} from '../jitCompiler';

const rt = runType<RegExp>();

const regexpsList = [
    /abc/, // Matches the string 'abc'
    /def/, // Matches the string 'def'
    /123/, // Matches the string '123'
    /xyz/, // Matches the string 'xyz'
    /[\w]+/, // Matches one or more word characters
    /\d{3}-\d{3}-\d{4}/, // Matches a phone number in the format XXX-XXX-XXXX
    /[A-Z]/, // Matches a single uppercase letter
    /[a-z]/, // Matches a single lowercase letter
    /\d+/, // Matches one or more digits
    /\s+/, // Matches one or more whitespace characters
    /^https?:\/\/[\w.-]+\.[a-zA-Z]{2,}$/i, // Matches a URL starting with http:// or https://
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Matches an email address
    /\b\d{2}\/\d{2}\/\d{4}\b/, // Matches a date in the format MM/DD/YYYY
    /\b\d{1,2}:\d{2}\b/, // Matches a time in the format HH:MM
    /\b\d{1,2}:\d{2}:\d{2}\b/, // Matches a time in the format HH:MM:SS
    /\b\d{1,2}\/\d{1,2}\/\d{2}\b/, // Matches a date in the format M/D/YY
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, // Matches a date in the format M/D/YYYY
    /\b\d{1,2}:\d{2}:\d{2} [AP]M\b/, // Matches a time in the format HH:MM:SS AM/PM
    /\b\d{1,2}:\d{2} [AP]M\b/, // Matches a time in the format HH:MM AM/PM
    /abc/gi, // Matches the string 'abc' with the global and case-insensitive flags
];

const regexpsStrings = regexpsList.map((regexp) => regexp.toString());

it('validate regexp', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(/abc/)).toBe(true);
    expect(validate(new RegExp('abc'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate regexp + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(/abc/)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: '', message: 'Expected to be a RegExp'}]);
    expect(valWithErrors(42)).toEqual([{path: '', message: 'Expected to be a RegExp'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be a RegExp'}]);
});

it('encode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    regexpsList.forEach((regexp, i) => {
        expect(toJson(regexp)).toEqual(regexpsStrings[i]);
    });
});

it('decode from json', () => {
    const fromJson = getJitJsonDecodeFn(rt);
    regexpsStrings.forEach((regexpString, i) => {
        expect(fromJson(regexpString)).toEqual(regexpsList[i]);
    });
    const phoneRegexp: RegExp = fromJson(regexpsStrings[5]);
    expect(phoneRegexp.test('999-999-9999')).toEqual(true);
    expect(phoneRegexp.test('XXX-XXX-XXXX')).toEqual(false);
    expect(phoneRegexp.test('zzasd123')).toEqual(false);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(mock() instanceof RegExp).toBe(true);
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
