/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {JitFunctions} from '../../../constants.functions';
import {createSerializationFns, roundTrip} from './xyzHelpers';

const SERIALIZE_FN = JitFunctions.prepareForJson;
const DESERIALIZE_FN = JitFunctions.restoreFromJson;

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
    const jsonValues = values.map((item) => JSON.stringify([-1, item])); // invalid union index

    values.forEach((value, i) => {
        expect(() => serialize(value)).toThrow('Can not json encode union: item does not belong to the union');
        expect(() => deserialize(jsonValues[i])).toThrow('Can not json decode union: invalid union index');
    });
});

it('union array', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_array.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_array.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });

    // ensure code for items that do not
    const jitSerializeFn = rt.createJitFunction(SERIALIZE_FN);
    const stringifyCode = jitSerializeFn.toString();
    expect(stringifyCode).not.toContain('[0,');
    expect(stringifyCode).not.toContain('[1,');
    expect(stringifyCode).not.toContain('[2,');
    expect(stringifyCode).toContain('[3,'); // date must be encoded to tuple [index, type]
});

it('with discriminator', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.with_discriminator.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.with_discriminator.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });

    // ensure code for items that do not need stringify to tuple is not emitted [index, type]
    const jitSerializeFn = rt.createJitFunction(SERIALIZE_FN);
    const stringifyCode = jitSerializeFn.toString();
    expect(stringifyCode).not.toContain('[0,');
    expect(stringifyCode).toContain('[1,'); // bigint must be encoded to tuple [index, type]
    expect(stringifyCode).not.toContain('[2,');
    expect(stringifyCode).toContain('[3,'); // date must be encoded to tuple [index, type]
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

it('union with any type - any is checked last as fallback', () => {
    const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_with_any.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_with_any.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.UNIONS).length;
    expect(ranTests).toBe(totalTest);
});
