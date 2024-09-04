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

const rt = runType<void>();

it('validate void', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    function vd() {}
    expect(validate(undefined)).toBe(true);
    expect(validate(vd())).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate void + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'void'}]);
});

it('encode to json should return undefined', () => {
    const encode = buildJsonEncodeJITFn(rt).fn;
    expect(encode(undefined)).toBe(undefined);
});

it('decode from json should return undefined', () => {
    const decode = buildJsonDecodeJITFn(rt).fn;
    expect(decode('')).toBe(undefined);
});

it('json stringify should return undefined', () => {
    const stringify = buildJsonStringifyJITFn(rt).fn;
    expect(stringify(undefined)).toBe(undefined);
});

it('mock', () => {
    expect(rt.mock()).toBeUndefined();
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});
