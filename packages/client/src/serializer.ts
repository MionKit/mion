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
    type SerializerMode,
    serializeBinaryBody as coreSerializeBinaryBody,
    deserializeBinaryBody as coreDeserializeBinaryBody,
} from '@mionkit/core';
import type {MionClientRequest} from './request';
import {DEFAULT_PREFILL_OPTIONS} from './constants';

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
 * For workflows, uses the first workflow subrequest's serializer mode.
 */
function getSerializerMode(req: MionClientRequest<any, any>): SerializerMode {
    // For workflows, use the first workflow subrequest's serializer mode
    const methodId = req.route?.id ?? req.workflowSubRequests?.[0]?.id;
    const method = routesCache.getMethodJitFns(methodId);
    const serializerMode = method?.options.serializer || DEFAULT_PREFILL_OPTIONS.serializer;
    // we do not want to mutate data, so we do not use 'json' mode in the client
    if (serializerMode === 'json') return DEFAULT_PREFILL_OPTIONS.serializer;
    return serializerMode;
}

/**
 * Serializes the request body and returns it with the appropriate content type.
 * This is the inverse of the router's deserializeRequestBody.
 *
 * Note: For headersFn methods, the HeadersSubset parameter is NOT included in the body.
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

/** Serializes request body to binary format using the core serializeBinaryBody function */
function serializeBinaryBody(req: MionClientRequest<any, any>): Uint8Array {
    const subRequestIds = Object.keys(req.subRequestList);

    // Build request body and execution chain for core serializer
    // For headersFn methods, strip the HeadersSubset param before serialization
    const body: Record<string, any> = {};
    const executionChain: MethodWithJitFns[] = [];

    for (const id of subRequestIds) {
        const subRequest = req.subRequestList[id];
        let params = subRequest.params;
        const method = routesCache.useMethodJitFns(id);

        // For headersFn methods, skip the HeadersSubset param (first param after context)
        if (method.type === HandlerType.headersLinkedFn && method.headersParam) {
            params = getParamsWithoutHeadersSubset(params);
        }

        body[id] = params;
        executionChain.push(method);
    }

    // For workflows, pass the individual route IDs for proper buffer size calculation
    // This ensures the buffer is sized based on the sum of all routes in the workflow
    const workflowRouteIds = req.workflowSubRequests?.map((sr) => sr.id);
    const {buffer} = coreSerializeBinaryBody(req.path, executionChain, body, false, workflowRouteIds);
    return new Uint8Array(buffer);
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

/** Deserializes binary response body using the core deserializeBinaryBody function */
async function deserializeBinaryResponseBody(response: Response): Promise<ResponseBody> {
    const arrayBuffer = await response.arrayBuffer();

    // Method metadata is looked up from routesCache internally by deserializeBinaryBody
    const {body} = coreDeserializeBinaryBody('client-response', arrayBuffer, true);
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

        // For headersFn methods, skip the HeadersSubset param (first param after context)
        // Headers are extracted separately by extractRequestHeaders()
        if (method.type === HandlerType.headersLinkedFn && method.headersParam) {
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
    // always use noon mutating json stringify in the client
    if (paramsJit.prepareForJson.isNoop) return JSON.stringify(params);
    return paramsJit.stringifyJson.fn(params);
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
            publicMessage: `Invalid response from Route or LinkedFn '${method.id}', can not deserialize return value: ${e.message}`,
            errorData: e?.errors,
        });
    }
}
