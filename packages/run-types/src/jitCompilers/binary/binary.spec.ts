/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SERIALIZATION_SPEC} from '../serialization-suite';
import {JitFunctions} from '../../constants.functions';
import {FunctionRunType} from '../../runType/function/function';
import {createBinaryDeserializer, createBinarySerializer} from './binarySerializer';
import type {BinaryDeserializer, BinarySerializer, StrictArrayBuffer} from './types';
import type {InterfaceRunType} from '../../runType/collection/interface';
import type {RunType} from '../../types';
import {runType} from '../../lib/runType';

const serContext: BinarySerializer = createBinarySerializer({bufferSize: 1024});
const desContext: BinaryDeserializer = createBinaryDeserializer(new ArrayBuffer(0));

const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;

function createSerializationFns(rt: RunType) {
    const toBinary = rt.createJitFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

function createSerializationParamsFn(rt: FunctionRunType, sliceStart?: number) {
    const params = typeof sliceStart === 'number' ? {paramsSlice: {start: sliceStart}} : undefined;
    const toBinary = rt.createJitParamsFunction(SERIALIZE_FN, params);
    const fromBinary = rt.createJitParamsFunction(DESERIALIZE_FN, params);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

function createSerializationReturnFn(rt: FunctionRunType) {
    const toBinary = rt.createJitReturnFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitReturnFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

function createSerializationCallSignatureParamsFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const toBinary = callSignature.createJitParamsFunction(SERIALIZE_FN);
    const fromBinary = callSignature.createJitParamsFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

function createSerializationCallSignatureReturnFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const toBinary = callSignature.createJitReturnFunction(SERIALIZE_FN);
    const fromBinary = callSignature.createJitReturnFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

function roundTrip(
    serialize: (v: any) => StrictArrayBuffer,
    deserialize: (v: StrictArrayBuffer) => any,
    value: any,
    debug = false
) {
    serContext.reset();
    const serialized = serialize(value);
    if (debug) {
        console.log(
            'Binary length:',
            serialized.byteLength,
            'Binary bytes:',
            Array.from(new Uint32Array(serialized))
                .map((b) => '0x' + b.toString(16).padStart(8, '0'))
                .join(' ')
        );
    }
    const deserialized = deserialize(serialized);
    if (debug) {
        console.log('Original value:', value, 'Deserialized value:', deserialized);
    }
    const result = {serialized, deserialized};
    return result;
}

describe('atomic', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('string', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.string.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('number', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.number.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized, serialized} = roundTrip(serialize, deserialize, value);
            expect(serialized instanceof ArrayBuffer).toBeTruthy();
            expect(value).toEqual(deserialized);
        });
    });

    it('number not supported', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.number_not_supported.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            let didThrow = false;
            let result: any;
            try {
                result = roundTrip(serialize, deserialize, value).deserialized;
                expect(result).not.toEqual(value);
                return;
            } catch (error) {
                didThrow = true;
            }
            expect(didThrow).toBeTruthy();
        });
    });

    it('regexp', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.regexp.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('bigint', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.bigint.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('boolean', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.boolean.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('any', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.any.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);
        // JSON.parse(undefined) throws an error, so we need to skip deserialization
        const deserializeUndefined = (v: any) => (typeof v === 'undefined' ? undefined : deserialize(v));

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserializeUndefined, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('any not supported', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.not_supported_any.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);
        values.forEach((value) => {
            let didThrow = false;
            let result: any;
            try {
                result = roundTrip(serialize, deserialize, value).deserialized;
                expect(result).not.toEqual(value);
                return;
            } catch (error) {
                didThrow = true;
            }
            expect(didThrow).toBeTruthy();
        });
    });

    it('null', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.null.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('undefined', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.undefined.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);
        // JSON.parse(undefined) throws an error, so we need to skip deserialization
        const deserializeUndefined = (v: any) => (typeof v === 'undefined' ? undefined : deserialize(v));

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserializeUndefined, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('date', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.date.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('enum', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.enum.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('symbol', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.symbol.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(deserialized.toString()).toEqual(value.toString());
        });
    });

    it('object', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.object.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('void', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.void.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);
        // json.parse does not support undefined, so we need to skip deserialization
        const deserializeUndefined = (v: any) => (typeof v === 'undefined' ? undefined : deserialize(v));

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserializeUndefined, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('never', () => {
        const {rt} = SERIALIZATION_SPEC.ATOMIC.never.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow('Never type cannot be serialized to Binary');
        expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow('Never type cannot be deserialized from Binary');
    });

    it('literal string', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_string.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('literal number', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_number.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('literal boolean', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_boolean.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('literal regexp', () => {
        const {rt, values} = SERIALIZATION_SPEC.ATOMIC.literal_regexp.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.ATOMIC).length;
        expect(ranTests).toBe(totalTest);
    });
});

describe('arrays', () => {
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
});

describe('objects', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('interface', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface with many optional props should be compiled correctly', () => {
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

    it('serializable class can be deserialized after they are registered', async () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.serializable_class_restored.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.serializable_class_restored.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
            // class has been registered for deserialization so we get a class instance back
            expect(deserialized.constructor.name).toEqual(originalValues[i].constructor.name);
        });
    });

    it('classes can be deserialized suing a deserialize function', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.classes_deserialize_function.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.classes_deserialize_function.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
            expect(deserialized.constructor.name).toEqual(originalValues[i].constructor.name);
        });
    });

    it('extended class', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.extended_class.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.extended_class.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('RpcError class are restored to class by default', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.rpc_error_class.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.rpc_error_class.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
            expect(deserialized.constructor.name).toEqual(originalValues[i].constructor.name);
        });
    });

    it('must set optional properties first in order to work properly', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.optional_properties_order.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.optional_properties_order.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('should work when all fields are optional', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.all_optional_fields.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.all_optional_fields.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('to strip extra params without fail', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.strip_extra_params.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.strip_extra_params.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface circular', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface circular array', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular_array.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular_array.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface circular deep', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular_deep.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular_deep.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface root not circular', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_root_not_circular.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_root_not_circular.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface multiple circular', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_multiple_circular.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_multiple_circular.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('interface with methods - methods should be excluded', () => {
        const {rt, values, deserializedValues} = SERIALIZATION_SPEC.OBJECTS.interface_with_methods.getTestData();
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(deserialized).toEqual(deserializedValues[i]);
        });
    });

    it('interface circular tuple', () => {
        const {rt, values} = SERIALIZATION_SPEC.OBJECTS.interface_circular_tuple.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.OBJECTS.interface_circular_tuple.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.OBJECTS).length;
        expect(ranTests).toBe(totalTest);
    });
});

describe('records', () => {
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
            expect(originalValues[i]).toEqual(deserialized);
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
            expect(originalValues[i]).toEqual(deserialized);
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

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.RECORDS).length;
        expect(ranTests).toBe(totalTest);
    });
});

describe('tuples', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('tuple', () => {
        const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('tuple with optional params', () => {
        const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple_with_optional.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple_with_optional.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('tuple rest parameter', () => {
        const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple_rest_parameter.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple_rest_parameter.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('tuple circular', () => {
        const {rt, values} = SERIALIZATION_SPEC.TUPLES.tuple_circular.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.TUPLES.tuple_circular.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
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

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.TUPLES).length;
        expect(ranTests).toBe(totalTest);
    });
});

describe('functions', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('throw errors for functions', () => {
        const {rt} = SERIALIZATION_SPEC.FUNCTIONS.throw_errors_for_functions.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(
            `Compile function ToJsonVal not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow(
            `Compile function FromJsonVal not supported, call compileParams or compileReturn instead.`
        );
    });

    it('parameters', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.parameters.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.parameters.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('function with Date parameters', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_with_date_parameters.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_with_date_parameters.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('optional parameters', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.optional_params.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.optional_params.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('function return', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_return.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_return.getTestData(true);
        const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('stringify function with rest parameters', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_with_rest_parameters.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_with_rest_parameters.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('required function return', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.required_function_return.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.required_function_return.getTestData(true);
        const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('stringify function with only rest parameters', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_with_only_rest_parameters.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_with_only_rest_parameters.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('non serializable types', () => {
        const {rt, values, deserializedValues} = SERIALIZATION_SPEC.FUNCTIONS.non_serializable_params.getTestData();
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(deserializedValues[i]).toEqual(deserialized);
        });
    });

    it(`if function's return type is a promise then return type should be the promise's resolvedType`, () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_promise_return_type.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_promise_return_type.getTestData(true);
        const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it(`if function's return type is a function then return type should be the function's return type`, () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_return_type_is_function.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_return_type_is_function.getTestData(true);
        const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('should get params runType from a function using reflectFunction', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_params.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_params.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('should get return runType from a function using reflectFunction', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_return.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_return.getTestData(true);
        const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('slice function params', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_slice_params.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_slice_params.getTestData(true);
        const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType, 1);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('call signature params', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.call_signature_params.getTestData();
        const {serialize, deserialize} = createSerializationCallSignatureParamsFn(rt as InterfaceRunType);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('call signature return', () => {
        const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.call_signature_return.getTestData();
        const {serialize, deserialize} = createSerializationCallSignatureReturnFn(rt as InterfaceRunType);

        values.forEach((value) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(value).toEqual(deserialized);
        });
    });

    it('throw errors for call signatures', () => {
        const {rt} = SERIALIZATION_SPEC.FUNCTIONS.throw_errors_for_call_signature.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(
            `Compile function ToJsonVal not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow(
            `Compile function FromJsonVal not supported, call compileParams or compileReturn instead.`
        );
    });

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.FUNCTIONS).length;
        expect(ranTests).toBe(totalTest);
    });
});

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

describe('unions', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('union', () => {
        const {rt, values} = SERIALIZATION_SPEC.UNIONS.union.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('throw errors when serializing/deserializing object not belonging to the union', () => {
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
            expect(originalValues[i]).toEqual(deserialized);
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
            expect(originalValues[i]).toEqual(deserialized);
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
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('union with discriminator property', () => {
        const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_with_discriminator_property.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_with_discriminator_property.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('union mixed with discriminator', () => {
        const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_mixed_with_discriminator.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_mixed_with_discriminator.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('union index property with discriminator', () => {
        const {rt, values} = SERIALIZATION_SPEC.UNIONS.union_index_property_with_discriminator.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.union_index_property_with_discriminator.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Circular Union with discriminator', () => {
        const {rt, values} = SERIALIZATION_SPEC.UNIONS.circular_union_with_discriminator.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.UNIONS.circular_union_with_discriminator.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
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
});

describe('iterables', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('Set', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.set.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.set.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Set<SmallObject>', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.set_small_object.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.set_small_object.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('objects with nested sets', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_sets.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_sets.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Map', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Map<string, SmallObject>', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_string_small_object.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_string_small_object.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Map<SmallObject, number>', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_small_object_number.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_small_object_number.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Map with bigint keys', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_with_bigint_keys.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_with_bigint_keys.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Map with date values', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.map_with_date_values.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.map_with_date_values.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('objects with nested maps', () => {
        const {rt, values} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_maps.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.ITERABLES.objects_with_nested_maps.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.ITERABLES).length;
        expect(ranTests).toBe(totalTest);
    });
});

describe('circular-references', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('circular types', () => {
        const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_types.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_types.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
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
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('CircularIndex object with discriminator', () => {
        const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_index.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_index.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('CircularDeep object with discriminator', () => {
        const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_deep.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_deep.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('Circular tuple with complex structure', () => {
        const {rt, values} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple_complex.getTestData();
        const {values: originalValues} = SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple_complex.getTestData(true);
        const {serialize, deserialize} = createSerializationFns(rt);

        values.forEach((value, i) => {
            const {deserialized} = roundTrip(serialize, deserialize, value);
            expect(originalValues[i]).toEqual(deserialized);
        });
    });

    it('array to strip extra params without fail', () => {
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
});

describe('others', () => {
    let ranTests = 0;
    afterEach(() => ranTests++);

    it('should throw error for Promise types', () => {
        const {rt} = SERIALIZATION_SPEC.OTHERS.promise_jsonStringify_error.getTestData();
        const errorMessage = `Jit compilation disabled for Non Serializable types.`;
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(errorMessage);
    });

    it('should throw error for non-serializable atomic types', () => {
        const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow();
    });

    it('should throw error for non-serializable types in interfaces', () => {
        const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable_interface.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow();
    });

    it('should throw error for non-serializable types in arrays', () => {
        const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable_array.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow();
    });

    it('should throw error for non-serializable types in tuples', () => {
        const {rt} = SERIALIZATION_SPEC.OTHERS.non_serializable_tuple.getTestData();
        expect(() => rt.createJitFunction(SERIALIZE_FN)()).toThrow();
    });

    it('all test ran', () => {
        const totalTest = Object.keys(SERIALIZATION_SPEC.OTHERS).length;
        expect(ranTests).toBe(totalTest);
    });
});
