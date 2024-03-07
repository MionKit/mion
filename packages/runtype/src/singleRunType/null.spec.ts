/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {buildJsonEncodeJITFn, buildJsonDecodeJITFn, buildIsTypeJITFn, buildTypeErrorsJITFn, buildMockJITFn} from '../jitCompiler';

const rt = runType<null>();

it('validate null', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate null + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: '', expected: 'null'}]);
    expect(valWithErrors(42)).toEqual([{path: '', expected: 'null'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'null'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const typeValue = null;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = null;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    expect(mock()).toBeNull();
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
