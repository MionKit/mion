/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<symbol>();

it('validate symbol', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(Symbol())).toBe(true);
    expect(validate(Symbol('foo'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate symbol + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(Symbol())).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'symbol'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'symbol'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'symbol'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    const typeValue = Symbol('foo');
    expect(toJsonVal(typeValue)).toEqual('Symbol:foo');
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const typeValue = Symbol('foo');
    const jsonValue = 'Symbol:foo';
    expect(fromJsonVal(jsonValue).toString()).toEqual(typeValue.toString());
});

// Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 158-165)

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('symbol');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
