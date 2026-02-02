/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, MionResponse, MionRequest, MionHeaders, RawRequestBody} from './types/context';
import type {RouterOptions} from './types/general';
import {Mutable, StatusCodes, SerializerModes, SerializerCode} from '@mionkit/core';

// ############# POOL STATE #############

const contextPool: CallContext[] = [];

/** Get current pool statistics for monitoring */
export function getContextPoolStats(): {poolSize: number} {
    return {
        poolSize: contextPool.length,
    };
}

/** Clear the context pool - useful for testing */
export function clearContextPool(): void {
    contextPool.length = 0;
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
    reqBodyType?: SerializerCode
): CallContext {
    const transformedPath = opts.pathTransform?.(rawRequest, path) || path;
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
            bodyType: SerializerModes.json,
            binSerializer: undefined,
        },
        shared: opts.contextDataFactory ? opts.contextDataFactory() : {},
    } as CallContext;
}

/** Acquires a CallContext from the pool or creates a new one */
export function acquireCallContext(
    path: string,
    opts: RouterOptions,
    reqRawBody: RawRequestBody,
    rawRequest: unknown,
    reqHeaders: MionHeaders,
    respHeaders: MionHeaders,
    reqBodyType?: SerializerCode
): CallContext {
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
        resp.bodyType = SerializerModes.json;
        resp.binSerializer = undefined;

        // Reset shared data
        ctx.shared = opts.contextDataFactory ? opts.contextDataFactory() : {};

        return ctx;
    }

    // No pooled context available, create new one
    return createCallContext(path, opts, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType);
}

/** Releases a CallContext back to the pool for reuse */
export function releaseCallContext(ctx: CallContext, maxPoolSize: number): void {
    if (contextPool.length < maxPoolSize) {
        // Clear references to allow GC of request-specific data
        const mutableCtx = ctx as Mutable<CallContext>;
        const req = mutableCtx.request as Mutable<MionRequest>;
        const resp = mutableCtx.response as Mutable<MionResponse>;

        // Clear large objects to help GC
        req.rawBody = '';
        req.body = {};
        req.thrownErrors = undefined;
        resp.rawBody = '';
        resp.body = {};
        resp.binSerializer = undefined;
        mutableCtx.shared = {};

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
