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
            const params = deserializeParameters(request, executable);
            validateParametersOrThrow(params, executable);

            if (executable.options.isSync) {
                const result = getHandlerResponse(params, context, rawRequest, rawResponse, executable, opts);
                if (result instanceof Error || result instanceof RpcError) throw result;
                else serializeResponse(executable, response, result);
            } else {
                const result = await runAsyncHandler(params, context, rawRequest, rawResponse, executable, opts);
                serializeResponse(executable, response, result);
            }
        } catch (err: any | RpcError | Error) {
            const path = isNotFoundExecutable(executable) ? context.path : executable.id;
            handleRpcErrors(path, request, response, err, i);
        }
    }
    return context.response;
}

async function runAsyncHandler(
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

    if (executable.type !== ProcedureType.headerHook) {
        (request.body as Mutable<MionRequest['body']>)[path] = _deserializeParameters(request.body[path] || [], executable, path);
        return request.body[path] as any[];
    }

    const headerParams = request.headers.get((executable as HeaderProcedure).headerName) || [];
    const params = _deserializeParameters(Array.isArray(headerParams) ? headerParams : [headerParams], executable, path);
    request.headers.set(executable.id, params);
    return params;
}

function _deserializeParameters(params: any, executable: Procedure, path: string): any[] {
    if (executable.options.useSerialization && executable?.handlerRunType?.isParamsJsonDecodedRequired) {
        try {
            return executable.handlerRunType.compiledParams.jsonDecode.fn(params as any[]);
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

function validateParametersOrThrow(params: any[], executable: Procedure): void {
    if (!executable.handlerRunType || !executable.options.useValidation) return;
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

function serializeResponse(executable: Procedure, response: MionResponse, result: any) {
    if (!executable.options.canReturnData || result === undefined) return;
    const serialized =
        executable.options.useSerialization && executable.handlerRunType?.isReturnJsonEncodedRequired
            ? executable.handlerRunType?.compiledReturn.jsonEncode.fn(result)
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
