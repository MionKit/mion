/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    Executable,
    CallContext,
    Obj,
    Response,
    Mutable,
    Request,
    RouterOptions,
    SimpleHandler,
    RawRequest,
    isRawExecutable,
    Handler,
} from './types';
import {getPublicErrorFromRouteError} from './errors';
import {getNotFoundExecutionPath, getRouteExecutionPath, getRouterOptions} from './router';
import {AsyncLocalStorage} from 'node:async_hooks';
import {isPromise} from 'node:util/types';
import {PublicError, RouteError, StatusCodes} from '@mionkit/core';

type CallBack = (err: any, response: Response | undefined) => void;

// ############# Async Call Context #############

const asyncLocalStorage = new AsyncLocalStorage();
export function getCallContext<R extends CallContext>(): R {
    return asyncLocalStorage.getStore() as R;
}

// ############# PUBLIC METHODS #############

/*
 * NOTE:
 * different options has been tested to improve performance but were discarded due to worst or no noticeable improvements
 * - using promisify(setImmediate): worst or no improvement
 * - using queueMicrotask instead of setImmediate: definitely worst
 * - using internal _dispatchRoute with callbacks instead promises: no difference, maybe worst in terms of memory usage
 * - dispatchRouteCallback seems to be more slow but use less memory in some scenarios.
 */

export function dispatchRoute<Req extends RawRequest, Resp>(
    path: string,
    rawRequest: Req,
    rawResponse?: Resp
): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        // Enqueue execution and DO NOT BLOCK THE LOOP
        setImmediate(() =>
            _dispatchRoute(path, rawRequest, rawResponse)
                .then((result) => resolve(result))
                .catch((err) => reject(err))
        );
    });
}

export function dispatchRouteCallback<Req extends RawRequest, Resp>(
    path: string,
    rawRequest: Req,
    rawResponse: Resp | undefined,
    cb: CallBack
): void {
    // Enqueue execution and DO NOT BLOCK THE LOOP
    setImmediate(() =>
        _dispatchRoute(path, rawRequest, rawResponse)
            .then((result) => cb(undefined, result))
            .catch((err) => cb(err, undefined))
    );
}

// ############# PRIVATE METHODS #############

async function _dispatchRoute(path: string, rawRequest: RawRequest, rawResponse?: any): Promise<Response> {
    try {
        const opts = getRouterOptions();
        const transformedPath = opts.pathTransform ? opts.pathTransform(rawRequest, path) : path;

        // this is the call context that will be passed to all handlers
        // we should keep it as small as possible
        const context: CallContext = {
            path: transformedPath,
            request: {
                headers: rawRequest.headers || {},
                body: {},
                internalErrors: [],
            },
            response: {
                statusCode: StatusCodes.OK,
                publicErrors: [],
                headers: {},
                body: {},
                json: '',
            },
            shared: opts.sharedDataFactory ? opts.sharedDataFactory() : {},
        };

        // gets the execution path for the route or the not found exucution path
        const executionPath = getRouteExecutionPath(transformedPath) || getNotFoundExecutionPath();

        await runExecutionPath(context, rawRequest, rawResponse, executionPath, opts);
        return context.response;
    } catch (err: any | RouteError | Error) {
        return Promise.reject(err);
    }
}

async function runExecutionPath(
    context: CallContext,
    rawRequest: RawRequest,
    rawResponse: any,
    executables: Executable[],
    opts: RouterOptions
): Promise<Response> {
    const {response, request} = context;
    for (let i = 0; i < executables.length; i++) {
        const executable = executables[i];
        if (response.publicErrors.length && !executable.forceRunOnError) continue;

        try {
            const deserializedParams = deserializeParameters(request, executable);
            const validatedParams = validateParameters(deserializedParams, executable);
            if (executable.inHeader) (request.headers as Mutable<Request['headers']>)[executable.fieldName] = validatedParams;
            else (request.body as Mutable<Request['body']>)[executable.fieldName] = validatedParams;

            const result = await runHandler(validatedParams, context, rawRequest, rawResponse, executable, opts);
            // TODO: should we also validate the handler result? think just forcing declaring the return type with a linter is enough.
            serializeResponse(response, executable, result);
        } catch (err: any | RouteError | Error) {
            handleRouteErrors(request, response, err, i);
        }
    }

    return context.response;
}

async function runHandler(
    handlerParams: any[],
    context: CallContext,
    rawRequest: RawRequest,
    rawResponse: any,
    executable: Executable,
    opts: RouterOptions
): Promise<any> {
    const resp = getHandlerResponse(handlerParams, context, rawRequest, rawResponse, executable, opts);
    if (isPromise(resp)) {
        return resp as Promise<any>;
    } else if (resp instanceof Error || resp instanceof RouteError) {
        return Promise.reject(resp);
    } else {
        return Promise.resolve(resp);
    }
}

function getHandlerResponse(
    handlerParams: any[],
    context: CallContext,
    rawRequest: RawRequest,
    rawResponse: any,
    executable: Executable,
    opts: RouterOptions
): any {
    if (isRawExecutable(executable)) {
        return executable.handler(context, rawRequest, rawResponse, opts);
    }
    if (executable.useAsyncCallContext) {
        return asyncLocalStorage.run(context, () => {
            return (executable.handler as SimpleHandler)(...handlerParams);
        });
    }

    return (executable.handler as Handler)(context, ...handlerParams);
}

function deserializeParameters(request: Request, executable: Executable): any[] {
    if (!executable.reflection) return [];
    const fieldName = executable.fieldName;
    let params;

    if (executable.inHeader) {
        params = request.headers[fieldName];
        if (typeof params === 'string') params = [params];
        else if (Array.isArray(params)) params = [params.join(',')]; // node http headers could be an array of strings
        else
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Invalid Header',
                publicMessage: `Invalid header '${fieldName}'. No header found with that name.`,
            });
    }

    // defaults to an empty array if required field is omitted from body
    params = params || (request.body[fieldName] ?? []);

    if (!Array.isArray(params))
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Invalid Params Array',
            publicMessage: `Invalid params '${fieldName}'. input parameters can only be sent in an array.`,
        });

    if (params.length && executable.enableSerialization) {
        try {
            params = executable.reflection.deserializeParams(params);
        } catch (e) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                publicMessage: `Invalid params '${fieldName}', can not deserialize. Parameters might be of the wrong type.`,
            });
        }
    }
    return params;
}

function validateParameters(params: any[], executable: Executable): any[] {
    if (!executable.reflection) return [];
    if (executable.enableValidation) {
        const validationResponse = executable.reflection.validateParams(params);
        if (validationResponse.hasErrors) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                publicMessage: `Invalid params in '${executable.fieldName}', validation failed.`,
                publicData: validationResponse,
            });
        }
    }
    return params;
}

function serializeResponse(response: Response, executable: Executable, result: any) {
    if (!executable.canReturnData || result === undefined || !executable.reflection) return;
    const serialized = executable.enableSerialization ? executable.reflection.serializeReturn(result) : result;
    if (executable.inHeader) (response.headers as Mutable<Response['headers']>)[executable.fieldName] = serialized;
    else (response as Mutable<Obj>).body[executable.fieldName] = serialized;
}

export function handleRouteErrors(request: Request, response: Response, err: any, step: number) {
    const routeError =
        err instanceof RouteError
            ? err
            : new RouteError({
                  statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                  publicMessage: `Unknown error in step ${step} of route execution path.`,
                  originalError: err,
                  name: 'Unknown Error',
              });

    const publicError = getPublicErrorFromRouteError(routeError);
    (response.publicErrors as Mutable<PublicError[]>).push(publicError);
    (request.internalErrors as Mutable<RouteError[]>).push(routeError);
}
