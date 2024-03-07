/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {buildJsonEncodeJITFn, buildJsonDecodeJITFn, buildIsTypeJITFn, buildTypeErrorsJITFn, buildMockJITFn} from '../jitCompiler';

const rt = runType<string>();

it('validate string', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate('hello')).toBe(true);
    expect(validate(2)).toBe(false);
});

it('validate string + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(2)).toEqual([{path: '', expected: 'string'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    expect(toJson('hello')).toBe('hello');
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt);
    expect(fromJson('hello')).toBe('hello');
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    expect(typeof mock()).toBe('string');
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
