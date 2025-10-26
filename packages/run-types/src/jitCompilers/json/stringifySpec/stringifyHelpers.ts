/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../../constants.functions';
import type {InterfaceRunType} from '../../../runType/collection/interface';
import type {FunctionRunType} from '../../../runType/function/function';
import type {RunType} from '../../../types';

const SERIALIZE_FN = JitFunctions.jsonStringify;
const DESERIALIZE_FN = JitFunctions.restoreFromJson;

export function createSerializationFns(rt: RunType) {
    const serialize = rt.createJitFunction(SERIALIZE_FN);
    const restoreFromJson = rt.createJitFunction(DESERIALIZE_FN);
    const deserialize = (data: any) => restoreFromJson(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationParamsFn(rt: FunctionRunType, sliceStart?: number) {
    const params = typeof sliceStart === 'number' ? {paramsSlice: {start: sliceStart}} : undefined;
    const serialize = rt.createJitParamsFunction(SERIALIZE_FN, params);
    const restoreFromJson = rt.createJitParamsFunction(DESERIALIZE_FN, params);
    const deserialize = (data: any) => restoreFromJson(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationReturnFn(rt: FunctionRunType) {
    const serialize = rt.createJitReturnFunction(SERIALIZE_FN);
    const restoreFromJson = rt.createJitReturnFunction(DESERIALIZE_FN);
    const deserialize = (data: any) => restoreFromJson(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationCallSignatureParamsFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const serialize = callSignature.createJitParamsFunction(SERIALIZE_FN);
    const restoreFromJson = callSignature.createJitParamsFunction(DESERIALIZE_FN);
    const deserialize = (data: any) => restoreFromJson(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationCallSignatureReturnFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const serialize = callSignature.createJitReturnFunction(SERIALIZE_FN);
    const restoreFromJson = callSignature.createJitReturnFunction(DESERIALIZE_FN);
    const deserialize = (data: any) => restoreFromJson(JSON.parse(data));
    return {serialize, deserialize};
}

export function roundTrip(serialize: (v: any) => string, deserialize: (v: string) => any, value: any) {
    const serialized = serialize(value);
    const deserialized = deserialize(serialized);
    const result = {serialized, deserialized};
    return result;
}
