/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {randomUUID} from 'crypto';
import {CallContext, Response} from './types';
import {stringifyResponseBody} from './jsonBodyParser';
import {getRouterOptions} from './router';
import {Mutable, PublicError, RouteError, StatusCodes} from '@mionkit/core';

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
    const context = {
        response: {
            statusCode,
            publicErrors,
            headers: {},
            body: {},
            json: '',
        },
    } as any as CallContext;
    // stringify does not uses rawRequest or raw response atm but that can change
    stringifyResponseBody(context, null as any, null as any, routerOptions);
    return context.response;
}

export function getPublicErrorFromRouteError(routeError: RouteError): PublicError {
    // creating a new public error object to avoid exposing the original error
    const publicError: Mutable<PublicError> = {
        name: routeError.name,
        statusCode: routeError.statusCode,
        message: routeError.publicMessage,
    };
    if (routeError.id) publicError.id = routeError.id;
    if (routeError.publicData) publicError.errorData = routeError.publicData;
    return publicError;
}
