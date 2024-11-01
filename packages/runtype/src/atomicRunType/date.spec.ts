/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<Date>();

it('validate Date', () => {
    const validate = rt.isType;
    expect(validate(new Date())).toBe(true);
    expect(validate('hello')).toBe(false);
});

it('validate Date + errors', () => {
    const valWithErrors = rt.typeErrors;
    expect(valWithErrors(new Date())).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'date'}]);
});

it('encode/decode to json', () => {
    const toJson = rt.jsonEncode;
    const fromJson = rt.jsonDecode;
    const typeValue = new Date();
    expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.jsonStringify;
    const fromJson = rt.jsonDecode;
    const typeValue = new Date();
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(rt.mock() instanceof Date).toBe(true);
    const validate = rt.isType;
    expect(validate(rt.mock())).toBe(true);
});
