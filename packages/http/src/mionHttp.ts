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
    getPublicErrorFromRouteError,
} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import type {HttpOptions, HttpRawServerContext} from './types';
import type {IncomingMessage, RequestListener, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {Obj, Headers, RawRequest, PublicError, RouterOptions, SharedDataFactory} from '@mionkit/router';
import {error} from 'console';

type Logger = typeof console | undefined;
type HeadersEntries = [string, string | boolean | number][];

let httpOptions: HttpOptions = {
    ...DEFAULT_HTTP_OPTIONS,
};
let defaultResponseContentType: string;
let defaultResponseHeaders: HeadersEntries = [];

export const initHttpApp = <App extends Obj, SharedData extends Obj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<HttpRawServerContext>>
) => {
    initRouter(app, handlersDataFactory, routerOptions);
    defaultResponseContentType = getRouterOptions().responseContentType;
};

export const startHttpServer = async (httpOptions_: Partial<HttpOptions> = {}): Promise<HttpServer | HttpsServer> => {
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
};

const httpRequestHandler: RequestListener = (httpReq: IncomingMessage, httpResponse: ServerResponse): void => {
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
            const error = new RouteError({statusCode: StatusCodes.REQUEST_TOO_LONG, publicMessage: 'Request Payload Too Large'});
            replyError(httpResponse, logger, error);
        }
    });

    httpReq.on('error', (e) => {
        hasError = true;
        const error = new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            publicMessage: 'Request Connection Error',
            originalError: e,
        });
        replyError(httpResponse, logger, error);
    });

    httpReq.on('end', () => {
        if (hasError) return;
        // monkey patching IncomingMessage to add required body once transfer has ended
        const body = Buffer.concat(bodyChunks).toString();
        (httpReq as any).body = body;

        dispatchRoute(path, {rawRequest: httpReq as any as RawRequest, rawResponse: httpResponse})
            .then((routeResponse) => {
                if (hasError) return;
                addResponseHeaders(httpResponse, routeResponse.headers);
                reply(httpResponse, logger, routeResponse.json, routeResponse.statusCode);
            })
            .catch((e) => {
                if (hasError) return;
                hasError = true;
                const error = new RouteError({
                    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                    publicMessage: 'Internal Error',
                    originalError: e,
                });
                replyError(httpResponse, logger, error);
            })
            .finally(() => {
                if (!httpResponse.writableEnded) httpResponse.end();
            });
    });

    httpResponse.on('error', (e) => {
        hasError = true;
        logger?.error({statusCode: 0, message: 'error responding to client'}, e);
    });
};

const reply = (httpResponse: ServerResponse, logger: Logger, json: string, statusCode: number, statusMessage?: string) => {
    if (httpResponse.writableEnded) {
        if (logger) {
            const mkError: RouteError = new RouteError({
                statusCode,
                publicMessage: 'response has ended but server is still trying to reply',
            });
            logger.error(mkError);
        }
        return;
    }
    if (statusMessage) httpResponse.statusMessage = statusMessage;
    httpResponse.statusCode = statusCode;
    httpResponse.setHeader('content-length', json.length);
    httpResponse.end(json);
};

const replyError = (httpResponse: ServerResponse, logger: Logger, routeError: RouteError) => {
    const publicError: PublicError = getPublicErrorFromRouteError(routeError);
    if (logger) logger.error(routeError);
    const jsonBody = getRouterOptions().bodyParser.stringify({errors: [publicError]});
    reply(httpResponse, logger, jsonBody, publicError.statusCode, publicError.name);
};

const addResponseHeaders = (httpResponse: ServerResponse, headers: Headers) => {
    Object.entries(headers).forEach(([key, value]) => httpResponse.setHeader(key, `${value}`));
};

const addResponseHeaderEntries = (httpResponse: ServerResponse, headerEntries: HeadersEntries) => {
    if (!headerEntries.length) return;
    headerEntries.forEach(([key, value]) => httpResponse.setHeader(key, `${value}`));
};
