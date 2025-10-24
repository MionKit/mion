/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {createSerializationFns, roundTrip} from './binaryHelpers';

let ranTests = 0;
afterEach(() => ranTests++);

it('circular types', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_types.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_types.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('CircularUnion array with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_union_array.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_union_array.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized.length).toEqual(originalValues[i].length);
    });
});

it('CircularTuple object with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('CircularIndex object with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_index.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_index.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('CircularDeep object with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_deep.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_deep.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Circular tuple with complex structure', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple_complex.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple_complex.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('array strip extra params', () => {
    const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.object_with_circular_array.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.CIRCULAR_REFS).length;
    expect(ranTests).toBe(totalTest);
});
