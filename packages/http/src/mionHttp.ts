/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, dispatchRoute, getResponseFromError, dispatchRouteCallback, resetRouter} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import type {HttpOptions} from './types';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {Headers, RawRequest, Response} from '@mionkit/router';
import {StatusCodes} from '@mionkit/core';

type HeadersEntries = [string, string | boolean | number][];

// ############# PRIVATE STATE #############

let httpOptions: Readonly<HttpOptions> = {...DEFAULT_HTTP_OPTIONS};
let defaultResponseHeaders: HeadersEntries = [];
const isTest = process.env.NODE_ENV === 'test';

// ############# PUBLIC METHODS #############

export function resetHttpRouter() {
    httpOptions = {...DEFAULT_HTTP_OPTIONS};
    defaultResponseHeaders = [];
    resetRouter();
}

export function initHttpRouter<Opts extends Partial<HttpOptions>>(options?: Opts) {
    httpOptions = initRouter({
        ...httpOptions,
        ...options,
    });
}

export async function startHttpServer(): Promise<HttpServer | HttpsServer> {
    defaultResponseHeaders = Object.entries(httpOptions.defaultResponseHeaders);

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    if (!isTest) console.log(`mion server running on ${url}`);

    return new Promise<HttpServer | HttpsServer>((resolve, reject) => {
        const server =
            httpOptions.protocol === 'https'
                ? createHttps(httpOptions.options, httpRequestHandler)
                : createHttp(httpOptions.options, httpRequestHandler);
        server.on('error', (e) => {
            reject(e);
        });

        server.listen(httpOptions.port, () => {
            resolve(server);
        });

        process.on('SIGINT', function () {
            if (!isTest) console.log(`Shutting down mion server on ${url}`);
            server.close(() => {
                process.exit(0);
            });
        });
    });
}

// ############# PRIVATE METHODS #############

function httpRequestHandler(httpReq: IncomingMessage, httpResponse: ServerResponse): void {
    let replied = false;
    const path = httpReq.url || '/';
    let size = 0;
    const bodyChunks: any[] = [];

    httpResponse.setHeader('server', '@mionkit/http');
    // here we could check that the client accepts application/json as response and abort
    // but this is gonna be true 99.999% of the time so is better to continue without checking it
    addResponseHeaderEntries(httpResponse, defaultResponseHeaders);

    const success = (routeResponse: Response) => {
        if (replied || httpResponse.writableEnded) return;
        replied = true;
        addResponseHeaders(httpResponse, routeResponse.headers);
        reply(httpResponse, routeResponse.json, routeResponse.statusCode);
    };

    const fail = (e?: Error, statusCode?: StatusCodes, message?: string) => {
        if (replied || httpResponse.writableEnded) return;
        replied = true;
        const routeResponse = getResponseFromError(e, statusCode, message);
        addResponseHeaders(httpResponse, routeResponse.headers);
        reply(httpResponse, routeResponse.json, routeResponse.statusCode);
    };

    httpReq.on('data', (data) => {
        bodyChunks.push(data);
        const chunkLength = bodyChunks[bodyChunks.length - 1].length;
        size += chunkLength;
        if (size > httpOptions.maxBodySize) {
            if (httpOptions.allowExceedMaxBodySize && httpOptions.allowExceedMaxBodySize(size, httpReq, httpResponse)) return;
            fail(undefined, StatusCodes.REQUEST_TOO_LONG, 'Request Payload Too Large');
        }
    });

    httpReq.on('error', (e) => {
        fail(e, StatusCodes.BAD_REQUEST, 'Request Connection Error');
    });

    httpReq.on('end', () => {
        if (replied) return;
        // monkey patching IncomingMessage to add required body once transfer has ended
        const body = Buffer.concat(bodyChunks).toString();
        (httpReq as any).body = body;

        if (httpOptions.useCallbacks) {
            dispatchRouteCallback(path, httpReq as any as RawRequest, httpResponse, (e, routeResponse) => {
                if (e) fail(e);
                else if (routeResponse) success(routeResponse);
                else fail(undefined, StatusCodes.INTERNAL_SERVER_ERROR, 'No response from Router');
            });
        } else {
            dispatchRoute(path, httpReq as any as RawRequest, httpResponse)
                .then((routeResponse) => success(routeResponse))
                .catch((e) => fail(e));
        }
    });

    httpResponse.on('error', (e) => {
        fail(e, StatusCodes.INTERNAL_SERVER_ERROR, 'Response Connection Error');
    });
}

function reply(httpResponse: ServerResponse, json: string, statusCode: number, statusMessage?: string) {
    if (statusMessage) httpResponse.statusMessage = statusMessage;
    httpResponse.statusCode = statusCode;
    httpResponse.setHeader('content-length', json.length);
    httpResponse.end(json);
}

function addResponseHeaders(httpResponse: ServerResponse, headers: Headers) {
    Object.entries(headers).forEach(([key, value]) => httpResponse.setHeader(key, `${value}`));
}

function addResponseHeaderEntries(httpResponse: ServerResponse, headerEntries: HeadersEntries) {
    if (!headerEntries.length) return;
    headerEntries.forEach(([key, value]) => httpResponse.setHeader(key, `${value}`));
}
