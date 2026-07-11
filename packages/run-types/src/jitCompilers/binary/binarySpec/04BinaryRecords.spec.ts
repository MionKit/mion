/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {roundTrip, createSerializationFns, serContext, desContext} from './binaryHelpers.ts';

let ranTests = 0;
afterEach(() => ranTests++);

it('index property', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('interfaces with a property and index property', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_and_prop.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.RECORDS.index_property_and_prop.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('index property with extra props', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_extra.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('multiple index properties', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.RECORDS.multiple_index_props.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserializedValues[i]).toEqual(deserialized);
    });
});

it('index property nested', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_nested.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('index property nested date', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_nested_date.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('index property with bigint values', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_bigint.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.RECORDS.index_property_bigint.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('index property non-root', () => {
    const {rt, values} = SERIALIZATION_SPEC.RECORDS.index_property_non_root.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

// ###################### PROTOTYPE POLLUTION PROTECTION TESTS ######################
// These tests verify that deserialization rejects dangerous property names

/** Helper to create a malicious binary buffer with a dangerous property name */
function createMaliciousBinaryBuffer(propName: string): ArrayBuffer {
    const encoder = new TextEncoder();
    const propBytes = encoder.encode(propName);
    // Buffer structure: count (4 bytes) + propName length (4 bytes) + propName bytes + value as float64 (8 bytes)
    const buffer = new ArrayBuffer(4 + 4 + propBytes.length + 8);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    let offset = 0;
    // Write count of properties (1)
    view.setUint32(offset, 1, true);
    offset += 4;
    // Write property name length
    view.setUint32(offset, propBytes.length, true);
    offset += 4;
    // Write property name bytes
    uint8View.set(propBytes, offset);
    offset += propBytes.length;
    // Write a number value (42.0 as float64)
    view.setFloat64(offset, 42.0, true);

    return buffer;
}

it('prototype pollution protection - rejects __proto__', () => {
    const {rt} = SERIALIZATION_SPEC.RECORDS.index_property.getTestData();
    const {deserialize} = createSerializationFns(rt);

    const maliciousBuffer = createMaliciousBinaryBuffer('__proto__');
    desContext.setBuffer(maliciousBuffer);

    expect(() => deserialize(maliciousBuffer)).toThrow('Unsafe property name: __proto__');
});

it('prototype pollution protection - rejects prototype', () => {
    const {rt} = SERIALIZATION_SPEC.RECORDS.index_property.getTestData();
    const {deserialize} = createSerializationFns(rt);

    const maliciousBuffer = createMaliciousBinaryBuffer('prototype');
    desContext.setBuffer(maliciousBuffer);

    expect(() => deserialize(maliciousBuffer)).toThrow('Unsafe property name: prototype');
});

it('prototype pollution protection - rejects constructor', () => {
    const {rt} = SERIALIZATION_SPEC.RECORDS.index_property.getTestData();
    const {deserialize} = createSerializationFns(rt);

    const maliciousBuffer = createMaliciousBinaryBuffer('constructor');
    desContext.setBuffer(maliciousBuffer);

    expect(() => deserialize(maliciousBuffer)).toThrow('Unsafe property name: constructor');
});

it('prototype pollution protection - allows safe property names', () => {
    const {rt} = SERIALIZATION_SPEC.RECORDS.index_property.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    // These should work fine (values are strings to match IndexString type)
    const safeValues = [
        {__proto: 'a'}, // missing underscore
        {_proto_: 'b'}, // different format
        {constructo: 'c'}, // missing 'r'
        {prototyp: 'd'}, // missing 'e'
    ];

    safeValues.forEach((value) => {
        serContext.reset();
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.RECORDS).length + 4; // +4 for prototype pollution tests
    expect(ranTests).toBe(totalTest);
});
