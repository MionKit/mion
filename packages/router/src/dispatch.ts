/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders} from './types/context';
import {type RouterOptions} from './types/general';
import {HeaderProcedure, NonRawProcedure, type Procedure} from './types/procedures';
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
            if (executable.type === ProcedureType.rawHook) {
                const resp = executable.handler(context, rawRequest, rawResponse, opts);
                if (resp instanceof Error || resp instanceof RpcError) throw resp;
                if (isPromise(resp)) await resp;
            } else {
                const params = deserializeParameters(request, executable as NonRawProcedure);
                validateParametersOrThrow(params, executable as NonRawProcedure);
                let result;
                const resp = (executable.handler as Handler)(context, ...(params as any[]));
                if (isPromise(resp)) result = await resp;
                else if (resp instanceof Error || resp instanceof RpcError) throw resp;
                else result = resp;
                serializeResponse(executable as NonRawProcedure, response, result, opts);
            }
        } catch (err: any | RpcError | Error) {
            const path = isNotFoundExecutable(executable) ? context.path : executable.id;
            handleRpcErrors(path, request, response, err, i);
        }
    }
    return context.response;
}

function deserializeParameters(request: MionRequest, executable: NonRawProcedure): any[] {
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
            return executable.handlerRunType?.jitParamsFns.jsonDecode.fn(params);
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

function validateParametersOrThrow(params: any[], executable: NonRawProcedure): void {
    if (!executable.options.useValidation) return;
    const areParamsValid = executable.handlerRunType.jitParamsFns.isType.fn(params);
    if (!areParamsValid) {
        throw new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Validation Error',
            publicMessage: `Invalid params in '${executable.id}', validation failed.`,
            errorData: executable.handlerRunType.jitParamsFns.typeErrors.fn(params),
        });
    }
}

function serializeResponse(executable: NonRawProcedure, response: MionResponse, result: any, opts: RouterOptions) {
    if (!executable.options.canReturnData || result === undefined) return;
    const shouldEncode =
        !opts.useJitStringify && executable.options.useSerialization && executable.handlerRunType?.isReturnJsonEncodedRequired;
    const serialized = shouldEncode ? executable.handlerRunType?.jitReturnFns.jsonEncode.fn(result) : result;
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
