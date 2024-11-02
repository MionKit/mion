/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<number>();

it('validate number', () => {
    const validate = rt.jitFnIsType();
    expect(validate(42)).toBe(true);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate number + errors', () => {
    const valWithErrors = rt.jitFnTypeErrors();
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'number'}]);
});

it('encode to json', () => {
    const toJson = rt.jitFnJsonEncode();
    const typeValue = 42;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = rt.jitFnJsonDecode();
    const typeValue = 42;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.jitFnJsonStringify();
    const fromJson = rt.jitFnJsonDecode();
    const typeValue = 42;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('number');
    const validate = rt.jitFnIsType();
    expect(validate(rt.mock())).toBe(true);
});
