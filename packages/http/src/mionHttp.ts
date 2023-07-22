/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    StatusCodes,
    initRouter,
    getRouterOptions,
    dispatchRoute,
    getResponseFromError,
    dispatchRouteCallback,
    resetRouter,
    RawHooksCollection,
    addStartHooks,
} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import type {HttpOptions, HttpRequest} from './types';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import {Obj, Headers, RawRequest, RouterOptions, SharedDataFactory, Response, CallContext, RouteError} from '@mionkit/router';

type HeadersEntries = [string, string | boolean | number][];

// ############# PRIVATE STATE #############

let httpOptions: HttpOptions;
let isInitialized = false;
let defaultResponseHeaders: HeadersEntries = [];
const isTest = process.env.NODE_ENV === 'test';

// ############# PUBLIC METHODS #############

export function resetHttpRouter() {
    httpOptions = undefined as any;
    defaultResponseHeaders = [];
    isInitialized = false;
    resetRouter();
}

export function initHttpRouter<Opts extends Partial<HttpOptions>>(options?: Opts) {
    if (isInitialized) throw new Error('Http router already initialized');
    addStartHooks(mionHttpHooks);
    httpOptions = initRouter({
        ...DEFAULT_HTTP_OPTIONS,
        ...options,
    });
    isInitialized = true;
}

export async function startHttpServer(): Promise<HttpServer | HttpsServer> {
    if (!isInitialized) throw new Error('Http router not initialized, call initHttpRouter before startHttpServer.');
    defaultResponseHeaders = Object.entries(httpOptions.defaultResponseHeaders);

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    if (!isTest) console.log(`mion server running on ${url}`);

    return new Promise<HttpServer | HttpsServer>((resolve, reject) => {
        const server =
            httpOptions.protocol === 'https'
                ? createHttps(httpOptions.options, requestHandler)
                : createHttp(httpOptions.options, requestHandler);
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

function requestHandler(httpReq: IncomingMessage, httpResponse: ServerResponse) {
    const path = httpReq.url || '/';
    (httpReq as any).body = '';

    const success = (routeResponse: Response) => {
        if (httpResponse.writableEnded) return;
        addResponseHeaders(httpResponse, routeResponse.headers);
        reply(httpResponse, routeResponse.json, routeResponse.statusCode);
    };

    const fail = (e?: Error, statusCode?: StatusCodes, message?: string) => {
        if (httpResponse.writableEnded) return;
        const routeResponse = getResponseFromError(e, statusCode, message);
        addResponseHeaders(httpResponse, routeResponse.headers);
        reply(httpResponse, routeResponse.json, routeResponse.statusCode);
    };

    if (httpOptions.useCallbacks) {
        dispatchRouteCallback(path, httpReq as HttpRequest, httpResponse, (e, routeResponse) => {
            if (e) fail(e);
            else if (routeResponse) success(routeResponse);
            else fail(undefined, StatusCodes.INTERNAL_SERVER_ERROR, 'No response from Router');
        });
    } else {
        dispatchRoute(path, httpReq as HttpRequest, httpResponse)
            .then((routeResponse) => success(routeResponse))
            .catch((e) => fail(e));
    }
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

// ############# Http Request context handler #############

async function httpRawRequestHandler(ctx, httpReq: HttpRequest, httpResponse: ServerResponse, opts: HttpOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let replied = false;
        let size = 0;
        const bodyChunks: any[] = [];

        httpResponse.setHeader('server', '@mionkit/http');
        // here we could check that the client accepts application/json as response and abort
        // but this is gonna be true 99.999% of the time so is better to continue without checking it
        addResponseHeaderEntries(httpResponse, defaultResponseHeaders);

        httpReq.on('data', (data) => {
            bodyChunks.push(data);
            const chunkLength = bodyChunks[bodyChunks.length - 1].length;
            size += chunkLength;
            if (size > opts.maxBodySize) {
                if (opts.allowExceedMaxBodySize && opts.allowExceedMaxBodySize(size, httpReq, httpResponse)) return;
                if (replied) return;
                replied = true;
                reject(new RouteError({statusCode: StatusCodes.REQUEST_TOO_LONG, publicMessage: 'Request Payload Too Large'}));
            }
        });

        httpReq.on('error', (e) => {
            if (replied) return;
            replied = true;
            reject(new RouteError({statusCode: StatusCodes.BAD_REQUEST, publicMessage: 'Request Connection Error'}));
        });

        httpReq.on('end', () => {
            if (replied) return;
            replied = true;
            // monkey patching IncomingMessage to add required body once transfer has ended
            const body = Buffer.concat(bodyChunks).toString();
            (httpReq as any).body = body;
            resolve();
        });

        httpResponse.on('error', (e) => {
            reject(new RouteError({statusCode: StatusCodes.INTERNAL_SERVER_ERROR, publicMessage: 'Response Connection Error'}));
        });
    });
}

const mionHttpHooks = {
    httpRawRequestHandler: {
        rawRequestHandler: httpRawRequestHandler,
    },
} satisfies RawHooksCollection<HttpRequest, ServerResponse, HttpOptions>;
