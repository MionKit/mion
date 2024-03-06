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

const rt = runType<boolean>();

it('validate boolean', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(true)).toBe(true);
    expect(validate(false)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate boolean + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(true)).toEqual([]);
    expect(valWithErrors(false)).toEqual([]);
    expect(valWithErrors(42)).toEqual([{path: '', expected: 'boolean'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'boolean'}]);
});

it('encode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    const typeValue = true;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = getJitJsonDecodeFn(rt);
    const typeValue = true;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(typeof mock()).toBe('boolean');
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
