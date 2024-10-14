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

const rt = runType<never>();

it('validate never', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(true)).toBe(false);
    expect(validate(false)).toBe(false);
    expect(validate(1)).toBe(false);
    expect(validate('3')).toBe(false);
    expect(validate({})).toBe(false);
});

it('validate never + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(valWithErrors(true)).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors(false)).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors(1)).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors('3')).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors({})).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'never'}]);
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
    expect(() => rt.mock()).toThrow('Never type cannot be mocked.');
});
