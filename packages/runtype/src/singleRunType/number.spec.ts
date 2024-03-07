/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {buildJsonEncodeJITFn, buildJsonDecodeJITFn, buildIsTypeJITFn, buildTypeErrorsJITFn, buildMockJITFn} from '../jitCompiler';

const rt = runType<number>();

it('validate number', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate(42)).toBe(true);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate number + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'number'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const typeValue = 42;
    expect(toJson(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = 42;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJson(jsonValue)).toEqual(typeValue);
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    expect(typeof mock()).toBe('number');
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
