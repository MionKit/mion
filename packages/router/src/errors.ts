/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {getRouterOptions} from './router';
import {StatusCodes, statusCodeToReasonPhrase} from './status-codes';
import {Obj, PublicError, Response, RouteErrorParams} from './types';
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

/**
 * This is a function to be called from outside the router.
 * Whenever there is an error outside the router, this function should be called.
 * So error keep the same format as when they were generated inside the router.
 * This also stringifies public errors into response.json.
 * @param routeResponse
 * @param originalError
 */

export function getResponseFromError(
    originalError: any,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    publicMessage = 'Internal Error'
): Response {
    const routerOptions = getRouterOptions();
    const error = new RouteError({
        statusCode,
        publicMessage,
        originalError,
    });
    const publicErrors = [getPublicErrorFromRouteError(error)];
    const response = {
        statusCode,
        publicErrors,
        headers: {},
        body: {},
        json: '',
    } as Response;

    stringifyResponseBody(response, routerOptions);
    return response;
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
