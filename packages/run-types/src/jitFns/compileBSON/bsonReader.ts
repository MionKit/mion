/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JITUtils, GenericPureFunction} from '@mionkit/core';
import {registerPureFnClosuresGroup, registerPureFnClosure} from '@mionkit/run-types';
import {BSONReadContext} from '@mionkit/run-types/src/jitFns/compileBSON/types';

// ==================== PURE READ FUNCTIONS ====================

/**
 * Check if we have enough bytes to read
 * @reflection never
 */
export function mionCheckAvailable() {
    return function checkAvailable(ctx: BSONReadContext, bytes: number): void {
        if (ctx.position + bytes > ctx.buffer.length) {
            throw new Error('BSON buffer underrun');
        }
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a single byte
 * @reflection never
 */
export function mionReadUInt8(jUtil: JITUtils) {
    const checkAvailable = jUtil.getPureFn('pf_mionCheckAvailable') as ReturnType<typeof mionCheckAvailable>;
    return function readUInt8(ctx: BSONReadContext): BSONReadContext {
        checkAvailable(ctx, 1);
        ctx.value = ctx.buffer[ctx.position];
        ctx.position += 1;
        ctx.bytesRead += 1;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a 32-bit integer in little-endian format
 * @reflection never
 */
export function mionReadInt32LE(jUtil: JITUtils) {
    const checkAvailable = jUtil.getPureFn('pf_mionCheckAvailable') as ReturnType<typeof mionCheckAvailable>;
    return function readInt32LE(ctx: BSONReadContext): BSONReadContext {
        checkAvailable(ctx, 4);
        // Create lightweight DataView for current position
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 4);
        ctx.value = view.getInt32(0, true); // true = little-endian
        ctx.position += 4;
        ctx.bytesRead += 4;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a 64-bit integer in little-endian format
 * @reflection never
 */
export function mionReadInt64LE(jUtil: JITUtils) {
    const checkAvailable = jUtil.getPureFn('pf_mionCheckAvailable') as ReturnType<typeof mionCheckAvailable>;
    return function readInt64LE(ctx: BSONReadContext): BSONReadContext {
        checkAvailable(ctx, 8);
        // Create lightweight DataView for current position
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 8);
        ctx.value = view.getBigInt64(0, true); // true = little-endian
        ctx.position += 8;
        ctx.bytesRead += 8;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a 64-bit double in little-endian format
 * @reflection never
 */
export function mionReadDoubleLE(jUtil: JITUtils) {
    const checkAvailable = jUtil.getPureFn('pf_mionCheckAvailable') as ReturnType<typeof mionCheckAvailable>;
    return function readDoubleLE(ctx: BSONReadContext): BSONReadContext {
        checkAvailable(ctx, 8);
        // Create lightweight DataView for current position
        const view = new DataView(ctx.buffer.buffer, ctx.buffer.byteOffset + ctx.position, 8);
        ctx.value = view.getFloat64(0, true); // true = little-endian
        ctx.position += 8;
        ctx.bytesRead += 8;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a number based on BSON type byte
 * Handles Int32 (0x10), Int64 (0x12), and Double (0x01)
 * @reflection never
 */
export function mionReadNumber(jUtil: JITUtils) {
    const readInt32LE = jUtil.getPureFn('pf_mionReadInt32LE') as ReturnType<typeof mionReadInt32LE>;
    const readInt64LE = jUtil.getPureFn('pf_mionReadInt64LE') as ReturnType<typeof mionReadInt64LE>;
    const readDoubleLE = jUtil.getPureFn('pf_mionReadDoubleLE') as ReturnType<typeof mionReadDoubleLE>;

    return function readNumber(ctx: BSONReadContext, bsonType: number): BSONReadContext {
        // BSON type constants
        const BSON_DOUBLE = 0x01;
        const BSON_INT32 = 0x10;
        const BSON_INT64 = 0x12;

        switch (bsonType) {
            case BSON_INT32:
                return readInt32LE(ctx);

            case BSON_INT64: {
                readInt64LE(ctx);
                // Convert BigInt back to number if it fits safely
                const bigIntValue = ctx.value as bigint;
                if (bigIntValue >= Number.MIN_SAFE_INTEGER && bigIntValue <= Number.MAX_SAFE_INTEGER) {
                    ctx.value = Number(bigIntValue);
                }
                // Otherwise keep as BigInt
                return ctx;
            }

            case BSON_DOUBLE:
                return readDoubleLE(ctx);

            default:
                throw new Error(`Invalid BSON number type: 0x${bsonType.toString(16)}`);
        }
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a C-style null-terminated string
 * @reflection never
 */
export function mionReadCString(jUtil: JITUtils) {
    return function readCString(ctx: BSONReadContext): BSONReadContext {
        const start = ctx.position;
        let position = ctx.position;

        while (position < ctx.buffer.length && ctx.buffer[position] !== 0) {
            position++;
        }

        if (position >= ctx.buffer.length) {
            throw new Error('BSON buffer underrun: unterminated C string');
        }

        const stringBytes = ctx.buffer.subarray(start, position);
        // Use the reusable TextDecoder from jUtil
        ctx.value = jUtil.textDecoder.decode(stringBytes);
        const bytesRead = position - start + 1; // +1 for null terminator
        ctx.position = position + 1; // skip null terminator
        ctx.bytesRead += bytesRead;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Read a BSON string (length-prefixed + null-terminated)
 * @reflection never
 */
export function mionReadBSONString(jUtil: JITUtils) {
    const readInt32LE = jUtil.getPureFn('pf_mionReadInt32LE') as ReturnType<typeof mionReadInt32LE>;
    const checkAvailable = jUtil.getPureFn('pf_mionCheckAvailable') as ReturnType<typeof mionCheckAvailable>;
    return function readBSONString(ctx: BSONReadContext): BSONReadContext {
        // Read the length first
        readInt32LE(ctx);
        const stringLength = ctx.value as number;

        // Check if we have enough bytes for the string
        checkAvailable(ctx, stringLength);

        const stringBytes = ctx.buffer.subarray(
            ctx.position,
            ctx.position + stringLength - 1 // -1 to exclude null terminator
        );

        const nullTerminator = ctx.buffer[ctx.position + stringLength - 1];
        if (nullTerminator !== 0) {
            throw new Error('BSON string not null-terminated');
        }

        // Use the reusable TextDecoder from jUtil
        ctx.value = jUtil.textDecoder.decode(stringBytes);
        ctx.position += stringLength;
        ctx.bytesRead += stringLength;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

/**
 * Read raw bytes
 * @reflection never
 */
export function mionReadBytes(jUtil: JITUtils) {
    const checkAvailable = jUtil.getPureFn('pf_mionCheckAvailable') as ReturnType<typeof mionCheckAvailable>;
    return function readBytes(ctx: BSONReadContext, length: number): BSONReadContext {
        checkAvailable(ctx, length);
        ctx.value = ctx.buffer.subarray(ctx.position, ctx.position + length);
        ctx.position += length;
        ctx.bytesRead += length;
        return ctx;
    } satisfies GenericPureFunction<any>;
}

// ==================== UTILITY FUNCTIONS ====================

export function createBSONReadContext(): BSONReadContext {
    return {buffer: new Uint8Array(0), position: 0, bytesRead: 0, value: undefined};
}

// ==================== REGISTRATION ====================

// Base functions that don't depend on other pure functions
export const baseBSONFns = [mionCheckAvailable];

// Functions that depend on base functions
export const dependentBSONFns = [
    mionReadUInt8,
    mionReadInt32LE,
    mionReadInt64LE,
    mionReadDoubleLE,
    mionReadNumber, // NEW: Runtime number type reading
    mionReadCString,
    mionReadBytes,
    mionReadBSONString,
];

// Register base functions first
registerPureFnClosuresGroup(baseBSONFns);

// Register dependent functions with their dependencies
registerPureFnClosure(mionReadUInt8, [mionCheckAvailable]);
registerPureFnClosure(mionReadInt32LE, [mionCheckAvailable]);
registerPureFnClosure(mionReadInt64LE, [mionCheckAvailable]);
registerPureFnClosure(mionReadDoubleLE, [mionCheckAvailable]);
registerPureFnClosure(mionReadNumber, [mionReadInt32LE, mionReadInt64LE, mionReadDoubleLE]);
registerPureFnClosure(mionReadCString, []);
registerPureFnClosure(mionReadBytes, [mionCheckAvailable]);
registerPureFnClosure(mionReadBSONString, [mionReadInt32LE, mionCheckAvailable]);
