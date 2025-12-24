/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders, RawRequestBody, RawRequestBodyType} from './types/context';
import {type RouterOptions} from './types/general';
import {HeaderMethod, RemoteMethod, MethodsExecutionList, RawMethod} from './types/remoteMethods';
import {getRouteExecutionPath, getRouterOptions} from './router';
import {getNotFoundExecutionPath} from './lib/notFound';
import {Mutable, AnyObject, createDataViewDeserializer, isAnyError, MION_ROUTES} from '@mionkit/core';
import {RpcError, HandlerType, StatusCodes} from '@mionkit/core';

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
    rawResponse?: Resp
): Promise<MionResponse> {
    try {
        const opts = getRouterOptions();
        // this is the call context that will be passed to all handlers
        // we should keep it as small as possible
        const context = createCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders);

        const executionPath = getRouteExecutionPath(context.path) || getNotFoundExecutionPath();
        await runExecutionPath(context, rawRequest, rawResponse, executionPath, opts);
        return context.response;
    } catch (err: any | RpcError<string> | Error) {
        // this should never happen, exceptions should be handled inside runExecutionPath
        return Promise.reject(err);
    }
}

export function createCallContext(
    path: string,
    opts: RouterOptions,
    reqRawBody: RawRequestBody,
    rawRequest: unknown,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders
): CallContext {
    const transformedPath = opts.pathTransform ? opts.pathTransform(rawRequest, path) : path;
    const bodyType = getRequestBodyType(reqRawBody);
    return {
        path: transformedPath,
        request: {
            headers: reqHeaders,
            rawBody: reqRawBody,
            bodyType,
            body: {},
            binDeserializer:
                bodyType === 'B' ? createDataViewDeserializer(transformedPath, reqRawBody as ArrayBuffer) : undefined,
        },
        response: {
            statusCode: StatusCodes.OK,
            hasErrors: false,
            headers: respHeaders,
            body: {},
            rawBody: '',
            bodyType: opts.useBinarySerialization ? 'B' : 'J',
            binSerializer: undefined, // we can create deserializer lazily
        },
        shared: opts.contextDataFactory ? opts.contextDataFactory() : {},
    } as CallContext;
}

// ############# PRIVATE METHODS #############

// runs the execution path of a route
async function runExecutionPath(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executionPath: MethodsExecutionList,
    opts: RouterOptions
): Promise<MionResponse> {
    const {response, request} = context;
    const executables = executionPath.methods;
    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        if (response.hasErrors && !executable.options.runOnError) continue;

        // Add unexpectedErrors to response body before the serializer runs
        if (
            executable.id === 'mionSerializeResponse' &&
            request.unexpectedErrors &&
            Object.keys(request.unexpectedErrors).length > 0
        ) {
            console.log('Adding unexpectedErrors to response body before serializer');
            (response.body as Mutable<AnyObject>)[MION_ROUTES.unexpectedError] = request.unexpectedErrors;
            console.log('response.body after adding:', response.body);
        }

        try {
            const methodCaller = executable.methodCaller || getMethodCaller(executable);
            // runRawHook , runHeaderHook & runRouteOrHook must always accept the same parameters in the same order
            const result = await methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);

            // handle result
            if (!!result && isAnyError(result)) {
                // todo, we might need to call isType error return to check if is expected or not
                const isExpected = executable.type !== HandlerType.rawHook;
                onErrorResponse(context, executionPath, executable, result, isExpected);
            }
            // TODO: when returning headerList on an union there could be another types that are array but not HeaderList
            // Not sure we this scenario can be easily fixed maybe returning a class or something that adds a unique prop to the returned data
            else if (!!result && executable.headersReturn && Array.isArray(result)) {
                executable.headersReturn.headerNames.forEach((name: string, i: string | number) => {
                    const headerValue = result[i];
                    if (!headerValue) return;
                    response.headers.set(name, headerValue);
                });
            } else if (executable.hasReturnData && result !== undefined) {
                (response.body as Mutable<AnyObject>)[executable.id] = result;
            }
        } catch (err: any | RpcError<string> | Error) {
            const isExpected = false;
            onErrorResponse(context, executionPath, executable, err, isExpected);
        }
    }

    return context.response;
}

function onErrorResponse(
    context: CallContext,
    executionPath: MethodsExecutionList,
    executable: RemoteMethod,
    err: any | RpcError<string> | Error,
    isExpected = true
) {
    const response = context.response as Mutable<MionResponse>;
    const isNotFoundRoute = executionPath.isNotFound && executable.type === HandlerType.route;
    const path = isNotFoundRoute ? context.path : executable.id;
    const rpcError =
        err instanceof RpcError
            ? err
            : new RpcError({
                  statusCode: StatusCodes.UNEXPECTED_ERROR,
                  publicMessage: `Unknown error in handler "${path}" of route execution path.`,
                  originalError: err,
                  type: 'unknown-error',
              });

    response.statusCode = rpcError.statusCode;
    response.hasErrors = true;

    if (isExpected && !isNotFoundRoute) {
        // Expected errors (returned from handlers) are added to response body at the route path
        // They will be serialized as part of the union return type
        (response.body as Mutable<AnyObject>)[path] = rpcError;
        return;
    }

    // Unexpected errors (thrown exceptions) are stored in unexpectedErrors
    // This allows proper serialization using JIT functions for Record<string, RpcError<string, any>>
    const unexpectedErrors = context.request.unexpectedErrors || ({} as Record<string, RpcError<string>>);
    unexpectedErrors[path] = rpcError;
    (context.request as Mutable<MionRequest>).unexpectedErrors = unexpectedErrors;
}

async function runRawHook(
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

async function runHeaderHook(context: CallContext, executable: HeaderMethod, request: MionRequest) {
    const headerNames = executable.headersParam.headerNames;
    const headerValues = headerNames.map((name) => request.headers.get(name));
    const params = deserializeBodyParams(request, executable as RemoteMethod);
    validateHeaderParamsOrThrow(headerValues as string[], executable as HeaderMethod);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as HeaderMethod);

    const result = await executable.handler(context, headerValues, ...params);
    return result;
}

async function runRouteOrHook(context: CallContext, executable: HeaderMethod, request: MionRequest) {
    const params = deserializeBodyParams(request, executable as RemoteMethod);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as RemoteMethod);
    const result = await executable.handler(context, ...params);
    return result;
}

function getMethodCaller(executable: RemoteMethod) {
    if (executable.type === HandlerType.rawHook) {
        executable.methodCaller = runRawHook;
    } else if (executable.type === HandlerType.headerHook) {
        executable.methodCaller = runHeaderHook;
    } else {
        executable.methodCaller = runRouteOrHook;
    }
    return executable.methodCaller;
}

function deserializeBodyParams(request: MionRequest, executable: RemoteMethod): any[] {
    const params: any[] = (request.body[executable.id] as any[]) || [];
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
            errorData: {deserializeError: e.message},
        });
    }
}

function validateParametersOrThrow(params: any[], executable: RemoteMethod): void {
    if (!executable.paramsJitFns.isType.fn(params)) {
        throw new RpcError({
            statusCode: StatusCodes.APPLICATION_ERROR,
            type: 'validation-error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: executable.paramsJitFns.typeErrors.fn(params),
        });
    }
}

function validateHeaderParamsOrThrow(headers: string[], executable: HeaderMethod): void {
    if (!executable.headersParam.jitFns.isType.fn(headers)) {
        throw new RpcError({
            statusCode: StatusCodes.APPLICATION_ERROR,
            type: 'headers-validation-error',
            publicMessage: `Invalid headers in '${executable.id}', validation failed.`,
            errorData: executable.headersParam.jitFns.typeErrors.fn(headers),
        });
    }
}

function getRequestBodyType(rawBody: RawRequestBody): RawRequestBodyType {
    if (typeof rawBody === 'string') return 'J';
    if (rawBody instanceof ArrayBuffer || rawBody instanceof Uint8Array) return 'B';
    return 'O';
}
