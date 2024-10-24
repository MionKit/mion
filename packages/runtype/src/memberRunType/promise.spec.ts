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
    buildJsonStringifyJITFn,
} from '../jitCompiler';

const rt = runType<Promise<string>>();

it('validate promise<string> should throw an error', () => {
    expect(() => buildIsTypeJITFn(rt)).toThrow('Jit compilation disabled for Promises.');
});

it('validate promise<string> + errors should throw an error', () => {
    expect(() => buildTypeErrorsJITFn(rt)).toThrow('Jit compilation disabled for Promises.');
});

it('encode to json should throw an error', () => {
    expect(() => buildJsonEncodeJITFn(rt)).toThrow('Jit compilation disabled for Promises.');
});

it('decode from json should throw an error', () => {
    expect(() => buildJsonDecodeJITFn(rt)).toThrow('Jit compilation disabled for Promises.');
});

it('json stringify', () => {
    expect(() => buildJsonStringifyJITFn(rt)).toThrow('Jit compilation disabled for Promises.');
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
