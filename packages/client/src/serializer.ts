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
import type {MionClientRequest} from './request.ts';
import {DEFAULT_PREFILL_OPTIONS} from './constants.ts';

/** Result of serializing a request body - can be string (JSON) or Uint8Array (binary) */
export type SerializedBody = string | Uint8Array;

/** Content-type header value for the serialized body */
export type ContentType = 'application/json; charset=utf-8' | 'application/octet-stream';

/** Result of serializing a request body with its content type */
export interface SerializedRequest {
    body: SerializedBody;
    contentType: ContentType;
}

/** Determines the serializer mode to use for a request */
function getSerializerMode(req: MionClientRequest<any, any>): SerializerMode {
    const methodId = req.route?.id ?? req.workflowSubRequests?.[0]?.id;
    const method = routesCache.getMethodJitFns(methodId);
    const serializerMode = method?.options.serializer || DEFAULT_PREFILL_OPTIONS.serializer;
    if (serializerMode === 'json') return DEFAULT_PREFILL_OPTIONS.serializer;
    return serializerMode;
}

/** Serializes the request body and returns it with the appropriate content type */
export function serializeRequestBody(req: MionClientRequest<any, any>): SerializedRequest {
    const serializerMode = getSerializerMode(req);

    switch (serializerMode) {
        case 'json':
        case 'stringifyJson':
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

/** Serializes request body to binary format */
function serializeBinaryBody(req: MionClientRequest<any, any>): Uint8Array {
    const subRequestIds = Object.keys(req.subRequestList);
    const body: Record<string, any> = {};
    const executionChain: MethodWithJitFns[] = [];

    for (const id of subRequestIds) {
        const subRequest = req.subRequestList[id];
        let params = subRequest.params;
        const method = routesCache.useMethodJitFns(id);

        if (method.type === HandlerType.headersMiddleFn && method.headersParam) {
            params = getParamsWithoutHeadersSubset(params);
        }

        body[id] = params;
        executionChain.push(method);
    }

    const workflowRouteIds = req.workflowSubRequests?.map((sr) => sr.id);
    const {buffer} = coreSerializeBinaryBody(req.path, executionChain, body, false, workflowRouteIds);
    return new Uint8Array(buffer);
}

/** Deserializes the response body from a fetch Response object */
export async function deserializeResponseBody(response: Response): Promise<ResponseBody> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const isBinary = contentType?.includes('application/octet-stream');

    let parsedBody: any;

    if (isJson) {
        parsedBody = await deserializeJsonResponseBody(response);
    } else if (isBinary) {
        parsedBody = await deserializeBinaryResponseBody(response);
    } else {
        parsedBody = await deserializeJsonResponseBody(response);
    }

    if (MION_ROUTES.thrownErrors in parsedBody) {
        const unexpectedErrors = parsedBody[MION_ROUTES.thrownErrors];

        if (MION_ROUTES.platformError in unexpectedErrors) {
            const globalErrorValue = unexpectedErrors[MION_ROUTES.platformError];
            const platformError = isRpcError(globalErrorValue) ? new RpcError(globalErrorValue) : globalErrorValue;
            return {[MION_ROUTES.platformError]: platformError};
        }

        Object.assign(parsedBody, unexpectedErrors);
        delete parsedBody[MION_ROUTES.thrownErrors];
    }

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

/** Deserializes binary response body */
async function deserializeBinaryResponseBody(response: Response): Promise<ResponseBody> {
    const arrayBuffer = await response.arrayBuffer();
    const {body} = coreDeserializeBinaryBody('client-response', arrayBuffer, true);
    return body;
}

function stringifyBody(req: MionClientRequest<any, any>): string {
    const props: string[] = [];
    const subRequestIds = Object.keys(req.subRequestList);

    for (let i = 0; i < subRequestIds.length; i++) {
        const id = subRequestIds[i];
        const subRequest = req.subRequestList[id];
        if (!subRequest) continue;
        let params = subRequest.params;
        const method = routesCache.useMethodJitFns(id);

        if (method.type === HandlerType.headersMiddleFn && method.headersParam) {
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

/** Returns params array without the HeadersSubset (first param) */
function getParamsWithoutHeadersSubset(params: any[]): any[] {
    if (!params || params.length === 0) return [];
    return params.slice(1);
}

function stringifyHandlerParams(method: MethodWithJitFns, params: any[]): string {
    if (!method.paramNames || method.paramNames.length === 0) return '';
    const paramsJit = method.paramsJitFns;
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
            publicMessage: `Invalid response from Route or MiddleFn '${method.id}', can not deserialize return value: ${e.message}`,
            errorData: e?.errors,
        });
    }
}
