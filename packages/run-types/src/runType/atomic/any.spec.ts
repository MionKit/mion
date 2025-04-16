/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFunctions} from '../../constants';
import {runType} from '../../lib/runType';

const rt = runType<any>();

it('validate any should throw error', () => {
    expect(() => rt.createJitFunction(JitFunctions.isType)).toThrow('Cannot compile isType for any type.');
});

it('validate any + errors should throw error', () => {
    expect(() => rt.createJitFunction(JitFunctions.typeErrors)).toThrow('Cannot compile typeErrors for any type.');
});

it('encode to json should throw error', () => {
    expect(() => rt.createJitFunction(JitFunctions.toJsonVal)).toThrow('Cannot compile toJsonVal for any type.');
});

it('decode from json should throw error', () => {
    expect(() => rt.createJitFunction(JitFunctions.fromJsonVal)).toThrow('Cannot compile fromJsonVal for any type.');
});

it('json stringify should throw error', () => {
    expect(() => rt.createJitFunction(JitFunctions.jsonStringify)).toThrow('Cannot compile jsonStringify for any type.');
});

it('mock should throw error', async () => {
    await expect(rt.mock()).rejects.toThrow('Cannot mock any type.');
});
