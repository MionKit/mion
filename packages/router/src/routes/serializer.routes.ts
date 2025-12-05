/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionResponse, MionRequest, CallContext} from '../types/context';
import type {RouterOptions} from '../types/general';
import type {HooksCollection, ErrorReturn, PublicResponses} from '../types/publicMethods';
import {AnyObject, Mutable} from '@mionkit/core';
import {rawHook} from '../lib/handlers';
import {getRouteExecutableFromPath, getRouteExecutionPath} from '../router';
import {RpcError} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';
import {Method} from '../types/remoteMethods';
import {getNotFoundExecutionPath} from '../lib/notFound';

// ############# PUBLIC METHODS #############

/**
 * Deserializes the request body and stores it in the request body property.
 * This method is called before any other hook or route handler.
 * @mion:hook
 */
export function deserializeRequestBody(context: CallContext): ErrorReturn {
    if (!context.request.rawBody) return; // empty body
    let parsedBody: any;
    switch (context.request.bodyType) {
        case 'J': // json
            try {
                parsedBody = JSON.parse(context.request.rawBody as string);
            } catch (err: any) {
                return new RpcError({
                    statusCode: StatusCodes.UNEXPECTED_ERROR,
                    type: 'parsing-json-request-error',
                    publicMessage: `Invalid json request body: ${err?.message || 'unknown parsing error.'}`,
                });
            }
            break;
        case 'B': // binary
            throw new Error('Binary deserialization not yet implemented');
            return; // noop, binary items will be parsed on each step of the execution path before calling the handler
        case 'O': // Object (pre-parsed body from platforms like Google Cloud Functions where Express auto-parses JSON)
            parsedBody = context.request.rawBody;
            break;
        default:
            throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
    if (parsedBody) {
        if (Array.isArray(parsedBody)) {
            // when the body is an array we assume it's a single route call and we have to reconstruct the body
            // http://my-api.com/route1 [p1, p2, p3] => {route1: [p1, p2, p3]}
            parsedBody = {[getRouteExecutableFromPath(context.path).id]: parsedBody};
        }
        if (typeof parsedBody !== 'object')
            return new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'invalid-request-body',
                publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
            });
        (context.request as Mutable<MionRequest>).body = parsedBody;
    }
}

/**
 * Serializes the response body and stores it in the response rawBody property.
 * This method is called after any other hook or route handler.
 * @mion:hook
 */
export function serializeResponseBody(context: CallContext, opts: RouterOptions): ErrorReturn {
    const response = context.response as Mutable<MionResponse>;
    const respBody: AnyObject = response.body;
    const bodyType = context.response.bodyType;
    switch (bodyType) {
        case 'J': {
            // json
            response.headers.set('content-type', 'application/json; charset=utf-8');
            const executionPath = getRouteExecutionPath(context.path) || getNotFoundExecutionPath();
            const body = stringifyBody(context, executionPath.methods, respBody, opts);
            response.rawBody = body;
            break;
        }
        case 'B': // binary
            response.headers.set('content-type', 'application/octet-stream');
            // TODO: serialize binary
            throw new Error('Binary serialization not yet implemented');
            break;
        default:
            throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
}

function stringifyBody(context: CallContext, executionPath: Method[], respBody: PublicResponses, opts: RouterOptions): string {
    const props: string[] = [];
    for (let i = 0; i < executionPath.length; i++) {
        const method = executionPath[i];
        const returnValue = respBody[method.id];
        if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
        try {
            const jsonValue = stringifyHandlerReturnValue(method, returnValue, opts);
            if (!jsonValue) continue;
            props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: any) {
            const err = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'json-stringify-response-error',
                publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.jsonStringify.typeName}`,
                originalError: e,
            });
            const errorJsonVal = JSON.stringify(err.toPublicError());
            props.push(`${JSON.stringify(method.id)}:${errorJsonVal}`);
            onErrorResponse(context, err);
        }
    }
    return `{${props.join('')}}`;
}

function stringifyHandlerReturnValue(method: Method, returnValue: any, opts: RouterOptions): string {
    if (opts.useJitStringify) return method.returnJitFns.jsonStringify.fn(returnValue);
    if (method.returnJitFns.prepareForJson.isNoop) return JSON.stringify(returnValue);
    return JSON.stringify(method.returnJitFns.prepareForJson.fn(returnValue));
}

function onErrorResponse(context: CallContext, err: any) {
    const response = context.response as Mutable<MionResponse>;
    response.statusCode = err.statusCode;
    response.hasErrors = true;
    (context.request.internalErrors as Mutable<any[]>).push(err);
}

export const serializerHooks = {
    mionDeserializeRequest: rawHook(deserializeRequestBody, {runOnError: true}),
    mionSerializeResponse: rawHook(serializeResponseBody, {runOnError: true}),
} satisfies HooksCollection;
