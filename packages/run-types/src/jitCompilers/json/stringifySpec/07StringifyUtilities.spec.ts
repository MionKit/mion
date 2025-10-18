/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {createSerializationFns, roundTrip} from './stringifyHelpers';

describe('utility-types', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('awaited', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.awaited.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.awaited.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('exclude atomic', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.exclude_atomic.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.exclude_atomic.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('exclude objects', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.exclude_objects.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.exclude_objects.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('required properties', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.required_properties.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.required_properties.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('extract atomic', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.extract_atomic.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.extract_atomic.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('extract objects', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.extract_objects.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.extract_objects.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('partial properties', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.partial_properties.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.partial_properties.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('pick properties', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.pick_properties.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.pick_properties.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('omit properties', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.omit_properties.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.omit_properties.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('record type', () => {
        const {rt, values} = SERIALIZATION_SPEC.UTILITY_TYPES.record_type.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UTILITY_TYPES.record_type.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.UTILITY_TYPES).length;
        expect(ranTests).toBe(totalTest);
    });
});
