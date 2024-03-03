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

const rt = runType<number>();

it('validate number', () => {
    const validate = getValidateFunction(rt);
    expect(validate(42)).toBe(true);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate number + errors', () => {
    const valWithErrors = getValidateWithErrorsFunction(rt);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '.', message: 'Expected to be a valid number'}]);
});

it('encode to json', () => {
    const toJson = getJsonEncodeFunction(rt);
    const typeValue = 42;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = getJsonDecodeFunction(rt);
    const typeValue = 42;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('mock', () => {
    const mock = getMockFunction(rt);
    expect(typeof mock()).toBe('number');
});
