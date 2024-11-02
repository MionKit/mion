/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<void>();

it('validate void', () => {
    const validate = rt.jitFnIsType();
    function vd() {}
    expect(validate(undefined)).toBe(true);
    expect(validate(vd())).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate void + errors', () => {
    const valWithErrors = rt.jitFnTypeErrors();
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'void'}]);
});

it('encode to json should return undefined', () => {
    const encode = rt.jitFnJsonEncode();
    expect(encode(undefined)).toBe(undefined);
});

it('decode from json should return undefined', () => {
    const decode = rt.jitFnJsonDecode();
    expect(decode('')).toBe(undefined);
});

it('json stringify should return undefined', () => {
    const stringify = rt.jitFnJsonStringify();
    expect(stringify(undefined)).toBe(undefined);
});

it('mock', () => {
    expect(rt.mock()).toBeUndefined();
    const validate = rt.jitFnIsType();
    expect(validate(rt.mock())).toBe(true);
});
