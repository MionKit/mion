/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// this code is based on from seqproto library https://github.com/oramasearch/seqproto

import type {StrictArrayBuffer, DataViewSerializer, DataViewDeserializer} from './types';

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true; // always use little endian

// ############## create serializer & deserializer ##############

const DEFAULT_OPTIONS = {
    maxStrCacheLength: 64,
    maxCacheSize: 600,
    bufferSize: 2 ** 24,
    averageResponseSizeMultiplier: 2,
    responseAverageSizes: new Map<string, number>(),
    stringCache: new Map<string, string>(),
    stringBytesCache: new Map<string, Uint8Array>(),
};

export type SerializationOptions = typeof DEFAULT_OPTIONS;

// ############## DataView-based serializer & deserializer ##############
// Uses byte-level precision (1-byte minimum unit) instead of 4-byte units

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// TODO: at the moment we do not resize the buffer, if data does not fit it will throw an error,
// anything that uses the serializer should catch the error and resize the buffer
class DataViewSerializerImpl implements DataViewSerializer {
    private buffer: ArrayBuffer;
    private routeId: string;
    index: number = 0; // byte offset
    view: DataView;
    constructor(
        routeId: string,
        size: number,
        private opts: SerializationOptions
    ) {
        this.routeId = routeId;
        this.buffer = new ArrayBuffer(size);
        this.view = new DataView(this.buffer);
    }
    reset(): void {
        this.index = 0;
    }
    getBuffer(): StrictArrayBuffer {
        const buff = this.buffer.slice(0, this.index);
        updateResponseSize(this.routeId, buff.byteLength, this.opts);
        return buff;
    }
    serString(str: string): void {
        if (str.length >= this.opts.maxStrCacheLength) {
            const targetView = new Uint8Array(this.buffer, this.index + 4);
            const result = textEncoder.encodeInto(str, targetView);
            this.view.setUint32(this.index, result.written, LE);
            this.index += 4 + result.written;
            return;
        }
        this.serAndCacheString(str);
    }
    serFloat64(n: number): void {
        this.view.setFloat64(this.index, n, LE);
        this.index += 8;
    }
    serEnum(n: number | string): void {
        if (typeof n === 'number') {
            this.view.setUint32(this.index, NUM, LE);
            this.index += 4;
            this.view.setUint32(this.index, n, LE);
            this.index += 4;
            return;
        }
        this.view.setUint32(this.index, STR, LE);
        this.index += 4;
        this.serString(n);
    }
    setBitMask(bitMaskIndex: number, bitIndex: number): void {
        const newBitmask = this.view.getUint8(bitMaskIndex) | (1 << bitIndex);
        this.view.setUint8(bitMaskIndex, newBitmask);
    }
    serAndCacheString(str: string): void {
        const cached = this.opts.stringBytesCache.get(str);
        if (cached) {
            const targetView = new Uint8Array(this.buffer, this.index + 4, cached.length);
            targetView.set(cached);
            this.view.setUint32(this.index, cached.length, LE);
            this.index += 4 + cached.length;
            return;
        }
        const encodedBytes = textEncoder.encode(str);
        const targetView = new Uint8Array(this.buffer, this.index + 4, encodedBytes.length);
        targetView.set(encodedBytes);
        this.view.setUint32(this.index, encodedBytes.length, LE);
        this.index += 4 + encodedBytes.length;
        if (this.opts.stringBytesCache.size >= this.opts.maxCacheSize) evictStringCache(this.opts);
        this.opts.stringBytesCache.set(str, encodedBytes);
    }
}

class DataViewDeserializerImpl implements DataViewDeserializer {
    private buffer: StrictArrayBuffer;
    index: number = 0;
    view: DataView;
    constructor(
        buffer: StrictArrayBuffer,
        private opts: SerializationOptions
    ) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
    }
    hashBytes(bytes: Uint8Array, len: number): string {
        let hash = '';
        for (let i = 0; i < len; i++) hash += String.fromCharCode(bytes[i]);
        return hash;
    }
    setBuffer(buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number): void {
        this.index = byteOffset ?? 0;
        this.buffer = buffer;
        this.view = new DataView(buffer, byteOffset, byteLength);
    }
    desString(): string {
        const len = this.view.getUint32(this.index, LE);
        this.index += 4;
        const bytes = new Uint8Array(this.buffer, this.index, len);
        this.index += len;
        if (len >= this.opts.maxStrCacheLength) return textDecoder.decode(bytes);
        const cacheKey = this.hashBytes(bytes, len);
        const cached = this.opts.stringCache.get(cacheKey);
        if (cached) return cached;
        const decoded = textDecoder.decode(bytes);
        if (this.opts.stringCache.size >= this.opts.maxCacheSize) evictStringCache(this.opts);
        this.opts.stringCache.set(cacheKey, decoded);
        return decoded;
    }
    desFloat64(): number {
        const value = this.view.getFloat64(this.index, LE);
        this.index += 8;
        return value;
    }
    desEnum(): number | string {
        const type = this.view.getUint32(this.index, LE);
        this.index += 4;
        if (type === NUM) {
            const value = this.view.getUint32(this.index, LE);
            this.index += 4;
            return value;
        }
        return this.desString();
    }
}

export function createDataViewSerializer(routeId: string, opts?: Partial<SerializationOptions>): DataViewSerializer {
    const options = opts ? {...DEFAULT_OPTIONS, ...opts} : DEFAULT_OPTIONS;
    const size = calculateDefaultBufferSize(routeId, options);
    if (size >= POW_2_32) throw new Error('bufferSize option must be strictly less than 2 ** 32');
    return new DataViewSerializerImpl(routeId, size, options);
}

export function createDataViewDeserializer(
    buffer: StrictArrayBuffer,
    opts?: Partial<SerializationOptions>
): DataViewDeserializer {
    const options = opts ? {...DEFAULT_OPTIONS, ...opts} : DEFAULT_OPTIONS;
    return new DataViewDeserializerImpl(buffer, options);
}

/** return the 75% percentile of the response size for the given route, and updates the map */
function calculateDefaultBufferSize(routeId: string, opts: SerializationOptions): number {
    const size = opts.responseAverageSizes.get(routeId);
    if (!size) return opts.bufferSize;
    return size * opts.averageResponseSizeMultiplier;
}

function updateResponseSize(routeId: string, responseSize: number, opts: SerializationOptions) {
    const currentSize = opts.responseAverageSizes.get(routeId) || opts.bufferSize;
    const average = (currentSize + responseSize) / 2;
    opts.responseAverageSizes.set(routeId, Math.floor(average));
}

function evictStringCache(opts: SerializationOptions): void {
    const entries = Array.from(opts.stringCache.entries());
    opts.stringCache.clear();
    for (let i = entries.length / 2; i < entries.length; i++) {
        opts.stringCache.set(entries[i][0], entries[i][1]);
    }
}
