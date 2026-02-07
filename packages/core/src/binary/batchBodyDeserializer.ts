/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StatusCodes} from '../constants';
import {RpcError} from '../errors';
import {BinaryInput, DataViewDeserializer} from '../types/general.types';
import {createDataViewDeserializer} from './dataView';

const LE = true;

/**
 * Init deserializer from batch buffer. Reads route count.
 *
 * Binary format header:
 * [4 bytes] - Number of routes (uint32 LE)
 */
export function initBatchDeserializer(
    buffer: BinaryInput,
    /** If true, the batch is a response batch, otherwise it's a request batch */
    isResponse: boolean
): {
    deserializer: DataViewDeserializer;
    routeCount: number;
} {
    try {
        const deserializer = createDataViewDeserializer(buffer);
        const routeCount = deserializer.view.getUint32(deserializer.index, LE);
        deserializer.index += 4;
        return {deserializer, routeCount};
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: isResponse ? 'batch-binary-response-deserialization-error' : 'batch-binary-request-deserialization-error',
            publicMessage: `Failed to init batch ${isResponse ? 'response' : 'request'} deserializer: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/**
 * Read next route entry from the batch deserializer.
 *
 * Request per-route format:
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Body length in bytes (uint32 LE)
 *   [M bytes]  - Individual route binary body (NOT read for requests — deserializer index at body start)
 *
 * Response per-route format:
 *   [4 bytes]  - Route ID string length (uint32 LE)
 *   [N bytes]  - Route ID string (UTF-8)
 *   [4 bytes]  - Status code (uint32 LE)
 *   [4 bytes]  - Body length in bytes (uint32 LE)
 *   [M bytes]  - Individual route binary body (fully extracted for responses)
 */
export function readNextBatchEntry(
    deserializer: DataViewDeserializer,
    /** If true, the batch is a response batch, otherwise it's a request batch */
    isResponse: boolean
): {
    routeId: string;
    bodyLength: number;
    statusCode?: number;
    body?: Uint8Array;
} {
    // Read routeId string (length-prefixed)
    const routeId = deserializer.desString();

    // Read status code (only for responses)
    let statusCode: number | undefined;
    if (isResponse) {
        statusCode = deserializer.view.getUint32(deserializer.index, LE);
        deserializer.index += 4;
    }

    // Read body length
    const bodyLength = deserializer.view.getUint32(deserializer.index, LE);
    deserializer.index += 4;

    // Extract body slice (only for responses)
    let body: Uint8Array | undefined;
    if (isResponse) {
        const bodyStart = deserializer.index;
        const uint8View = new Uint8Array(deserializer.view.buffer, deserializer.view.byteOffset, deserializer.view.byteLength);
        body = uint8View.subarray(bodyStart, bodyStart + bodyLength);
        deserializer.index += bodyLength;
    }
    // For requests, deserializer index is now at the start of the body bytes

    return {routeId, bodyLength, statusCode, body};
}
