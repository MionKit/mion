/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * BSON type constants following BSON 1.1 specification
 */
export const BSON_TYPES = {
    DOUBLE: 0x01,
    STRING: 0x02,
    DOCUMENT: 0x03,
    ARRAY: 0x04,
    BINARY: 0x05,
    UNDEFINED: 0x06, // Deprecated
    OBJECT_ID: 0x07,
    BOOLEAN: 0x08,
    DATE: 0x09,
    NULL: 0x0a,
    REGEX: 0x0b,
    DB_POINTER: 0x0c, // Deprecated
    JAVASCRIPT: 0x0d,
    SYMBOL: 0x0e, // Deprecated
    JAVASCRIPT_WITH_SCOPE: 0x0f,
    INT32: 0x10,
    TIMESTAMP: 0x11,
    INT64: 0x12,
    DECIMAL128: 0x13,
    MIN_KEY: 0xff,
    MAX_KEY: 0x7f,
} as const;

/**
 * BSON Writer class for serializing data to BSON format
 * This is a reference implementation - JIT functions should generate inline code instead
 */
export class BSONWriter {
    private buffer: Uint8Array;
    private position: number;

    constructor(initialSize = 1024) {
        this.buffer = new Uint8Array(initialSize);
        this.position = 0;
    }

    /**
     * Ensure buffer has enough capacity, growing if necessary
     */
    private ensureCapacity(additionalBytes: number): void {
        const requiredSize = this.position + additionalBytes;
        if (requiredSize > this.buffer.length) {
            const newSize = Math.max(this.buffer.length * 2, requiredSize);
            const newBuffer = new Uint8Array(newSize);
            newBuffer.set(this.buffer.subarray(0, this.position));
            this.buffer = newBuffer;
        }
    }

    /**
     * Write a single byte
     */
    writeUInt8(value: number): void {
        this.ensureCapacity(1);
        this.buffer[this.position] = value;
        this.position += 1;
    }

    /**
     * Write a 32-bit integer in little-endian format
     */
    writeInt32LE(value: number): void {
        this.ensureCapacity(4);
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.position, 4);
        view.setInt32(0, value, true); // true = little-endian
        this.position += 4;
    }

    /**
     * Write a 64-bit integer in little-endian format
     */
    writeInt64LE(value: bigint): void {
        this.ensureCapacity(8);
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.position, 8);
        view.setBigInt64(0, value, true); // true = little-endian
        this.position += 8;
    }

    /**
     * Write a 64-bit double in little-endian format
     */
    writeDoubleLE(value: number): void {
        this.ensureCapacity(8);
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.position, 8);
        view.setFloat64(0, value, true); // true = little-endian
        this.position += 8;
    }

    /**
     * Write a C-style null-terminated string
     */
    writeCString(str: string): void {
        const utf8Bytes = new TextEncoder().encode(str);
        this.ensureCapacity(utf8Bytes.length + 1);
        this.buffer.set(utf8Bytes, this.position);
        this.position += utf8Bytes.length;
        this.buffer[this.position] = 0; // null terminator
        this.position += 1;
    }

    /**
     * Write a BSON string (length-prefixed + null-terminated)
     */
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

    /**
     * Write raw bytes
     */
    writeBytes(bytes: Uint8Array): void {
        this.ensureCapacity(bytes.length);
        this.buffer.set(bytes, this.position);
        this.position += bytes.length;
    }

    /**
     * Get the current buffer contents
     */
    getBuffer(): Uint8Array {
        return this.buffer.subarray(0, this.position);
    }

    /**
     * Reset the writer
     */
    reset(): void {
        this.position = 0;
    }

    /**
     * Get current position
     */
    getPosition(): number {
        return this.position;
    }
}

/**
 * BSON Reader class for deserializing data from BSON format
 * This is a reference implementation - JIT functions should generate inline code instead
 */
export class BSONReader {
    private buffer: Uint8Array;
    private position: number;

    constructor(buffer: Uint8Array) {
        this.buffer = buffer;
        this.position = 0;
    }

    /**
     * Check if we have enough bytes to read
     */
    private checkAvailable(bytes: number): void {
        if (this.position + bytes > this.buffer.length) {
            throw new Error('BSON buffer underrun');
        }
    }

    /**
     * Read a single byte
     */
    readUInt8(): number {
        this.checkAvailable(1);
        const value = this.buffer[this.position];
        this.position += 1;
        return value;
    }

    /**
     * Read a 32-bit integer in little-endian format
     */
    readInt32LE(): number {
        this.checkAvailable(4);
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.position, 4);
        const value = view.getInt32(0, true); // true = little-endian
        this.position += 4;
        return value;
    }

    /**
     * Read a 64-bit integer in little-endian format
     */
    readInt64LE(): bigint {
        this.checkAvailable(8);
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.position, 8);
        const value = view.getBigInt64(0, true); // true = little-endian
        this.position += 8;
        return value;
    }

    /**
     * Read a 64-bit double in little-endian format
     */
    readDoubleLE(): number {
        this.checkAvailable(8);
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.position, 8);
        const value = view.getFloat64(0, true); // true = little-endian
        this.position += 8;
        return value;
    }

    /**
     * Read a C-style null-terminated string
     */
    readCString(): string {
        const start = this.position;
        while (this.position < this.buffer.length && this.buffer[this.position] !== 0) {
            this.position++;
        }
        if (this.position >= this.buffer.length) {
            throw new Error('BSON buffer underrun: unterminated C string');
        }
        const stringBytes = this.buffer.subarray(start, this.position);
        this.position += 1; // skip null terminator
        return new TextDecoder().decode(stringBytes);
    }

    /**
     * Read a BSON string (length-prefixed + null-terminated)
     */
    readString(): string {
        const stringLength = this.readInt32LE();
        this.checkAvailable(stringLength);
        const stringBytes = this.buffer.subarray(this.position, this.position + stringLength - 1);
        this.position += stringLength - 1;
        const nullTerminator = this.readUInt8();
        if (nullTerminator !== 0) {
            throw new Error('BSON string not null-terminated');
        }
        return new TextDecoder().decode(stringBytes);
    }

    /**
     * Read raw bytes
     */
    readBytes(length: number): Uint8Array {
        this.checkAvailable(length);
        const bytes = this.buffer.subarray(this.position, this.position + length);
        this.position += length;
        return bytes;
    }

    /**
     * Get current position
     */
    getPosition(): number {
        return this.position;
    }

    /**
     * Set position
     */
    setPosition(position: number): void {
        if (position < 0 || position > this.buffer.length) {
            throw new Error('Invalid position');
        }
        this.position = position;
    }

    /**
     * Check if we're at the end of the buffer
     */
    isAtEnd(): boolean {
        return this.position >= this.buffer.length;
    }

    /**
     * Get remaining bytes
     */
    getRemainingBytes(): number {
        return this.buffer.length - this.position;
    }
}
