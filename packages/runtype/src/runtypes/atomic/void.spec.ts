/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<void>();

it('validate void', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    function vd() {}
    expect(validate(undefined)).toBe(true);
    expect(validate(vd())).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate void + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'void'}]);
});

it('encode to json should return undefined', () => {
    const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
    expect(encode(undefined)).toBe(undefined);
});

it('decode from json should return undefined', () => {
    const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
    expect(decode('')).toBe(undefined);
});

it('json stringify should return undefined', () => {
    const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    expect(stringify(undefined)).toBe(undefined);
});

it('mock', () => {
    expect(rt.mock()).toBeUndefined();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
