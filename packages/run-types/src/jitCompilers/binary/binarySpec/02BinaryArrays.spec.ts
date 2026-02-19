/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {JitFunctions} from '../../../constants.functions.ts';
import {roundTrip, createSerializationFns} from './binaryHelpers.ts';

const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;

let ranTests = 0;
afterEach(() => ranTests++);

it('array', () => {
    const {rt, values} = SERIALIZATION_SPEC.ARRAYS.array.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('array of dates', () => {
    const {rt, values} = SERIALIZATION_SPEC.ARRAYS.array_date.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('undefined in array', () => {
    const {rt, values} = SERIALIZATION_SPEC.ARRAYS.undefined_in_array.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('multi dimensional array', () => {
    const {rt, values} = SERIALIZATION_SPEC.ARRAYS.multi_dimensional.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('non serializable items throws an error', () => {
    const {rt} = SERIALIZATION_SPEC.ARRAYS.non_serializable_in_array.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(
        'Arrays can not have non serializable types, ie: Symbol[], Function[], etc.'
    );
    expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow(
        'Arrays can not have non serializable types, ie: Symbol[], Function[], etc.'
    );
});

it('array circular', () => {
    const {rt, values} = SERIALIZATION_SPEC.ARRAYS.circular.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.ARRAYS).length;
    expect(ranTests).toBe(totalTest);
});
