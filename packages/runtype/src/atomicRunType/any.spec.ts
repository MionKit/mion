/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<any>();

it('validate any', () => {
    const validate = rt.isType;
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(true);
    expect(validate(42)).toBe(true);
    expect(validate('hello')).toBe(true);
});

it('validate any + errors', () => {
    const valWithErrors = rt.typeErrors;
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([]);
});

it('encode to json', () => {
    const toJson = rt.jsonEncode;
    const typeValue = null;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = rt.jsonDecode;
    const typeValue = null;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.jsonStringify;
    const fromJson = rt.jsonDecode;
    const typeValue = {a: 42, b: 'hello'};
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock).toBe('function');
    const validate = rt.isType;
    expect(validate(rt.mock())).toBe(true);
});
