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

const rt = runType<void>();

it('validate void', () => {
    const validate = getValidateJitFunction(rt);
    function vd() {}
    expect(validate(undefined)).toBe(true);
    expect(validate(vd())).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate void + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: '', expected: 'void'}]);
    expect(valWithErrors(42)).toEqual([{path: '', expected: 'void'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'void'}]);
});

it('encode to json should throw an error', () => {
    expect(() => getJitJsonEncodeFn(rt)).toThrow('void can not be encoded to json.');
});

it('decode from json should throw an error', () => {
    expect(() => getJitJsonDecodeFn(rt)).toThrow('void can not be decoded from json.');
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(mock()).toBeUndefined();
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
