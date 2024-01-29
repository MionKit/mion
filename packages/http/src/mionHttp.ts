/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getResponseFromError, resetRouter} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import type {NodeHttpOptions} from './types';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {MionResponse} from '@mionkit/router';
import {RpcError, StatusCodes} from '@mionkit/core';
import {headersFromIncomingMessage, headersFromServerResponse} from './headers';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<NodeHttpOptions> = {...DEFAULT_HTTP_OPTIONS};
const isTest = process.env.NODE_ENV === 'test';

// ############# PUBLIC METHODS #############

export function resetNodeHttpOpts() {
    httpOptions = {...DEFAULT_HTTP_OPTIONS};
    resetRouter();
}

export function setNodeHttpOpts(options?: Partial<NodeHttpOptions>) {
    httpOptions = {
        ...httpOptions,
        ...options,
    };

    return httpOptions;
}

export async function startNodeServer(options?: Partial<NodeHttpOptions>): Promise<HttpServer | HttpsServer> {
    if (options) setNodeHttpOpts(options);
    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    if (!isTest) console.log(`mion node server running on ${url}`);

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
    const nodeUrl = httpReq.url || '/';
    const queryIndex = nodeUrl.indexOf('?');
    const path = queryIndex === -1 ? nodeUrl : nodeUrl.substring(0, queryIndex);
    let size = 0;
    const bodyChunks: any[] = [];

    httpResponse.setHeader('server', '@mionkit/http');
    const reqHeaders = headersFromIncomingMessage(httpReq);
    const respHeaders = headersFromServerResponse(httpResponse, httpOptions.defaultResponseHeaders);

    const dispatchReply = (routeResponse: MionResponse) => {
        if (replied || httpResponse.writableEnded) return;
        replied = true;
        reply(httpResponse, routeResponse.rawBody, routeResponse.statusCode);
    };

    // only called whe there is an htt error or weird unhandled route errors
    const fail = (e?: Error, statusCode: StatusCodes = StatusCodes.INTERNAL_SERVER_ERROR, message = 'Unknown Error') => {
        if (replied || httpResponse.writableEnded) return;
        replied = true;
        const error = new RpcError({statusCode, publicMessage: message, originalError: e});
        const routeResponse = getResponseFromError(
            'httpRequest',
            'dispatch',
            '',
            httpReq,
            httpResponse,
            error,
            reqHeaders,
            respHeaders
        );
        reply(httpResponse, routeResponse.rawBody, routeResponse.statusCode);
    };

    httpReq.on('data', (data) => {
        bodyChunks.push(data);
        const chunkLength = bodyChunks[bodyChunks.length - 1].length;
        size += chunkLength;
        if (size > httpOptions.maxBodySize) {
            fail(undefined, StatusCodes.REQUEST_TOO_LONG, 'Request Payload Too Large');
        }
    });

    httpReq.on('error', (e) => {
        fail(e, StatusCodes.BAD_REQUEST, 'Request Connection Error');
    });

    httpReq.on('end', () => {
        if (replied) return;
        const reqRawBody = Buffer.concat(bodyChunks).toString();

        dispatchRoute(path, reqRawBody, reqHeaders, respHeaders, httpReq, httpResponse)
            .then((routeResponse) => dispatchReply(routeResponse))
            .catch((e) => fail(e));
    });

    httpResponse.on('error', (e) => {
        fail(e, StatusCodes.INTERNAL_SERVER_ERROR, 'Response Connection Error');
    });
}

function reply(httpResponse: ServerResponse, rawBody: string, statusCode: number, statusMessage?: string) {
    if (statusMessage) httpResponse.statusMessage = statusMessage;
    httpResponse.statusCode = statusCode;
    httpResponse.setHeader('content-length', rawBody.length);
    httpResponse.end(rawBody);
}
