/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Executable, Context, Obj, Response, RawServerCallContext, Mutable, Request, RouterOptions, SimpleHandler} from './types';
import {StatusCodes} from './status-codes';
import {RouteError, PublicError} from './errors';
import {getApp, getRouteExecutionPath, getRouterOptions, getSharedDataFactory} from './router';
import {AsyncLocalStorage} from 'node:async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

export function getCallContext<R extends Context<any, RawServerCallContext>>(): R {
    return asyncLocalStorage.getStore() as R;
}

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
        const opts = getRouterOptions();
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
    opts: RouterOptions,
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
    opts: RouterOptions,
    cb: CallBack
) {
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

const deserializeAndValidateParameters = (request: Request, executable: Executable, routerOptions: RouterOptions): any[] => {
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

const serializeResponse = (response: Response, executable: Executable, result: any, routerOptions: RouterOptions) => {
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

/**
 * This is a function to be called from outside the router.
 * Whenever there is an error outside the router, this function should be called.
 * So error keep the same format as when they were generated inside the router.
 * This also stringifies public errors into response.json.
 * @param routeResponse
 * @param originalError
 */
export const generateRouteResponseFromOutsideError = (
    originalError: any,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    publicMessage = 'Internal Error'
): Response => {
    const routerOptions = getRouterOptions();
    const error = new RouteError({
        statusCode,
        publicMessage,
        originalError,
    });
    const publicErrors = [getPublicErrorFromRouteError(error)];
    return {
        statusCode,
        publicErrors,
        headers: {},
        body: {},
        json: routerOptions.bodyParser.stringify(publicErrors),
    };
};

export const getPublicErrorFromRouteError = (routeError: RouteError): PublicError => {
    // creating a new public error object to avoid exposing the original error
    const publicError: PublicError = {
        name: routeError.name,
        statusCode: routeError.statusCode,
        message: routeError.publicMessage,
    };
    if (routeError.id) publicError.id = routeError.id;
    if (routeError.publicData) publicError.errorData = routeError.publicData;
    return publicError;
};
