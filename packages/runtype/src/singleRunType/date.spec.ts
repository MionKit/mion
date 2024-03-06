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
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'date'}]);
});

it('encode/decode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    const fromJson = getJitJsonDecodeFn(rt);
    const typeValue = new Date();
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(mock() instanceof Date).toBe(true);
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
