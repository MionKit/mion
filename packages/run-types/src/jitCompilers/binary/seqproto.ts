// this code is based on from seqproto library and used only for reference and few methods added to support mion requirements
// https://github.com/oramasearch/seqproto

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export type StrictArrayBuffer = ArrayBuffer & {buffer?: undefined};

const TYPE_FLOAT = 0;
const TYPE_UINT32 = 1;
const TYPE_INT32 = 2;
const TYPE_FLOAT64 = 3;
const TYPE_UINT64 = 4;
const TYPE_INT64 = 5;
const POW_2_32 = 2 ** 32;

export interface BinarySerializer {
    index: number;
    buffer: ArrayBuffer;
    uint32Array: Uint32Array;
    float32Array: Float32Array;
    float64Array: Float64Array;
    reset: () => void;
    getBuffer: () => StrictArrayBuffer;
    serializeBoolean: (b: boolean) => void;
    serializeUInt32: (n: number) => void;
    serializeFloat32: (n: number) => void;
    serializeNumber: (n: number) => void;
    serializeString: (str: string) => void;
    serializeArray: <T>(arr: T[], serialize: (ser: BinarySerializer, t: T) => void) => void;
    serializeIterable: <T>(iterable: Iterable<T>, serialize: (ser: BinarySerializer, t: T) => void) => void;
    serializeIndexableArray: <T>(arr: T[], serialize: (ser: BinarySerializer, t: T) => void) => void;
    unsafeSerializeUint32Array: (buffer: Uint32Array) => void;
    // mion
    serializeFloat64: (n: number) => void;
    serializeUInt64: (n: number) => void;
    serializeInt64: (n: number) => void;
    serializeBigInt: (n: bigint) => void;
    serializeDate: (date: Date) => void;
    serializeRegExp: (regExp: RegExp) => void;
}
export interface BinaryDeserializer {
    index: number;
    buffer: StrictArrayBuffer;
    uint32Array: Uint32Array;
    float32Array: Float32Array;
    float64Array: Float64Array;
    setBuffer: (buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) => void;
    deserializeBoolean: () => boolean;
    deserializeUInt32: () => number;
    deserializeFloat32: () => number;
    deserializeNumber: () => number;
    deserializeString: () => string;
    deserializeArray: <T>(deserialize: (des: BinaryDeserializer) => T) => T[];
    deserializeIterable: <T>(deserialize: (des: BinaryDeserializer) => T) => Iterable<T>;
    unsafeDeserializeUint32Array: () => Uint32Array;
    getArrayElements: <T>(indexes: number[], deserialize: (des: BinaryDeserializer, start: number, end: number) => T) => T[];
    // mion
    deserializeFloat64: () => number;
    deserializeUInt64: () => number;
    deserializeInt64: () => number;
    deserializeBigInt: () => bigint;
    deserializeDate: () => Date;
    deserializeRegExp: () => RegExp;
}

interface CreateSerOption {
    bufferSize?: number;
}

function serializeBoolean(this: BinarySerializer, b: boolean): void {
    this.uint32Array[this.index++] = b ? 1 : 0;
}
function serializeUInt32(this: BinarySerializer, n: number): void {
    this.uint32Array[this.index++] = n;
}
function deserializeUInt32(this: BinaryDeserializer): number {
    return this.uint32Array[this.index++];
}
function serializeFloat32(this: BinarySerializer, n: number): void {
    this.float32Array[this.index++] = n;
}
function deserializeFloat32(this: BinaryDeserializer): number {
    return this.float32Array[this.index++];
}
function deserializeBoolean(this: BinarySerializer): boolean {
    return this.uint32Array[this.index++] === 1;
}

function serializeNumber(this: BinarySerializer, n: number): void {
    // If it's not an integer
    if (!Number.isInteger(n)) {
        // precision check for floats
        this.uint32Array[this.index++] = TYPE_FLOAT64;
        this.serializeFloat64(n);
    } else {
        // Integer handling with extended range
        if (n >= 0 && n <= 0xffffffff) {
            // Fits in UInt32
            this.uint32Array[this.index++] = TYPE_UINT32;
            this.uint32Array[this.index++] = n;
        } else if (n >= -0x80000000 && n < 0) {
            // Fits in Int32 range
            this.uint32Array[this.index++] = TYPE_INT32;
            this.uint32Array[this.index++] = POW_2_32 + n;
        } else if (n >= 0) {
            // Large positive integer
            this.uint32Array[this.index++] = TYPE_UINT64;
            this.serializeUInt64(n);
        } else {
            // Large negative integer
            this.uint32Array[this.index++] = TYPE_INT64;
            this.serializeInt64(n);
        }
    }
}
function deserializeNumber(this: BinaryDeserializer): number {
    const type = this.uint32Array[this.index++];
    switch (type) {
        case TYPE_UINT32:
            return this.uint32Array[this.index++];
        case TYPE_INT32:
            return this.uint32Array[this.index++] - POW_2_32;
        case TYPE_UINT64:
            return this.deserializeUInt64();
        case TYPE_INT64:
            return this.deserializeInt64();
        case TYPE_FLOAT:
            return this.float32Array[this.index++];
        case TYPE_FLOAT64:
            return this.deserializeFloat64();
        default:
            throw new Error('Unknown type: ' + type);
    }
}

const textEncoder = new TextEncoder();
function serializeString(this: BinarySerializer, str: string): void {
    const r = textEncoder.encodeInto(str, new Uint8Array(this.buffer, (this.index + 1) * 4));
    this.uint32Array[this.index] = r.written;
    this.index += Math.ceil(r.written / 4) + 1;
}

const textDecoder = new TextDecoder();
function deserializeString(this: BinaryDeserializer): string {
    const len = this.uint32Array[this.index++];
    const decoded = textDecoder.decode(new Uint8Array(this.buffer, this.index * 4, len));
    this.index += Math.ceil(len / 4);
    return decoded;
}

function serializeArray<T>(this: BinarySerializer, arr: T[], serialize: (ser: BinarySerializer, t: T) => void): void {
    const len = arr.length;
    this.uint32Array[this.index++] = len;
    for (let i = 0; i < len; i++) {
        serialize(this, arr[i]);
    }
}
function deserializeArray<T>(this: BinaryDeserializer, deserialize: (ser: BinaryDeserializer) => T): T[] {
    const len = this.uint32Array[this.index++];
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = deserialize(this);
    }
    return arr;
}

function serializeIterable<T>(
    this: BinarySerializer,
    iterable: Iterable<T>,
    serialize: (ser: BinarySerializer, t: T) => void
): void {
    // Keep space for the length
    const currentIndex = this.index++;
    let n = 0;
    for (const t of iterable) {
        n++;
        serialize(this, t);
    }
    this.uint32Array[currentIndex] = n;
}
function deserializeIterable<T>(this: BinaryDeserializer, deserialize: (des: BinaryDeserializer) => T): Iterable<T> {
    const len = this.uint32Array[this.index++];
    const aGeneratorObject = (function* (des) {
        for (let i = 0; i < len; i++) {
            yield deserialize(des);
        }
    })(this);

    return {
        [Symbol.iterator]() {
            return aGeneratorObject;
        },
    };
}

function unsafeSerializeUint32Array(this: BinarySerializer, arr: Uint32Array): void {
    const length = Math.ceil(arr.byteLength / 4);
    this.uint32Array[this.index++] = length;
    this.uint32Array.set(arr, this.index);
    this.index += length;
}
function unsafeDeserializeUint32Array(this: BinaryDeserializer): Uint32Array {
    const byteLength = this.uint32Array[this.index++];
    const d = new Uint32Array(this.buffer, this.index * 4, byteLength);
    this.index += byteLength;
    return d;
}

function serializeIndexableArray<T>(this: BinarySerializer, arr: T[], serialize: (ser: BinarySerializer, t: T) => void): void {
    const l = arr.length;
    this.uint32Array[this.index++] = l;
    let indexOffsets = this.index;
    // Skip the length of the array twice
    // to store the offset + length of the array element
    this.index += l * 2;
    for (let i = 0; i < l; i++) {
        const offsetStart = this.index;
        serialize(this, arr[i]);
        const offsetEnd = this.index;
        this.uint32Array[indexOffsets++] = offsetStart;
        this.uint32Array[indexOffsets++] = offsetEnd - offsetStart;
    }
}
function getArrayElements<T>(
    this: BinaryDeserializer,
    indexes: number[],
    deserialize: (des: BinaryDeserializer, start: number, end: number) => T
): T[] {
    const currentIndex = this.index + 1;
    const l = indexes.length;
    const arr = new Array(l);
    for (let i = 0; i < l; i++) {
        const indexOffset = currentIndex + indexes[i] * 2;
        const start = this.uint32Array[indexOffset];
        const end = this.uint32Array[indexOffset + 1];
        arr[i] = deserialize(this, start * 4, end);
    }
    return arr;
}

// ##################### mion extension #####################

function serializeDate(this: BinarySerializer, date: Date): void {
    const timestamp = date.getTime();
    if (timestamp <= 0xffffffff) {
        this.uint32Array[this.index++] = TYPE_UINT32;
        this.uint32Array[this.index++] = timestamp;
    } else {
        this.uint32Array[this.index++] = TYPE_FLOAT;
        this.float32Array[this.index++] = timestamp;
    }
}
function deserializeDate(this: BinaryDeserializer): Date {
    const type = this.uint32Array[this.index++];
    if (type === TYPE_UINT32) {
        return new Date(this.uint32Array[this.index++]);
    } else if (type === TYPE_FLOAT) {
        return new Date(this.float32Array[this.index++]);
    } else {
        throw new Error('Invalid date type');
    }
}
function serializeRegExp(this: BinarySerializer, regExp: RegExp): void {
    this.serializeString(regExp.source);
    this.serializeString(regExp.flags);
}
function deserializeRegExp(this: BinaryDeserializer): RegExp {
    const source = this.deserializeString();
    const flags = this.deserializeString();
    return new RegExp(source, flags);
}
function serializeFloat64(this: BinarySerializer, n: number): void {
    // Ensure index is even for 8-byte alignment
    if (this.index % 2 !== 0) {
        this.uint32Array[this.index] = 0; // Zero out the skipped slot
        this.index++;
    }
    this.float64Array[this.index / 2] = n;
    this.index += 2;
}
function deserializeFloat64(this: BinaryDeserializer): number {
    // Ensure index is even for 8-byte alignment
    if (this.index % 2 !== 0) {
        this.index++; // Skip the padding slot
    }
    const value = this.float64Array[this.index / 2];
    this.index += 2;
    return value;
}

function serializeUInt64(this: BinarySerializer, n: number): void {
    // Ensure index is even for 8-byte alignment
    if (this.index % 2 !== 0) {
        this.uint32Array[this.index] = 0; // Zero out the skipped slot
        this.index++;
    }
    // Use Float64Array to store large integers (exact up to 2^53)
    this.float64Array[this.index / 2] = n;
    this.index += 2;
}
function deserializeUInt64(this: BinaryDeserializer): number {
    // Ensure index is even for 8-byte alignment
    if (this.index % 2 !== 0) {
        this.index++; // Skip the padding slot
    }
    const value = this.float64Array[this.index / 2];
    this.index += 2;
    return value;
}
function serializeInt64(this: BinarySerializer, n: number): void {
    // Ensure index is even for 8-byte alignment
    if (this.index % 2 !== 0) {
        this.uint32Array[this.index] = 0; // Zero out the skipped slot
        this.index++;
    }
    // Use Float64Array to store large integers (works for negative numbers too)
    this.float64Array[this.index / 2] = n;
    this.index += 2;
}
function deserializeInt64(this: BinaryDeserializer): number {
    // Ensure index is even for 8-byte alignment
    if (this.index % 2 !== 0) {
        this.index++; // Skip the padding slot
    }
    const value = this.float64Array[this.index / 2];
    this.index += 2;
    return value;
}
function serializeBigInt(this: BinarySerializer, n: bigint): void {
    // Serialize all BigInts as strings for simplicity and universal support
    this.serializeString(n.toString());
}
function deserializeBigInt(this: BinaryDeserializer): bigint {
    // Deserialize BigInt from string
    const str = this.deserializeString();
    return BigInt(str);
}

export function createBinarySerializer({bufferSize}: CreateSerOption = {}): BinarySerializer {
    const size = bufferSize ?? 2 ** 24;
    if (size >= POW_2_32) {
        throw new Error('bufferSize option must be strictly less than 2 ** 32');
    }

    // Ensure buffer size is aligned to 8 bytes for Float64Array compatibility
    const alignedSize = Math.floor(size / 8) * 8;
    const buffer = new ArrayBuffer(alignedSize);
    return {
        index: 0,
        buffer,
        uint32Array: new Uint32Array(buffer),
        float32Array: new Float32Array(buffer),
        float64Array: new Float64Array(buffer),
        reset: function () {
            this.index = 0;
        },
        serializeBoolean,
        serializeUInt32,
        serializeFloat32,
        serializeNumber,
        serializeString,
        serializeArray,
        serializeIterable,
        serializeIndexableArray,
        unsafeSerializeUint32Array,
        getBuffer: function () {
            return this.buffer.slice(0, this.index * 4);
        },
        // mion
        serializeFloat64,
        serializeUInt64,
        serializeInt64,
        serializeBigInt,
        serializeDate,
        serializeRegExp,
    };
}

export function createBinaryDeserializer(buffer: StrictArrayBuffer): BinaryDeserializer {
    const n32 = Math.floor(buffer.byteLength / 4);
    const n64 = Math.floor(buffer.byteLength / 8);

    return {
        index: 0,
        buffer,
        uint32Array: new Uint32Array(buffer, 0, n32),
        float32Array: new Float32Array(buffer, 0, n32),
        float64Array: new Float64Array(buffer, 0, n64),
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
        deserializeBoolean,
        deserializeUInt32,
        deserializeFloat32,
        deserializeNumber,
        deserializeString,
        deserializeArray,
        deserializeIterable,
        getArrayElements,
        unsafeDeserializeUint32Array,
        // mion
        deserializeFloat64,
        deserializeUInt64,
        deserializeInt64,
        deserializeBigInt,
        deserializeDate,
        deserializeRegExp,
    };
}

// TODO: we could investigate some other optimizations techniques
// like https://kriszyp.medium.com/building-the-fastest-js-de-serializer-a413a2b4fb72
