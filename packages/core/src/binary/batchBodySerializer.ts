/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StatusCodes} from '../constants';
import {RpcError} from '../errors';

const textEncoder = new TextEncoder();

/** Entry for serializing a batch binary response */
export interface BatchBinaryResponseSerEntry {
    routeId: string;
    statusCode: number;
    /** The individual route's binary response body (already serialized by the route's own dispatch cycle) */
    body: Uint8Array;
}

/** Entry for serializing a batch binary request */
export interface BatchBinaryRequestSerEntry {
    routeId: string;
    /** The individual route's binary request body */
    body: Uint8Array;
}

/**
 * Serializes a batch binary response envelope.
 * Wraps individual route binary response bodies into a single buffer.
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
export function serializeBatchBinaryResponse(entries: BatchBinaryResponseSerEntry[]): Uint8Array {
    try {
        // Calculate total buffer size
        let totalSize = 4; // route count
        for (const entry of entries) {
            const routeIdBytes = textEncoder.encode(entry.routeId);
            totalSize += 4 + routeIdBytes.length + 4 + 4 + entry.body.length; // routeIdLen + routeId + status + bodyLen + body
        }

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);
        let offset = 0;

        // Write route count
        view.setUint32(offset, entries.length, true);
        offset += 4;

        for (const entry of entries) {
            const routeIdBytes = textEncoder.encode(entry.routeId);

            // Write route ID string length
            view.setUint32(offset, routeIdBytes.length, true);
            offset += 4;

            // Write route ID string
            uint8.set(routeIdBytes, offset);
            offset += routeIdBytes.length;

            // Write status code
            view.setUint32(offset, entry.statusCode, true);
            offset += 4;

            // Write body length
            view.setUint32(offset, entry.body.length, true);
            offset += 4;

            // Write body
            uint8.set(entry.body, offset);
            offset += entry.body.length;
        }

        return new Uint8Array(buffer, 0, offset);
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-binary-response-serialization-error',
            publicMessage: `Failed to serialize batch binary response: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/**
 * Serializes a batch binary request envelope.
 * Wraps individual route binary request bodies into a single buffer.
 *
 * Binary format:
 * [4 bytes]  - Number of routes (uint32 LE)
 * For each route:
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Body length in bytes (uint32 LE)
 *   [M bytes]  - Individual route binary body
 */
export function serializeBatchBinaryRequest(entries: BatchBinaryRequestSerEntry[]): Uint8Array {
    try {
        // Calculate total buffer size
        let totalSize = 4; // route count
        for (const entry of entries) {
            const routeIdBytes = textEncoder.encode(entry.routeId);
            totalSize += 4 + routeIdBytes.length + 4 + entry.body.length; // routeIdLen + routeId + bodyLen + body
        }

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);
        let offset = 0;

        // Write route count
        view.setUint32(offset, entries.length, true);
        offset += 4;

        for (const entry of entries) {
            const routeIdBytes = textEncoder.encode(entry.routeId);

            // Write route ID string length
            view.setUint32(offset, routeIdBytes.length, true);
            offset += 4;

            // Write route ID string
            uint8.set(routeIdBytes, offset);
            offset += routeIdBytes.length;

            // Write body length
            view.setUint32(offset, entry.body.length, true);
            offset += 4;

            // Write body
            uint8.set(entry.body, offset);
            offset += entry.body.length;
        }

        return new Uint8Array(buffer, 0, offset);
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-binary-request-serialization-error',
            publicMessage: `Failed to serialize batch binary request: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}
