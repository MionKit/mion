/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StatusCodes} from '../constants';
import {RpcError} from '../errors';
import {DataViewSerializer} from '../types/general.types';
import {createBatchDataViewSerializer} from './dataView';

const LE = true;

/**
 * Init shared DataViewSerializer for batch. Writes route count header.
 *
 * Binary format header:
 * [4 bytes] - Number of routes (uint32 LE)
 */
export function initBatchSerializer(
    routeIds: string[],
    /** If true, the batch is a response batch, otherwise it's a request batch */
    isResponse: boolean
): DataViewSerializer {
    try {
        const serializer = createBatchDataViewSerializer(routeIds);
        // Write route count
        serializer.view.setUint32(serializer.index, routeIds.length, LE);
        serializer.index += 4;
        return serializer;
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: isResponse ? 'batch-binary-response-serialization-error' : 'batch-binary-request-serialization-error',
            publicMessage: `Failed to init batch ${isResponse ? 'response' : 'request'} serializer: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/**
 * Write route entry into the batch serializer.
 *
 * Request per-route format:
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Body length in bytes (uint32 LE)
 *   [M bytes]  - Individual route binary body
 *
 * Response per-route format (incremental with placeholders):
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Status code placeholder (uint32 LE) — backfilled later
 *   [4 bytes]  - Body length placeholder (uint32 LE) — backfilled later
 *   [M bytes]  - Individual route binary body (written later)
 */
export function writeBatchEntry(
    serializer: DataViewSerializer,
    routeId: string,
    /** Body bytes (only for requests, responses write body separately) */
    requestBody?: Uint8Array
): {
    statusIndex?: number;
    bodyLengthIndex?: number;
    bodyStartIndex?: number;
} {
    const isResponse = !requestBody;
    // Write routeId string (length-prefixed UTF-8)
    serializer.serString(routeId);

    if (isResponse) {
        // Response mode: write placeholders for statusCode and bodyLength
        const statusIndex = serializer.index;
        serializer.index += 4;

        const bodyLengthIndex = serializer.index;
        serializer.index += 4;

        const bodyStartIndex = serializer.index;

        return {statusIndex, bodyLengthIndex, bodyStartIndex};
    } else {
        // Request mode: write body immediately
        if (!requestBody) throw new Error('Body is required for request batch entries');

        // Write body length
        serializer.view.setUint32(serializer.index, requestBody.length, LE);
        serializer.index += 4;

        // Write body bytes
        if (requestBody.length > 0) {
            const uint8View = new Uint8Array(serializer.view.buffer, 0, serializer.view.byteLength);
            uint8View.set(requestBody, serializer.index);
            serializer.index += requestBody.length;
        }

        return {};
    }
}

/** Backfill statusCode and bodyLength after route body has been written into the serializer (response mode only). */
export function finalizeBatchEntry(
    serializer: DataViewSerializer,
    statusCode: number,
    statusIndex: number,
    bodyLengthIndex: number,
    bodyStartIndex: number
): void {
    // Backfill statusCode
    serializer.view.setUint32(statusIndex, statusCode, LE);
    // Calculate and backfill bodyLength
    const bodyLength = serializer.index - bodyStartIndex;
    serializer.view.setUint32(bodyLengthIndex, bodyLength, LE);
}
