/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect, afterEach} from 'vitest';
import {SERIALIZATION_SPEC} from '../../serialization-suite.ts';
import {JitFunctions} from '../../../constants.functions.ts';
import type {InterfaceRunType} from '../../../nodes/collection/interface.ts';
import type {FunctionRunType} from '../../../nodes/function/function.ts';
import {
    createSerializationParamsFn,
    createSerializationReturnFn,
    createSerializationCallSignatureParamsFn,
    createSerializationCallSignatureReturnFn,
    roundTrip,
} from './jsonHelpers.ts';

const SERIALIZE_FN = JitFunctions.prepareForJson;
const DESERIALIZE_FN = JitFunctions.restoreFromJson;

let ranTests = 0;
afterEach(() => ranTests++);

it('throw errors for functions', () => {
    const {rt} = SERIALIZATION_SPEC.FUNCTIONS.throw_errors_for_functions.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(
        `Compile function PrepareForJson not supported, call compileParams or compileReturn instead.`
    );
    expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow(
        `Compile function RestoreFromJson not supported, call compileParams or compileReturn instead.`
    );
});

it('parameters', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.parameters.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.parameters.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('function with Date parameters', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_with_date_parameters.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_with_date_parameters.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('optional parameters', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.optional_params.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.optional_params.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('function return', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_return.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_return.getTestData(true);
    const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('stringify function with rest parameters', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_with_rest_parameters.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_with_rest_parameters.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('required function return', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.required_function_return.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.required_function_return.getTestData(true);
    const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('stringify function with only rest parameters', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_with_only_rest_parameters.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_with_only_rest_parameters.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
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

it(`functions returns a promise`, () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_promise_return_type.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_promise_return_type.getTestData(true);
    const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it(`return type of a closure`, () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_return_type_is_function.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_return_type_is_function.getTestData(true);
    const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('get params function using reflectFunction', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_params.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_params.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('get return function using reflectFunction', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_return.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.reflectFunction_return.getTestData(true);
    const {serialize, deserialize} = createSerializationReturnFn(rt as FunctionRunType);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('slice function params', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.function_slice_params.getTestData();
    const {values: originalValues} = SERIALIZATION_SPEC.FUNCTIONS.function_slice_params.getTestData(true);
    const {serialize, deserialize} = createSerializationParamsFn(rt as FunctionRunType, 1);

    values.forEach((value, i) => {
        const {deserialized} = roundTrip(serialize, deserialize, value);
        expect(deserialized).toEqual(originalValues[i]);
    });
});

it('call signature params', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.call_signature_params.getTestData();
    const {serialize, deserialize} = createSerializationCallSignatureParamsFn(rt as InterfaceRunType);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('call signature return', () => {
    const {rt, values} = SERIALIZATION_SPEC.FUNCTIONS.call_signature_return.getTestData();
    const {serialize, deserialize} = createSerializationCallSignatureReturnFn(rt as InterfaceRunType);

    values.forEach((value) => {
        const {serialized, deserialized} = roundTrip(serialize, deserialize, value);
        expect(typeof serialized).toBe('string');
        expect(value).toEqual(deserialized);
    });
});

it('throw errors for call signatures', () => {
    const {rt} = SERIALIZATION_SPEC.FUNCTIONS.throw_errors_for_call_signature.getTestData();
    expect(() => rt.createJitFunction(SERIALIZE_FN)).toThrow(
        `Compile function PrepareForJson not supported, call compileParams or compileReturn instead.`
    );
    expect(() => rt.createJitFunction(DESERIALIZE_FN)).toThrow(
        `Compile function RestoreFromJson not supported, call compileParams or compileReturn instead.`
    );
});

it('all test ran', () => {
    const totalTest = Object.keys(SERIALIZATION_SPEC.FUNCTIONS).length;
    expect(ranTests).toBe(totalTest);
});
