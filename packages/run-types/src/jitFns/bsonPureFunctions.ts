/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Pure functional BSON utilities
 * All functions are pure - no external dependencies, all constants defined inside functions
 * Buffer state is passed as parameters and returned as new state
 */

/**
 * BSON context for pure functional operations
 */
export interface BSONContext {
    buffer: Uint8Array;
    position: number;
}

/**
 * Result of a write operation
 */
export interface WriteResult {
    context: BSONContext;
    bytesWritten: number;
}

/**
 * Result of a read operation
 */
export interface ReadResult<T> {
    context: BSONContext;
    value: T;
    bytesRead: number;
}

// ==================== PURE WRITE FUNCTIONS ====================

/**
 * Ensure buffer has enough capacity, growing if necessary
 */
export function ensureCapacity(ctx: BSONContext, additionalBytes: number): BSONContext {
    const requiredSize = ctx.position + additionalBytes;
    if (requiredSize <= ctx.buffer.length) {
        return ctx; // No change needed
    }

    const newSize = Math.max(ctx.buffer.length * 2, requiredSize);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(ctx.buffer.subarray(0, ctx.position));

    return {
        buffer: newBuffer,
        position: ctx.position,
    };
}

/**
 * Write a single byte
 */
export function writeUInt8(ctx: BSONContext, value: number): WriteResult {
    const newCtx = ensureCapacity(ctx, 1);
    newCtx.buffer[newCtx.position] = value;

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + 1,
        },
        bytesWritten: 1,
    };
}

/**
 * Write a 32-bit integer in little-endian format
 */
export function writeInt32LE(ctx: BSONContext, value: number): WriteResult {
    const newCtx = ensureCapacity(ctx, 4);
    const view = new DataView(newCtx.buffer.buffer, newCtx.buffer.byteOffset + newCtx.position, 4);
    view.setInt32(0, value, true); // true = little-endian

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + 4,
        },
        bytesWritten: 4,
    };
}

/**
 * Write a 64-bit integer in little-endian format
 */
export function writeInt64LE(ctx: BSONContext, value: bigint): WriteResult {
    const newCtx = ensureCapacity(ctx, 8);
    const view = new DataView(newCtx.buffer.buffer, newCtx.buffer.byteOffset + newCtx.position, 8);
    view.setBigInt64(0, value, true); // true = little-endian

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + 8,
        },
        bytesWritten: 8,
    };
}

/**
 * Write a 64-bit double in little-endian format
 */
export function writeDoubleLE(ctx: BSONContext, value: number): WriteResult {
    const newCtx = ensureCapacity(ctx, 8);
    const view = new DataView(newCtx.buffer.buffer, newCtx.buffer.byteOffset + newCtx.position, 8);
    view.setFloat64(0, value, true); // true = little-endian

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + 8,
        },
        bytesWritten: 8,
    };
}

/**
 * Write a C-style null-terminated string
 */
export function writeCString(ctx: BSONContext, str: string): WriteResult {
    const utf8Bytes = new TextEncoder().encode(str);
    const totalBytes = utf8Bytes.length + 1; // +1 for null terminator
    const newCtx = ensureCapacity(ctx, totalBytes);

    newCtx.buffer.set(utf8Bytes, newCtx.position);
    newCtx.buffer[newCtx.position + utf8Bytes.length] = 0; // null terminator

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + totalBytes,
        },
        bytesWritten: totalBytes,
    };
}

/**
 * Write a BSON string (length-prefixed + null-terminated)
 */
export function writeBSONString(ctx: BSONContext, str: string): WriteResult {
    const utf8Bytes = new TextEncoder().encode(str);
    const stringLength = utf8Bytes.length + 1; // include null terminator
    const totalBytes = 4 + utf8Bytes.length + 1; // length(4) + string + null

    const newCtx = ensureCapacity(ctx, totalBytes);

    // Write length
    const view = new DataView(newCtx.buffer.buffer, newCtx.buffer.byteOffset + newCtx.position, 4);
    view.setInt32(0, stringLength, true);

    // Write string bytes
    newCtx.buffer.set(utf8Bytes, newCtx.position + 4);

    // Write null terminator
    newCtx.buffer[newCtx.position + 4 + utf8Bytes.length] = 0;

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + totalBytes,
        },
        bytesWritten: totalBytes,
    };
}

/**
 * Write raw bytes
 */
export function writeBytes(ctx: BSONContext, bytes: Uint8Array): WriteResult {
    const newCtx = ensureCapacity(ctx, bytes.length);
    newCtx.buffer.set(bytes, newCtx.position);

    return {
        context: {
            buffer: newCtx.buffer,
            position: newCtx.position + bytes.length,
        },
        bytesWritten: bytes.length,
    };
}

// ==================== PURE READ FUNCTIONS ====================

/**
 * Check if we have enough bytes to read
 */
function checkAvailable(ctx: BSONContext, bytes: number): void {
    if (ctx.position + bytes > ctx.buffer.length) {
        throw new Error('BSON buffer underrun');
    }
}

/**
 * Read a single byte
 */
export function readUInt8(ctx: BSONContext): ReadResult<number> {
    checkAvailable(ctx, 1);
    const value = ctx.buffer[ctx.position];

    return {
        context: {
            buffer: ctx.buffer,
            position: ctx.position + 1,
        },
        value,
        bytesRead: 1,
    };
}

/**
 * Read a 32-bit integer in little-endian format
 */
export function readInt32LE(ctx: BSONContext): ReadResult<number> {
    checkAvailable(ctx, 4);
    const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 4);
    const value = view.getInt32(0, true); // true = little-endian

    return {
        context: {
            buffer: ctx.buffer,
            position: ctx.position + 4,
        },
        value,
        bytesRead: 4,
    };
}

/**
 * Read a 64-bit integer in little-endian format
 */
export function readInt64LE(ctx: BSONContext): ReadResult<bigint> {
    checkAvailable(ctx, 8);
    const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 8);
    const value = view.getBigInt64(0, true); // true = little-endian

    return {
        context: {
            buffer: ctx.buffer,
            position: ctx.position + 8,
        },
        value,
        bytesRead: 8,
    };
}

/**
 * Read a 64-bit double in little-endian format
 */
export function readDoubleLE(ctx: BSONContext): ReadResult<number> {
    checkAvailable(ctx, 8);
    const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 8);
    const value = view.getFloat64(0, true); // true = little-endian

    return {
        context: {
            buffer: ctx.buffer,
            position: ctx.position + 8,
        },
        value,
        bytesRead: 8,
    };
}

/**
 * Read a C-style null-terminated string
 */
export function readCString(ctx: BSONContext): ReadResult<string> {
    const start = ctx.position;
    let position = ctx.position;

    while (position < ctx.buffer.length && ctx.buffer[position] !== 0) {
        position++;
    }

    if (position >= ctx.buffer.length) {
        throw new Error('BSON buffer underrun: unterminated C string');
    }

    const stringBytes = ctx.buffer.subarray(start, position);
    const value = new TextDecoder().decode(stringBytes);
    const bytesRead = position - start + 1; // +1 for null terminator

    return {
        context: {
            buffer: ctx.buffer,
            position: position + 1, // skip null terminator
        },
        value,
        bytesRead,
    };
}

/**
 * Read a BSON string (length-prefixed + null-terminated)
 */
export function readBSONString(ctx: BSONContext): ReadResult<string> {
    const lengthResult = readInt32LE(ctx);
    const stringLength = lengthResult.value;

    checkAvailable(lengthResult.context, stringLength);

    const stringBytes = lengthResult.context.buffer.subarray(
        lengthResult.context.position,
        lengthResult.context.position + stringLength - 1
    );

    const nullTerminator = lengthResult.context.buffer[lengthResult.context.position + stringLength - 1];
    if (nullTerminator !== 0) {
        throw new Error('BSON string not null-terminated');
    }

    const value = new TextDecoder().decode(stringBytes);
    const totalBytesRead = 4 + stringLength; // length + string + null

    return {
        context: {
            buffer: lengthResult.context.buffer,
            position: lengthResult.context.position + stringLength,
        },
        value,
        bytesRead: totalBytesRead,
    };
}

/**
 * Read raw bytes
 */
export function readBytes(ctx: BSONContext, length: number): ReadResult<Uint8Array> {
    checkAvailable(ctx, length);
    const bytes = ctx.buffer.subarray(ctx.position, ctx.position + length);

    return {
        context: {
            buffer: ctx.buffer,
            position: ctx.position + length,
        },
        value: bytes,
        bytesRead: length,
    };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Create a new BSON context
 */
export function createBSONContext(initialSize = 1024): BSONContext {
    return {
        buffer: new Uint8Array(initialSize),
        position: 0,
    };
}

/**
 * Get the current buffer contents
 */
export function getBuffer(ctx: BSONContext): Uint8Array {
    return ctx.buffer.subarray(0, ctx.position);
}

/**
 * Reset context position
 */
export function resetPosition(ctx: BSONContext): BSONContext {
    return {
        buffer: ctx.buffer,
        position: 0,
    };
}

/**
 * Check if we're at the end of the buffer
 */
export function isAtEnd(ctx: BSONContext): boolean {
    return ctx.position >= ctx.buffer.length;
}

/**
 * Get remaining bytes
 */
export function getRemainingBytes(ctx: BSONContext): number {
    return ctx.buffer.length - ctx.position;
}
