/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NOT_FOUND_PATH, WORKFLOW_PATH} from './constants.ts';
import {getRouteExecutionChain} from './router.ts';
import type {
    CallContext,
    MionResponse,
    MionRequest,
    MionHeaders,
    RawRequestBody,
    RoutesFlowExecutionResult,
} from './types/context.ts';
import type {RouterOptions} from './types/general.ts';
import {Mutable, StatusCodes, SerializerModes, SerializerCode, RpcError} from '@mionjs/core';
import {getRoutesFlowExecutionChain} from './routesFlow.ts';

// ############# POOL STATE #############

let contextPool: CallContext[] = [];

/** Get current pool statistics for monitoring */
export function getContextPoolStats(): {poolSize: number} {
    return {
        poolSize: contextPool.length,
    };
}

/** Clear the context pool - useful for testing */
export function clearContextPool(): void {
    contextPool = [];
}

// ############# CONTEXT CREATION #############

/** Creates a new CallContext without pooling (original behavior) */
export function createCallContext(
    path: string,
    opts: RouterOptions,
    reqRawBody: RawRequestBody,
    rawRequest: unknown,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    reqBodyType?: SerializerCode,
    urlQuery?: string
): CallContext {
    const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
    const {executionChain, routesFlowRouteIds} = getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts);
    return {
        path: transformedPath,
        request: {
            headers: reqHeaders,
            rawBody: reqRawBody,
            bodyType: reqBodyType ?? getRequestBodyType(reqRawBody),
            body: {},
            thrownErrors: undefined,
        },
        response: {
            statusCode: StatusCodes.OK,
            hasErrors: false,
            headers: respHeaders,
            body: {},
            rawBody: '',
            serializer: SerializerModes.json,
            binSerializer: undefined,
        },
        executionChain,
        shared: opts.contextDataFactory ? opts.contextDataFactory() : {},
        urlQuery,
        routesFlowRouteIds,
    } as CallContext;
}

/** Acquires a CallContext from the pool or creates a new one */
export function acquireCallContext(
    usePooling: boolean,
    path: string,
    opts: RouterOptions,
    reqRawBody: RawRequestBody,
    rawRequest: unknown,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    reqBodyType?: SerializerCode,
    urlQuery?: string
): CallContext {
    if (!usePooling) return createCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType, urlQuery);
    const pooledContext = contextPool.pop();
    const transformedPath = opts.pathTransform?.(rawRequest, path) || path;

    if (pooledContext) {
        // Reuse the pooled context shell, but create fresh body objects
        const ctx = pooledContext as Mutable<CallContext>;
        ctx.path = transformedPath;
        // Reset request - reuse the request object shell
        const req = ctx.request as Mutable<MionRequest>;
        req.headers = reqHeaders;
        req.rawBody = reqRawBody;
        req.bodyType = reqBodyType ?? getRequestBodyType(reqRawBody);
        req.body = {}; // Must be fresh - handlers write to this
        req.thrownErrors = undefined;
        // Reset response - reuse the response object shell
        const resp = ctx.response as Mutable<MionResponse>;
        resp.statusCode = StatusCodes.OK;
        resp.hasErrors = false;
        resp.headers = respHeaders;
        resp.body = {}; // Must be fresh - handlers write to this
        resp.rawBody = '';
        resp.serializer = SerializerModes.json;
        resp.binSerializer = undefined;
        // Reset execution chain and routesFlow route IDs
        const {executionChain, routesFlowRouteIds} = getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts);
        ctx.executionChain = executionChain;
        ctx.routesFlowRouteIds = routesFlowRouteIds;
        // Reset shared data
        ctx.shared = opts.contextDataFactory ? opts.contextDataFactory() : {};
        // Reset urlQuery
        ctx.urlQuery = urlQuery;
        return ctx;
    }
    // No pooled context available, create new one
    return createCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType, urlQuery);
}

/** Releases a CallContext back to the pool for reuse */
export function releaseCallContext(ctx: CallContext, maxPoolSize: number): void {
    if (contextPool.length < maxPoolSize) {
        const mutableCtx = ctx as Mutable<CallContext>;
        const req = mutableCtx.request as Mutable<MionRequest>;
        // Clear request data - safe to mutate since request is not returned to caller
        req.rawBody = '';
        req.body = null as any; // Will be set when context is acquired
        req.thrownErrors = undefined;
        // Create fresh response object - the old one may still be referenced by the caller
        // IMPORTANT: We must NOT mutate the existing response object because it's returned
        // to the platform wrapper (e.g., HTTP handler) which may still be using it
        mutableCtx.response = {
            statusCode: StatusCodes.OK,
            hasErrors: false,
            headers: null as any, // Will be set when context is acquired
            body: null as any, // Will be set when context is acquired
            rawBody: '',
            serializer: SerializerModes.json,
            binSerializer: undefined,
        };
        mutableCtx.shared = null as any;
        mutableCtx.executionChain = null as any;
        mutableCtx.routesFlowRouteIds = undefined;
        contextPool.push(ctx);
    }
    // If pool is full, let the context be garbage collected
}

// ############# HELPER FUNCTIONS #############

function getRequestBodyType(rawBody: RawRequestBody): SerializerCode {
    if (typeof rawBody === 'string') return SerializerModes.stringifyJson;
    if (rawBody instanceof ArrayBuffer || rawBody instanceof Uint8Array) return SerializerModes.binary;
    return SerializerModes.json;
}

/** Gets the execution chain for a path, handling routesFlow paths specially */
function getExecutionChain(
    originalPath: string,
    transformedPath: string,
    urlQuery: string | undefined,
    rawRequest: unknown,
    opts: RouterOptions
): RoutesFlowExecutionResult {
    // Handle routesFlow path - build merged execution chain from multiple routes
    // Compare with original path since WORKFLOW_PATH is not transformed
    if (originalPath === WORKFLOW_PATH) return getRoutesFlowExecutionChain(rawRequest, opts, urlQuery);

    // Normal path - get execution chain from router using transformed path
    let executionChain = getRouteExecutionChain(transformedPath);
    if (!executionChain) {
        executionChain = getRouteExecutionChain(NOT_FOUND_PATH);
        if (!executionChain) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'not-found',
                publicMessage: 'Not-found route is not registered. This should never happen.',
            });
        }
    }
    return {executionChain};
}
