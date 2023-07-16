/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Executable, FullRouterOptions, RouterOptions} from './types';
import {getApp, getRouteExecutionPath, getSharedDataFactory} from './router';
import {
    Context,
    Mutable,
    Obj,
    PublicError,
    RawServerCallContext,
    Request,
    Response,
    RouteError,
    StatusCodes,
    getAsyncLocalStorage,
    getGlobalOptions,
    getPublicErrorFromRouteError,
} from '@mionkit/core';
import {SimpleHandler} from '@mionkit/hooks';

type CallBack = (err: any, response: Response | undefined) => void;

export function dispatchRoute<RawCallContext extends RawServerCallContext>(
    path: string,
    rawCallContext: RawCallContext
): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        const callBack = (err: any, response: Response | undefined) => {
            if (response) {
                resolve(response);
            } else {
                reject(err);
            }
        };
        // Enqueue route execution
        setImmediate(() => _dispatchRoute(path, rawCallContext, callBack));
    });
}

export function dispatchRouteCallback<RawCallContext extends RawServerCallContext>(
    path: string,
    rawCallContext: RawCallContext,
    cb: CallBack
): void {
    // Enqueue route execution
    setImmediate(() => _dispatchRoute(path, rawCallContext, cb));
}

function _dispatchRoute<RawCallContext extends RawServerCallContext>(
    path: string,
    rawCallContext: RawCallContext,
    cb: CallBack
): Promise<Response> | void {
    try {
        const opts = getGlobalOptions<FullRouterOptions>();
        const transformedPath = opts.pathTransform ? opts.pathTransform(rawCallContext.rawRequest, path) : path;
        const sharedFactory = getSharedDataFactory();
        const context: Context<any, RawCallContext> = {
            rawCallContext,
            path: transformedPath,
            request: {
                headers: rawCallContext.rawRequest.headers || {},
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
            shared: sharedFactory ? sharedFactory() : {},
        };

        const executionPath = getRouteExecutionPath(transformedPath) || [];
        const end = () => cb(undefined, context.response);

        if (!executionPath.length) {
            const notFound = new RouteError({statusCode: StatusCodes.NOT_FOUND, publicMessage: 'Route not found'});
            handleRouteErrors(context.request, context.response, notFound, 'findRoute');
            end();
        } else {
            // ### runs execution path
            runExecutionPath(0, context, executionPath, opts, end);
        }
    } catch (err: any | RouteError | Error) {
        cb(err, undefined);
    }
}

function runExecutionPath(
    step: number,
    context: Context<any, RawServerCallContext>,
    executionPath: Executable[],
    opts: FullRouterOptions,
    end: () => void
) {
    const executable = executionPath[step];
    if (!executable) return end();
    const next = () => runExecutionPath(step + 1, context, executionPath, opts, end);
    const {response, request} = context;
    if (response.publicErrors.length && !executable.forceRunOnError) {
        return next();
    }

    try {
        const handlerParams = deserializeAndValidateParameters(request, executable, opts);
        if (executable.inHeader) request.headers[executable.fieldName] = handlerParams;
        else request.body[executable.fieldName] = handlerParams;

        runHandler(handlerParams, context, executable, opts, (err, result) => {
            if (err) {
                handleRouteErrors(request, response, err, executable.fieldName);
            } else {
                serializeResponse(response, executable, result, opts);
            }
            next();
        });
    } catch (err: any | RouteError | Error) {
        handleRouteErrors(request, response, err, executable.fieldName);
        next();
    }
}

function runHandler(
    handlerParams: any[],
    context: Context<any, RawServerCallContext>,
    executable: Executable,
    opts: FullRouterOptions,
    cb: CallBack
) {
    const asyncLocalStorage = getAsyncLocalStorage();
    const resp = !opts.useAsyncCallContext
        ? executable.handler(getApp(), context, ...handlerParams)
        : asyncLocalStorage.run(context, () => {
              const simpleHandler = executable.handler as SimpleHandler;
              return simpleHandler(...handlerParams);
          });

    if (typeof resp?.then === 'function') {
        resp.then((result) => cb(undefined, result)).catch((err) => cb(err, undefined));
    } else if (resp instanceof Error || resp instanceof RouteError) {
        cb(resp, undefined);
    } else {
        cb(undefined, resp);
    }
}

// ############# PRIVATE METHODS #############

const deserializeAndValidateParameters = (request: Request, executable: Executable, routerOptions: FullRouterOptions): any[] => {
    const fieldName = executable.fieldName;
    let params;

    if (executable.inHeader) {
        params = request.headers[fieldName];
        if (typeof params === 'string') return [params];
        else if (Array.isArray(params)) return [params.join(',')]; // node http headers could be an array of strings
        else
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Invalid Header',
                publicMessage: `Invalid header '${fieldName}'. No header found with that name.`,
            });
    }

    // defaults to an empty array if required field is omitted from body
    params = request.body[fieldName] ?? [];

    if (!Array.isArray(params))
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Invalid Params Array',
            publicMessage: `Invalid params '${fieldName}'. input parameters can only be sent in an array.`,
        });

    // if there are no params input field can be omitted
    if (!params.length && !executable.reflection.paramsLength) return params;

    if (params.length !== executable.reflection.paramsLength)
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Invalid Params Length',
            publicMessage: `Invalid params '${fieldName}', missing or invalid number of input parameters`,
        });

    if (routerOptions.enableSerialization) {
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

    if (routerOptions.enableValidation) {
        const validationResponse = executable.reflection.validateParams(params);
        if (validationResponse.hasErrors) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                publicMessage: `Invalid params in '${fieldName}', validation failed.`,
                publicData: validationResponse,
            });
        }
    }

    return params;
};

const serializeResponse = (response: Response, executable: Executable, result: any, routerOptions: FullRouterOptions) => {
    if (!executable.canReturnData || result === undefined) return;
    const serialized = routerOptions.enableSerialization ? executable.reflection.serializeReturn(result) : result;
    if (executable.inHeader) response.headers[executable.fieldName] = serialized;
    else (response as Mutable<Obj>).body[executable.fieldName] = serialized;
};

const handleRouteErrors = (request: Request, response: Response, err: any, executableName: string) => {
    const routeError =
        err instanceof RouteError
            ? err
            : new RouteError({
                  statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                  publicMessage: `Unknown error in step ${executableName} of route execution path.`,
                  originalError: err,
                  name: 'Unknown Error',
              });

    const publicError = getPublicErrorFromRouteError(routeError);
    (response.publicErrors as Mutable<PublicError[]>).push(publicError);
    (request.internalErrors as Mutable<RouteError[]>).push(routeError);
};
