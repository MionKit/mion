/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    Context,
    Mutable,
    Obj,
    RouteError,
    StatusCodes,
    addDefaultGlobalOptions,
    getCallContext,
    getGlobalOptions,
    getPublicErrorFromRouteError,
} from '@mionkit/core';

export type Parser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};

export type BodyParserOptions = {
    /** Custom JSON parser, defaults to Native js JSON */
    bodyParser: Parser;
    /** Default response content type */
    defaultResponseContentType: string;
};

export const DEFAULT_BODY_PARSER_OPTIONS = addDefaultGlobalOptions<BodyParserOptions>({
    /** Body parser, defaults to Native js JSON */
    bodyParser: JSON,
    defaultResponseContentType: 'application/json; charset=utf-8',
});

/*
 * TODO: Ideally these should be extracted into the hooks package but we run into circular dependency problems.
 * being here means we are not compiling the runtime types for these hooks, and we have to
 * implement thing getFakeInternalHookReflection so the router still works properly.
 */

export function parseJsonRequestBody(app, context: Context<any> | undefined) {
    const {request, rawCallContext} = context || getCallContext();
    const {bodyParser} = getGlobalOptions<BodyParserOptions>();
    if (!rawCallContext.rawRequest?.body) return;
    if (typeof rawCallContext.rawRequest.body === 'string') {
        try {
            const parsedBody = bodyParser.parse(rawCallContext.rawRequest.body);
            if (typeof parsedBody !== 'object')
                return new RouteError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Invalid Request Body',
                    publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                });
            (request as Mutable<Obj>).body = parsedBody;
        } catch (err: any) {
            return new RouteError({
                statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
                name: 'Parsing Request Body',
                publicMessage: `Invalid request body: ${err?.message || 'unknown parsing error.'}`,
                originalError: err,
            });
        }
    } else if (typeof rawCallContext.rawRequest.body === 'object') {
        // lets assume the body has been already parsed, TODO: investigate possible security issues
        (request as Mutable<Obj>).body = rawCallContext.rawRequest.body;
    } else {
        return new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Invalid Request Body',
            publicMessage: 'Wrong request body, expecting a json string.',
        });
    }
}

export function stringifyJsonResponseBody(app, context: Context<any> | undefined) {
    const {response, rawCallContext} = context || getCallContext();
    const {bodyParser, defaultResponseContentType} = getGlobalOptions<BodyParserOptions>();
    const respBody: Obj = response?.body;
    rawCallContext.rawResponse.setHeader('content-type', defaultResponseContentType);
    try {
        if (response.publicErrors.length) {
            respBody.errors = response.publicErrors;
            (response.json as Mutable<string>) = bodyParser.stringify(response.publicErrors);
        } else if (respBody) {
            (response.json as Mutable<string>) = bodyParser.stringify(respBody);
        }
    } catch (err: any) {
        const routeError = new RouteError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            name: 'Stringify Response Body',
            publicMessage: `Invalid response body: ${err?.message || 'unknown parsing error.'}`,
            originalError: err,
        });
        (response.json as Mutable<string>) = bodyParser.stringify([getPublicErrorFromRouteError(routeError)]);
        return routeError;
    }
}
