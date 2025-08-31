/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Binary read context - mutable for performance with reusable objects
 */
export interface BinaryReadContext {
    buffer: Uint8Array;
    position: number;
    bytesRead: number;
}

/**
 * Binary write context - mutable for performance with reusable objects
 */

export interface BinaryWriteContext {
    buffer: Uint8Array;
    position: number;
    bytesWritten: number;
    // Reusable objects for performance
    tempBuffer: Uint8Array; // For temporary operations
}
