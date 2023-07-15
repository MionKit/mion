/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRouterOptions} from './router';
import {getCallContext} from './dispatch';
import {RouteError} from './errors';
import {StatusCodes} from './status-codes';
import type {Context, HooksCollection, Mutable, Obj} from './types';

/*
 * TODO: Ideally these should be extracted into the hooks package but we run into circular dependency problems.
 * being here means we are not compiling the runtime types for these hooks, and we have to
 * implement things getFakeInternalHookReflection so the router still works properly.
 */

export function parseRequestBody(app, context: Context<any>) {
    const routerOptions = getRouterOptions();
    const {request, rawCallContext} = context || getCallContext();
    if (!rawCallContext.rawRequest?.body) return;
    if (typeof rawCallContext.rawRequest.body === 'string') {
        try {
            const parsedBody = routerOptions.bodyParser.parse(rawCallContext.rawRequest.body);
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

export function stringifyResponseBody(app, context: Context<any>) {
    const routerOptions = getRouterOptions();
    const {response} = context || getCallContext();
    const respBody: Obj = response?.body;
    try {
        if (response?.publicErrors?.length) {
            respBody.errors = response.publicErrors;
            (response.json as Mutable<string>) = routerOptions.bodyParser.stringify(response.publicErrors);
        } else if (respBody) {
            (response.json as Mutable<string>) = routerOptions.bodyParser.stringify(respBody);
        }
    } catch (err: any) {
        return new RouteError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            name: 'Stringify Response Body',
            publicMessage: `Invalid response body: ${err?.message || 'unknown parsing error.'}`,
            originalError: err,
        });
    }
}

export const routerHooks = {
    parseRequestBody: {
        isInternal: true,
        hook: parseRequestBody,
    },
    stringifyResponseBody: {
        isInternal: true,
        hook: stringifyResponseBody,
    },
} satisfies HooksCollection;
