/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<null>();

it('validate null', () => {
    const validate = rt.jitFnIsType();
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate null + errors', () => {
    const valWithErrors = rt.jitFnTypeErrors();
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'null'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'null'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'null'}]);
});

it('encode to json', () => {
    const toJson = rt.jitFnJsonEncode();
    const typeValue = null;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = rt.jitFnJsonDecode();
    const typeValue = null;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.jitFnJsonStringify();
    const fromJson = rt.jitFnJsonDecode();
    const typeValue = null;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(rt.mock()).toBeNull();
    const validate = rt.jitFnIsType();
    expect(validate(rt.mock())).toBe(true);
});
