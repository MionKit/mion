/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionkit/router';
import {
    type MethodWithJitFns,
    RpcError,
    isRpcError,
    routesCache,
    MION_ROUTES,
    HandlerType,
    createDataViewSerializer,
    createDataViewDeserializer,
    type SerializerMode,
} from '@mionkit/core';
import type {MionClientRequest} from './request';

// ############# SERIALIZATION #############

/** Result of serializing a request body - can be string (JSON) or Uint8Array (binary) */
export type SerializedBody = string | Uint8Array;

/** Content-type header value for the serialized body */
export type ContentType = 'application/json; charset=utf-8' | 'application/octet-stream';

/** Result of serializing a request body with its content type */
export interface SerializedRequest {
    body: SerializedBody;
    contentType: ContentType;
}

/**
 * Determines the serializer mode to use for a request.
 * Reads from method metadata if available, otherwise defaults to JSON.
 */
function getSerializerMode(req: MionClientRequest<any, any>): SerializerMode {
    const method = routesCache.getMethodJitFns(req.route?.methodId);
    if (method && method.options.serialize) {
        return method.options.serialize;
    }

    return 'jo';
}

/**
 * Serializes the request body and returns it with the appropriate content type.
 * This is the inverse of the router's deserializeRequestBody.
 *
 * Note: For headersHook methods, the HeadersSubset parameter is NOT included in the body.
 * Use extractRequestHeaders() to get headers to send as HTTP headers.
 */
export function serializeRequestBody(req: MionClientRequest<any, any>): SerializedRequest {
    const serializerMode = getSerializerMode(req);

    switch (serializerMode) {
        case 'json':
        case 'stringifyJson':
            // Both json modes use JSON serialization on the client
            return {
                body: stringifyBody(req),
                contentType: 'application/json; charset=utf-8',
            };
        case 'binary':
            return {
                body: serializeBinaryBody(req),
                contentType: 'application/octet-stream',
            };
        default:
            throw new Error(`Invalid serializer mode ${serializerMode}`);
    }
}

/**
 * Serializes request body to binary format.
 * Binary Protocol Request Format:
 * [4 bytes] - Number of methods (uint32 LE)
 * For each method:
 *   [4 bytes] - Method ID string length (uint32 LE)
 *   [N bytes] - Method ID string (UTF-8)
 *   [M bytes] - Serialized params (using toBinary JIT)
 */
function serializeBinaryBody(req: MionClientRequest<any, any>): Uint8Array {
    const subRequestIds = Object.keys(req.subRequestList);
    const serializer = createDataViewSerializer('client-request');

    try {
        // Write number of methods
        serializer.view.setUint32(serializer.index, subRequestIds.length, true);
        serializer.index += 4;

        for (let i = 0; i < subRequestIds.length; i++) {
            const id = subRequestIds[i];
            const subRequest = req.subRequestList[id];
            if (!subRequest) continue;

            let params = subRequest.params;
            const method = routesCache.useMethodJitFns(id);

            // For headersHook methods, skip the HeadersSubset param (first param after context)
            if (method.type === HandlerType.headerHook && method.headersParam) {
                params = getParamsWithoutHeadersSubset(params);
            }

            // Write method ID
            serializer.serString(id);

            // Serialize params using toBinary JIT function
            if (!method.paramsJitFns.toBinary.isNoop) {
                method.paramsJitFns.toBinary.fn(params, serializer);
            }
        }

        serializer.markAsEnded();
        return serializer.getBufferView();
    } catch (e: any) {
        serializer.markAsEnded();
        throw new RpcError({
            type: 'binary-serialize-request-error',
            publicMessage: `Failed to serialize request body to binary: ${e?.message || 'unknown error'}`,
            originalError: e,
        });
    }
}

/**
 * Deserializes the response body from a fetch Response object.
 * This is the inverse of the router's serializeResponseBody.
 *
 * Note: Methods with headersReturn are NOT included in the response body.
 * The router sets those values as HTTP response headers instead.
 * Use reconstructHeadersSubsetFromResponse() to get the HeadersSubset for those methods.
 */
export async function deserializeResponseBody(response: Response): Promise<ResponseBody> {
    // Determine body type based on content-type header
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const isBinary = contentType?.includes('application/octet-stream');

    let parsedBody: any;

    if (isJson) {
        parsedBody = await deserializeJsonResponseBody(response);
    } else if (isBinary) {
        parsedBody = await deserializeBinaryResponseBody(response);
    } else {
        // Default to JSON for backward compatibility
        parsedBody = await deserializeJsonResponseBody(response);
    }

    // Check if there are unexpected errors
    // Unexpected errors are errors thrown during route execution that are not part of the return type union
    // Global errors (errors before reaching router) are also stored in unexpectedErrors with a special key
    if (MION_ROUTES.thrownErrors in parsedBody) {
        const unexpectedErrors = parsedBody[MION_ROUTES.thrownErrors];

        // Check if this is a platform error (stored with special platformError key)
        if (MION_ROUTES.platformError in unexpectedErrors) {
            const globalErrorValue = unexpectedErrors[MION_ROUTES.platformError];
            const platformError = isRpcError(globalErrorValue) ? new RpcError(globalErrorValue) : globalErrorValue;
            // Return the platform error as-is - it will be handled by the request processing
            // which will apply it to all subrequests
            return {[MION_ROUTES.platformError]: platformError};
        }

        // Merge unexpected errors into the main response body
        // so they appear at their original route paths
        Object.assign(parsedBody, unexpectedErrors);
        delete parsedBody[MION_ROUTES.thrownErrors];
    }

    // Deserialize each method's return value (for JSON responses)
    // Binary responses are already deserialized
    if (isJson || (!isJson && !isBinary)) {
        const deserializedBody: ResponseBody = {};
        Object.entries(parsedBody).forEach(([methodId, returnValue]) => {
            const method = routesCache.useMethodJitFns(methodId);
            const deserialized = parseHandlerReturnValue(method, returnValue);
            deserializedBody[methodId] = deserialized;
        });
        return deserializedBody;
    }

    return parsedBody;
}

/** Deserializes JSON response body */
async function deserializeJsonResponseBody(response: Response): Promise<any> {
    try {
        return await response.json();
    } catch (err: any) {
        throw new RpcError({
            type: 'parsing-json-response-error',
            publicMessage: `Invalid json response body: ${err?.message || 'unknown parsing error.'}`,
        });
    }
}

/**
 * Deserializes binary response body.
 * Binary Protocol Response Format:
 * [4 bytes] - Number of methods with return data (uint32 LE)
 * For each method:
 *   [4 bytes] - Method ID string length (uint32 LE)
 *   [N bytes] - Method ID string (UTF-8)
 *   [M bytes] - Serialized return value (using fromBinary JIT)
 */
async function deserializeBinaryResponseBody(response: Response): Promise<ResponseBody> {
    const arrayBuffer = await response.arrayBuffer();
    const deserializer = createDataViewDeserializer('client-response', arrayBuffer);
    const body: ResponseBody = {};

    try {
        // Read number of methods
        const numMethods = deserializer.view.getUint32(deserializer.index, true);
        deserializer.index += 4;

        for (let i = 0; i < numMethods; i++) {
            // Read method ID
            const methodId = deserializer.desString();

            // Get the method to access its fromBinary JIT function
            const method = routesCache.useMethodJitFns(methodId);

            // Deserialize return value using fromBinary JIT function
            if (method.returnJitFns.fromBinary.isNoop) {
                body[methodId] = undefined;
            } else {
                body[methodId] = method.returnJitFns.fromBinary.fn(undefined, deserializer);
            }
        }

        deserializer.markAsEnded();
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            type: 'binary-deserialization-error',
            publicMessage: `Failed to deserialize binary response body: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }

    return body;
}

function stringifyBody(req: MionClientRequest<any, any>): string {
    const props: string[] = [];
    const subRequestIds = Object.keys(req.subRequestList);

    for (let i = 0; i < subRequestIds.length; i++) {
        const id = subRequestIds[i];
        const subRequest = req.subRequestList[id];
        if (!subRequest) continue; // Skip if not required
        let params = subRequest.params;
        const method = routesCache.useMethodJitFns(id);

        // For headersHook methods, skip the HeadersSubset param (first param after context)
        // Headers are extracted separately by extractRequestHeaders()
        if (method.type === HandlerType.headerHook && method.headersParam) {
            params = getParamsWithoutHeadersSubset(params);
        }

        try {
            const jsonValue = stringifyHandlerParams(method, params);
            if (!jsonValue) continue;
            props.push(`${JSON.stringify(id)}:${jsonValue}`);
        } catch (e: any) {
            const err = new RpcError({
                type: 'json-stringify-request-error',
                publicMessage: `Failed to stringify params for handler ${id}`,
                originalError: e,
            });
            throw err;
        }
    }

    return `{${props.join(',')}}`;
}

/**
 * Returns params array without the HeadersSubset (first param).
 * HeadersSubset is sent as HTTP headers, not in the body.
 */
function getParamsWithoutHeadersSubset(params: any[]): any[] {
    if (!params || params.length === 0) return [];
    return params.slice(1);
}

function stringifyHandlerParams(method: MethodWithJitFns, params: any[]): string {
    if (!method.paramNames || method.paramNames.length === 0) return '';
    const paramsJit = method.paramsJitFns;
    // Note: client doesn't have useJitStringify option, always use prepareForJson + JSON.stringify
    if (paramsJit.prepareForJson.isNoop) return JSON.stringify(params);
    return JSON.stringify(paramsJit.prepareForJson.fn(params));
}

function parseHandlerReturnValue(method: MethodWithJitFns, returnValue: any): any {
    if (!method.hasReturnData) return returnValue;
    const returnJit = method.returnJitFns;
    if (returnJit.restoreFromJson.isNoop || !returnValue) return returnValue;

    try {
        if (returnValue instanceof RpcError) return returnValue;
        if (isRpcError(returnValue)) return new RpcError(returnValue);
        return returnJit.restoreFromJson.fn(returnValue);
    } catch (e: any) {
        return new RpcError({
            type: 'deserialization-error',
            publicMessage: `Invalid response from Route or Hook '${method.id}', can not deserialize return value: ${e.message}`,
            errorData: e?.errors,
        });
    }
}
