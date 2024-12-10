/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<symbol>();

it('validate symbol', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(Symbol())).toBe(true);
    expect(validate(Symbol('foo'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate symbol + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(Symbol())).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'symbol'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'symbol'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'symbol'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
    const typeValue = Symbol('foo');
    expect(toJsonVal(typeValue)).toEqual('Symbol:foo');
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = Symbol('foo');
    const jsonValue = 'Symbol:foo';
    expect(fromJsonVal(jsonValue).toString()).toEqual(typeValue.toString());
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = Symbol('foo');
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip.toString()).toEqual(typeValue.toString());
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('symbol');
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
