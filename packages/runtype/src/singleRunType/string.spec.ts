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

const rt = runType<string>();

it('validate string', () => {
    const validate = getValidateFunction(rt);
    expect(validate('hello')).toBe(true);
    expect(validate(2)).toBe(false);
});

it('validate string + errors', () => {
    const valWithErrors = getValidateWithErrorsFunction(rt);
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(2)).toEqual([{path: '.', message: 'Expected to be a string'}]);
});

it('encode to json', () => {
    const toJson = getJsonEncodeFunction(rt);
    expect(toJson('hello')).toBe('hello');
});

it('decode from json', () => {
    const fromJson = getJsonDecodeFunction(rt);
    expect(fromJson('hello')).toBe('hello');
});

it('mock', () => {
    const mock = getMockFunction(rt);
    expect(typeof mock()).toBe('string');
});
