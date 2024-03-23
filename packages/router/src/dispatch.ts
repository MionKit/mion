/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders} from './types/context';
import {type RouterOptions} from './types/general';
import {HeaderProcedure, NonRawProcedure, RawProcedure, type Procedure} from './types/procedures';
import {ProcedureType} from './types/procedures';
import type {Handler} from './types/handlers';
import {isNotFoundExecutable} from './types/guards';
import {getRouteExecutionPath, getRouterOptions} from './router';
import {getNotFoundExecutionPath} from './notFound';
import {isPromise} from 'node:util/types';
import {Mutable, AnyObject, RpcError, StatusCodes} from '@mionkit/core';
import {handleRpcErrors} from './errors';

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
    rawResponse?: Resp
): Promise<MionResponse> {
    try {
        const opts = getRouterOptions();
        // this is the call context that will be passed to all handlers
        // we should keep it as small as possible
        const context = getEmptyCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders);

        const executionPath = getRouteExecutionPath(context.path) || getNotFoundExecutionPath();
        await runExecutionPath(context, rawRequest, rawResponse, executionPath.procedures, opts);

        return context.response;
    } catch (err: any | RpcError | Error) {
        return Promise.reject(err);
    }
}

export function getEmptyCallContext(
    path: string,
    opts: RouterOptions,
    reqRawBody: string,
    rawRequest: unknown,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders
): CallContext {
    const transformedPath = opts.pathTransform ? opts.pathTransform(rawRequest, path) : path;
    return {
        path: transformedPath,
        request: {
            headers: reqHeaders,
            rawBody: reqRawBody,
            body: {},
            internalErrors: [],
        },
        response: {
            statusCode: StatusCodes.OK,
            hasErrors: false,
            headers: respHeaders,
            body: {},
            rawBody: '',
        },
        shared: opts.sharedDataFactory ? opts.sharedDataFactory() : {},
    };
}

// ############# PRIVATE METHODS #############
// runs the execution path of a route
// Optimized for performance
async function runExecutionPath(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executables: Procedure[],
    opts: RouterOptions
): Promise<MionResponse> {
    const {response, request} = context;

    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        if (response.hasErrors && !executable.options.runOnError) continue;

        try {
            const procedureCaller = getProcedureCaller(executable);
            // procedure caller is not type safe so we need to be sure we always passing correct parameters
            // runRawHook , runHeaderHook & runRouteOrHook must always accept the same parameters in the same order
            await procedureCaller(context, executable, request, response, opts, rawRequest, rawResponse);
        } catch (err: any | RpcError | Error) {
            const path = isNotFoundExecutable(executable) ? context.path : executable.id;
            handleRpcErrors(path, request, response, err, i);
        }
    }
    return context.response;
}

export async function runRawHook(
    context: CallContext,
    executable: RawProcedure,
    request: MionRequest,
    response: MionResponse,
    opts: RouterOptions,
    rawRequest: unknown,
    rawResponse: unknown
) {
    let result;
    const resp = executable.handler(context, rawRequest, rawResponse, opts);
    if (isPromise(resp)) result = await resp;
    else result = resp;
    if (result instanceof Error || result instanceof RpcError) throw result;
}

export async function runHeaderHook(
    context: CallContext,
    executable: HeaderProcedure,
    request: MionRequest,
    response: MionResponse
) {
    const params = (executable as HeaderProcedure).headerNames.map((name) => request.headers.get(name));
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as HeaderProcedure);

    // only awaits if procedure response response is a promise
    let result;
    const resp = executable.handler(context, ...(params as string[]));
    if (isPromise(resp)) result = await resp;
    else result = resp;
    if (result instanceof Error || result instanceof RpcError) throw result;

    if (result !== undefined) {
        (executable as HeaderProcedure).headerNames.forEach((name, i) => {
            if (!result[i]) return;
            response.headers.set(name, result[i]);
        });
    }
}

export async function runRouteOrHook(
    context: CallContext,
    executable: HeaderProcedure,
    request: MionRequest,
    response: MionResponse
) {
    const params = deserializeBodyParams(request, executable as NonRawProcedure);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable as NonRawProcedure);

    // only awaits if procedure response response is a promise
    let result;
    const resp = (executable.handler as Handler)(context, ...params);
    if (isPromise(resp)) result = await resp;
    else result = resp;
    if (result instanceof Error || result instanceof RpcError) throw result;

    if (executable.options.hasReturnData && result !== undefined) {
        (response.body as Mutable<AnyObject>)[executable.id] = executable.options.serializeReturn
            ? (executable as NonRawProcedure).returnJitFns.jsonEncode.fn(result)
            : result;
    }
}

function getProcedureCaller(executable: Procedure) {
    if (executable.procedureCaller) return executable.procedureCaller;
    if (executable.type === ProcedureType.rawHook) {
        executable.procedureCaller = runRawHook;
    } else if (executable.type === ProcedureType.headerHook) {
        executable.procedureCaller = runHeaderHook;
    } else {
        executable.procedureCaller = runRouteOrHook;
    }
    return executable.procedureCaller;
}

function deserializeBodyParams(request: MionRequest, executable: NonRawProcedure): any[] {
    const params: any[] = (request.body[executable.id] as any[]) || [];
    if (!executable.options.deserializeParams) return params;
    try {
        (request.body as Mutable<MionRequest['body']>)[executable.id] = executable.paramsJitFns.jsonDecode.fn(params);
        return request.body[executable.id] as any[];
    } catch (e: any) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            publicMessage: `Invalid params '${executable.id}', can not deserialize. Parameters might be of the wrong type.`,
            originalError: e,
            errorData: {deserializeError: e.message},
        });
    }
}

function validateParametersOrThrow(params: any[], executable: NonRawProcedure): void {
    if (!executable.paramsJitFns.isType.fn(params)) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Validation Error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: executable.paramsJitFns.typeErrors.fn(params),
        });
    }
}
