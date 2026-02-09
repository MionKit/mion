/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFunctions, type RunType, runType} from '@mionkit/run-types';
import {BigNumInt64, BigNUmUInt64} from './defaultBigNumberFormats';
import {
    createDataViewDeserializer,
    createDataViewSerializer,
    DataViewDeserializer,
    DataViewSerializer,
    setSerializationOptions,
    StrictArrayBuffer,
} from '@mionkit/core';

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

describe('BigInt Binary Serialization', () => {
    it('BigNumInt64 uses 8 bytes for signed 64-bit integers', async () => {
        serContext.reset();
        const rt = runType<BigNumInt64>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(10n);
        expect(buffer.byteLength).toBe(8);
        expect(deserialize(buffer)).toBe(10n);
    });

    it('BigNumInt64 handles negative values', async () => {
        serContext.reset();
        const rt = runType<BigNumInt64>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(-9223372036854775808n); // min Int64
        expect(buffer.byteLength).toBe(8);
        expect(deserialize(buffer)).toBe(-9223372036854775808n);
    });

    it('BigNumInt64 handles max positive value', async () => {
        serContext.reset();
        const rt = runType<BigNumInt64>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(9223372036854775807n); // max Int64
        expect(buffer.byteLength).toBe(8);
        expect(deserialize(buffer)).toBe(9223372036854775807n);
    });

    it('BigNUmUInt64 uses 8 bytes for unsigned 64-bit integers', async () => {
        serContext.reset();
        const rt = runType<BigNUmUInt64>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(10n);
        expect(buffer.byteLength).toBe(8);
        expect(deserialize(buffer)).toBe(10n);
    });

    it('BigNUmUInt64 handles max unsigned value', async () => {
        serContext.reset();
        const rt = runType<BigNUmUInt64>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(18446744073709551615n); // max UInt64
        expect(buffer.byteLength).toBe(8);
        expect(deserialize(buffer)).toBe(18446744073709551615n);
    });

    it('BigNUmUInt64 handles zero', async () => {
        serContext.reset();
        const rt = runType<BigNUmUInt64>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(0n);
        expect(buffer.byteLength).toBe(8);
        expect(deserialize(buffer)).toBe(0n);
    });

    // Test plain bigint without any format (should use default string serialization)
    it('Plain bigint uses string serialization', async () => {
        serContext.reset();
        const rt = runType<bigint>();
        const {serialize, deserialize} = createSerializationFns(rt);
        const buffer = serialize(12345n);
        expect(buffer.byteLength).toBeGreaterThan(8);
        expect(deserialize(buffer)).toBe(12345n);
    });
});
