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

const rt = runType<Date>();

it('validate Date', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(new Date())).toBe(true);
    expect(validate('hello')).toBe(false);
});

it('validate Date + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(new Date())).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be a valid Date'}]);
});

it('encode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    const typeValue = new Date();
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = getJitJsonDecodeFn(rt);
    const typeValue = new Date();
    const json = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(json)).toEqual(typeValue);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(mock() instanceof Date).toBe(true);
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
