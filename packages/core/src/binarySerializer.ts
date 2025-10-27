/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// this code is based on from seqproto library https://github.com/oramasearch/seqproto

import type {StrictArrayBuffer, DataViewSerializer, DataViewDeserializer} from './types';

interface CreateSerOption {
    bufferSize?: number;
}

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true; // always use little endian

// ############## create serializer & deserializer ##############

// ############## DataView-based serializer & deserializer ##############
// Uses byte-level precision (1-byte minimum unit) instead of 4-byte units

export function createDataViewSerializer({bufferSize}: CreateSerOption = {}): DataViewSerializer {
    const size = bufferSize ?? 2 ** 24;
    if (size >= POW_2_32) throw new Error('bufferSize option must be strictly less than 2 ** 32');
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    const Ser: DataViewSerializer = {
        index: 0, // byte offset
        buffer,
        view,
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
            return this.buffer.slice(0, this.index);
        },
        serString(str: string): void {
            if (str.length >= Ser.maxStrCacheLength) {
                const targetView = new Uint8Array(Ser.buffer, Ser.index + 4);
                const result = Ser.textEncoder.encodeInto(str, targetView);
                Ser.view.setUint32(Ser.index, result.written, LE);
                Ser.index += 4 + result.written;
                return;
            }
            Ser.serAndCacheString(str);
        },
        serFloat64(n: number): void {
            Ser.view.setFloat64(Ser.index, n, LE);
            Ser.index += 8;
        },
        serEnum(n: number | string): void {
            if (typeof n === 'number') {
                Ser.view.setUint32(Ser.index, NUM, LE);
                Ser.index += 4;
                Ser.view.setUint32(Ser.index, n, LE);
                Ser.index += 4;
                return;
            }
            Ser.view.setUint32(Ser.index, STR, LE);
            Ser.index += 4;
            Ser.serString(n);
        },
        setBitMask(bitMaskIndex: number, bitIndex: number) {
            const newBitmask = Ser.view.getUint8(bitMaskIndex) | (1 << bitIndex);
            Ser.view.setUint8(bitMaskIndex, newBitmask);
        },
        serAndCacheString(str: string): Uint8Array | undefined {
            const cached = Ser.stringCache.get(str);
            if (cached) {
                const targetView = new Uint8Array(Ser.buffer, Ser.index + 4, cached.length);
                targetView.set(cached);
                Ser.view.setUint32(Ser.index, cached.length, LE);
                Ser.index += 4 + cached.length;
                return;
            }
            const encodedBytes = Ser.textEncoder.encode(str);
            const targetView = new Uint8Array(Ser.buffer, Ser.index + 4, encodedBytes.length);
            targetView.set(encodedBytes);
            Ser.view.setUint32(Ser.index, encodedBytes.length, LE);
            Ser.index += 4 + encodedBytes.length;
            if (Ser.stringCache.size >= Ser.maxCacheSize) Ser.evictStringCache();
            Ser.stringCache.set(str, encodedBytes);
        },
    };
    return Ser;
}

export function createDataViewDeserializer(buffer: StrictArrayBuffer): DataViewDeserializer {
    const view = new DataView(buffer);
    const Des: DataViewDeserializer = {
        index: 0,
        buffer,
        view,
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
            this.index = byteOffset ?? 0;
            this.buffer = buffer;
            this.view = new DataView(buffer, byteOffset, byteLength);
        },
        desString(): string {
            const len = Des.view.getUint32(Des.index, LE);
            Des.index += 4;
            const bytes = new Uint8Array(Des.buffer, Des.index, len);
            Des.index += len;
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
            const value = Des.view.getFloat64(Des.index, LE);
            Des.index += 8;
            return value;
        },
        desEnum(): number | string {
            const type = Des.view.getUint32(Des.index, LE);
            Des.index += 4;
            if (type === NUM) {
                const value = Des.view.getUint32(Des.index, LE);
                Des.index += 4;
                return value;
            }
            return Des.desString();
        },
    };
    return Des;
}
