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

const rt = runType<string[]>();

it('validate string[]', () => {
    const validate = getValidateFunction(rt);
    expect(validate([])).toBe(true);
    expect(validate(['hello', 'world'])).toBe(true);
    expect(validate(['hello', 2])).toBe(false);
    expect(validate('hello')).toBe(false);
    console.log(validate.toString());
});

it('validate string[] + errors', () => {
    const valWithErrors = getValidateWithErrorsFunction(rt);
    expect(valWithErrors(['hello', 'world'])).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '.', message: 'Expected to be a valid string'}]);
});

it('encode to json', () => {
    const toJson = getJsonEncodeFunction(rt);
    const typeValue = ['hello', 'world'];
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = getJsonDecodeFunction(rt);
    const typeValue = ['hello', 'world'];
    const json = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(json)).toEqual(typeValue);
});

it('mock', () => {
    const mock = getMockFunction(rt);
    expect(mock() instanceof Array).toBe(true);
});
