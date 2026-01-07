/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionResponse, MionRequest, CallContext} from '../types/context';
import type {RouterOptions} from '../types/general';
import type {HooksCollection, MayReturnError} from '../types/publicMethods';
import type {ResponseBody} from '../types/context';
import {AnyObject, Mutable, MION_ROUTES, StatusCodes} from '@mionkit/core';
import {rawHook} from '../lib/handlers';
import {getRouteExecutableFromPath, getRouteExecutionPath, getRouteExecutable} from '../router';
import {RpcError} from '@mionkit/core';
import {RemoteMethod} from '../types/remoteMethods';
import {onExecutableError} from '../lib/dispatchError';

// ############# PUBLIC METHODS #############

/**
 * Deserializes the request body and stores it in the request body property.
 * This method is called before any other hook or route handler.
 * @mion:hook
 */
export function deserializeRequestBody(context: CallContext): MayReturnError {
    if (!context.request.rawBody) return; // empty body
    let parsedBody: any;
    switch (context.request.bodyType) {
        case 'J': // json
            try {
                parsedBody = JSON.parse(context.request.rawBody as string);
            } catch (err: any) {
                throw new RpcError({
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
            throw new RpcError({
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
export function serializeResponseBody(context: CallContext, opts: RouterOptions): MayReturnError {
    const response = context.response as Mutable<MionResponse>;
    const respBody: AnyObject = response.body;
    const bodyType = context.response.bodyType;
    switch (bodyType) {
        case 'J': {
            // json
            response.headers.set('content-type', 'application/json; charset=utf-8');
            const executionPath = getRouteExecutionPath(context.path)!;
            const body = stringifyBody(context, executionPath.methods, respBody);
            response.rawBody = body;
            break;
        }
        case 'O': {
            // pre-serialized object - only prepare for JSON, don't stringify
            // Platform adapters will handle the actual JSON stringification
            // prepareForJson mutates response.body in place, so we don't set rawBody
            const executionPath = getRouteExecutionPath(context.path)!;
            prepareBodyForJson(context, executionPath.methods, respBody);
            break;
        }
        case 'B': // binary
            response.headers.set('content-type', 'application/octet-stream');
            // TODO: serialize binary
            throw new Error('Binary serialization not yet implemented');
        default:
            throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
}

function stringifyBody(context: CallContext, executionPath: RemoteMethod[], respBody: ResponseBody): string {
    const props: string[] = [];
    for (let i = 0; i < executionPath.length; i++) {
        const method = executionPath[i];
        const returnValue = respBody[method.id];
        if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
        try {
            const jsonValue = stringifyHandlerReturnValue(method, returnValue);
            if (!jsonValue) continue;
            props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
        } catch (e: any) {
            onStringifyExecutableError(context, method, e);
        }
    }

    // Serialize thrownErrors if they exist
    const thrownErrors = respBody['@thrownErrors'];
    if (thrownErrors) {
        const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
        // console.log('thrownErrors method', method);
        try {
            const jsonValue = stringifyHandlerReturnValue(method, thrownErrors);
            if (jsonValue) props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
        } catch (e: any) {
            onStringifyExecutableError(context, method, e);
        }
    }
    return `{${props.join(',')}}`;
}

function onStringifyExecutableError(context: CallContext, method: RemoteMethod, e: any) {
    const err = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'json-stringify-response-error',
        publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.stringifyJson.typeName}`,
        originalError: e,
        errorData: {methodId: method.id},
    });
    onExecutableError(context, method, err);
}

function stringifyHandlerReturnValue(method: RemoteMethod, returnValue: any): string {
    if (!method.hasReturnData) return '';
    return method.returnJitFns.stringifyJson.fn(returnValue);
}

function prepareBodyForJson(context: CallContext, executionPath: RemoteMethod[], respBody: ResponseBody): void {
    // prepareForJson mutates the response body in place
    for (let i = 0; i < executionPath.length; i++) {
        const method = executionPath[i];
        const returnValue = respBody[method.id];
        if (!method.hasReturnData || typeof returnValue === 'undefined') continue;
        try {
            const preparedValue = prepareHandlerReturnValue(method, returnValue);
            if (preparedValue !== undefined) (respBody as Mutable<ResponseBody>)[method.id] = preparedValue;
        } catch (e: any) {
            onPrepareForJsonExecutableError(context, method, e);
        }
    }
    // Prepare thrownErrors if they exist
    const thrownErrors = respBody['@thrownErrors'];
    if (thrownErrors) {
        const method = getRouteExecutable(MION_ROUTES.thrownErrors)!;
        try {
            const preparedValue = prepareHandlerReturnValue(method, thrownErrors);
            if (preparedValue !== undefined) (respBody as Mutable<ResponseBody>)[method.id] = preparedValue;
        } catch (e: any) {
            onPrepareForJsonExecutableError(context, method, e);
        }
    }
}

function onPrepareForJsonExecutableError(context: CallContext, method: RemoteMethod, e: any) {
    const err = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: 'prepare-for-json-response-error',
        publicMessage: `Failed to prepare return value for JSON for handler ${method.id}, expected response type: ${method.returnJitFns.prepareForJson.typeName}`,
        originalError: e,
        errorData: {methodId: method.id},
    });
    onExecutableError(context, method, err);
}

function prepareHandlerReturnValue(method: RemoteMethod, returnValue: any): any {
    if (!method.hasReturnData) return undefined;
    if (method.returnJitFns.prepareForJson.isNoop) return returnValue;
    return method.returnJitFns.prepareForJson.fn(returnValue);
}

export const serializerHooks = {
    mionDeserializeRequest: rawHook(deserializeRequestBody, {runOnError: true}),
    mionSerializeResponse: rawHook(serializeResponseBody, {runOnError: true}),
} satisfies HooksCollection;
