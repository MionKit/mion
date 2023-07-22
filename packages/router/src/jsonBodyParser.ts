/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Obj, Response, Mutable, Request, RouterOptions, RawRequest, RawHooksCollection, CallContext, ErrorReturn} from './types';
import {StatusCodes} from './status-codes';
import {RouteError, getPublicErrorFromRouteError} from './errors';

// ############# PUBLIC METHODS #############

export function parseRequestBody(
    context: CallContext,
    rawRequest: RawRequest,
    rawResponse: any,
    opts: RouterOptions
): ErrorReturn {
    if (!rawRequest.body) return;
    const request = context.request as Mutable<Request>;
    if (typeof rawRequest.body === 'string') {
        try {
            const parsedBody = opts.bodyParser.parse(rawRequest.body);
            if (typeof parsedBody !== 'object')
                return new RouteError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Invalid Request Body',
                    publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                });
            request.body = parsedBody;
        } catch (err: any) {
            return new RouteError({
                statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
                name: 'Parsing Request Body Error',
                publicMessage: `Invalid request body: ${err?.message || 'unknown parsing error.'}`,
            });
        }
    } else if (typeof rawRequest.body === 'object') {
        // lets assume the body has been already parsed, TODO: investigate possible security issues
        request.body = rawRequest.body;
    } else {
        return new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Invalid Request Body',
            publicMessage: 'Wrong request body, expecting a json string.',
        });
    }
}

export function stringifyResponseBody(
    context: CallContext,
    rawRequest: RawRequest,
    rawResponse: any,
    opts: RouterOptions
): ErrorReturn {
    const response = context.response as Mutable<Response>;
    const respBody: Obj = response.body;
    (response.headers as Mutable<Response['headers']>)['content-type'] = 'application/json; charset=utf-8';
    try {
        if (response.publicErrors.length) {
            respBody.errors = response.publicErrors;
            response.json = opts.bodyParser.stringify(response.publicErrors);
        } else {
            response.json = opts.bodyParser.stringify(respBody);
        }
    } catch (err: any) {
        const routeError = new RouteError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            name: 'Stringify Response Body',
            publicMessage: `Invalid response body: ${err?.message || 'unknown parsing error.'}`,
            originalError: err,
        });
        response.json = opts.bodyParser.stringify([getPublicErrorFromRouteError(routeError)]);
        return routeError;
    }
}

export const bodyParserHooks = {
    parseJsonRequestBody: {
        rawRequestHandler: parseRequestBody,
    },
    stringifyJsonResponseBody: {
        rawRequestHandler: stringifyResponseBody,
    },
} satisfies RawHooksCollection;
