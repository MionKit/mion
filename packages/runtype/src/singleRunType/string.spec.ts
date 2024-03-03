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
} from '../jitRunner';

const rt = runType<string>();

it('validate string', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate('hello')).toBe(true);
    expect(validate(2)).toBe(false);
});

it('validate string + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(2)).toEqual([{path: '', message: 'Expected to be a String'}]);
});

it('encode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    expect(toJson('hello')).toBe('hello');
});

it('decode from json', () => {
    const fromJson = getJitJsonDecodeFn(rt);
    expect(fromJson('hello')).toBe('hello');
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(typeof mock()).toBe('string');
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
