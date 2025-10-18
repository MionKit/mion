/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// this code is based on from seqproto library https://github.com/oramasearch/seqproto

import type {BinaryDeserializer, BinarySerializer, StrictArrayBuffer} from './types';

interface CreateSerOption {
    bufferSize?: number;
}

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;

// ############## create serializer & deserializer ##############

// These binary serializer should be based in the Uint32Array so everything should be aligned to 4 bytes
// number will be stored in 8 bytes and add some padding if needed

export function createBinarySerializer({bufferSize}: CreateSerOption = {}): BinarySerializer {
    const size = bufferSize ?? 2 ** 24;
    if (size >= POW_2_32) throw new Error('bufferSize option must be strictly less than 2 ** 32');
    // Ensure buffer size is aligned to 8 bytes for Float64Array compatibility
    const alignedSize = Math.floor(size / 8) * 8;
    const buffer = new ArrayBuffer(alignedSize);
    const Ser: BinarySerializer = {
        index: 0, // index in uint32 (4 bytes)
        buffer,
        uint32: new Uint32Array(buffer),
        int32: new Int32Array(buffer),
        bigint64: new BigInt64Array(buffer),
        float64: new Float64Array(buffer),
        textEncoder: new TextEncoder(),
        maxStrCacheLength: 64,
        maxCacheSize: 600,
        stringCache: new Map<string, Uint8Array>(),
        evictStringCache() {
            const entries = Array.from(this.stringCache.entries());
            this.stringCache.clear();
            for (let i = entries.length / 2; i < entries.length; i++) {
                this.stringCache.set(entries[i][0], entries[i][1]);
            }
        },
        reset() {
            this.index = 0;
        },
        getBuffer() {
            return this.buffer.slice(0, this.index * 4);
        },
        serString(str: string): void {
            if (str.length >= Ser.maxStrCacheLength) {
                const targetView = new Uint8Array(Ser.buffer, (Ser.index + 1) * 4);
                const result = Ser.textEncoder.encodeInto(str, targetView);
                setIndex(Ser, result.written);
                return;
            }
            const cached = Ser.stringCache.get(str);
            if (cached) {
                const targetView = new Uint8Array(Ser.buffer, (Ser.index + 1) * 4, cached.length);
                targetView.set(cached);
                setIndex(Ser, cached.length);
                return;
            }
            const encodedBytes = Ser.textEncoder.encode(str);
            const targetView = new Uint8Array(Ser.buffer, (Ser.index + 1) * 4, encodedBytes.length);
            targetView.set(encodedBytes);
            setIndex(Ser, encodedBytes.length);
            if (Ser.stringCache.size >= Ser.maxCacheSize) Ser.evictStringCache();
            Ser.stringCache.set(str, encodedBytes);
        },
        serFloat64(n: number): void {
            if (Ser.index & 1) Ser.uint32[Ser.index++] = 0; // add some padding if needed
            Ser.float64[Ser.index >> 1] = n;
            Ser.index += 2;
        },
        serEnum(n: number | string): void {
            if (typeof n === 'number') {
                Ser.uint32[Ser.index++] = NUM;
                Ser.uint32[Ser.index++] = n;
                return;
            }
            Ser.uint32[Ser.index++] = STR;
            Ser.serString(n);
        },
    };
    return Ser;
}

function setIndex(ser: BinarySerializer, length: number) {
    ser.uint32[ser.index] = length;
    ser.index += Math.ceil(length / 4) + 1;
}

export function createBinaryDeserializer(buffer: StrictArrayBuffer): BinaryDeserializer {
    const n32 = Math.floor(buffer.byteLength / 4);
    const n64 = Math.floor(buffer.byteLength / 8);
    const Des: BinaryDeserializer = {
        index: 0, // index in uint32 (4 bytes)
        buffer,
        uint32: new Uint32Array(buffer, 0, n32),
        int32: new Int32Array(buffer, 0, n32),
        bigint64: new BigInt64Array(buffer, 0, n64),
        float64: new Float64Array(buffer, 0, n64),
        textDecoder: new TextDecoder(),
        maxStrCacheLength: 64,
        maxCacheSize: 600,
        stringCache: new Map<string, string>(),
        evictStringCache: function () {
            const entries = Array.from(this.stringCache.entries());
            this.stringCache.clear();
            for (let i = entries.length / 2; i < entries.length; i++) {
                this.stringCache.set(entries[i][0], entries[i][1]);
            }
        },
        hashBytes: function (bytes: Uint8Array, len: number): string {
            let hash = '';
            for (let i = 0; i < len; i++) hash += String.fromCharCode(bytes[i]);
            return hash;
        },
        setBuffer: function (buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) {
            const isCustom = typeof byteOffset === 'number' && typeof byteLength === 'number';
            this.index = isCustom ? Math.floor(byteOffset / 4) : 0;
            const n32 = isCustom ? this.index + Math.ceil(byteLength / 4) : Math.floor(buffer.byteLength / 4);
            const n64 = isCustom ? this.index + Math.ceil(byteLength / 8) : Math.floor(buffer.byteLength / 8);
            this.buffer = buffer;
            this.uint32 = new Uint32Array(buffer, 0, n32);
            this.int32 = new Int32Array(buffer, 0, n32);
            this.bigint64 = new BigInt64Array(buffer, 0, n64);
            this.float64 = new Float64Array(buffer, 0, n64);
        },
        desString(): string {
            const len = Des.uint32[Des.index++];
            const bytes = new Uint8Array(Des.buffer, Des.index * 4, len);
            const indexIncrement = Math.ceil(len / 4);
            Des.index += indexIncrement;
            if (len >= Des.maxStrCacheLength) return Des.textDecoder.decode(bytes);
            const cacheKey = Des.hashBytes(bytes, len);
            const cached = Des.stringCache.get(cacheKey);
            if (cached) return cached;
            const decoded = Des.textDecoder.decode(bytes);
            if (Des.stringCache.size >= Des.maxCacheSize) Des.evictStringCache();
            Des.stringCache.set(cacheKey, decoded);
            return decoded;
        },
        desFloat64(): number {
            if (Des.index & 1) Des.index++; // skip padding if needed
            const value = Des.float64[Des.index >> 1];
            Des.index += 2;
            return value;
        },
        desEnum(): number | string {
            const type = Des.uint32[Des.index++];
            if (type === NUM) return Des.uint32[Des.index++];
            return Des.desString();
        },
    };
    return Des;
}
