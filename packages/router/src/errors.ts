/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {getRouterOptions} from './router';
import {StatusCodes, statusCodeToReasonPhrase} from './status-codes';
import {CallContext, Mutable, Obj, PublicError, Response, RouteErrorParams} from './types';
import {stringifyResponseBody} from './jsonBodyParser';

export class RouteError extends Error {
    /** id of the error, if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated */
    public readonly id?: number | string;
    /** response status code */
    public readonly statusCode: number;
    /** the message that will be returned in the response */
    public readonly publicMessage: string;
    /** options data related to the error, ie validation data */
    public readonly publicData?: Obj;

    constructor({statusCode, message, publicMessage, originalError, publicData, name, id}: RouteErrorParams) {
        super(message || originalError?.message || publicMessage);
        super.name = name || statusCodeToReasonPhrase[statusCode] || 'UnknownError';
        if (originalError?.stack) super.stack = originalError?.stack;
        const {autoGenerateErrorId} = getRouterOptions();
        this.id = id || autoGenerateErrorId ? `${new Date().toISOString()}@${randomUUID()}` : undefined;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
        this.publicData = publicData;
        Object.setPrototypeOf(this, RouteError.prototype);
    }
}

export function addErrorToCallContext(context: CallContext, err: any, step: number) {
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
    (context.response.publicErrors as Mutable<PublicError[]>).push(publicError);
    (context.request.internalErrors as Mutable<RouteError[]>).push(routeError);
}

/**
 * This is a function to be called from outside the router.
 * Whenever there is an error outside the router, this function should be called.
 * So error keep the same format as when they were generated inside the router.
 * This also stringifies public errors into response.json.
 * @param routeResponse
 * @param originalError
 */
export function generateRouteResponseFromOutsideError(
    originalError: any,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    publicMessage = 'Internal Error'
): Readonly<Response> {
    const routerOptions = getRouterOptions();
    const error = new RouteError({
        statusCode,
        publicMessage,
        originalError,
    });
    const publicErrors = [getPublicErrorFromRouteError(error)];
    const context = {
        rawRequest: undefined as any,
        path: undefined as any,
        request: undefined as any,
        shared: undefined as any,
        response: {
            statusCode,
            publicErrors,
            headers: {},
            body: {},
            json: '',
        },
    } as CallContext;

    stringifyResponseBody(context, routerOptions);
    return context.response;
}

export function getPublicErrorFromRouteError(routeError: RouteError): PublicError {
    // creating a new public error object to avoid exposing the original error
    const publicError: PublicError = {
        name: routeError.name,
        statusCode: routeError.statusCode,
        message: routeError.publicMessage,
    };
    if (routeError.id) publicError.id = routeError.id;
    if (routeError.publicData) publicError.errorData = routeError.publicData;
    return publicError;
}
