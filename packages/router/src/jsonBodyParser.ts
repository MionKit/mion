/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Obj, Response, Mutable, Request, RouterOptions, RawRequest} from './types';
import {StatusCodes} from './status-codes';
import {RouteError, getPublicErrorFromRouteError} from './errors';
import {handleRouteErrors} from './dispatch';

// ############# PUBLIC METHODS #############

export function parseRequestBody(rawRequest: RawRequest, request: Request, response: Response, opts: RouterOptions) {
    if (!rawRequest.body) return;
    try {
        if (typeof rawRequest.body === 'string') {
            const parsedBody = opts.bodyParser.parse(rawRequest.body);
            if (typeof parsedBody !== 'object')
                throw new RouteError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Invalid Request Body',
                    publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                });
            (request as Mutable<Obj>).body = parsedBody;
        } else if (typeof rawRequest.body === 'object') {
            // lets assume the body has been already parsed, TODO: investigate possible security issues
            (request as Mutable<Obj>).body = rawRequest.body;
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
}

export function stringifyResponseBody(response: Response, opts: RouterOptions): void {
    const respBody: Obj = response.body;
    try {
        if (response.publicErrors.length) {
            respBody.errors = response.publicErrors;
            (response.json as Mutable<string>) = opts.bodyParser.stringify(response.publicErrors);
        } else {
            (response.json as Mutable<string>) = opts.bodyParser.stringify(respBody);
        }
    } catch (err: any) {
        const routeError = new RouteError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            name: 'Stringify Response Body',
            publicMessage: `Invalid response body: ${err?.message || 'unknown parsing error.'}`,
            originalError: err,
        });
        (response.json as Mutable<string>) = opts.bodyParser.stringify([getPublicErrorFromRouteError(routeError)]);
    } finally {
        response.headers['Content-Type'] = opts.responseContentType;
    }
}
