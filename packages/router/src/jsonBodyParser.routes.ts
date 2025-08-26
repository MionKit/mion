/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionResponse, MionRequest, CallContext} from './types/context';
import type {RouterOptions} from './types/general';
import type {HooksCollection, ErrorReturn} from './types/publicMethods';
import {AnyObject, Mutable} from '@mionkit/core';
import {handleRpcErrors} from './errors';
import {rawHook} from './handlers';
import {jitStringifyResponseBody} from './jsonBodyStringify';
import {getRouteExecutableFromPath} from './router';
import {RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';

// ############# PUBLIC METHODS #############

// TODO: rename to body parser as this should be configurable from options

export function parseRequestBody(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    opts: RouterOptions
): ErrorReturn {
    if (!context.request.rawBody && !context.request.parsedBody) return;
    const request = context.request as Mutable<MionRequest>;
    try {
        const parsedBody = context.request.parsedBody || opts.bodyParser.parse(context.request.rawBody);
        if (Array.isArray(parsedBody)) {
            // when the body is an array we assume it's a single route call and we have to reconstruct the body
            // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
            request.body = {[getRouteExecutableFromPath(context.path).id]: parsedBody};
            return;
        }
        if (typeof parsedBody !== 'object')
            return new RpcError({
                statusCode: StatusCodes.BAD_REQUEST,
                type: 'Invalid Request Body',
                publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
            });
        request.body = parsedBody;
    } catch (err: any) {
        return new RpcError({
            statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
            type: 'Parsing Request Body Error',
            publicMessage: `Invalid request body: ${err?.message || 'unknown parsing error.'}`,
        });
    }
}

export function stringifyResponseBody(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    opts: RouterOptions
): ErrorReturn {
    const response = context.response as Mutable<MionResponse>;
    const respBody: AnyObject = response.body;
    response.headers.set('content-type', 'application/json; charset=utf-8');
    try {
        // TODO: we might need to handle error on a per method basis rather than the whole response
        if (opts.useJitStringify && !context.response.hasErrors) {
            const {body, stringifyErrors} = jitStringifyResponseBody(respBody, context.path);
            response.rawBody = body;
            Object.entries(stringifyErrors).forEach(([id, err]) => {
                handleRpcErrors(id, context.request, context.response, err, id);
            });
        } else {
            response.rawBody = opts.bodyParser.stringify(respBody);
        }
    } catch (err: any) {
        const rpcError = new RpcError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            type: 'Stringify Response Body',
            publicMessage: `Invalid response body: ${err?.message || 'unknown parsing error.'}`,
            originalError: err,
        });
        response.hasErrors = true;
        response.body = {}; // reset the body as it was not possible to stringify it
        handleRpcErrors(context.path, context.request, context.response, rpcError, 'stringifyResponseBody');
        response.rawBody = opts.bodyParser.stringify(response.body);
        return rpcError;
    }
}

export const bodyParserHooks = {
    mionParseJsonRequestBody: rawHook(parseRequestBody, {runOnError: true, isAsync: false}),
    mionStringifyJsonResponseBody: rawHook(stringifyResponseBody, {runOnError: true, isAsync: false}),
} satisfies HooksCollection;
