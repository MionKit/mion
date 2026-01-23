/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionResponse, MionRequest, CallContext} from '../types/context';
import type {RouterOptions} from '../types/general';
import type {HooksCollection, MayReturnError} from '../types/publicMethods';
import type {ResponseBody} from '../types/context';
import {AnyObject, Mutable, MION_ROUTES, StatusCodes, createDataViewSerializer, DataViewSerializer} from '@mionkit/core';
import {rawHook} from '../lib/handlers';
import {getRouteExecutableFromPath, getRouteExecutionPath, getRouteExecutable} from '../router';
import {RpcError} from '@mionkit/core';
import {RemoteMethod} from '../types/remoteMethods';
import {onExecutableError} from '../lib/dispatchError';

// ############# PUBLIC METHODS #############

/**
 * Deserializes the request body and stores it in the request body property.
 * This method is called before any other hook or route handler.
 * For binary requests, the body is parsed lazily per-method in dispatch.ts.
 * @mion:hook
 */
export function deserializeRequestBody(context: CallContext): MayReturnError {
    if (!context.request.rawBody) return; // empty body
    let parsedBody: any;
    switch (context.request.bodyType) {
        case 'J': // json
            try {
                parsedBody = JSON.parse(context.request.rawBody as string);
            } catch (err: any) {
                throw new RpcError({
                    statusCode: StatusCodes.UNEXPECTED_ERROR,
                    type: 'parsing-json-request-error',
                    publicMessage: `Invalid json request body: ${err?.message || 'unknown parsing error.'}`,
                });
            }
            break;
        case 'B': // binary
            // Binary deserialization is handled per-method in dispatch.ts
            // The binDeserializer is already created in createCallContext
            // We parse the binary protocol header here to extract method IDs
            parsedBody = deserializeBinaryRequestBody(context);
            break;
        case 'O': // Object (pre-parsed body from platforms like Google Cloud Functions where Express auto-parses JSON)
            parsedBody = context.request.rawBody;
            break;
        default:
            throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
    if (parsedBody) {
        if (Array.isArray(parsedBody)) {
            // when the body is an array we assume it's a single route call and we have to reconstruct the body
            // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
            parsedBody = {[getRouteExecutableFromPath(context.path).id]: parsedBody};
        }
        if (typeof parsedBody !== 'object')
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'invalid-request-body',
                publicMessage: 'Wrong request body. Expecting a body containing the route name and parameters.',
            });
        (context.request as Mutable<MionRequest>).body = parsedBody;
    }
}

/**
 * Deserializes binary request body according to the binary protocol format.
 * Binary Protocol Request Format:
 * [4 bytes] - Number of methods (uint32 LE)
 * For each method:
 *   [4 bytes] - Method ID string length (uint32 LE)
 *   [N bytes] - Method ID string (UTF-8)
 *   [M bytes] - Serialized params (using fromBinary JIT)
 */
function deserializeBinaryRequestBody(context: CallContext): AnyObject {
    const deserializer = context.request.binDeserializer;
    if (!deserializer) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'binary-deserializer-missing',
            publicMessage: 'Binary deserializer not initialized for binary request.',
        });
    }

    const body: AnyObject = {};

    try {
        // Read number of methods
        const numMethods = deserializer.view.getUint32(deserializer.index, true);
        deserializer.index += 4;

        for (let i = 0; i < numMethods; i++) {
            // Read method ID
            const methodId = deserializer.desString();

            // Get the method to access its fromBinary JIT function
            const method =
                getRouteExecutable(methodId) || getRouteExecutionPath(context.path)?.methods.find((m) => m.id === methodId);
            if (!method) {
                throw new RpcError({
                    statusCode: StatusCodes.UNEXPECTED_ERROR,
                    type: 'binary-method-not-found',
                    publicMessage: `Method '${methodId}' not found for binary deserialization.`,
                });
            }

            // Deserialize params using fromBinary JIT function
            // fromBinary(undefined, deserializer) - reads from deserializer and returns the value
            if (method.paramsJitFns.fromBinary.isNoop) {
                body[methodId] = [];
            } else {
                body[methodId] = method.paramsJitFns.fromBinary.fn(undefined, deserializer);
            }
        }

        deserializer.markAsEnded();
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'binary-deserialization-error',
            publicMessage: `Failed to deserialize binary request body: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }

    return body;
}

/**
 * Serializes the response body and stores it in the response rawBody property.
 * This method is called after any other hook or route handler.
 * @mion:hook
 */
export function serializeResponseBody(context: CallContext, opts: RouterOptions): MayReturnError {
    const response = context.response as Mutable<MionResponse>;
    const respBody: AnyObject = response.body;
    const bodyType = context.response.bodyType;
    switch (bodyType) {
        case 'J': {
            // json - use stringifyJson JIT function
            response.headers.set('content-type', 'application/json; charset=utf-8');
            const executionPath = getRouteExecutionPath(context.path)!;
            const body = stringifyBody(context, executionPath.methods, respBody);
            response.rawBody = body;
            break;
        }
        case 'O': {
            // pre-serialized object - only prepare for JSON, don't stringify
            // Platform adapters will handle the actual JSON stringification
            // prepareForJson mutates response.body in place, so we don't set rawBody
            response.headers.set('content-type', 'application/json; charset=utf-8');
            const executionPath = getRouteExecutionPath(context.path)!;
            prepareBodyForJson(context, executionPath.methods, respBody);
            break;
        }
        case 'B': {
            // binary - use toBinary JIT function
            response.headers.set('content-type', 'application/octet-stream');
            const executionPath = getRouteExecutionPath(context.path)!;
            serializeBinaryBody(context, executionPath.methods, respBody);
            break;
        }
        default:
            throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
}

/**
 * Serializes response body to binary format.
 * Binary Protocol Response Format:
 * [4 bytes] - Number of methods with return data (uint32 LE)
 * For each method:
 *   [4 bytes] - Method ID string length (uint32 LE)
 *   [N bytes] - Method ID string (UTF-8)
 *   [M bytes] - Serialized return value (using toBinary JIT)
 */
function serializeBinaryBody(context: CallContext, executionPath: RemoteMethod[], respBody: ResponseBody): void {
    const response = context.response as Mutable<MionResponse>;

    // Create serializer lazily
    const serializer = createDataViewSerializer(context.path);
    response.binSerializer = serializer;

    try {
        // First pass: count methods with return data
        let methodCount = 0;
        for (let i = 0; i < executionPath.length; i++) {
            const method = executionPath[i];
            const returnValue = respBody[method.id];
            if (method.hasReturnData && typeof returnValue !== 'undefined') {
                methodCount++;
            }
        }

        // Add thrownErrors if they exist
        const thrownErrors = respBody['@thrownErrors'];
        if (thrownErrors) methodCount++;

        // Write method count
        serializer.view.setUint32(serializer.index, methodCount, true);
        serializer.index += 4;

        // Second pass: serialize each method's return value
        for (let i = 0; i < executionPath.length; i++) {
            const method = executionPath[i];
            const returnValue = respBody[method.id];
            if (!method.hasReturnData || typeof returnValue === 'undefined') continue;

            try {
                serializeMethodReturnValue(serializer, method, returnValue);
            } catch (e: any) {
                onBinarySerializeError(context, method, e);
            }
        }

        // Serialize thrownErrors if they exist
        if (thrownErrors) {
            const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
            try {
                serializeMethodReturnValue(serializer, method, thrownErrors);
            } catch (e: any) {
                onBinarySerializeError(context, method, e);
            }
        }

        serializer.markAsEnded();

        // Set rawBody to the serialized binary data
        response.rawBody = serializer.getBufferView();
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'binary-serialization-error',
            publicMessage: `Failed to serialize binary response body: ${err?.message || 'unknown error'}`,
            originalError: err,
        });
    }
}

/** Serializes a single method's return value to binary */
function serializeMethodReturnValue(serializer: DataViewSerializer, method: RemoteMethod, returnValue: any): void {
    // Write method ID
    serializer.serString(method.id);

    // Serialize return value using toBinary JIT function
    // toBinary(value, serializer) - writes to serializer, returns void
    if (!method.returnJitFns.toBinary.isNoop) {
        method.returnJitFns.toBinary.fn(returnValue, serializer);
    }
    // Note: toBinary writes directly to the serializer, no need to handle the return value
}

function onBinarySerializeError(context: CallContext, method: RemoteMethod, e: any) {
    const err = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'binary-serialize-response-error',
        publicMessage: `Failed to serialize return value to binary for handler ${method.id}, expected response type: ${method.returnJitFns.toBinary.typeName}`,
        originalError: e,
        errorData: {methodId: method.id},
    });
    onExecutableError(context, method, err);
}

function stringifyBody(context: CallContext, executionPath: RemoteMethod[], respBody: ResponseBody): string {
    const props: string[] = [];
    for (let i = 0; i < executionPath.length; i++) {
        const method = executionPath[i];
        const returnValue = respBody[method.id];
        if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
        try {
            const jsonValue = stringifyHandlerReturnValue(method, returnValue);
            if (!jsonValue) continue;
            props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
        } catch (e: any) {
            onStringifyExecutableError(context, method, e);
        }
    }

    // Serialize thrownErrors if they exist
    const thrownErrors = respBody['@thrownErrors'];
    if (thrownErrors) {
        const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
        try {
            const jsonValue = stringifyHandlerReturnValue(method, thrownErrors);
            if (jsonValue) props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
        } catch (e: any) {
            onStringifyExecutableError(context, method, e);
        }
    }
    return `{${props.join(',')}}`;
}

function onStringifyExecutableError(context: CallContext, method: RemoteMethod, e: any) {
    const err = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'json-stringify-response-error',
        publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.stringifyJson.typeName}`,
        originalError: e,
        errorData: {methodId: method.id},
    });
    onExecutableError(context, method, err);
}

function stringifyHandlerReturnValue(method: RemoteMethod, returnValue: any): string {
    if (!method.hasReturnData) return '';
    return method.returnJitFns.stringifyJson.fn(returnValue);
}

function prepareBodyForJson(context: CallContext, executionPath: RemoteMethod[], respBody: ResponseBody): void {
    // prepareForJson mutates the response body in place
    for (let i = 0; i < executionPath.length; i++) {
        const method = executionPath[i];
        const returnValue = respBody[method.id];
        if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
        try {
            const preparedValue = prepareHandlerReturnValue(method, returnValue);
            if (preparedValue !== undefined) (respBody as Mutable<ResponseBody>)[method.id] = preparedValue;
        } catch (e: any) {
            onPrepareForJsonExecutableError(context, method, e);
        }
    }
    // Prepare thrownErrors if they exist
    const thrownErrors = respBody['@thrownErrors'];
    if (thrownErrors) {
        const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
        try {
            const preparedValue = prepareHandlerReturnValue(method, thrownErrors);
            if (preparedValue !== undefined) (respBody as Mutable<ResponseBody>)[method.id] = preparedValue;
        } catch (e: any) {
            onPrepareForJsonExecutableError(context, method, e);
        }
    }
}

function onPrepareForJsonExecutableError(context: CallContext, method: RemoteMethod, e: any) {
    const err = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'prepare-for-json-response-error',
        publicMessage: `Failed to prepare return value for JSON for handler ${method.id}, expected response type: ${method.returnJitFns.prepareForJson.typeName}`,
        originalError: e,
        errorData: {methodId: method.id},
    });
    onExecutableError(context, method, err);
}

function prepareHandlerReturnValue(method: RemoteMethod, returnValue: any): any {
    if (!method.hasReturnData) return undefined;
    if (method.returnJitFns.prepareForJson.isNoop) return returnValue;
    return method.returnJitFns.prepareForJson.fn(returnValue);
}

export const serializerHooks = {
    mionDeserializeRequest: rawHook(deserializeRequestBody, {runOnError: true}),
    mionSerializeResponse: rawHook(serializeResponseBody, {runOnError: true}),
} satisfies HooksCollection;
