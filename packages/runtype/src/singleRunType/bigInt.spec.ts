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
    buildMockJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';

const rt = runType<bigint>();

it('validate bigint', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate(1n)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate bigint + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors(1n)).toEqual([]);
    expect(valWithErrors(BigInt(42))).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'bigint'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    expect(toJson(1n)).toEqual('1n');
    expect(toJson(BigInt(42))).toEqual('42n');
    expect(toJson(90071992547409999n)).toEqual('90071992547409999n');
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt);
    expect(fromJson('1n')).toEqual(1n);
    expect(fromJson('42n')).toEqual(BigInt(42));
    expect(fromJson('90071992547409999n')).toEqual(90071992547409999n);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = 1n;
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    expect(typeof mock()).toBe('bigint');
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
