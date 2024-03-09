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

const rt = runType<undefined>();

it('validate undefined', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate(undefined)).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate undefined + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: '', expected: 'undefined'}]);
    expect(valWithErrors(42)).toEqual([{path: '', expected: 'undefined'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'undefined'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const typeValue = undefined;
    expect(toJson(typeValue)).toEqual(null);
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = null;
    expect(fromJson(typeValue)).toEqual(undefined);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = undefined;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(rt.mock()).toBeUndefined();
    const validate = buildIsTypeJITFn(rt);
    expect(validate(rt.mock())).toBe(true);
});
