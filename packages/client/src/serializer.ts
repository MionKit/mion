/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionkit/router';
import {type MethodWithJitFns, RpcError, isRpcError, routesCache, MION_ROUTES, HandlerType} from '@mionkit/core';
import type {MionRequest} from './request';

// ############# SERIALIZATION #############

/**
 * Serializes the request body and returns it as a string.
 * This is the inverse of the router's deserializeRequestBody.
 *
 * Note: For headersHook methods, the HeadersSubset parameter is NOT included in the body.
 * Use extractRequestHeaders() to get headers to send as HTTP headers.
 */
export function serializeRequestBody(req: MionRequest<any, any>): string {
    const bodyType: 'J' | 'B' = 'J'; // JSON for now, binary later

    switch (bodyType) {
        case 'J': {
            // json
            return stringifyBody(req);
        }
        case 'B':
            // binary
            throw new Error('Binary serialization not yet implemented');
        default:
            throw new Error(`Invalid body type ${bodyType}`);
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
    let parsedBody: any;

    // Determine body type based on content-type header
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (isJson) {
        // JSON - use response.json() for automatic parsing
        try {
            parsedBody = await response.json();
        } catch (err: any) {
            throw new RpcError({
                type: 'parsing-json-response-error',
                publicMessage: `Invalid json response body: ${err?.message || 'unknown parsing error.'}`,
            });
        }
    } else {
        // Binary
        throw new Error('Binary deserialization not yet implemented');
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

    // Deserialize each method's return value
    const deserializedBody: ResponseBody = {};
    Object.entries(parsedBody).forEach(([methodId, returnValue]) => {
        const method = routesCache.useMethodJitFns(methodId);
        const deserialized = parseHandlerReturnValue(method, returnValue);
        deserializedBody[methodId] = deserialized;
    });

    return deserializedBody;
}

function stringifyBody(req: MionRequest<any, any>): string {
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
