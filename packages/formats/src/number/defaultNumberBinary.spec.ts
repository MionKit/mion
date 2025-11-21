/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFunctions, type RunType, runType} from '@mionkit/run-types';
import {
    NumInteger,
    NumFloat,
    NumPositive,
    NumNegative,
    NumPositiveInt,
    NumNegativeInt,
    NumInt8,
    NumInt16,
    NumInt32,
    NumUInt8,
    NumUInt16,
    NumUInt32,
} from './defaultNumberFormats';
import {
    createDataViewDeserializer,
    createDataViewSerializer,
    DataViewDeserializer,
    DataViewSerializer,
    StrictArrayBuffer,
} from '@mionkit/core';

const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;
const serContext: DataViewSerializer = createDataViewSerializer('test', {bufferSize: 1024});
const desContext: DataViewDeserializer = createDataViewDeserializer(new ArrayBuffer(0));

function createSerializationFns(rt: RunType) {
    const toBinary = rt.createJitFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

it('NumInteger uses 8 bytes as MAX_SAFE_INTEGER does not fit in 4 bytes', async () => {
    serContext.reset();
    const rt = runType<NumInteger>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(10);
});

it('NumFloat uses 8 bytes', async () => {
    serContext.reset();
    const rt = runType<NumFloat>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10.5);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(10.5);
});

it('NumPositive uses 8 bytes as we do not know if it could be integer or float', async () => {
    serContext.reset();
    const rt = runType<NumPositive>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10.5);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(10.5);
});

it('NumNegative uses 8 bytes as we do not know if it could be integer or float', async () => {
    serContext.reset();
    const rt = runType<NumNegative>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(-10.5);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(-10.5);
});

it('NumPositiveInt uses 8 bytes as MAX_SAFE_INTEGER does not fit in 4 bytes', async () => {
    serContext.reset();
    const rt = runType<NumPositiveInt>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(Number.MAX_SAFE_INTEGER);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(Number.MAX_SAFE_INTEGER);
});

it('NumNegativeInt uses 8 bytes as MIN_SAFE_INTEGER does not fit in 4 bytes', async () => {
    serContext.reset();
    const rt = runType<NumNegativeInt>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(Number.MIN_SAFE_INTEGER);
    expect(buffer.byteLength).toBe(8);
    expect(deserialize(buffer)).toBe(Number.MIN_SAFE_INTEGER);
});

// SERIALIZAION/DESERIALIZATION DOES NOT CHECK CORRECTNESS OF THE VALUE, that should be checked before serialization/deserialization
// so passing wrong number here could send incorrect values

it('NumInt8 uses 1 byte', async () => {
    serContext.reset();
    const rt = runType<NumInt8>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(1);
    expect(deserialize(buffer)).toBe(10);
});

it('NumInt16 uses 2 bytes', async () => {
    serContext.reset();
    const rt = runType<NumInt16>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(2);
    expect(deserialize(buffer)).toBe(10);
});

it('NumInt32 uses 4 bytes', async () => {
    serContext.reset();
    const rt = runType<NumInt32>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(4);
    expect(deserialize(buffer)).toBe(10);
});

it('NumUInt8 uses 1 byte', async () => {
    serContext.reset();
    const rt = runType<NumUInt8>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(1);
    expect(deserialize(buffer)).toBe(10);
});

it('NumUInt16 uses 2 bytes', async () => {
    serContext.reset();
    const rt = runType<NumUInt16>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(2);
    expect(deserialize(buffer)).toBe(10);
});

it('NumUInt32 correct length and roundtrip', async () => {
    serContext.reset();
    const rt = runType<NumUInt32>();
    const {serialize, deserialize} = createSerializationFns(rt);
    const buffer = serialize(10);
    expect(buffer.byteLength).toBe(4);
    expect(deserialize(buffer)).toBe(10);
});
