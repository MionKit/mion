/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    buildJsonEncodeJITFn,
    buildJsonDecodeJITFn,
    buildIsTypeJITFn,
    buildTypeErrorsJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';

const rt = runType<boolean>();

it('validate boolean', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(true)).toBe(true);
    expect(validate(false)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate boolean + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(valWithErrors(true)).toEqual([]);
    expect(valWithErrors(false)).toEqual([]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'boolean'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'boolean'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt).fn;
    const typeValue = true;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = true;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = true;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('boolean');
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});
