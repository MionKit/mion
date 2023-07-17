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
    RouteError,
    generateRouteResponseFromOutsideError,
    dispatchRouteCallback,
} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import type {HttpOptions, HttpRawServerContext} from './types';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {Obj, Headers, RawRequest, RouterOptions, SharedDataFactory} from '@mionkit/router';

type Logger = typeof console | undefined;
type HeadersEntries = [string, string | boolean | number][];

let httpOptions: HttpOptions = {
    ...DEFAULT_HTTP_OPTIONS,
};
let defaultResponseContentType: string;
let defaultResponseHeaders: HeadersEntries = [];

export function resetHttpRouter() {
    httpOptions = {
        ...DEFAULT_HTTP_OPTIONS,
    };
    defaultResponseContentType = '';
    defaultResponseHeaders = [];
}

export function initHttpRouter<SharedData extends Obj>(
    sharedDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<HttpRawServerContext>>
) {
    initRouter(sharedDataFactory, routerOptions);
    defaultResponseContentType = getRouterOptions().responseContentType;
}

export async function startHttpServer(httpOptions_: Partial<HttpOptions> = {}): Promise<HttpServer | HttpsServer> {
    httpOptions = {
        ...httpOptions,
        ...httpOptions_,
    };

    defaultResponseHeaders = Object.entries(httpOptions.defaultResponseHeaders);

    const logger = httpOptions_.logger;

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    logger?.log(`mion server running on ${url}`);

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
            logger?.log(`Shutting down mion server on ${url}`);
            server.close(() => {
                process.exit(0);
            });
        });
    });
}

function httpRequestHandler(httpReq: IncomingMessage, httpResponse: ServerResponse): void {
    let hasError = false;
    const path = httpReq.url || '/';
    const logger = httpOptions.logger;
    let size = 0;
    const bodyChunks: any[] = [];

    httpResponse.setHeader('server', '@mionkit/http');
    httpResponse.setHeader('content-type', defaultResponseContentType);
    // here we could check that the client accepts application/json as response and abort
    // but this is gonna be true 99.999% of the time so is better to continue without checking it
    addResponseHeaderEntries(httpResponse, defaultResponseHeaders);

    httpReq.on('data', (data) => {
        bodyChunks.push(data);
        const chunkLength = bodyChunks[bodyChunks.length - 1].length;
        size += chunkLength;
        if (size > httpOptions.maxBodySize) {
            if (httpOptions.allowExceedMaxBodySize && httpOptions.allowExceedMaxBodySize(size, httpReq, httpResponse)) return;
            hasError = true;
            const routeResponse = generateRouteResponseFromOutsideError(
                undefined,
                StatusCodes.REQUEST_TOO_LONG,
                'Request Payload Too Large'
            );
            reply(httpResponse, logger, routeResponse.json, routeResponse.statusCode);
        }
    });

    httpReq.on('error', (e) => {
        hasError = true;
        const routeResponse = generateRouteResponseFromOutsideError(e, StatusCodes.BAD_REQUEST, 'Request Connection Error');
        reply(httpResponse, logger, routeResponse.json, routeResponse.statusCode);
    });

    httpReq.on('end', () => {
        if (hasError) return;
        // monkey patching IncomingMessage to add required body once transfer has ended
        const body = Buffer.concat(bodyChunks).toString();
        (httpReq as any).body = body;

        const rawContext = {rawRequest: httpReq as any as RawRequest, rawResponse: httpResponse};
        const success = (routeResponse) => {
            if (hasError) return;
            addResponseHeaders(httpResponse, routeResponse.headers);
            reply(httpResponse, logger, routeResponse.json, routeResponse.statusCode);
        };
        const fail = (e) => {
            if (hasError) return;
            hasError = true;
            const routeResponse = generateRouteResponseFromOutsideError(e);
            reply(httpResponse, logger, routeResponse.json, routeResponse.statusCode);
        };
        if (httpOptions.useCallbacks) {
            dispatchRouteCallback(path, rawContext, (e, routeResponse) => {
                if (e) {
                    fail(e);
                } else {
                    success(routeResponse);
                }
                if (!httpResponse.writableEnded) httpResponse.end();
            });
        } else {
            dispatchRoute(path, rawContext)
                .then((routeResponse) => success(routeResponse))
                .catch((e) => fail(e))
                .finally(() => {
                    if (!httpResponse.writableEnded) httpResponse.end();
                });
        }
    });

    httpResponse.on('error', (e) => {
        hasError = true;
        logger?.error({statusCode: 0, message: 'error responding to client'}, e);
    });
}

function reply(httpResponse: ServerResponse, logger: Logger, json: string, statusCode: number, statusMessage?: string) {
    if (httpResponse.writableEnded) {
        if (logger) {
            logger.error(
                new RouteError({
                    statusCode,
                    publicMessage: 'response has ended but server is still trying to reply',
                })
            );
        }
        return;
    }
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
