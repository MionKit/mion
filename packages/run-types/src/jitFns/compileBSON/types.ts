/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * BSON read context - mutable for performance with reusable objects
 */
export interface BSONReadContext {
    buffer: Uint8Array;
    position: number;
    bytesRead: number;
    value: any; // Last read value
}

/**
 * BSON write context - mutable for performance with reusable objects
 */

export interface BSONWriteContext {
    buffer: Uint8Array;
    position: number;
    bytesWritten: number;
    // Reusable objects for performance
    tempBuffer: Uint8Array; // For temporary operations
}
