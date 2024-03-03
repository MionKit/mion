/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    getJsonEncodeFunction,
    getJsonDecodeFunction,
    getValidateFunction,
    getValidateWithErrorsFunction,
    getMockFunction,
} from '../jitRunner';

const rt = runType<symbol>();

it('validate symbol', () => {
    const validate = getValidateFunction(rt);
    expect(validate(Symbol())).toBe(true);
    expect(validate(Symbol('foo'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate symbol + errors', () => {
    const valWithErrors = getValidateWithErrorsFunction(rt);
    expect(valWithErrors(Symbol())).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: '.', message: 'Expected to be a symbol'}]);
    expect(valWithErrors(42)).toEqual([{path: '.', message: 'Expected to be a symbol'}]);
    expect(valWithErrors('hello')).toEqual([{path: '.', message: 'Expected to be a symbol'}]);
});

it('encode to json should throw an error', () => {
    expect(() => getJsonEncodeFunction(rt)).toThrow('Symbol encode to json not supported.');
});

it('decode from json should throw an error', () => {
    expect(() => getJsonDecodeFunction(rt)).toThrow('Symbol decode from json supported.');
});

it('mock', () => {
    const mock = getMockFunction(rt);
    expect(typeof mock()).toBe('symbol');
});
