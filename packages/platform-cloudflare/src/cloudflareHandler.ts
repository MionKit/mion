/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getRouterFatalErrorResponse, resetRouter, decodeQueryBody, MionResponse} from '@mionjs/router';
import {DEFAULT_CLOUDFLARE_OPTIONS} from './constants.ts';
import type {CloudflareHandlerOptions, CloudflareExecutionContext, CloudflarePlatformContext} from './types.ts';
import {SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError} from '@mionjs/core';

// ############# PRIVATE STATE #############

let cloudflareOptions: Readonly<CloudflareHandlerOptions> = {...DEFAULT_CLOUDFLARE_OPTIONS};
let defaultHeaders: [string, string][] = [['server', '@mionjs']];

export function resetCloudflareHandlerOpts() {
    cloudflareOptions = {...DEFAULT_CLOUDFLARE_OPTIONS};
    defaultHeaders = [['server', '@mionjs']];
    resetRouter();
}

export function setCloudflareHandlerOpts(options?: Partial<CloudflareHandlerOptions>) {
    cloudflareOptions = {
        ...cloudflareOptions,
        ...options,
    };
    defaultHeaders = [['server', '@mionjs'], ...Object.entries(cloudflareOptions.defaultResponseHeaders)];
    return cloudflareOptions;
}

/** Main handler for Web standard Request -> Response */
async function handleRequest<Env = unknown>(req: Request, env?: Env, ctx?: CloudflareExecutionContext): Promise<Response> {
    const reqUrl = req.url;
    const urlObj = new URL(reqUrl);
    let path = urlObj.pathname;
    // Strip basePath prefix to get the mion route path
    if (cloudflareOptions.basePath && path.startsWith(cloudflareOptions.basePath)) {
        path = path.slice(cloudflareOptions.basePath.length) || '/';
    }
    const urlQuery = urlObj.search ? urlObj.search.slice(1) : undefined;
    const contentType = req.headers.get('content-type') || '';
    const isBinary = contentType.startsWith('application/octet-stream');
    let rawBody: any = req.body
        ? isBinary
            ? await req.arrayBuffer()
            : ((await req.json()) as Record<string, unknown>)
        : undefined;
    let reqBodyType: SerializerCode = isBinary ? SerializerModes.binary : SerializerModes.json;
    const queryBody = decodeQueryBody(urlQuery, rawBody);
    if (queryBody) {
        rawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
    }
    const responseHeaders = new Headers(defaultHeaders);

    // Build platform context for route handlers to access env/ctx
    const platformContext: CloudflarePlatformContext<Env> | undefined =
        env !== undefined || ctx !== undefined ? {env: env as Env, ctx: ctx as CloudflareExecutionContext} : undefined;

    try {
        const platformResp = await dispatchRoute(
            path,
            rawBody,
            req.headers,
            responseHeaders,
            req,
            platformContext,
            reqBodyType,
            urlQuery
        );
        return reply(platformResp, responseHeaders);
    } catch (e) {
        const error =
            e instanceof RpcError
                ? e
                : new RpcError({
                      publicMessage: 'Unknown Error',
                      type: 'unknown-error',
                      originalError: e as Error,
                  });
        return fatalFail(error, responseHeaders);
    }
}

/** Creates a Cloudflare Workers fetch handler */
export function createCloudflareHandler<Env = unknown>() {
    return {
        fetch: (req: Request, env?: Env, ctx?: CloudflareExecutionContext) => handleRequest<Env>(req, env, ctx),
    };
}

function fatalFail(err: RpcError<string>, responseHeaders: any): Response {
    const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
    return reply(routeResponse, responseHeaders);
}

function reply(mionResp: MionResponse, responseHeaders: any): Response {
    const bodyType = mionResp.serializer;
    switch (bodyType) {
        case SerializerModes.stringifyJson: {
            return new Response(mionResp.rawBody as string, {
                status: mionResp.statusCode,
                headers: responseHeaders,
            });
        }
        case SerializerModes.json: {
            return Response.json(mionResp.body, {
                status: mionResp.statusCode,
                headers: responseHeaders,
            });
        }
        case SerializerModes.binary: {
            const serializer = mionResp.binSerializer!;
            responseHeaders.set('content-length', String(serializer.getLength()));
            const response = new Response(serializer.getBufferView(), {
                status: mionResp.statusCode,
                headers: responseHeaders,
            });
            serializer.markAsEnded();
            return response;
        }
        default: {
            const error = new RpcError({
                publicMessage: 'unknown-mion-response-format',
                type: 'unknown-error',
                errorData: {bodyType},
            });
            return fatalFail(error, responseHeaders);
        }
    }
}
