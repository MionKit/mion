/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// BSON type constants following BSON 1.1 specification
export const BSON_TYPES = {
    DOUBLE: 0x01,
    STRING: 0x02,
    DOCUMENT: 0x03,
    ARRAY: 0x04,
    BINARY: 0x05,
    UNDEFINED: 0x06, // Deprecated
    OBJECTID: 0x07,
    BOOLEAN: 0x08,
    DATETIME: 0x09,
    NULL: 0x0a,
    REGEX: 0x0b,
    INT32: 0x10,
    TIMESTAMP: 0x11,
    INT64: 0x12,
    DECIMAL128: 0x13,
} as const;

// Binary subtypes
export const BSON_BINARY_SUBTYPES = {
    GENERIC: 0x00,
    FUNCTION: 0x01,
    BINARY_OLD: 0x02,
    UUID_OLD: 0x03,
    UUID: 0x04,
    MD5: 0x05,
    ENCRYPTED: 0x06,
    USER_DEFINED: 0x80,
} as const;

export type BSONType = (typeof BSON_TYPES)[keyof typeof BSON_TYPES];
export type BSONBinarySubtype = (typeof BSON_BINARY_SUBTYPES)[keyof typeof BSON_BINARY_SUBTYPES];

/**
 * BSON Writer class for building BSON documents
 */
export class BSONWriter {
    private buffer: Uint8Array;
    private position: number;
    private view: DataView;

    constructor(initialSize: number = 1024) {
        this.buffer = new Uint8Array(initialSize);
        this.position = 0;
        this.view = new DataView(this.buffer.buffer);
    }

    private ensureCapacity(additionalBytes: number): void {
        const requiredSize = this.position + additionalBytes;
        if (requiredSize > this.buffer.length) {
            const newSize = Math.max(this.buffer.length * 2, requiredSize);
            const newBuffer = new Uint8Array(newSize);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
            this.view = new DataView(this.buffer.buffer);
        }
    }

    writeUInt8(value: number): void {
        this.ensureCapacity(1);
        this.buffer[this.position] = value;
        this.position += 1;
    }

    writeInt32LE(value: number): void {
        this.ensureCapacity(4);
        this.view.setInt32(this.position, value, true); // little-endian
        this.position += 4;
    }

    writeInt64LE(value: number | bigint): void {
        this.ensureCapacity(8);
        if (typeof value === 'number') {
            // For numbers, use the DataView setFloat64 to handle the conversion
            this.view.setBigInt64(this.position, BigInt(value), true);
        } else {
            this.view.setBigInt64(this.position, value, true);
        }
        this.position += 8;
    }

    writeDoubleLE(value: number): void {
        this.ensureCapacity(8);
        this.view.setFloat64(this.position, value, true); // little-endian
        this.position += 8;
    }

    writeCString(str: string): void {
        const utf8Bytes = new TextEncoder().encode(str);
        this.ensureCapacity(utf8Bytes.length + 1);
        this.buffer.set(utf8Bytes, this.position);
        this.position += utf8Bytes.length;
        this.buffer[this.position] = 0; // null terminator
        this.position += 1;
    }

    writeString(str: string): void {
        const utf8Bytes = new TextEncoder().encode(str);
        const stringLength = utf8Bytes.length + 1; // include null terminator
        this.writeInt32LE(stringLength);
        this.ensureCapacity(utf8Bytes.length + 1);
        this.buffer.set(utf8Bytes, this.position);
        this.position += utf8Bytes.length;
        this.buffer[this.position] = 0; // null terminator
        this.position += 1;
    }

    writeBytes(bytes: Uint8Array): void {
        this.ensureCapacity(bytes.length);
        this.buffer.set(bytes, this.position);
        this.position += bytes.length;
    }

    getBuffer(): Uint8Array {
        return this.buffer.slice(0, this.position);
    }

    getPosition(): number {
        return this.position;
    }

    setPosition(position: number): void {
        this.position = position;
    }
}

/**
 * BSON Reader class for parsing BSON documents
 */
export class BSONReader {
    private buffer: Uint8Array;
    private position: number;
    private view: DataView;

    constructor(buffer: Uint8Array) {
        this.buffer = buffer;
        this.position = 0;
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    readUInt8(): number {
        if (this.position >= this.buffer.length) {
            throw new Error('BSON buffer underrun: cannot read UInt8');
        }
        const value = this.buffer[this.position];
        this.position += 1;
        return value;
    }

    readInt32LE(): number {
        if (this.position + 4 > this.buffer.length) {
            throw new Error('BSON buffer underrun: cannot read Int32');
        }
        const value = this.view.getInt32(this.position, true); // little-endian
        this.position += 4;
        return value;
    }

    readInt64LE(): bigint {
        if (this.position + 8 > this.buffer.length) {
            throw new Error('BSON buffer underrun: cannot read Int64');
        }
        const value = this.view.getBigInt64(this.position, true); // little-endian
        this.position += 8;
        return value;
    }

    readDoubleLE(): number {
        if (this.position + 8 > this.buffer.length) {
            throw new Error('BSON buffer underrun: cannot read Double');
        }
        const value = this.view.getFloat64(this.position, true); // little-endian
        this.position += 8;
        return value;
    }

    readCString(): string {
        const start = this.position;
        while (this.position < this.buffer.length && this.buffer[this.position] !== 0) {
            this.position++;
        }
        if (this.position >= this.buffer.length) {
            throw new Error('BSON buffer underrun: unterminated C string');
        }
        const stringBytes = this.buffer.slice(start, this.position);
        this.position += 1; // skip null terminator
        return new TextDecoder().decode(stringBytes);
    }

    readString(): string {
        const length = this.readInt32LE();
        if (this.position + length > this.buffer.length) {
            throw new Error('BSON buffer underrun: cannot read string');
        }
        const stringBytes = this.buffer.slice(this.position, this.position + length - 1); // exclude null terminator
        this.position += length;
        return new TextDecoder().decode(stringBytes);
    }

    readBytes(length: number): Uint8Array {
        if (this.position + length > this.buffer.length) {
            throw new Error('BSON buffer underrun: cannot read bytes');
        }
        const bytes = this.buffer.slice(this.position, this.position + length);
        this.position += length;
        return bytes;
    }

    getPosition(): number {
        return this.position;
    }

    setPosition(position: number): void {
        this.position = position;
    }

    hasMoreData(): boolean {
        return this.position < this.buffer.length;
    }
}

/**
 * Utility functions for BSON operations
 */
export function calculateBSONSize(value: any): number {
    // Rough estimation for buffer pre-allocation
    // This is a simplified version - actual implementation would be more precise
    if (value === null || value === undefined) return 1;
    if (typeof value === 'boolean') return 1;
    if (typeof value === 'number') return Number.isInteger(value) ? 4 : 8;
    if (typeof value === 'string') return 4 + new TextEncoder().encode(value).length + 1;
    if (value instanceof Uint8Array) return 4 + 1 + value.length;
    if (Array.isArray(value)) {
        return (
            4 +
            value.reduce((sum, item, index) => {
                return sum + String(index).length + 1 + 1 + calculateBSONSize(item);
            }, 0) +
            1
        );
    }
    if (typeof value === 'object') {
        return (
            4 +
            Object.entries(value).reduce((sum, [key, val]) => {
                return sum + key.length + 1 + 1 + calculateBSONSize(val);
            }, 0) +
            1
        );
    }
    return 100; // fallback estimate
}

export function isValidBSONType(type: number): type is BSONType {
    return Object.values(BSON_TYPES).includes(type as BSONType);
}
