/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {JitFnIDs} from '../constants';

const rt = runType<bigint>();

it('validate bigint', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(1n)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate bigint + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(1n)).toEqual([]);
    expect(valWithErrors(BigInt(42))).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'bigint'}]);
});

it('encode to json', () => {
    const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
    expect(toJson(1n)).toEqual('1');
    expect(toJson(BigInt(42))).toEqual('42');
    expect(toJson(90071992547409999n)).toEqual('90071992547409999');
});

it('decode from json', () => {
    const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
    expect(fromJson('1')).toEqual(1n);
    expect(fromJson('42')).toEqual(BigInt(42));
    expect(fromJson('90071992547409999')).toEqual(90071992547409999n);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
    const typeValue = 1n;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('bigint');
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
