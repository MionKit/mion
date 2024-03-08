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

const rt = runType<never>();

it('validate never', () => {
    expect(() => buildIsTypeJITFn(rt)).toThrow('Never type cannot exist at runtime.');
});

it('validate never + errors', () => {
    expect(() => buildTypeErrorsJITFn(rt)).toThrow('Never type cannot exist at runtime.');
});

it('encode to json should throw an error', () => {
    expect(() => buildJsonEncodeJITFn(rt)).toThrow('Never type cannot be encoded to JSON.');
});

it('decode from json should throw an error', () => {
    expect(() => buildJsonDecodeJITFn(rt)).toThrow('Never type cannot be decoded from JSON.');
});

it('json stringify', () => {
    expect(() => buildJsonStringifyJITFn(rt)).toThrow('Never type cannot be stringified.');
});

it('mock', () => {
    expect(() => buildMockJITFn(rt)).toThrow('Never type cannot be mocked.');
});
