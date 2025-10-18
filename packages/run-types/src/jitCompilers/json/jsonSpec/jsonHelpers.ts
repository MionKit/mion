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

const SERIALIZE_FN = JitFunctions.toJsonVal;
const DESERIALIZE_FN = JitFunctions.fromJsonVal;

export function createSerializationFns(rt: RunType) {
    const toJsonVal = rt.createJitFunction(SERIALIZE_FN);
    const fromJsonVal = rt.createJitFunction(DESERIALIZE_FN);
    const serialize = (v: any) => JSON.stringify(toJsonVal(v));
    const deserialize = (data: any) => fromJsonVal(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationParamsFn(rt: FunctionRunType, sliceStart?: number) {
    const params = typeof sliceStart === 'number' ? {paramsSlice: {start: sliceStart}} : undefined;
    const toJsonVal = rt.createJitParamsFunction(SERIALIZE_FN, params);
    const fromJsonVal = rt.createJitParamsFunction(DESERIALIZE_FN, params);
    const serialize = (v: any) => JSON.stringify(toJsonVal(v));
    const deserialize = (data: any) => fromJsonVal(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationReturnFn(rt: FunctionRunType) {
    const toJsonVal = rt.createJitReturnFunction(SERIALIZE_FN);
    const fromJsonVal = rt.createJitReturnFunction(DESERIALIZE_FN);
    const serialize = (v: any) => JSON.stringify(toJsonVal(v));
    const deserialize = (data: any) => fromJsonVal(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationCallSignatureParamsFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const toJsonVal = callSignature.createJitParamsFunction(SERIALIZE_FN);
    const fromJsonVal = callSignature.createJitParamsFunction(DESERIALIZE_FN);
    const serialize = (v: any) => JSON.stringify(toJsonVal(v));
    const deserialize = (data: any) => fromJsonVal(JSON.parse(data));
    return {serialize, deserialize};
}

export function createSerializationCallSignatureReturnFn(rt: InterfaceRunType) {
    const callSignature = rt.getCallSignature()!;
    const toJsonVal = callSignature.createJitReturnFunction(SERIALIZE_FN);
    const fromJsonVal = callSignature.createJitReturnFunction(DESERIALIZE_FN);
    const serialize = (v: any) => JSON.stringify(toJsonVal(v));
    const deserialize = (data: any) => fromJsonVal(JSON.parse(data));
    return {serialize, deserialize};
}

export function roundTrip(serialize: (v: any) => string, deserialize: (v: string) => any, value: any) {
    const serialized = serialize(value);
    const deserialized = deserialize(serialized);
    const result = {serialized, deserialized};
    return result;
}
