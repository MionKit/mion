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

const rt = runType<symbol>();

it('validate symbol', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate(Symbol())).toBe(true);
    expect(validate(Symbol('foo'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate symbol + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors(Symbol())).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: '', expected: 'symbol'}]);
    expect(valWithErrors(42)).toEqual([{path: '', expected: 'symbol'}]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'symbol'}]);
});

it('encode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const typeValue = Symbol('foo');
    expect(toJson(typeValue)).toEqual('Symbol:foo');
});

it('decode from json', () => {
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = Symbol('foo');
    const jsonValue = 'Symbol:foo';
    expect(fromJson(jsonValue).toString()).toEqual(typeValue.toString());
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = Symbol('foo');
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip.toString()).toEqual(typeValue.toString());
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    expect(typeof mock()).toBe('symbol');
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
