/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

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
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
    expect(toJsonVal(1n)).toEqual('1');
    expect(toJsonVal(BigInt(42))).toEqual('42');
    expect(toJsonVal(90071992547409999n)).toEqual('90071992547409999');
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    expect(fromJsonVal('1')).toEqual(1n);
    expect(fromJsonVal('42')).toEqual(BigInt(42));
    expect(fromJsonVal('90071992547409999')).toEqual(90071992547409999n);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = 1n;
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('bigint');
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
