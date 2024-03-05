/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    getJitJsonEncodeFn,
    getJitJsonDecodeFn,
    getValidateJitFunction,
    getJitValidateWithErrorsFn,
    getJitMockFn,
} from '../jitCompiler';

const rt = runType<never>();

it('validate never', () => {
    expect(() => getValidateJitFunction(rt)).toThrow('Never type cannot exist at runtime.');
});

it('validate never + errors', () => {
    expect(() => getJitValidateWithErrorsFn(rt)).toThrow('Never type cannot exist at runtime.');
});

it('encode to json should throw an error', () => {
    expect(() => getJitJsonEncodeFn(rt)).toThrow('Never type cannot be encoded to JSON.');
});

it('decode from json should throw an error', () => {
    expect(() => getJitJsonDecodeFn(rt)).toThrow('Never type cannot be decoded from JSON.');
});

it('mock', () => {
    expect(() => getJitMockFn(rt)).toThrow('Never type cannot be mocked.');
});
