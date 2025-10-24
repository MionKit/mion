/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {createSerializationFns, roundTrip} from './stringifyHelpers';

let ranTests = 0;
afterEach(() => ranTests++);

it('Set', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.set.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.set.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Set<SmallObject>', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.set_small_object.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.set_small_object.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('objects with nested sets', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_sets.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_sets.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Map', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Map<string, SmallObject>', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_string_small_object.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_string_small_object.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Map<SmallObject, number>', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_small_object_number.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_small_object_number.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Map with bigint keys', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_with_bigint_keys.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_with_bigint_keys.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Map with date values', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_with_date_values.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_with_date_values.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('objects with nested maps', () => {
    const {rt, values} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_maps.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_maps.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.ITERABLES).length;
    expect(ranTests).toBe(totalTest);
});
