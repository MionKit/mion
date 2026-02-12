/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {roundTrip, createSerializationFns} from './jsonHelpers.ts';

let ranTests = 0;
afterEach(() => ranTests++);

it('index property', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('interfaces with a property and index property', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_and_prop.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.RECORDS.index_property_and_prop.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('index property with extra props', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_extra.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('multiple index properties', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.RECORDS.multiple_index_props.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(deserializedValues[i]).toEqual(deserialized);
    });
});

it('index property nested', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_nested.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('index property nested date', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_nested_date.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('index property with bigint values', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_bigint.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.RECORDS.index_property_bigint.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('index property non-root', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_non_root.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.RECORDS).length;
    expect(ranTests).toBe(totalTest);
});
