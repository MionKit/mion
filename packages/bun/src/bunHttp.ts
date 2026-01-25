/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getRouterFatalErrorResponse, resetRouter, MionResponse as MionResponse} from '@mionkit/router';
import {DEFAULT_BUN_HTTP_OPTIONS} from './constants';
import type {BunHttpOptions} from './types';
import {getENV, SerializerModes} from '@mionkit/core';
import {RpcError} from '@mionkit/core';
import {Server} from 'bun';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<BunHttpOptions> = {...DEFAULT_BUN_HTTP_OPTIONS};
let defaultHeaders: [string, string][] = [['server', '@mionkit']];
const textEncoder = new TextEncoder();

export function resetBunHttpOpts() {
    httpOptions = {...DEFAULT_BUN_HTTP_OPTIONS};
    defaultHeaders = [['server', '@mionkit']];
    resetRouter();
}

export function setBunHttpOpts(options?: Partial<BunHttpOptions>) {
    httpOptions = {
        ...httpOptions,
        ...options,
    };
    // Pre-build default headers array once
    defaultHeaders = [['server', '@mionkit'], ...Object.entries(httpOptions.defaultResponseHeaders)];
    return httpOptions;
}

export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server<any>> {
    const isTest = getENV('NODE_ENV') === 'test';
    const isCompiling = getENV('MION_COMPILE') === 'true';

    if (options) setBunHttpOpts(options);

    if (isCompiling) {
        console.log('Compiling routes metadata and skipping mion server initialization...');
        return undefined as any;
    }

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `http://localhost${port}`;
    if (!isTest && !isCompiling) console.log(`mion bun server running on ${url}`);
    const server = Bun.serve({
        maxRequestBodySize: httpOptions.maxBodySize,
        port: httpOptions.port,
        ...httpOptions.options,

        async fetch(req) {
            const path = new URL(req.url).pathname;
            // Check content-type to determine if this is a binary request
            const contentType = req.headers.get('content-type') || '';
            const isBinary = contentType.includes('application/octet-stream');
            const rawBody = req.body ? (isBinary ? await req.arrayBuffer() : await req.text()) : '';
            const responseHeaders = new Headers(defaultHeaders);

            return dispatchRoute(path, rawBody, req.headers, responseHeaders, req, undefined)
                .then((routeResp: MionResponse) => reply(routeResp, responseHeaders))
                .catch((e) => {
                    const error =
                        e instanceof RpcError
                            ? e
                            : new RpcError({
                                  publicMessage: 'Unknown Error',
                                  type: 'unknown-error',
                                  originalError: e,
                              });
                    return fatalFail(error, responseHeaders);
                });
        },
        error(errReq) {
            const responseHeaders = new Headers({
                server: '@mionkit',
                ...httpOptions.defaultResponseHeaders,
            });
            const error =
                errReq instanceof RpcError
                    ? errReq
                    : new RpcError({
                          publicMessage: 'Connection Error',
                          type: 'response-connection-error',
                          originalError: errReq,
                      });
            return fatalFail(error, responseHeaders);
        },
    });

    const shutdownHandler = function () {
        if (!isTest) console.log(`Shutting down mion server on ${url}`);
        server.stop(true);
        process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);

    return server;
}

// only called whe there is an htt error or weird unhandled route errors
function fatalFail(err: RpcError<string>, responseHeaders: any): Response {
    const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
    return reply(routeResponse, responseHeaders);
}

function reply(
    mionResp: MionResponse,
    // TODO: fix issue with Native Bun Headers type messing with Node Headers type
    // responseHeaders: Headers,
    responseHeaders: any
): Response {
    const bodyType = mionResp.bodyType;
    switch (bodyType) {
        case SerializerModes.stringifyJson: {
            // Encode once and reuse for both content-length and response body
            const buffer = textEncoder.encode(mionResp.rawBody as string);
            responseHeaders.set('content-length', String(buffer.byteLength));
            // content-type already set by serializer
            return new Response(buffer, {
                status: mionResp.statusCode,
                headers: responseHeaders,
            });
        }
        case SerializerModes.json: {
            // Platform adapter uses Response.json() which handles JSON.stringify internally
            responseHeaders.set('content-type', 'application/json; charset=utf-8');
            return Response.json(mionResp.body, {
                status: mionResp.statusCode,
                headers: responseHeaders,
            });
        }
        case SerializerModes.binary: {
            const serializer = mionResp.binSerializer!;
            responseHeaders.set('content-length', String(serializer.getLength()));
            // content-type already set by serializer
            const response = new Response(serializer.getBufferView(), {
                status: mionResp.statusCode,
                headers: responseHeaders,
            });
            // Mark buffer as ended immediately - Bun copies the buffer to the response
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
