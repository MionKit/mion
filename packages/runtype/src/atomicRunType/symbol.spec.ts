/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const rt = runType<symbol>();

it('validate symbol', () => {
    const validate = rt.jitFnIsType();
    expect(validate(Symbol())).toBe(true);
    expect(validate(Symbol('foo'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate symbol + errors', () => {
    const valWithErrors = rt.jitFnTypeErrors();
    expect(valWithErrors(Symbol())).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'symbol'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'symbol'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'symbol'}]);
});

it('encode to json', () => {
    const toJson = rt.jitFnJsonEncode();
    const typeValue = Symbol('foo');
    expect(toJson(typeValue)).toEqual('Symbol:foo');
});

it('decode from json', () => {
    const fromJson = rt.jitFnJsonDecode();
    const typeValue = Symbol('foo');
    const jsonValue = 'Symbol:foo';
    expect(fromJson(jsonValue).toString()).toEqual(typeValue.toString());
});

it('json stringify', () => {
    const jsonStringify = rt.jitFnJsonStringify();
    const fromJson = rt.jitFnJsonDecode();
    const typeValue = Symbol('foo');
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip.toString()).toEqual(typeValue.toString());
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('symbol');
    const validate = rt.jitFnIsType();
    expect(validate(rt.mock())).toBe(true);
});
