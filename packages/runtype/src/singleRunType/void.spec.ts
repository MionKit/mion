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

const rt = runType<void>();

it('validate void', () => {
    const validate = getValidateFunction(rt);
    function vd() {}
    expect(validate(undefined)).toBe(true);
    expect(validate(vd())).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate void + errors', () => {
    const valWithErrors = getValidateWithErrorsFunction(rt);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: '.', message: 'Expected to be void'}]);
    expect(valWithErrors(42)).toEqual([{path: '.', message: 'Expected to be void'}]);
    expect(valWithErrors('hello')).toEqual([{path: '.', message: 'Expected to be void'}]);
});

it('encode to json should throw an error', () => {
    expect(() => getJsonEncodeFunction(rt)).toThrow('void can not be encoded to json.');
});

it('decode from json should throw an error', () => {
    expect(() => getJsonDecodeFunction(rt)).toThrow('void can not be decoded from json.');
});

it('mock', () => {
    const mock = getMockFunction(rt);
    expect(mock()).toBeUndefined();
});
