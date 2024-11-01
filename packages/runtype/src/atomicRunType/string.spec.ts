/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<string>();

it('validate string', () => {
    const validate = rt.isType;
    expect(validate('hello')).toBe(true);
    expect(validate(2)).toBe(false);
});

it('validate string + errors', () => {
    const valWithErrors = rt.typeErrors;
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(2)).toEqual([{path: [], expected: 'string'}]);
});

it('encode to json', () => {
    const toJson = rt.jsonEncode;
    expect(toJson('hello')).toBe('hello');
});

it('decode from json', () => {
    const fromJson = rt.jsonDecode;
    expect(fromJson('hello')).toBe('hello');
});

it('json stringify', () => {
    const jsonStringify = rt.jsonStringify;
    const fromJson = rt.jsonDecode;
    const typeValue = 'hello';
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('string');
    const validate = rt.isType;
    expect(validate(rt.mock())).toBe(true);
});
