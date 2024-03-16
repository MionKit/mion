/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders} from './types/context';
import {type RouterOptions} from './types/general';
import {HeaderProcedure, type Procedure} from './types/procedures';
import {ProcedureType} from './types/procedures';
import type {Handler} from './types/handlers';
import {isNotFoundExecutable} from './types/guards';
import {getNotFoundExecutionPath, getRouteExecutionPath, getRouterOptions} from './router';
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
        await runExecutionPath(context, rawRequest, rawResponse, executionPath, opts);

        return context.response;
    } catch (err: any | RpcError | Error) {
        return Promise.reject(err);
    }
}

// ############# PRIVATE METHODS #############
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
            const deserializedParams = deserializeParameters(request, executable);
            const validatedParams = validateParameters(deserializedParams, executable);
            if (executable.type === ProcedureType.headerHook) request.headers.set(executable.id, validatedParams);
            else (request.body as Mutable<MionRequest['body']>)[executable.id] = validatedParams;

            const result = await runHandler(validatedParams, context, rawRequest, rawResponse, executable, opts);
            // TODO: should we also validate the handler result? think just forcing declaring the return type with a linter is enough.
            serializeResponse(executable, response, result);
        } catch (err: any | RpcError | Error) {
            const path = isNotFoundExecutable(executable) ? context.path : executable.id;
            handleRpcErrors(path, request, response, err, i);
        }
    }
    return context.response;
}

async function runHandler(
    handlerParams: any[],
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executable: Procedure,
    opts: RouterOptions
): Promise<any> {
    const resp = getHandlerResponse(handlerParams, context, rawRequest, rawResponse, executable, opts);
    if (isPromise(resp)) {
        return resp as Promise<any>;
    } else if (resp instanceof Error || resp instanceof RpcError) {
        return Promise.reject(resp);
    } else {
        return Promise.resolve(resp);
    }
}

function getHandlerResponse(
    handlerParams: any[],
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    executable: Procedure,
    opts: RouterOptions
): any {
    if (executable.type === ProcedureType.rawHook) {
        return executable.handler(context, rawRequest, rawResponse, opts);
    }

    return (executable.handler as Handler)(context, ...handlerParams);
}

function deserializeParameters(request: MionRequest, executable: Procedure): any[] {
    if (!executable.handlerRunType) return [];
    const path = executable.id;
    let params;

    if (executable.type !== ProcedureType.headerHook) {
        params = request.body[path] || [];
    } else {
        params = request.headers.get((executable as HeaderProcedure).headerName) || [];
        // headers could be arrays or individual values, so we need to normalize to an array
        if (!Array.isArray(params)) params = [params];
    }

    if (executable.options.useSerialization) {
        try {
            params = executable.handlerRunType.compiledParams.jsonDecode.fn(params);
        } catch (e: any) {
            throw new RpcError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                publicMessage: `Invalid params '${path}', can not deserialize. Parameters might be of the wrong type.`,
                originalError: e,
                errorData: {deserializeError: e.message},
            });
        }
    }
    return params;
}

function validateParameters(params: any[], executable: Procedure): any[] {
    if (!executable.handlerRunType) return params;
    if (executable.options.useValidation) {
        const areParamsValid = executable.handlerRunType.compiledParams.isType.fn(params);
        if (!areParamsValid) {
            throw new RpcError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                publicMessage: `Invalid params in '${executable.id}', validation failed.`,
                errorData: executable.handlerRunType.compiledParams.typeErrors.fn(params),
            });
        }
    }
    return params;
}

function serializeResponse(executable: Procedure, response: MionResponse, result: any) {
    if (!executable.options.canReturnData || result === undefined) return;
    const serialized = executable.options.useSerialization
        ? executable.handlerRunType?.compiledParams.jsonEncode.fn(result)
        : result;
    if (executable.type !== ProcedureType.headerHook) (response.body as Mutable<AnyObject>)[executable.id] = serialized;
    else response.headers.set((executable as HeaderProcedure).headerName, serialized);
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
