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
    RawRequest,
    Response as MionResponse,
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
        ...httpOptions.options,
        async fetch(req) {
            const path = req.url || '/';
            // monkey patching Bun Request to fit mion's RawRequest
            (req as any).body = req.body ? await Bun.readableStreamToText(req.body) : '';
            (req as any).headers = req.headers.toJSON();

            return dispatchRoute(path, req as any as RawRequest)
                .then((routeResp) => reply(routeResp))
                .catch((e) => fail(req as any as RawRequest, e));
        },
        error(errReq) {
            return fail({headers: {}, body: ''}, errReq, errReq.errno);
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
    httpReq: RawRequest,
    e?: Error,
    statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR,
    message = 'Unknown Error'
): Response => {
    const error = new RpcError({statusCode, publicMessage: message, originalError: e});
    const routeResponse = getResponseFromError('httpRequest', 'dispatch', httpReq, undefined, error);
    return reply(routeResponse);
};

function reply(routeResp: MionResponse): Response {
    return new Response(routeResp.json, {
        status: routeResp.statusCode,
        headers: {
            server: '@mionkit/http',
            ...httpOptions.defaultResponseHeaders,
            ...routeResp.headers,
        },
    });
}
