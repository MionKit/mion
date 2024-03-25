/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getResponseFromError, resetRouter, MionResponse as MionResponse} from '@mionkit/router';
import {DEFAULT_BUN_HTTP_OPTIONS} from './constants';
import type {BunHttpOptions} from './types';
import {RpcError, StatusCodes} from '@mionkit/core';
import {Server} from 'bun';
import {compileRouter} from '@mionkit/router/index';

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

export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server> {
    const isTest = process.env.NODE_ENV === 'test';
    const isCompiling = process.env.MION_COMPILE === 'true';

    if (options) setBunHttpOpts(options);

    if (isCompiling) {
        console.log('Compiling routes metadata and skipping mion server initialization...');
        compileRouter();
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
                server: '@mionkit/http',
                ...httpOptions.defaultResponseHeaders,
            });

            return dispatchRoute(path, rawBody, req.headers, responseHeaders, req, undefined)
                .then((routeResp: MionResponse) => reply(routeResp, responseHeaders))
                .catch((e: Error) => fail(req, responseHeaders, req.headers, e));
        },
        error(errReq) {
            const responseHeaders = new Headers({
                server: '@mionkit/http',
                ...httpOptions.defaultResponseHeaders,
            });
            return fail({headers: {}, body: ''}, responseHeaders, undefined, errReq, errReq.errno);
        },
    });

    process.on('SIGINT', function () {
        if (!isTest) console.log(`Shutting down mion server on ${url}`);
        server.stop(true);
        process.exit(0);
    });

    return server;
}

// only called whe there is an htt error or weird unhandled route errors
const fail = (
    httpReq: unknown,
    // TODO: fic issue with Native Bun Headers type messing with Node Headers type
    // requestHeaders: Headers = new Headers(),
    // responseHeaders: Headers,
    responseHeaders: any,
    requestHeaders: any = new Headers(),
    e?: Error,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    message = 'Unknown Error'
): Response => {
    const error = new RpcError({statusCode, publicMessage: message, originalError: e});
    const routeResponse = getResponseFromError(
        'httpRequest',
        'dispatch',
        '',
        httpReq,
        undefined,
        error,
        requestHeaders,
        responseHeaders
    );
    return reply(routeResponse, responseHeaders);
};

function reply(
    routeResp: MionResponse,
    // TODO: fic issue with Native Bun Headers type messing with Node Headers type
    // responseHeaders: Headers,
    responseHeaders: any
): Response {
    return new Response(routeResp.rawBody, {
        status: routeResp.statusCode,
        headers: responseHeaders,
    });
}
