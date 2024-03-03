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

const rt = runType<null>();

it('validate null', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate null + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: '', message: 'Expected to be null'}]);
    expect(valWithErrors(42)).toEqual([{path: '', message: 'Expected to be null'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be null'}]);
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
    expect(mock()).toBeNull();
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
