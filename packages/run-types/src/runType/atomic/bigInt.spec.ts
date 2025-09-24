/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<bigint>();

it('validate bigint', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(1n)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate bigint + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(1n)).toEqual([]);
    expect(valWithErrors(BigInt(42))).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'bigint'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    expect(toJsonVal(1n)).toEqual('1');
    expect(toJsonVal(BigInt(42))).toEqual('42');
    expect(toJsonVal(90071992547409999n)).toEqual('90071992547409999');
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    expect(fromJsonVal('1')).toEqual(1n);
    expect(fromJsonVal('42')).toEqual(BigInt(42));
    expect(fromJsonVal('90071992547409999')).toEqual(90071992547409999n);
});

// Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 45-52)

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('bigint');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
