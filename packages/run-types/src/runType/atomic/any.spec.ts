/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFunctions} from '../../constants.functions';
import {runType} from '../../lib/runType';

const rt = runType<any>();

it('validate any', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(true);
    expect(validate(42)).toBe(true);
    expect(validate('hello')).toBe(true);
});

it('validate any + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    const typeValue = null;
    expect(toJsonVal(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const typeValue = null;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJsonVal(jsonValue)).toEqual(typeValue);
});

// Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 71-78)

it('mock', async () => {
    const mocked = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
