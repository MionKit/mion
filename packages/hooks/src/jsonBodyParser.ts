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
    getGlobalOptions,
    getPublicErrorFromRouteError,
} from '@mionkit/core';
import {InternalHookDef} from './types';

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

/**
 * Parses Json body.
 * TODO: accept url params as well
 */
export const mionParseJsonRequestBodyHook = {
    internalHook: (context, cb) => {
        const {request, rawCallContext} = context;
        const {bodyParser} = getGlobalOptions<BodyParserOptions>();
        // body could be empty if there are no parameters sent to the router
        let error: RouteError | undefined;
        if (!rawCallContext.rawRequest?.body) {
            cb();
            return;
        }
        if (typeof rawCallContext.rawRequest.body === 'string') {
            try {
                const parsedBody = bodyParser.parse(rawCallContext.rawRequest.body);
                if (typeof parsedBody !== 'object') {
                    error = new RouteError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        name: 'Invalid Request Body',
                        publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                    });
                } else {
                    (request as Mutable<Obj>).body = parsedBody;
                }
            } catch (err: any) {
                error = new RouteError({
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
            error = new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Invalid Request Body',
                publicMessage: 'Wrong request body, expecting a json string.',
            });
        }
        cb(error);
    },
} satisfies InternalHookDef<Context<any>>;

/** Stringifies Json response. */
export const mionStringifyJsonResponseBodyHook = {
    internalHook: (context, cb) => {
        const {response} = context;
        const {bodyParser, defaultResponseContentType} = getGlobalOptions<BodyParserOptions>();
        const respBody: Obj = response.body;

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
        } finally {
            response.headers['content-type'] = defaultResponseContentType;
            response.headers['content-length'] = response.json.length;
            cb();
        }
    },
} satisfies InternalHookDef<Context<any>>;
