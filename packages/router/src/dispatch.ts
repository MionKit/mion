/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders} from './types/context';
import {type RouterOptions} from './types/general';
import {HeaderMethod, Method, RawMethod} from './types/remoteMethods';
import {HandlerType} from './types/remoteMethods';
import {isNotFoundExecutable} from './types/guards';
import {getRouteExecutionPath, getRouterOptions} from './router';
import {getNotFoundExecutionPath} from './notFound';
import {Mutable, AnyObject} from '@mionkit/core';
import {handleRpcErrors} from './errors';
import {RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';

// ############# PUBLIC METHODS #############

/*
 * NOTE:
 * different options has been tested to improve performance but were discarded due to worst or no noticeable improvements
 * - using promisify(setImmediate): worst or no improvement
 * - using queueMicrotask instead of setImmediate: definitely worst
 * - using callback instead promises: seems to be more slow but use less memory in some scenarios.
 */

export async function dispatchRoute<Req, Resp>(
    path: string,
    reqRawBody: string,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    rawRequest: Req,
    rawResponse?: Resp,
    parsedBody?: any
): Promise<MionResponse> {
    try {
        const opts = getRouterOptions();
        // this is the call context that will be passed to all handlers
        // we should keep it as small as possible
        const context = getEmptyCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, parsedBody);

        const executionPath = getRouteExecutionPath(context.path) || getNotFoundExecutionPath();
        await runExecutionPath(context, rawRequest, rawResponse, executionPath.methods, opts);
        // console.log('dispatchRoute errors', context.request.internalErrors);
        return context.response;
    } catch (err: any | RpcError<any> | Error) {
        // this should never happen, exceptions should be handled inside runExecutionPath
        return Promise.reject(err);
    }
}

export function getEmptyCallContext(
    path: string,
    opts: RouterOptions,
    reqRawBody: string,
    rawRequest: unknown,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    parsedBody?: any
): CallContext {
    const transformedPath = opts.pathTransform ? opts.pathTransform(rawRequest, path) : path;
    return {
        path: transformedPath,
        request: {
            headers: reqHeaders,
            rawBody: reqRawBody,
            body: {},
            parsedBody,
            internalErrors: [],
        },
        response: {
            statusCode: StatusCodes.OK,
            hasErrors: false,
            headers: respHeaders,
            body: {},
            rawBody: '',
        },
        shared: opts.contextDataFactory ? opts.contextDataFactory() : {},
    };
}

// ############# PRIVATE METHODS #############
// runs the execution path of a route
async function runExecutionPath(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executables: Method[],
    opts: RouterOptions
): Promise<MionResponse> {
    const {response, request} = context;

    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        if (response.hasErrors && !executable.options.runOnError) continue;

        try {
            const methodCaller = getMethodCaller(executable);
            // method caller is not type safe so we need to be sure we always passing correct parameters
            // runRawHook , runHeaderHook & runRouteOrHook must always accept the same parameters in the same order
            await methodCaller(context, executable, request, response, opts, rawRequest, rawResponse);
        } catch (err: any | RpcError<any> | Error) {
            const path = isNotFoundExecutable(executable) ? context.path : executable.id;
            handleRpcErrors(path, request, response, err, i);
        }
    }
    return context.response;
}

export async function runRawHook(
    context: CallContext,
    executable: RawMethod,
    request: MionRequest,
    response: MionResponse,
    opts: RouterOptions,
    rawRequest: unknown,
    rawResponse: unknown
) {
    const result = await executable.handler(context, rawRequest, rawResponse, opts);
    if (result instanceof Error || result instanceof RpcError) throw result;
}

export async function runHeaderHook(
    context: CallContext,
    executable: HeaderMethod,
    request: MionRequest,
    response: MionResponse
) {
    const headerNames = executable.headersParam.headerNames;
    const headerValues = headerNames.map((name) => request.headers.get(name));
    const params = deserializeBodyParams(request, executable as Method);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as HeaderMethod);

    const result = await executable.handler(context, headerValues, ...params);
    if (result instanceof Error || result instanceof RpcError) throw result;

    if (result !== undefined) {
        executable.headersParam.headerNames.forEach((name, i) => {
            if (!result[i]) return;
            response.headers.set(name, result[i]);
        });
    }
}

export async function runRouteOrHook(
    context: CallContext,
    executable: HeaderMethod,
    request: MionRequest,
    response: MionResponse
) {
    const params = deserializeBodyParams(request, executable as Method);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as Method);

    const result = await executable.handler(context, ...params);
    if (result instanceof Error || result instanceof RpcError) throw result;

    if (executable.hasReturnData && result !== undefined) {
        (response.body as Mutable<AnyObject>)[executable.id] = executable.options.serializeReturn
            ? (executable as Method).returnJitFns.prepareForJson.fn(result)
            : result;
    }
}

function getMethodCaller(executable: Method) {
    if (executable.methodCaller) return executable.methodCaller;
    if (executable.type === HandlerType.rawHook) {
        executable.methodCaller = runRawHook;
    } else if (executable.type === HandlerType.headerHook) {
        executable.methodCaller = runHeaderHook;
    } else {
        executable.methodCaller = runRouteOrHook;
    }
    return executable.methodCaller;
}

function deserializeBodyParams(request: MionRequest, executable: Method): any[] {
    const params: any[] = (request.body[executable.id] as any[]) || [];
    if (!executable.options.deserializeParams) return params;
    try {
        (request.body as Mutable<MionRequest['body']>)[executable.id] = executable.paramsJitFns.restoreFromJson.fn(params);
        return request.body[executable.id] as any[];
    } catch (e: any) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            type: 'serialization-error',
            publicMessage: `Invalid params '${executable.id}', can not deserialize. Parameters might be of the wrong type.`,
            originalError: e,
            errorData: {deserializeError: e.message},
        });
    }
}

function validateParametersOrThrow(params: any[], executable: Method): void {
    if (!executable.paramsJitFns.isType.fn(params)) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            type: 'validation-error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: executable.paramsJitFns.typeErrors.fn(params),
        });
    }
}
