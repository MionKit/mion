/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JITUtils, GenericPureFunction} from '@mionkit/core';
import {registerPureFnClosuresGroup, registerPureFnClosure} from '@mionkit/run-types';
import {BSONWriteContext} from '@mionkit/run-types/src/jitFns/compileBSON/types';

// ==================== PURE WRITE FUNCTIONS ====================

/**
 * Ensure buffer has enough capacity, growing if necessary
 * @reflection never
 */
export function mionEnsureCapacity() {
    return function ensureCapacity(ctx: BSONWriteContext, additionalBytes: number): BSONWriteContext {
        const requiredSize = ctx.position + additionalBytes;
        if (requiredSize <= ctx.buffer.length) {
            return ctx; // No change needed
        }

        const newSize = Math.max(ctx.buffer.length * 2, requiredSize);
        const newBuffer = new Uint8Array(newSize);
        newBuffer.set(ctx.buffer.subarray(0, ctx.position));

        // Mutate the context in place
        ctx.buffer = newBuffer;
        // Note: DataView will be created fresh for each operation at the current position
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a single byte
 * @reflection never
 */
export function mionWriteUInt8(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeUInt8(ctx: BSONWriteContext, value: number): BSONWriteContext {
        ensureCapacity(ctx, 1);
        ctx.buffer[ctx.position] = value;
        ctx.position += 1;
        ctx.bytesWritten += 1;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a 32-bit integer in little-endian format
 * @reflection never
 */
export function mionWriteInt32LE(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeInt32LE(ctx: BSONWriteContext, value: number): BSONWriteContext {
        ensureCapacity(ctx, 4);
        // Create DataView for current position - this is lightweight
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 4);
        view.setInt32(0, value, true); // true = little-endian
        ctx.position += 4;
        ctx.bytesWritten += 4;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a 64-bit integer in little-endian format
 * @reflection never
 */
export function mionWriteInt64LE(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeInt64LE(ctx: BSONWriteContext, value: bigint): BSONWriteContext {
        ensureCapacity(ctx, 8);
        // Create DataView for current position - this is lightweight
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 8);
        view.setBigInt64(0, value, true); // true = little-endian
        ctx.position += 8;
        ctx.bytesWritten += 8;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a 64-bit double in little-endian format
 * @reflection never
 */
export function mionWriteDoubleLE(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeDoubleLE(ctx: BSONWriteContext, value: number): BSONWriteContext {
        ensureCapacity(ctx, 8);
        // Create DataView for current position - this is lightweight
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 8);
        view.setFloat64(0, value, true); // true = little-endian
        ctx.position += 8;
        ctx.bytesWritten += 8;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a number with automatic BSON type detection
 * Chooses between Int32, Int64, or Double based on the value
 * @reflection never
 */
export function mionWriteNumber(jUtil: JITUtils) {
    const writeInt32LE = jUtil.getPureFn('pf_mionWriteInt32LE') as ReturnType<typeof mionWriteInt32LE>;
    const writeInt64LE = jUtil.getPureFn('pf_mionWriteInt64LE') as ReturnType<typeof mionWriteInt64LE>;
    const writeDoubleLE = jUtil.getPureFn('pf_mionWriteDoubleLE') as ReturnType<typeof mionWriteDoubleLE>;

    return function writeNumber(ctx: BSONWriteContext, value: number): BSONWriteContext {
        // Check if it's an integer
        if (Number.isInteger(value)) {
            // Check if it fits in 32-bit signed integer range
            if (value >= -2147483648 && value <= 2147483647) {
                return writeInt32LE(ctx, value);
            }
            // Check if it fits in JavaScript's safe integer range (can be represented as BigInt)
            else if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
                return writeInt64LE(ctx, BigInt(value));
            }
            // Integer too large for safe conversion, use double
            else {
                return writeDoubleLE(ctx, value);
            }
        }
        // Not an integer, use double
        else {
            return writeDoubleLE(ctx, value);
        }
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a C-style null-terminated string
 * @reflection never
 */
export function mionWriteCString(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeCString(ctx: BSONWriteContext, str: string): BSONWriteContext {
        // Use the reusable TextEncoder from jUtil
        const utf8Bytes = jUtil.textEncoder.encode(str);
        const totalBytes = utf8Bytes.length + 1; // +1 for null terminator
        ensureCapacity(ctx, totalBytes);

        ctx.buffer.set(utf8Bytes, ctx.position);
        ctx.buffer[ctx.position + utf8Bytes.length] = 0; // null terminator
        ctx.position += totalBytes;
        ctx.bytesWritten += totalBytes;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write a BSON string (length-prefixed + null-terminated)
 * @reflection never
 */
export function mionWriteBSONString(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeBSONString(ctx: BSONWriteContext, str: string): BSONWriteContext {
        // Use the reusable TextEncoder from jUtil
        const utf8Bytes = jUtil.textEncoder.encode(str);
        const stringLength = utf8Bytes.length + 1; // include null terminator
        const totalBytes = 4 + utf8Bytes.length + 1; // length(4) + string + null

        ensureCapacity(ctx, totalBytes);

        // Write length using lightweight DataView
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 4);
        view.setInt32(0, stringLength, true);

        // Write string bytes
        ctx.buffer.set(utf8Bytes, ctx.position + 4);

        // Write null terminator
        ctx.buffer[ctx.position + 4 + utf8Bytes.length] = 0;

        ctx.position += totalBytes;
        ctx.bytesWritten += totalBytes;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Write raw bytes
 * @reflection never
 */
export function mionWriteBytes(jUtil: JITUtils) {
    const ensureCapacity = jUtil.getPureFn('pf_mionEnsureCapacity') as ReturnType<typeof mionEnsureCapacity>;
    return function writeBytes(ctx: BSONWriteContext, bytes: Uint8Array): BSONWriteContext {
        ensureCapacity(ctx, bytes.length);
        ctx.buffer.set(bytes, ctx.position);
        ctx.position += bytes.length;
        ctx.bytesWritten += bytes.length;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

// ==================== UTILITY FUNCTIONS ====================

export function createBSONWriteContext(): BSONWriteContext {
    return {buffer: new Uint8Array(0), position: 0, bytesWritten: 0, tempBuffer: new Uint8Array(0)};
}

// ==================== REGISTRATION ====================

// Base functions that don't depend on other pure functions
export const baseBSONFns = [mionEnsureCapacity];

// Functions that depend on base functions
export const dependentBSONFns = [
    mionWriteUInt8,
    mionWriteInt32LE,
    mionWriteInt64LE,
    mionWriteDoubleLE,
    mionWriteNumber, // NEW: Runtime number type detection
    mionWriteCString,
    mionWriteBSONString,
    mionWriteBytes,
];

// Register base functions first
registerPureFnClosuresGroup(baseBSONFns);

// Register dependent functions with their dependencies
registerPureFnClosure(mionWriteUInt8, [mionEnsureCapacity]);
registerPureFnClosure(mionWriteInt32LE, [mionEnsureCapacity]);
registerPureFnClosure(mionWriteInt64LE, [mionEnsureCapacity]);
registerPureFnClosure(mionWriteDoubleLE, [mionEnsureCapacity]);
registerPureFnClosure(mionWriteNumber, [mionWriteInt32LE, mionWriteInt64LE, mionWriteDoubleLE]);
registerPureFnClosure(mionWriteCString, [mionEnsureCapacity]);
registerPureFnClosure(mionWriteBSONString, [mionEnsureCapacity]);
registerPureFnClosure(mionWriteBytes, [mionEnsureCapacity]);
