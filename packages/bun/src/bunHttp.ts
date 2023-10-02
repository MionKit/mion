/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    initRouter,
    dispatchRoute,
    getResponseFromError,
    resetRouter,
    MionResponse as MionResponse,
    MionReadonlyHeaders,
} from '@mionkit/router';
import {DEFAULT_BUN_HTTP_OPTIONS} from './constants';
import type {BunHttpOptions} from './types';
import {RpcError, StatusCodes} from '@mionkit/core';
import {Server} from 'bun';

export function resetBunHttpRouter() {
    httpOptions = {...DEFAULT_BUN_HTTP_OPTIONS};
    resetRouter();
}

export function initBunHttpRouter<Opts extends Partial<BunHttpOptions>>(options?: Opts) {
    httpOptions = initRouter({
        ...httpOptions,
        ...options,
    });
}

// ############# PRIVATE STATE #############

let httpOptions: Readonly<BunHttpOptions> = {...DEFAULT_BUN_HTTP_OPTIONS};
const isTest = process.env.NODE_ENV === 'test';

export function startBunHttpServer(): Server {
    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `http://localhost${port}`;
    if (!isTest) console.log(`mion server running on ${url}`);

    const server = Bun.serve({
        maxRequestBodySize: httpOptions.maxBodySize,
        port: httpOptions.port,
        ...httpOptions.options,
        async fetch(req) {
            const path = req.url || '/';

            const jsonBody = req.body ? await Bun.readableStreamToText(req.body) : '';
            const responseHeaders = new Headers({
                server: '@mionkit/http',
                ...httpOptions.defaultResponseHeaders,
            });

            return dispatchRoute(path, jsonBody, req, undefined, req.headers as MionReadonlyHeaders, responseHeaders)
                .then((routeResp) => reply(routeResp, responseHeaders))
                .catch((e) => fail(req, responseHeaders, e));
        },
        error(errReq) {
            console.log('Bun error ====> ', errReq);
            const responseHeaders = new Headers({
                server: '@mionkit/http',
                ...httpOptions.defaultResponseHeaders,
            });
            return fail({headers: {}, body: ''}, responseHeaders, errReq, errReq.errno);
        },
    });

    process.on('SIGINT', function () {
        if (!isTest) console.log(`Shutting down mion server on ${url}`);
        server.stop(true);
        process.exit(0);
    });

    console.log('server', server);

    return server;
}

// only called whe there is an htt error or weird unhandled route errors
const fail = (
    httpReq: unknown,
    responseHeaders: Headers,
    e?: Error,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    message = 'Unknown Error'
): Response => {
    const error = new RpcError({statusCode, publicMessage: message, originalError: e});
    const routeResponse = getResponseFromError('httpRequest', 'dispatch', '', httpReq, undefined, error);
    return reply(routeResponse, responseHeaders);
};

function reply(routeResp: MionResponse, responseHeaders: Headers): Response {
    return new Response(routeResp.rawBody, {
        status: routeResp.statusCode,
        headers: responseHeaders,
    });
}
