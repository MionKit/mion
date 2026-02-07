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
import {Mutable, AnyObject, StatusCodes, HeadersSubset, SerializerModes, SerializerCode, MION_ROUTES} from '@mionkit/core';
import {RpcError, HandlerType, ValidationError} from '@mionkit/core';
import {onExecutableError} from './lib/dispatchError';
import {createCallContext, acquireCallContext, releaseCallContext} from './callContext';
import {extractWorkflowRoutes, buildWorkflowExecutionChain} from './workflow';

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
    reqBodyType?: SerializerCode
): Promise<MionResponse> {
    const opts = getRouterOptions();
    const usePooling = opts.maxContextPoolSize > 0;
    // Use pooled context if enabled (maxContextPoolSize > 0), otherwise create new context
    const context = usePooling
        ? acquireCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType)
        : createCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType);

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

/** Dispatches a workflow request that executes multiple routes in a single call */
export async function dispatchWorkflow<Req, Resp>(
    reqRawBody: RawRequestBody,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    rawRequest: Req,
    rawResponse?: Resp,
    reqBodyType?: SerializerCode
): Promise<MionResponse> {
    const opts = getRouterOptions();
    const workflowPath = `/${MION_ROUTES.workflowRoute}`;
    const usePooling = opts.maxContextPoolSize > 0;
    const context = usePooling
        ? acquireCallContext(workflowPath, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType)
        : createCallContext(workflowPath, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType);

    try {
        // Pre-parse body to extract workflow route list
        const routeIds = extractWorkflowRoutes(reqRawBody);
        if (!routeIds) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'invalid-workflow-request',
                publicMessage: `Invalid workflow request: missing '${MION_ROUTES.workflowMiddy}' property in request body.`,
            });
        }

        // Build merged execution chain
        const executionChain = buildWorkflowExecutionChain(routeIds);

        // Store on context for serializer access
        (context as Mutable<CallContext>).executionChain = executionChain;

        await runExecutionChain(context, rawRequest, rawResponse, executionChain, opts);
        return context.response;
    } catch (err: any | RpcError<string> | Error) {
        // this should never happen, exceptions should be handled inside runExecutionChain
        return Promise.reject(err);
    } finally {
        if (usePooling) releaseCallContext(context, opts.maxContextPoolSize);
    }
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
    // we can't use a direct reference to executables as this is changed dynamically by workflow requests
    // const executables = executionChain.methods;
    (response as Mutable<MionResponse>).bodyType = executionChain.serializer;

    for (let i = 0; i < executionChain.methods.length; i++) {
        const executable = executionChain.methods[i];
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
