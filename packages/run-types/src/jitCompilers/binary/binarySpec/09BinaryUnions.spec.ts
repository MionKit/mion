/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {JitFunctions} from '../../../constants.functions';
import {createSerializationFns, roundTrip, serContext} from './binaryHelpers';

const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;

let ranTests = 0;
afterEach(() => ranTests++);

it('union', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('throw errors when item not belongs to the union', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_errors.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        expect(() => serialize(value)).toThrow('Can not encode union to binary: item does not belong to the union');
    });

    serContext.reset();
    const invalidUnionIndex = 20; // any number greater than the number of union items
    serContext.view.setUint8(0, invalidUnionIndex);
    serContext.view.setFloat64(1, 123, true); // set any valid value for the union (number), little endian
    serContext.index = 9; // 1 byte for union index + 8 bytes for float64
    expect(() => deserialize(serContext.getBuffer())).toThrow('Can not binary decode union: invalid union index');
});

it('union array', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_array.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_array.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.with_discriminator.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.with_discriminator.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('union object with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_object_with_discriminator.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_object_with_discriminator.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('union with discriminator property', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_with_discriminator_property.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_with_discriminator_property.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('union mixed with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_mixed_with_discriminator.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_mixed_with_discriminator.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('union index property with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_index_property_with_discriminator.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_index_property_with_discriminator.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('Circular Union with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.circular_union_with_discriminator.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.circular_union_with_discriminator.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('union with methods - methods should be excluded', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.UNIONS.union_with_methods.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(deserializedValues[i]);
    });
});

it('union with non serializable types throws an error', () => {
    const {rt} = SERIALIZATION_SPEC.UNIONS.union_whit_non_serializable.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(
        'Union can not have non serializable types, ie: Symbol, Function, etc.'
    );
    expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow(
        'Union can not have non serializable types, ie: Symbol, Function, etc.'
    );
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.UNIONS).length;
    expect(ranTests).toBe(totalTest);
});
