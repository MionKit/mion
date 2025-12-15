/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// this code is based on from seqproto library https://github.com/oramasearch/seqproto

import type {StrictArrayBuffer, DataViewSerializer, DataViewDeserializer} from './types/general.types';

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true; // always use little endian

// ############## create serializer & deserializer ##############

const DEFAULT_OPTIONS = {
    maxPoolItems: 100,
    maxStrCacheLength: 64,
    maxCacheSize: 1000,
    bufferSize: 2 ** 24,
    averageResponseSizeMultiplier: 2,
    responseAverageSizes: new Map<string, number>(),
    stringBytesCache: new Map<string, Uint8Array>(),
};

export type SerializationOptions = typeof DEFAULT_OPTIONS;

// ############## DataView-based serializer & deserializer ##############
// Uses byte-level precision (1-byte minimum unit) instead of 4-byte units

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let opts = {...DEFAULT_OPTIONS};

export function setSerializationOptions(options: Partial<SerializationOptions>) {
    opts = {...opts, ...options};
}

export function createDataViewSerializer(routeId: string): DataViewSerializer {
    const size = calculateDefaultBufferSize(routeId);
    if (size >= POW_2_32) throw new Error('bufferSize option must be strictly less than 2 ** 32');
    return new DataViewSerializerImpl(routeId, size);
}

export function createDataViewDeserializer(routeId: string, buffer: StrictArrayBuffer): DataViewDeserializer {
    return new DataViewDeserializerImpl(routeId, buffer);
}

// TODO: at the moment we do not resize the buffer, if data does not fit it will throw an error,
// anything that uses the serializer should catch the error and resize the buffer
class DataViewSerializerImpl implements DataViewSerializer {
    readonly buffer: ArrayBuffer;
    private uint8View: Uint8Array; // Reusable view
    readonly routeId: string;
    index: number = 0; // byte offset
    view: DataView;
    hasEnded: boolean = false;
    constructor(routeId: string, size: number) {
        this.routeId = routeId;
        this.buffer = new ArrayBuffer(size);
        this.view = new DataView(this.buffer);
        this.uint8View = new Uint8Array(this.buffer);
    }
    reset(): void {
        this.index = 0;
        this.hasEnded = false;
    }
    resize(size: number): void {
        (this as any).buffer = new ArrayBuffer(size);
        this.view = new DataView(this.buffer);
        this.uint8View = new Uint8Array(this.buffer);
    }
    getBuffer(): StrictArrayBuffer {
        const buff = this.buffer.slice(0, this.index);
        return buff;
    }
    getBufferView(): Uint8Array {
        return new Uint8Array(this.buffer, 0, this.index);
    }
    markAsEnded(): void {
        this.hasEnded = true;
        updateResponseSize(this.routeId, this.index);
    }
    getLength(): number {
        return this.index;
    }
    serString(str: string, skipCache?: boolean): void {
        if (str.length >= opts.maxStrCacheLength || skipCache) {
            const targetView = this.uint8View.subarray(this.index + 4);
            const result = textEncoder.encodeInto(str, targetView);
            this.view.setUint32(this.index, result.written, LE);
            this.index += 4 + result.written;
            return;
        }
        const cached = opts.stringBytesCache.get(str);
        if (cached) {
            this.uint8View.set(cached, this.index + 4);
            this.view.setUint32(this.index, cached.length, LE);
            this.index += 4 + cached.length;
            return;
        }

        // Encode directly into working view
        const targetView = this.uint8View.subarray(this.index + 4);
        const result = textEncoder.encodeInto(str, targetView);
        const written = result.written!;

        this.view.setUint32(this.index, written, LE);
        this.index += 4 + written;

        // Cache the encoded bytes (create slice only for caching)
        if (opts.stringBytesCache.size >= opts.maxCacheSize) evictStringBytesCache();
        opts.stringBytesCache.set(str, this.uint8View.slice(this.index - written, this.index));
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
}

class DataViewDeserializerImpl implements DataViewDeserializer {
    readonly buffer: StrictArrayBuffer;
    private uint8View: Uint8Array; // Reusable view
    readonly routeId: string;
    index: number = 0;
    view: DataView;
    hasEnded: boolean = false;
    constructor(routeId: string, buffer: StrictArrayBuffer) {
        this.routeId = routeId;
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.uint8View = new Uint8Array(buffer);
    }
    reset(): void {
        this.index = 0;
        this.hasEnded = false;
    }
    setBuffer(buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number): void {
        this.index = byteOffset ?? 0;
        (this as any).buffer = buffer;
        this.view = new DataView(buffer, byteOffset, byteLength);
        this.uint8View = new Uint8Array(buffer, byteOffset, byteLength); // Update working view
        this.hasEnded = false;
    }
    markAsEnded(): void {
        this.hasEnded = true;
    }
    getLength(): number {
        return this.index;
    }
    desString(): string {
        const len = this.view.getUint32(this.index, LE);
        this.index += 4;

        const decoded = textDecoder.decode(this.uint8View.subarray(this.index, this.index + len));
        this.index += len;
        return decoded;
    }
    /** Deserialize a string that will be used as a property name, with prototype pollution protection */
    desSafePropName(): string {
        const key = this.desString();
        const len = key.length;
        if (len === 9) {
            if (key === '__proto__' || key === 'prototype') throw new Error(`Unsafe property name: ${key}`);
        } else if (len === 11) {
            if (key === 'constructor') throw new Error(`Unsafe property name: ${key}`);
        }
        return key;
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

/** return the 75% percentile of the response size for the given route, and updates the map */
function calculateDefaultBufferSize(routeId: string): number {
    const size = opts.responseAverageSizes.get(routeId);
    if (!size) return opts.bufferSize;
    return size * opts.averageResponseSizeMultiplier;
}

function updateResponseSize(routeId: string, responseSize: number) {
    const currentSize = opts.responseAverageSizes.get(routeId) || opts.bufferSize;
    const average = (currentSize + responseSize) / 2;
    opts.responseAverageSizes.set(routeId, Math.floor(average));
}

function evictStringBytesCache(): void {
    const entries = Array.from(opts.stringBytesCache.entries());
    opts.stringBytesCache.clear();
    for (let i = Math.floor(entries.length / 2); i < entries.length; i++) {
        opts.stringBytesCache.set(entries[i][0], entries[i][1]);
    }
}
