/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {it, expect} from 'vitest';
import {JitFunctions, type RunType, runType} from '@mionjs/run-types';
import {
    FormatInteger,
    FormatFloat,
    FormatPositive,
    FormatNegative,
    FormatPositiveInt,
    FormatNegativeInt,
    FormatInt8,
    FormatInt16,
    FormatInt32,
    FormatUInt8,
    FormatUInt16,
    FormatUInt32,
} from './defaultNumberFormats.ts';
import {
    createDataViewDeserializer,
    createDataViewSerializer,
    DataViewDeserializer,
    DataViewSerializer,
    setSerializationOptions,
    StrictArrayBuffer,
} from '@mionjs/core';

setSerializationOptions({bufferSize: 1024});
const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;
const serContext: DataViewSerializer = createDataViewSerializer('test');
const desContext: DataViewDeserializer = createDataViewDeserializer('test', new ArrayBuffer(1024));

function createSerializationFns(rt: RunType) {
    const toBinary = rt.createJitFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

it('FormatInteger uses 8 bytes as MAX_SAFE_INTEGER does not fit in 4 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatInteger>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(10);
});

it('FormatFloat uses 8 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatFloat>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10.5);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(10.5);
});

it('FormatPositive uses 8 bytes as we do not know if it could be integer or float', async () => {
    serContext.reset();
    const rt = runType<FormatPositive>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10.5);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(10.5);
});

it('FormatNegative uses 8 bytes as we do not know if it could be integer or float', async () => {
    serContext.reset();
    const rt = runType<FormatNegative>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(-10.5);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(-10.5);
});

it('FormatPositiveInt uses 8 bytes as MAX_SAFE_INTEGER does not fit in 4 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatPositiveInt>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(Number.MAX_SAFE_INTEGER);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(Number.MAX_SAFE_INTEGER);
});

it('FormatNegativeInt uses 8 bytes as MIN_SAFE_INTEGER does not fit in 4 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatNegativeInt>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(Number.MIN_SAFE_INTEGER);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(Number.MIN_SAFE_INTEGER);
});

// SERIALIZAION/DESERIALIZATION DOES NOT CHECK CORRECTNESS OF THE VALUE, that should be checked before serialization/deserialization
// so passing wrong number here could send incorrect values

it('FormatInt8 uses 1 byte', async () => {
    serContext.reset();
    const rt = runType<FormatInt8>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(1);
    expect(deserialize(buffer)).toBe(10);
});

it('FormatInt16 uses 2 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatInt16>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(2);
    expect(deserialize(buffer)).toBe(10);
});

it('FormatInt32 uses 4 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatInt32>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(4);
    expect(deserialize(buffer)).toBe(10);
});

it('FormatUInt8 uses 1 byte', async () => {
    serContext.reset();
    const rt = runType<FormatUInt8>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(1);
    expect(deserialize(buffer)).toBe(10);
});

it('FormatUInt16 uses 2 bytes', async () => {
    serContext.reset();
    const rt = runType<FormatUInt16>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(2);
    expect(deserialize(buffer)).toBe(10);
});

it('FormatUInt32 correct length and roundtrip', async () => {
    serContext.reset();
    const rt = runType<FormatUInt32>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(4);
    expect(deserialize(buffer)).toBe(10);
});
