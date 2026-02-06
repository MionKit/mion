/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StatusCodes} from '../constants';
import {RpcError} from '../errors';
import {BinaryInput} from '../types/general.types';

/**
 * Result of deserializing a batch binary request envelope.
 * Contains route IDs and per-route binary body slices.
 * Individual route bodies are NOT deserialized here - that happens in each route's own dispatch cycle.
 */
export interface BatchBinaryRequestEntry {
    routeId: string;
    body: Uint8Array;
}

/**
 * Result of deserializing a batch binary response envelope.
 * Contains route IDs, status codes, and per-route binary body slices.
 */
export interface BatchBinaryResponseEntry {
    routeId: string;
    statusCode: number;
    body: Uint8Array;
}

const textDecoder = new TextDecoder();

/**
 * Deserializes a batch binary request envelope.
 * Extracts route IDs and per-route binary body slices from the batch buffer.
 *
 * Binary format:
 * [4 bytes]  - Number of routes (uint32 LE)
 * For each route:
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Body length in bytes (uint32 LE)
 *   [M bytes]  - Individual route binary body
 */
export function deserializeBatchBinaryRequest(buffer: BinaryInput): BatchBinaryRequestEntry[] {
    try {
        const {view, uint8, byteOffset, byteLength} = getViewsFromInput(buffer);
        let offset = 0;

        // Read number of routes
        const routeCount = view.getUint32(offset, true);
        offset += 4;

        const entries: BatchBinaryRequestEntry[] = [];

        for (let i = 0; i < routeCount; i++) {
            // Read route ID string length
            const routeIdLen = view.getUint32(offset, true);
            offset += 4;

            // Read route ID string
            const routeId = textDecoder.decode(uint8.subarray(byteOffset + offset, byteOffset + offset + routeIdLen));
            offset += routeIdLen;

            // Read body length
            const bodyLen = view.getUint32(offset, true);
            offset += 4;

            // Extract body slice (zero-copy view into the original buffer)
            const body = uint8.subarray(byteOffset + offset, byteOffset + offset + bodyLen);
            offset += bodyLen;

            entries.push({routeId, body});
        }

        if (offset > byteLength) {
            throw new Error(`Binary batch request buffer overrun: read ${offset} bytes but buffer is ${byteLength} bytes`);
        }

        return entries;
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-binary-request-deserialization-error',
            publicMessage: `Failed to deserialize batch binary request: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/**
 * Deserializes a batch binary response envelope.
 * Extracts route IDs, status codes, and per-route binary body slices.
 *
 * Binary format:
 * [4 bytes]  - Number of routes (uint32 LE)
 * For each route:
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Status code (uint32 LE)
 *   [4 bytes]  - Body length in bytes (uint32 LE)
 *   [M bytes]  - Individual route binary body
 */
export function deserializeBatchBinaryResponse(buffer: BinaryInput): BatchBinaryResponseEntry[] {
    try {
        const {view, uint8, byteOffset, byteLength} = getViewsFromInput(buffer);
        let offset = 0;

        // Read number of routes
        const routeCount = view.getUint32(offset, true);
        offset += 4;

        const entries: BatchBinaryResponseEntry[] = [];

        for (let i = 0; i < routeCount; i++) {
            // Read route ID string length
            const routeIdLen = view.getUint32(offset, true);
            offset += 4;

            // Read route ID string
            const routeId = textDecoder.decode(uint8.subarray(byteOffset + offset, byteOffset + offset + routeIdLen));
            offset += routeIdLen;

            // Read status code
            const statusCode = view.getUint32(offset, true);
            offset += 4;

            // Read body length
            const bodyLen = view.getUint32(offset, true);
            offset += 4;

            // Extract body slice
            const body = uint8.subarray(byteOffset + offset, byteOffset + offset + bodyLen);
            offset += bodyLen;

            entries.push({routeId, statusCode, body});
        }

        if (offset > byteLength) {
            throw new Error(`Binary batch response buffer overrun: read ${offset} bytes but buffer is ${byteLength} bytes`);
        }

        return entries;
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-binary-response-deserialization-error',
            publicMessage: `Failed to deserialize batch binary response: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/** Extracts DataView and Uint8Array from various binary input types */
function getViewsFromInput(buffer: BinaryInput): {
    view: DataView;
    uint8: Uint8Array;
    byteOffset: number;
    byteLength: number;
} {
    if (ArrayBuffer.isView(buffer)) {
        const byteOffset = buffer.byteOffset;
        const byteLength = buffer.byteLength;
        const view = new DataView(buffer.buffer, byteOffset, byteLength);
        const uint8 = new Uint8Array(buffer.buffer);
        return {view, uint8, byteOffset, byteLength};
    }
    // Plain ArrayBuffer
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);
    return {view, uint8, byteOffset: 0, byteLength: buffer.byteLength};
}
