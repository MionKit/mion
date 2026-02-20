/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../../constants.functions.ts';
import {FunctionRunType} from '../../../nodes/function/function.ts';
import type {DataViewDeserializer, DataViewSerializer, StrictArrayBuffer} from '@mionkit/core';
import type {InterfaceRunType} from '../../../nodes/collection/interface.ts';
import type {RunType} from '../../../types.ts';
import {createDataViewDeserializer, createDataViewSerializer, setSerializationOptions, getENV} from '@mionkit/core';
import {afterAll, expect} from 'vitest';

const DEBUG = getENV('DEBUG_JIT') === 'print';
/** maps a binary serializer to json serializer */
const toJsonSerializers: Map<(v: any) => any, (v: any) => string> = new Map();

setSerializationOptions({bufferSize: 1024});
export const serContext: DataViewSerializer = createDataViewSerializer('test');
export const desContext: DataViewDeserializer = createDataViewDeserializer('test', new ArrayBuffer(0));

const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;

export function createSerializationFns(rt: RunType) {
    const toBinary = rt.createJitFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    if (DEBUG) {
        const toJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const stringify = (v: any) => JSON.stringify(toJson(v));
        toJsonSerializers.set(serialize, stringify);
    }
    return {serialize, deserialize};
}

export function createSerializationParamsFn(rt: FunctionRunType, sliceStart?: number) {
    const params = typeof sliceStart === 'number' ? {paramsSlice: {start: sliceStart}} : undefined;
    const toBinary = rt.createJitParamsFunction(SERIALIZE_FN, params);
    const fromBinary = rt.createJitParamsFunction(DESERIALIZE_FN, params);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    if (DEBUG) {
        const toJson = rt.createJitParamsFunction(JitFunctions.prepareForJson, params);
        const stringify = (v: any) => JSON.stringify(toJson(v));
        toJsonSerializers.set(serialize, stringify);
    }
    return {serialize, deserialize};
}

export function createSerializationReturnFn(rt: FunctionRunType) {
    const toBinary = rt.createJitReturnFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitReturnFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    if (DEBUG) {
        const toJson = rt.createJitReturnFunction(JitFunctions.prepareForJson);
        const stringify = (v: any) => JSON.stringify(toJson(v));
        toJsonSerializers.set(serialize, stringify);
    }
    return {serialize, deserialize};
}

export function createSerializationCallSignatureParamsFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const toBinary = callSignature.createJitParamsFunction(SERIALIZE_FN);
    const fromBinary = callSignature.createJitParamsFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    if (DEBUG) {
        const toJson = callSignature.createJitParamsFunction(JitFunctions.prepareForJson);
        const stringify = (v: any) => JSON.stringify(toJson(v));
        toJsonSerializers.set(serialize, stringify);
    }
    return {serialize, deserialize};
}

export function createSerializationCallSignatureReturnFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const toBinary = callSignature.createJitReturnFunction(SERIALIZE_FN);
    const fromBinary = callSignature.createJitReturnFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    if (DEBUG) {
        const toJson = callSignature.createJitReturnFunction(JitFunctions.prepareForJson);
        const stringify = (v: any) => JSON.stringify(toJson(v));
        toJsonSerializers.set(serialize, stringify);
    }
    return {serialize, deserialize};
}

const sizesEntries: any[] = [];
const valuesEntries: any[] = [];

export function roundTrip(serialize: (v: any) => StrictArrayBuffer, deserialize: (v: StrictArrayBuffer) => any, value: any) {
    serContext.reset();
    const serialized = serialize(value);
    const deserialized = deserialize(serialized);
    if (DEBUG) {
        const stringify = toJsonSerializers.get(serialize)!;
        let json: number | string = '';
        // eslint-disable-next-line
        try { json = new Blob([stringify(value)]).size; } catch (e) { json = '-'; } // prettier-ignore
        const sizes = {name: expect.getState().currentTestName, json, binary: serialized.byteLength};
        sizesEntries.push(sizes);
        valuesEntries.push({value, deserialized});
    }
    const result = {serialized, deserialized};
    return result;
}

afterAll(() => {
    if (sizesEntries.length) console.table(sizesEntries);
    if (valuesEntries.length) console.table(valuesEntries);
});
