/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// this code is based on from seqproto library https://github.com/oramasearch/seqproto

import type {JITUtils} from '@mionkit/core';
import type {BinaryDeserializer, BinarySerializer, StrictArrayBuffer} from './types';
import {registerPureFnClosure} from '../../lib/pureFn';

/** @reflection never */
export function mionBinSerString() {
    function setIndex(ser: BinarySerializer, length: number) {
        ser.uint32Array[ser.index] = length;
        ser.index += Math.ceil(length / 4) + 1;
    }
    return function serializeString(ser: BinarySerializer, str: string): void {
        if (str.length >= ser.maxStrLength) {
            const targetView = new Uint8Array(ser.buffer, (ser.index + 1) * 4);
            const result = ser.textEncoder.encodeInto(str, targetView);
            setIndex(ser, result.written);
            return;
        }
        const cached = ser.stringCache.get(str);
        if (cached) {
            const targetView = new Uint8Array(ser.buffer, (ser.index + 1) * 4, cached.length);
            targetView.set(cached);
            setIndex(ser, cached.length);
            return;
        }
        const encodedBytes = ser.textEncoder.encode(str);
        const targetView = new Uint8Array(ser.buffer, (ser.index + 1) * 4, encodedBytes.length);
        targetView.set(encodedBytes);
        setIndex(ser, encodedBytes.length);
        if (ser.stringCache.size >= ser.maxCacheSize) ser.evictStringCache();
        ser.stringCache.set(str, encodedBytes);
    };
}

/** @reflection never */
export function mionBinDesString() {
    return function deserializeString(des: BinaryDeserializer): string {
        const len = des.uint32Array[des.index++];
        const bytes = new Uint8Array(des.buffer, des.index * 4, len);
        const indexIncrement = Math.ceil(len / 4);
        des.index += indexIncrement;
        if (len >= des.maxStrLength) return des.textDecoder.decode(bytes);
        const cacheKey = des.hashBytes(bytes, len);
        const cached = des.stringCache.get(cacheKey);
        if (cached) return cached;
        const decoded = des.textDecoder.decode(bytes);
        if (des.stringCache.size >= des.maxCacheSize) des.evictStringCache();
        des.stringCache.set(cacheKey, decoded);
        return decoded;
    };
}

/** @reflection never */
export function mionBinSerFloat64() {
    return function serializeFloat64(ser: BinarySerializer, n: number): void {
        if (ser.index % 2 !== 0) {
            ser.uint32Array[ser.index] = 0;
            ser.index++;
        }
        ser.float64Array[ser.index / 2] = n;
        ser.index += 2;
    };
}

/** @reflection never */
export function mionBinDesFloat64() {
    return function deserializeFloat64(des: BinaryDeserializer): number {
        if (des.index % 2 !== 0) des.index++;
        const value = des.float64Array[des.index / 2];
        des.index += 2;
        return value;
    };
}

// prettier-ignore
/** @reflection never */
export function mionBinSerNumber(jUtil: JITUtils) {
    const UINT32 = 1; const INT32 = 2; const FLOAT64 = 3; const POW_2_32 = 2 ** 32;
    const sF64 = jUtil.getPureFn('pf_mionBinSerFloat64') as ReturnType<typeof mionBinSerFloat64>;
    return function serializeNumber(ser: BinarySerializer, n: number): void {
        if (!Number.isInteger(n)) {
            ser.uint32Array[ser.index++] = FLOAT64;
            sF64(ser, n);
        } else if (n >= 0) {
            if (n <= 0xffffffff) {
                ser.uint32Array[ser.index++] = UINT32;
                ser.uint32Array[ser.index++] = n;
            } else {
                ser.uint32Array[ser.index++] = FLOAT64;
                sF64(ser, n);
            }
        } else if (n >= -0x80000000) {
            ser.uint32Array[ser.index++] = INT32;
            ser.uint32Array[ser.index++] = POW_2_32 + n;
        } else {
            ser.uint32Array[ser.index++] = FLOAT64;
            sF64(ser, n);
        }
    };
}

// prettier-ignore
/** @reflection never */
export function mionBinDesNumber(jUtil: JITUtils) {
    const UINT32 = 1; const INT32 = 2; const FLOAT64 = 3; const POW_2_32 = 2 ** 32;
    const dF64 = jUtil.getPureFn('pf_mionBinDesFloat64') as ReturnType<typeof mionBinDesFloat64>;
    return function deserializeNumber(des: BinaryDeserializer): number {
        const type = des.uint32Array[des.index++];
        switch (type) {
            case UINT32: return des.uint32Array[des.index++];
            case INT32: return des.uint32Array[des.index++] - POW_2_32;
            case FLOAT64: return dF64(des);
            default: throw new Error('Unknown number type: ' + type);
        }
    };
}

// prettier-ignore
/** @reflection never */
export function mionBinSerEnum(jUtil: JITUtils) {
    const STR = 1; const NUM = 2;
    const sString = jUtil.getPureFn('pf_mionBinSerString') as ReturnType<typeof mionBinSerString>;
    return function serializeEnum(ser: BinarySerializer, n: number | string): void {
        if (typeof n === 'number') {
            ser.uint32Array[ser.index++] = NUM;
            ser.uint32Array[ser.index++] = n;
            return;
        }
        ser.uint32Array[ser.index++] = STR;
        sString(ser, n);
    };
}

/** @reflection never */
export function mionBinDesEnum(jUtil: JITUtils) {
    const NUM = 2;
    const dString = jUtil.getPureFn('pf_mionBinDesString') as ReturnType<typeof mionBinDesString>;
    return function deserializeEnum(des: BinaryDeserializer): number | string {
        const type = des.uint32Array[des.index++];
        if (type === NUM) return des.uint32Array[des.index++];
        return dString(des);
    };
}

// ############## register pure functions so they can be used in the jit compiler ##############

registerPureFnClosure(mionBinSerString);
registerPureFnClosure(mionBinDesString);
registerPureFnClosure(mionBinSerFloat64);
registerPureFnClosure(mionBinDesFloat64);
registerPureFnClosure(mionBinSerNumber, [mionBinSerFloat64]);
registerPureFnClosure(mionBinDesNumber, [mionBinDesFloat64]);
registerPureFnClosure(mionBinSerEnum, [mionBinSerString]);
registerPureFnClosure(mionBinDesEnum, [mionBinDesString]);

// ############## create serializer & deserializer ##############

interface CreateSerOption {
    bufferSize?: number;
}

const POW_2_32 = 2 ** 32;
export function createBinarySerializer({bufferSize}: CreateSerOption = {}): BinarySerializer {
    const size = bufferSize ?? 2 ** 24;
    if (size >= POW_2_32) throw new Error('bufferSize option must be strictly less than 2 ** 32');
    // Ensure buffer size is aligned to 8 bytes for Float64Array compatibility
    const alignedSize = Math.floor(size / 8) * 8;
    const buffer = new ArrayBuffer(alignedSize);
    const serializer: BinarySerializer = {
        index: 0,
        buffer,
        uint32Array: new Uint32Array(buffer),
        float32Array: new Float32Array(buffer),
        float64Array: new Float64Array(buffer),
        textEncoder: new TextEncoder(),
        maxStrLength: 64,
        maxCacheSize: 600,
        stringCache: new Map<string, Uint8Array>(),
        evictStringCache: function () {
            const entries = Array.from(this.stringCache.entries());
            this.stringCache.clear();
            for (let i = entries.length / 2; i < entries.length; i++) {
                this.stringCache.set(entries[i][0], entries[i][1]);
            }
        },
        reset: function () {
            this.index = 0;
        },
        getBuffer: function () {
            return this.buffer.slice(0, this.index * 4);
        },
    };

    return serializer;
}

export function createBinaryDeserializer(buffer: StrictArrayBuffer): BinaryDeserializer {
    const n32 = Math.floor(buffer.byteLength / 4);
    const n64 = Math.floor(buffer.byteLength / 8);
    const deserializer: BinaryDeserializer = {
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
    };
    return deserializer;
}
