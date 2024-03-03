/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    getJsonEncodeFunction,
    getJsonDecodeFunction,
    getValidateFunction,
    getValidateWithErrorsFunction,
    getMockFunction,
} from '../jitRunner';

const rt = runType<bigint>();

it('validate bigint', () => {
    const validate = getValidateFunction(rt);
    expect(validate(1n)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate bigint + errors', () => {
    const valWithErrors = getValidateWithErrorsFunction(rt);
    expect(valWithErrors(1n)).toEqual([]);
    expect(valWithErrors(BigInt(42))).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '.', message: 'Expected to be a valid bigint'}]);
});

it('encode to json', () => {
    const toJson = getJsonEncodeFunction(rt);
    expect(toJson(1n)).toEqual('1');
    expect(toJson(BigInt(42))).toEqual('42');
    expect(toJson(90071992547409999n)).toEqual('90071992547409999');
});

it('decode from json', () => {
    const fromJson = getJsonDecodeFunction(rt);
    expect(fromJson('1')).toEqual(1n);
    expect(fromJson('42')).toEqual(BigInt(42));
    expect(fromJson('90071992547409999')).toEqual(90071992547409999n);
});

it('mock', () => {
    const mock = getMockFunction(rt);
    expect(typeof mock()).toBe('bigint');
});
