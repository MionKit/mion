/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders, RawRequestBody} from './types/context';
import {type RouterOptions} from './types/general';
import {NOT_FOUND_PATH} from './constants';
import {HeadersMethod, RemoteMethod, MethodsExecutionList, RawMethod} from './types/remoteMethods';
import {getRouteExecutionChain, getRouterOptions} from './router';
import {Mutable, AnyObject, StatusCodes, HeadersSubset, SerializerModes, SerializerCode} from '@mionkit/core';
import {RpcError, HandlerType, ValidationError} from '@mionkit/core';
import {BatchRequest, BatchResponse, DataViewSerializer, DataViewDeserializer} from '@mionkit/core';
import {initBatchDeserializer, readNextBatchEntry} from '@mionkit/core';
import {initBatchSerializer, writeBatchEntry, finalizeBatchEntry} from '@mionkit/core';
import {onExecutableError} from './lib/dispatchError';
import {acquireCallContext, releaseCallContext} from './callContext';

/*
 * PERFORMANCE PROFILING NOTE:
 * different options has been tested to improve performance but were discarded due to worst or no noticeable improvements
 * - using promisify(setImmediate): worst or no improvement
 * - using queueMicrotask instead of setImmediate: definitely worst
 * - using callback instead promises: seems to be more slow but use less memory in some scenarios.
 */

// ############# PUBLIC METHODS #############

export async function dispatchRoute<Req, Resp>(
    path: string,
    reqRawBody: RawRequestBody,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    rawRequest: Req,
    rawResponse?: Resp,
    reqBodyType?: SerializerCode,
    binaryDeserializer?: DataViewDeserializer,
    binarySerializer?: DataViewSerializer
): Promise<MionResponse> {
    const opts = getRouterOptions();
    const usePooling = opts.maxContextPoolSize > 0;
    const context = acquireCallContext(
        path,
        opts,
        reqRawBody,
        rawRequest,
        reqHeaders,
        respHeaders,
        usePooling,
        reqBodyType,
        binaryDeserializer,
        binarySerializer
    );

    try {
        let executionChain = getRouteExecutionChain(context.path);
        if (!executionChain) {
            executionChain = getRouteExecutionChain(NOT_FOUND_PATH);
            if (!executionChain) {
                throw new RpcError({
                    statusCode: StatusCodes.UNEXPECTED_ERROR,
                    type: 'not-found',
                    publicMessage: 'Not-found route is not registered. This should never happen.',
                });
            }
        }
        await runExecutionChain(context, rawRequest, rawResponse, executionChain, opts);
        return context.response;
    } catch (err: any | RpcError<string> | Error) {
        // this should never happen, exceptions should be handled inside runExecutionChain
        return Promise.reject(err);
    } finally {
        // Release context back to pool if pooling is enabled
        if (usePooling) {
            releaseCallContext(context, opts.maxContextPoolSize);
        }
    }
}

/** Dispatches multiple routes in a single request, collecting individual responses into a BatchResponse */
export async function dispatchBatchRoute<Req, Resp>(
    reqRawBody: RawRequestBody,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    rawRequest: Req,
    rawResponse?: Resp,
    reqBodyType?: SerializerCode
): Promise<MionResponse> {
    const opts = getRouterOptions();
    const isBinary = reqBodyType === SerializerModes.binary;

    if (isBinary) {
        return dispatchBinaryBatch(reqRawBody, reqHeaders, respHeaders, rawRequest, rawResponse, opts);
    }
    return dispatchJsonBatch(reqRawBody, reqHeaders, respHeaders, rawRequest, rawResponse, opts);
}

/** Dispatches binary batch using shared DataViewSerializer/DataViewDeserializer across all routes */
async function dispatchBinaryBatch<Req, Resp>(
    reqRawBody: RawRequestBody,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    rawRequest: Req,
    rawResponse: Resp | undefined,
    opts: RouterOptions
): Promise<MionResponse> {
    // Init shared deserializer from batch request buffer
    const {deserializer, routeCount} = initBatchDeserializer(reqRawBody as ArrayBuffer | Uint8Array, false);

    // Validate batch size
    if (routeCount === 0) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-empty-request',
            publicMessage: 'Batch request must contain at least one route.',
        });
    }
    if (routeCount > opts.maxBatchSize) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-size-exceeded',
            publicMessage: `Batch request contains ${routeCount} routes, maximum allowed is ${opts.maxBatchSize}.`,
        });
    }

    // Peek all routeIds for serializer buffer sizing (read headers, then rewind)
    // Instead, we read routeIds incrementally in the loop and collect them for the serializer init
    // We need routeIds upfront for initBatchResponseSerializer, so we do a first pass to collect them
    const savedIndex = deserializer.index;
    const routeIds: string[] = [];
    const bodyLengths: number[] = [];
    for (let i = 0; i < routeCount; i++) {
        const {routeId, bodyLength} = readNextBatchEntry(deserializer, false);
        routeIds.push(routeId);
        bodyLengths.push(bodyLength);
        // Skip past the body bytes to read the next entry header
        deserializer.index += bodyLength;
    }
    // Rewind deserializer to start of first route entry
    deserializer.index = savedIndex;

    // Init shared serializer for batch response
    const serializer = initBatchSerializer(routeIds, true);

    let hasNonOkStatus = false;

    for (let i = 0; i < routeCount; i++) {
        const {routeId, bodyLength} = readNextBatchEntry(deserializer, false);
        const bodyStartIndex = deserializer.index;

        // Write response route header (routeId + placeholders for statusCode and bodyLength)
        const headerPositions = writeBatchEntry(serializer, routeId, undefined);

        try {
            // Dispatch route with shared deserializer and serializer via context
            const mionResponse = await dispatchRoute(
                routeId,
                reqRawBody, // full batch buffer (not used directly — shared deserializer reads inline)
                reqHeaders,
                respHeaders,
                rawRequest,
                rawResponse,
                SerializerModes.binary,
                deserializer,
                serializer
            );

            // Backfill statusCode and bodyLength in the response serializer
            finalizeBatchEntry(
                serializer,
                mionResponse.statusCode,
                headerPositions.statusIndex!,
                headerPositions.bodyLengthIndex!,
                headerPositions.bodyStartIndex!
            );

            if (mionResponse.statusCode !== StatusCodes.OK) hasNonOkStatus = true;
        } catch {
            // Error recovery: skip past the failed route body in the deserializer
            deserializer.index = bodyStartIndex + bodyLength;

            // Backfill error status with empty body
            finalizeBatchEntry(
                serializer,
                StatusCodes.UNEXPECTED_ERROR,
                headerPositions.statusIndex!,
                headerPositions.bodyLengthIndex!,
                headerPositions.bodyStartIndex!
            );
            hasNonOkStatus = true;
        }
    }

    const binaryResponse = serializer.getBufferView();

    const overallStatus = hasNonOkStatus ? StatusCodes.MULTI_STATUS : StatusCodes.OK;
    respHeaders.set('content-type', 'application/octet-stream');
    return {
        statusCode: overallStatus,
        headers: respHeaders,
        body: {} as AnyObject,
        rawBody: binaryResponse,
        bodyType: SerializerModes.binary,
        hasErrors: hasNonOkStatus,
        binSerializer: undefined,
    };
}

/** Dispatches JSON batch (original behavior, unchanged) */
async function dispatchJsonBatch<Req, Resp>(
    reqRawBody: RawRequestBody,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    rawRequest: Req,
    rawResponse: Resp | undefined,
    opts: RouterOptions
): Promise<MionResponse> {
    // Parse the batch JSON envelope
    let routeIds: string[];
    let routeBodies: AnyObject[];
    try {
        const batchRequest = parseBatchJsonRequest(reqRawBody);
        routeIds = batchRequest.routeIds;
        routeBodies = batchRequest.bodies;
    } catch (err: any) {
        if (err instanceof RpcError) throw err;
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-parsing-json-request-error',
            publicMessage: err?.message || 'Failed to parse batch request envelope',
            originalError: err instanceof Error ? err : undefined,
        });
    }

    // Validate batch size
    if (routeIds.length === 0) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-empty-request',
            publicMessage: 'Batch request must contain at least one route.',
        });
    }
    if (routeIds.length > opts.maxBatchSize) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-size-exceeded',
            publicMessage: `Batch request contains ${routeIds.length} routes, maximum allowed is ${opts.maxBatchSize}.`,
        });
    }
    if (routeIds.length !== routeBodies.length) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'batch-mismatched-lengths',
            publicMessage: `Batch routeIds length (${routeIds.length}) does not match bodies length (${routeBodies.length}).`,
        });
    }

    // Dispatch each route sequentially, collecting responses
    const batchResponse: BatchResponse = {routeIds: [], statuses: [], bodies: []};
    let hasNonOkStatus = false;

    for (let i = 0; i < routeIds.length; i++) {
        const routeId = routeIds[i];
        const routeBody = routeBodies[i];

        try {
            const mionResponse = await dispatchRoute(
                routeId,
                routeBody,
                reqHeaders,
                respHeaders,
                rawRequest,
                rawResponse,
                SerializerModes.json
            );

            batchResponse.routeIds.push(routeId);
            batchResponse.statuses.push(mionResponse.statusCode);
            batchResponse.bodies.push(mionResponse.body as AnyObject);

            if (mionResponse.statusCode !== StatusCodes.OK) hasNonOkStatus = true;
        } catch (err: any) {
            batchResponse.routeIds.push(routeId);
            batchResponse.statuses.push(StatusCodes.UNEXPECTED_ERROR);
            batchResponse.bodies.push({
                error: err instanceof RpcError ? err.publicMessage : 'Unknown dispatch error',
            });
            hasNonOkStatus = true;
        }
    }

    const overallStatus = hasNonOkStatus ? StatusCodes.MULTI_STATUS : StatusCodes.OK;

    // JSON: let the platform adapter handle stringification
    return {
        statusCode: overallStatus,
        headers: respHeaders,
        body: batchResponse as unknown as AnyObject,
        rawBody: '',
        bodyType: SerializerModes.json,
        hasErrors: hasNonOkStatus,
        binSerializer: undefined,
    };
}

/** Parses the batch JSON request envelope from raw body */
function parseBatchJsonRequest(reqRawBody: RawRequestBody): BatchRequest {
    let parsed: any;
    if (typeof reqRawBody === 'string') {
        parsed = JSON.parse(reqRawBody);
    } else if (reqRawBody instanceof ArrayBuffer || reqRawBody instanceof Uint8Array) {
        throw new Error('Binary batch request received but JSON format expected. Check Content-Type header.');
    } else {
        // Already a parsed object (pre-parsed by platform adapter)
        parsed = reqRawBody;
    }

    if (!parsed || !Array.isArray(parsed.routeIds) || !Array.isArray(parsed.bodies)) {
        throw new Error('Invalid batch request format: expected { routeIds: string[], bodies: object[] }');
    }

    return parsed as BatchRequest;
}

// ############# PRIVATE METHODS #############

// runs the ExecutionChain of a route
async function runExecutionChain(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executionChain: MethodsExecutionList,
    opts: RouterOptions
): Promise<MionResponse> {
    const {response, request} = context;
    const executables = executionChain.methods;
    (response as Mutable<MionResponse>).bodyType = executionChain.serializer;

    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        if (response.hasErrors && !executable.options.runOnError) continue;

        try {
            const methodCaller = executable.methodCaller || getMethodCaller(executable);
            // runRawLinkedFn , runHeadersLinkedFn & runRouteOrLinkedFn must always accept the same parameters in the same order
            const result = await methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
            if (result === undefined || !executable.hasReturnData) continue;
            if (executable.headersReturn && result instanceof HeadersSubset) {
                const headersMap = result.headers;
                for (const name in headersMap) {
                    const value = headersMap[name];
                    if (value !== undefined && value !== null) {
                        response.headers.set(name, value);
                    }
                }
                continue;
            }
            (response.body as Mutable<AnyObject>)[executable.id] = result;
        } catch (err: any | RpcError<string> | Error) {
            // All thrown errors are unexpected
            onExecutableError(context, executable, err);
        }
    }
    return context.response;
}

async function runRawLinkedFn(
    context: CallContext,
    executable: RawMethod,
    req,
    resp,
    opts: RouterOptions,
    rawRequest: unknown,
    rawResponse: unknown
) {
    const result = await executable.handler(context, rawRequest, rawResponse, opts);
    return result;
}

async function runHeadersLinkedFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
    const headerNames = executable.headersParam.headerNames;
    const params = deserializeBodyParamsOrThrow(request, executable as RemoteMethod);
    const headersMap: Record<string, string> = {};
    headerNames.forEach((name) => {
        const value = request.headers.get(name);
        if (value) headersMap[name] = value;
    });
    const headersSubset = new HeadersSubset(headersMap);
    validateHeaderParamsOrThrow(headersSubset, executable as HeadersMethod);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as HeadersMethod);

    const result = await executable.handler(context, headersSubset, ...params);
    return result;
}

async function runRouteOrLinkedFn(context: CallContext, executable: HeadersMethod, request: MionRequest) {
    const params = deserializeBodyParamsOrThrow(request, executable as RemoteMethod);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as RemoteMethod);
    const result = await executable.handler(context, ...params);
    return result;
}

function getMethodCaller(executable: RemoteMethod) {
    if (executable.type === HandlerType.rawLinkedFn) {
        executable.methodCaller = runRawLinkedFn;
    } else if (executable.type === HandlerType.headersLinkedFn) {
        executable.methodCaller = runHeadersLinkedFn;
    } else {
        executable.methodCaller = runRouteOrLinkedFn;
    }
    return executable.methodCaller;
}

function deserializeBodyParamsOrThrow(request: MionRequest, executable: RemoteMethod): any[] {
    const params: any[] = (request.body[executable.id] as any[]) || [];
    // For binary requests, params are already deserialized in the serializer linkedFn
    // (deserializeBinaryRequestBody in serializer.routes.ts)
    if (request.bodyType === SerializerModes.binary) return params;

    // For JSON requests, use restoreFromJson to deserialize
    if (executable.paramsJitFns.restoreFromJson.isNoop) return params;
    try {
        (request.body as Mutable<MionRequest['body']>)[executable.id] = executable.paramsJitFns.restoreFromJson.fn(params);
        return request.body[executable.id] as any[];
    } catch (e: any) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'serialization-error',
            publicMessage: `Invalid params '${executable.id}', can not deserialize. Parameters might be of the wrong type.`,
            originalError: e,
            errorData: {
                deserializeError: e?.message || 'Unknown error',
            },
        });
    }
}

function validateParametersOrThrow(params: any[], executable: RemoteMethod): void {
    if (executable.paramsJitFns.isType.isNoop) return;
    if (!executable.paramsJitFns.isType.fn(params)) {
        const validationError: ValidationError = new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'validation-error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: {
                typeErrors: executable.paramsJitFns.typeErrors.fn(params),
            },
        });
        throw validationError;
    }
}

function validateHeaderParamsOrThrow(headers: HeadersSubset<string, string>, executable: HeadersMethod): void {
    if (!executable.headersParam.jitFns.isType.fn(headers)) {
        const validationError: ValidationError = new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'validation-error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: {
                typeErrors: executable.headersParam.jitFns.typeErrors.fn(headers),
            },
        });
        throw validationError;
    }
}
