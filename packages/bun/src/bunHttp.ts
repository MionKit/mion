/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getGlobalErrorResponse, resetRouter, MionResponse as MionResponse} from '@mionkit/router';
import {DEFAULT_BUN_HTTP_OPTIONS} from './constants';
import type {BunHttpOptions} from './types';
import {getENV, StatusCodes} from '@mionkit/core';
import {RpcError} from '@mionkit/core';
import {Server} from 'bun';

export function resetBunHttpOpts() {
    httpOptions = {...DEFAULT_BUN_HTTP_OPTIONS};
    resetRouter();
}

export function setBunHttpOpts(options?: Partial<BunHttpOptions>) {
    httpOptions = {
        ...httpOptions,
        ...options,
    };
    return httpOptions;
}

// ############# PRIVATE STATE #############

let httpOptions: Readonly<BunHttpOptions> = {...DEFAULT_BUN_HTTP_OPTIONS};

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
            const pathIndex = req.url.indexOf('/', 12);
            const queryIndex = req.url.indexOf('?', pathIndex + 1);
            const path = queryIndex === -1 ? req.url.substring(pathIndex) : req.url.substring(pathIndex, queryIndex);
            const rawBody = req.body ? await Bun.readableStreamToText(req.body) : '';
            const responseHeaders = new Headers({
                server: '@mionkit',
                ...httpOptions.defaultResponseHeaders,
            });

            return dispatchRoute(path, rawBody, req.headers, responseHeaders, req, undefined)
                .then((routeResp: MionResponse) => reply(routeResp, responseHeaders))
                .catch((e: Error) => {
                    const error = new RpcError({
                        statusCode: StatusCodes.UNEXPECTED_ERROR,
                        publicMessage: 'Unknown Error',
                        type: 'unknown-error',
                        originalError: e,
                    });
                    return fail(error, responseHeaders);
                });
        },
        error(errReq) {
            const responseHeaders = new Headers({
                server: '@mionkit',
                ...httpOptions.defaultResponseHeaders,
            });
            const error = new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                publicMessage: 'Connection Error',
                type: 'response-connection-error',
                originalError: errReq,
            });
            return fail(error, responseHeaders);
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
const fail = (err: RpcError<string>, responseHeaders: any): Response => {
    const routeResponse = getGlobalErrorResponse(err, responseHeaders);
    return reply(routeResponse, responseHeaders);
};

function reply(
    routeResp: MionResponse,
    // TODO: fic issue with Native Bun Headers type messing with Node Headers type
    // responseHeaders: Headers,
    responseHeaders: any
): Response {
    if (typeof routeResp.rawBody !== 'string') throw new Error('Binary responses are not yet supported on Bun');
    return new Response(routeResp.rawBody, {
        status: routeResp.statusCode,
        headers: responseHeaders,
    });
}
