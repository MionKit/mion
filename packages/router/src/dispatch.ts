/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    Executable,
    Context,
    Obj,
    Response,
    RawServerContext,
    Mutable,
    PublicError,
    Request,
    RouterOptions,
    SimpleHandler,
} from './types';
import {StatusCodes} from './status-codes';
import {RouteError} from './errors';
import {getApp, getRouteExecutionPath, getRouterOptions, getSharedDataFactory} from './router';
import {AsyncLocalStorage} from 'node:async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

export function getCallContext<R extends Context<any, RawServerContext>>(): R {
    return asyncLocalStorage.getStore() as R;
}

type CallBack = (err: any, response: Response | undefined) => void;

export function dispatchRoute<RawContext extends RawServerContext>(path: string, serverContext: RawContext): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
        const callBack = (err: any, response: Response | undefined) => {
            if (response) {
                resolve(response);
            } else {
                reject(err);
            }
        };
        // Enqueue route execution
        setImmediate(() => _dispatchRoute(path, serverContext, callBack));
    });
}

export function dispatchRouteCallback<RawContext extends RawServerContext>(
    path: string,
    serverContext: RawContext,
    cb: CallBack
): void {
    // Enqueue route execution
    setImmediate(() => _dispatchRoute(path, serverContext, cb));
}

function _dispatchRoute<RawContext extends RawServerContext>(
    path: string,
    serverContext: RawContext,
    cb: CallBack
): Promise<Response> | void {
    try {
        const opts = getRouterOptions();
        const transformedPath = opts.pathTransform ? opts.pathTransform(serverContext.rawRequest, path) : path;
        const sharedFactory = getSharedDataFactory();
        const context: Context<any, RawContext> = {
            rawContext: serverContext,
            path: transformedPath,
            request: {
                headers: serverContext.rawRequest.headers || {},
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
        const lastStep = executionPath.length - 1;
        const end = (executionStep: number): void => {
            if (executionStep < lastStep) return;
            const respBody: Obj = context.response.body;
            if (context.response.publicErrors.length) {
                respBody.errors = context.response.publicErrors;
                (context.response.json as Mutable<string>) = opts.bodyParser.stringify(context.response.publicErrors);
            } else {
                (context.response.json as Mutable<string>) = opts.bodyParser.stringify(respBody);
            }
            cb(undefined, context.response);
        };

        if (!executionPath.length) {
            const notFound = new RouteError({statusCode: StatusCodes.NOT_FOUND, publicMessage: 'Route not found'});
            handleRouteErrors(context.request, context.response, notFound, 0);
            end(0);
        } else {
            parseRequestBody(context.rawContext, context.request, context.response, opts);
            // ### runs execution path
            for (let i = 0; i < executionPath.length; i++) {
                execute(context, executionPath[i], opts, i, end);
            }
        }
    } catch (err: any | RouteError | Error) {
        // todo create response and send error
        cb(err, undefined);
    }
}

function execute(
    context: Context<any, RawServerContext>,
    executable: Executable,
    opts: RouterOptions,
    executionStep: number,
    end: (executionStep: number) => void
) {
    if (context.response.publicErrors.length && !executable.forceRunOnError) {
        return end(executionStep);
    }

    try {
        const handlerParams = deserializeAndValidateParameters(context.request, executable, opts);
        if (executable.inHeader) context.request.headers[executable.fieldName] = handlerParams;
        else context.request.body[executable.fieldName] = handlerParams;

        runHandler(handlerParams, context, executable, opts, (err, result) => {
            if (err) {
                handleRouteErrors(context.request, context.response, err, executionStep);
            } else {
                serializeResponse(context.response, executable, result, opts);
            }
            end(executionStep);
        });
    } catch (err: any | RouteError | Error) {
        handleRouteErrors(context.request, context.response, err, executionStep);
        end(executionStep);
    }
}

function runHandler(
    handlerParams: any[],
    context: Context<any, RawServerContext>,
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

const parseRequestBody = (
    serverContext: RawServerContext<any, any>,
    request: Request,
    response: Response,
    routerOptions: RouterOptions
) => {
    if (!serverContext.rawRequest.body) return;
    try {
        if (typeof serverContext.rawRequest.body === 'string') {
            const parsedBody = routerOptions.bodyParser.parse(serverContext.rawRequest.body);
            if (typeof parsedBody !== 'object')
                throw new RouteError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Invalid Request Body',
                    publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                });
            (request as Mutable<Obj>).body = parsedBody;
        } else if (typeof serverContext.rawRequest.body === 'object') {
            // lets assume the body has been already parsed, TODO: investigate possible security issues
            (request as Mutable<Obj>).body = serverContext.rawRequest.body;
        } else {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Invalid Request Body',
                publicMessage: 'Wrong request body, expecting a json string.',
            });
        }
    } catch (err: any) {
        if (!(err instanceof RouteError)) {
            handleRouteErrors(
                request,
                response,
                new RouteError({
                    statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
                    name: 'Parsing Request Body Error',
                    publicMessage: `Invalid request body: ${err?.message || 'unknown parsing error.'}`,
                }),
                0
            );
        }
        handleRouteErrors(request, response, err, 0);
    }
};

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

const handleRouteErrors = (request: Request, response: Response, err: any, step: number) => {
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
