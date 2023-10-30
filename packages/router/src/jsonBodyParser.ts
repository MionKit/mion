/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionResponse, MionRequest, CallContext} from './types/context';
import type {RouterOptions} from './types/general';
import type {HooksCollection, ErrorReturn} from './types/remote';
import type {RawHookDef} from './types/definitions';
import {RpcError, StatusCodes, AnyObject, Mutable} from '@mionkit/core';
import {handleRpcErrors} from './dispatch';

// ############# PUBLIC METHODS #############

// TODO: rename to body parser as this should be configurable from options

export function parseRequestBody(
    context: CallContext,
    rawRequest: unknown,
    rawResponse: unknown,
    opts: RouterOptions
): ErrorReturn {
    if (!context.request.rawBody) return;
    const request = context.request as Mutable<MionRequest>;
    const type = typeof context.request.rawBody;
    if (type === 'object') {
        // assumes that the body is already parsed
        request.body = context.request.rawBody as any as AnyObject;
    } else if (type === 'string') {
        try {
            const parsedBody = opts.bodyParser.parse(context.request.rawBody);
            if (typeof parsedBody !== 'object')
                return new RpcError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Invalid Request Body',
                    publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                });
            request.body = parsedBody;
        } catch (err: any) {
            return new RpcError({
                statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
                name: 'Parsing Request Body Error',
                publicMessage: `Invalid request body: ${err?.message || 'unknown parsing error.'}`,
            });
        }
    } else {
        return new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Invalid Request Body',
            publicMessage: 'Wrong request body, expecting a json string.',
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
        response.rawBody = opts.bodyParser.stringify(respBody);
    } catch (err: any) {
        const rpcError = new RpcError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            name: 'Stringify Response Body',
            publicMessage: `Invalid response body: ${err?.message || 'unknown parsing error.'}`,
            originalError: err,
        });
        response.body = {}; // reset the body as it was not possible to stringify it
        handleRpcErrors(context.path, context.request, context.response, rpcError, 'stringifyResponseBody');
        response.rawBody = opts.bodyParser.stringify(response.body);
        return rpcError;
    }
}

export const bodyParserHooks = {
    mionParseJsonRequestBody: {
        isRawHook: true,
        hook: parseRequestBody,
    } satisfies RawHookDef,
    mionStringifyJsonResponseBody: {
        isRawHook: true,
        hook: stringifyResponseBody,
    } satisfies RawHookDef,
} satisfies HooksCollection;
