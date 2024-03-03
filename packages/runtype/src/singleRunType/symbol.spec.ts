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

const rt = runType<symbol>();

it('validate symbol', () => {
    const validate = getValidateJitFunction(rt);
    expect(validate(Symbol())).toBe(true);
    expect(validate(Symbol('foo'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate symbol + errors', () => {
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors(Symbol())).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: '', message: 'Expected to be a Symbol'}]);
    expect(valWithErrors(42)).toEqual([{path: '', message: 'Expected to be a Symbol'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be a Symbol'}]);
});

it('encode to json should throw an error', () => {
    expect(() => getJitJsonEncodeFn(rt)).toThrow('Symbol encode to json not supported.');
});

it('decode from json should throw an error', () => {
    expect(() => getJitJsonDecodeFn(rt)).toThrow('Symbol decode from json supported.');
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    expect(typeof mock()).toBe('symbol');
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
