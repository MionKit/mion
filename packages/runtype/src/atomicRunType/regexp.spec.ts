/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

import {mockRegExpsList} from '../constants';

const rt = runType<RegExp>();

it('validate regexp', () => {
    const validate = rt.jitFnIsType();
    expect(validate(/abc/)).toBe(true);
    expect(validate(new RegExp('abc'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate regexp + errors', () => {
    const valWithErrors = rt.jitFnTypeErrors();
    expect(valWithErrors(/abc/)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'regexp'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'regexp'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'regexp'}]);
});

it('encode/decode json', () => {
    const fromJson = rt.jitFnJsonDecode();
    const toJson = rt.jitFnJsonEncode();
    mockRegExpsList.forEach((regexp) => {
        expect(fromJson(JSON.parse(JSON.stringify(toJson(regexp))))).toEqual(regexp);
    });
});

it('json stringify', () => {
    const jsonStringify = rt.jitFnJsonStringify();
    const fromJson = rt.jitFnJsonDecode();
    mockRegExpsList.forEach((regexp) => {
        const typeValue = regexp;
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });
});

it('mock', () => {
    expect(rt.mock() instanceof RegExp).toBe(true);
    const validate = rt.jitFnIsType();
    expect(validate(rt.mock())).toBe(true);
});
