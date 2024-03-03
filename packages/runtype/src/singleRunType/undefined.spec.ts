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

const rt = runType<undefined>();

it('validate undefined', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(undefined)).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate undefined + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: '', message: 'Expected to be undefined'}]);
    expect(valWithErrors(42)).toEqual([{path: '', message: 'Expected to be undefined'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be undefined'}]);
});

it('encode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    const typeValue = undefined;
    expect(toJson(typeValue)).toEqual(null);
});

it('decode from json', () => {
    const fromJson = getJitJsonDecodeFn(rt);
    const typeValue = null;
    expect(fromJson(typeValue)).toEqual(undefined);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(mock()).toBeUndefined();
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
