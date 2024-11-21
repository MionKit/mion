/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import {getJITFnHash} from '../../lib/jitCompiler';
import {jitUtils} from '../../lib/jitUtils';

const rt = runType<Promise<string>>();

it('Ensures when compiling a function throws an error the jit compiler is not stored in cache', () => {
    expect(() => rt.createJitFunction(JitFnIDs.isType)).toThrow('Jit compilation disabled for Promises.');
    expect(jitUtils.getJIT(getJITFnHash(JitFnIDs.isType, rt as any))).toBe(undefined);
});

it('validate promise<string> should throw an error', () => {
    expect(() => rt.createJitFunction(JitFnIDs.isType)).toThrow('Jit compilation disabled for Promises.');
});

it('validate promise<string> + errors should throw an error', () => {
    expect(() => rt.createJitFunction(JitFnIDs.typeErrors)).toThrow('Jit compilation disabled for Promises.');
});

it('encode to json should throw an error', () => {
    expect(() => rt.createJitFunction(JitFnIDs.jsonEncode)).toThrow('Jit compilation disabled for Promises.');
});

it('decode from json should throw an error', () => {
    expect(() => rt.createJitFunction(JitFnIDs.jsonDecode)).toThrow('Jit compilation disabled for Promises.');
});

it('json stringify', () => {
    expect(() => rt.createJitFunction(JitFnIDs.jsonStringify)).toThrow('Jit compilation disabled for Promises.');
});

it('mock', async () => {
    const mock = rt.mock();
    const result = await mock;
    expect(mock instanceof Promise).toBe(true);
    expect(typeof result).toBe('string');
});

it('mock with reject', async () => {
    try {
        const mock = rt.mock({promiseTimeOut: 1, promiseReject: new Error('rejected')});
        await mock;
        throw new Error('promise not rejected');
    } catch (error: any) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(error.message).toBe('rejected');
    }
});
