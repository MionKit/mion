/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {normalizeForComparison} from '../../equalsHelpers.ts';
import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {roundTrip, createSerializationFns} from './binaryHelpers.ts';

let ranTests = 0;
afterEach(() => ranTests++);

it('tuple', () => {
    const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('tuple with optional params', () => {
    const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple_with_optional.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple_with_optional.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        // Use normalizeForComparison to handle Vitest's stricter array comparison with optional elements
        const {actual, expected} = normalizeForComparison(deserialized, originalValues[i]);
        expect(actual).toEqual(expected);
    });
});

it('tuple rest parameter', () => {
    const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple_rest_parameter.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple_rest_parameter.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('tuple circular', () => {
    const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple_circular.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple_circular.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        // Use normalizeForComparison to handle Vitest's stricter array comparison with optional elements
        const {actual, expected} = normalizeForComparison(deserialized, originalValues[i]);
        expect(actual).toEqual(expected);
    });
});

it('tuple with non serializable types are transformed to undefined', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.TUPLES.tuple_with_non_serializable.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserializedValues[i]).toEqual(deserialized);
    });
});

it('interface circular tuple', () => {
    const {rt, values} = SERIALIZATION_SPEC.TUPLES.interface_circular_tuple.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.interface_circular_tuple.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.TUPLES).length;
    expect(ranTests).toBe(totalTest);
});
