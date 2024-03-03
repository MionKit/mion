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

const rt = runType<any>();

it('validate any', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(true);
    expect(validate(42)).toBe(true);
    expect(validate('hello')).toBe(true);
});

it('validate any + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([]);
});

it('encode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    const typeValue = null;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = getJitJsonDecodeFn(rt);
    const typeValue = null;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(typeof mock).toBe('function');
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
