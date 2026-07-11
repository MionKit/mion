/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {JitFunctions} from '../../../constants.functions.ts';

const SERIALIZE_FN = JitFunctions.stringifyJson;

let ranTests = 0;
afterEach(() => ranTests++);

it('should throw error for Promise types', () => {
    const {rt} = SERIALIZATION_SPEC.OTHERS.promise_jsonStringify_error.getTestData();
    const errorMessage = `Jit compilation disabled for Non Serializable types.`;
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(errorMessage);
});

it('should throw error for non-serializable atomic types', () => {
    const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow();
});

it('should throw error for non-serializable types in interfaces', () => {
    const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable_interface.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow();
});

it('should throw error for non-serializable types in arrays', () => {
    const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable_array.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow();
});

it('should throw error for non-serializable types in tuples', () => {
    const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable_tuple.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)()).toThrow();
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.OTHERS).length;
    expect(ranTests).toBe(totalTest);
});
