/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../../serialization-suite';
import {roundTrip, createSerializationFns} from './binaryHelpers';

let ranTests = 0;
afterEach(() => ranTests++);

it('interface', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('interface with many optional props', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.many_optional_props.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('undefined in object', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.undefined_in_object.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(value).toEqual(deserialized);
    });
});

it('class', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.OBJECTS.class.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.class.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(deserializedValues[i]);
        // deserialized object is a plain object and not a class instance
        expect(deserialized.constructor.name).not.toEqual(originalValues[i].constructor.name);
    });
});

it('class can be deserialized after registered', async () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.serializable_class_restored.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.serializable_class_restored.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
        // class has been registered for deserialization so we get a class instance back
        expect(deserialized.constructor.name).toEqual(originalValues[i].constructor.name);
    });
});

it('deserialize class using a function', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.classes_deserialize_function.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.classes_deserialize_function.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
        expect(deserialized.constructor.name).toEqual(originalValues[i].constructor.name);
    });
});

it('extended class', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.extended_class.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.extended_class.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('RpcError class is restored to class by default', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.rpc_error_class.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.rpc_error_class.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
        expect(deserialized.constructor.name).toEqual(originalValues[i].constructor.name);
    });
});

it('optional properties', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.optional_properties_order.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.optional_properties_order.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('should work when all fields are optional', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.all_optional_fields.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.all_optional_fields.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('strip extra params', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.OBJECTS.strip_extra_params.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserializedValues[i]).toEqual(deserialized);
    });
});

it('interface circular', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('interface circular array', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular_array.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular_array.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('interface circular deep', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular_deep.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular_deep.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('interface root not circular', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_root_not_circular.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_root_not_circular.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('interface multiple circular', () => {
    const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_multiple_circular.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_multiple_circular.getTestData(true);
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('methods should be excluded from interface', () => {
    const {rt, values, deserializedValues} = SERIALIZATION_SPEC.OBJECTS.interface_with_methods.getTestData();
    const {serialize, deserialize} = createSerializationFns(rt);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(deserializedValues[i]);
    });
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.OBJECTS).length;
    expect(ranTests).toBe(totalTest);
});
