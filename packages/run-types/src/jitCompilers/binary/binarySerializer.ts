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

const UINT32 = 1;
const INT32 = 2;
const FLOAT64 = 3;
const POW_2_32 = 2 ** 32;
const STR = 1;
const NUM = 2;

// ############## create serializer & deserializer ##############

export function createBinarySerializer({bufferSize}: CreateSerOption = {}): BinarySerializer {
    const size = bufferSize ?? 2 ** 24;
    if (size >= POW_2_32) throw new Error('bufferSize option must be strictly less than 2 ** 32');
    // Ensure buffer size is aligned to 8 bytes for Float64Array compatibility
    const alignedSize = Math.floor(size / 8) * 8;
    const buffer = new ArrayBuffer(alignedSize);
    const Ser: BinarySerializer = {
        index: 0,
        buffer,
        uint32Array: new Uint32Array(buffer),
        float32Array: new Float32Array(buffer),
        float64Array: new Float64Array(buffer),
        textEncoder: new TextEncoder(),
        maxStrLength: 64,
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
            if (str.length >= Ser.maxStrLength) {
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
            if (Ser.index % 2 !== 0) {
                Ser.uint32Array[Ser.index] = 0;
                Ser.index++;
            }
            Ser.float64Array[Ser.index / 2] = n;
            Ser.index += 2;
        },
        serNumber(n: number): void {
            if (!Number.isInteger(n)) {
                Ser.uint32Array[Ser.index++] = FLOAT64;
                Ser.serFloat64(n);
            } else if (n >= 0) {
                if (n <= 0xffffffff) {
                    Ser.uint32Array[Ser.index++] = UINT32;
                    Ser.uint32Array[Ser.index++] = n;
                } else {
                    Ser.uint32Array[Ser.index++] = FLOAT64;
                    Ser.serFloat64(n);
                }
            } else if (n >= -0x80000000) {
                Ser.uint32Array[Ser.index++] = INT32;
                Ser.uint32Array[Ser.index++] = POW_2_32 + n;
            } else {
                Ser.uint32Array[Ser.index++] = FLOAT64;
                Ser.serFloat64(n);
            }
        },
        serEnum(n: number | string): void {
            if (typeof n === 'number') {
                Ser.uint32Array[Ser.index++] = NUM;
                Ser.uint32Array[Ser.index++] = n;
                return;
            }
            Ser.uint32Array[Ser.index++] = STR;
            Ser.serString(n);
        },
    };
    return Ser;
}

function setIndex(ser: BinarySerializer, length: number) {
    ser.uint32Array[ser.index] = length;
    ser.index += Math.ceil(length / 4) + 1;
}

export function createBinaryDeserializer(buffer: StrictArrayBuffer): BinaryDeserializer {
    const n32 = Math.floor(buffer.byteLength / 4);
    const n64 = Math.floor(buffer.byteLength / 8);
    const Des: BinaryDeserializer = {
        index: 0,
        buffer,
        uint32Array: new Uint32Array(buffer, 0, n32),
        float32Array: new Float32Array(buffer, 0, n32),
        float64Array: new Float64Array(buffer, 0, n64),
        textDecoder: new TextDecoder(),
        maxStrLength: 64,
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
            if (typeof byteOffset === 'number' && typeof byteLength === 'number') {
                this.index = Math.floor(byteOffset / 4);
                const n32 = this.index + Math.ceil(byteLength / 4);
                const n64 = this.index + Math.ceil(byteLength / 8);
                this.buffer = buffer;
                this.uint32Array = new Uint32Array(buffer, 0, n32);
                this.float32Array = new Float32Array(buffer, 0, n32);
                this.float64Array = new Float64Array(buffer, 0, n64);
                return;
            }
            const n32 = Math.floor(buffer.byteLength / 4);
            const n64 = Math.floor(buffer.byteLength / 8);
            this.buffer = buffer;
            this.index = 0;
            this.uint32Array = new Uint32Array(buffer, 0, n32);
            this.float32Array = new Float32Array(buffer, 0, n32);
            this.float64Array = new Float64Array(buffer, 0, n64);
        },
        desString(): string {
            const len = Des.uint32Array[Des.index++];
            const bytes = new Uint8Array(Des.buffer, Des.index * 4, len);
            const indexIncrement = Math.ceil(len / 4);
            Des.index += indexIncrement;
            if (len >= Des.maxStrLength) return Des.textDecoder.decode(bytes);
            const cacheKey = Des.hashBytes(bytes, len);
            const cached = Des.stringCache.get(cacheKey);
            if (cached) return cached;
            const decoded = Des.textDecoder.decode(bytes);
            if (Des.stringCache.size >= Des.maxCacheSize) Des.evictStringCache();
            Des.stringCache.set(cacheKey, decoded);
            return decoded;
        },
        desFloat64(): number {
            if (Des.index % 2 !== 0) Des.index++;
            const value = Des.float64Array[Des.index / 2];
            Des.index += 2;
            return value;
        },
        desNumber(): number {
            const type = Des.uint32Array[Des.index++];
            switch (type) {
                case UINT32:
                    return Des.uint32Array[Des.index++];
                case INT32:
                    return Des.uint32Array[Des.index++] - POW_2_32;
                case FLOAT64:
                    return Des.desFloat64();
                default:
                    throw new Error('Unknown number type: ' + type);
            }
        },
        desEnum(): number | string {
            const type = Des.uint32Array[Des.index++];
            if (type === NUM) return Des.uint32Array[Des.index++];
            return Des.desString();
        },
    };
    return Des;
}
