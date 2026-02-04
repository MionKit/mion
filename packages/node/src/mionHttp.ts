/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getRouterFatalErrorResponse, resetRouter} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import type {NodeHttpOptions} from './types';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {MionHeaders, MionResponse} from '@mionkit/router';
import {getENV, SerializerModes} from '@mionkit/core';
import {RpcError} from '@mionkit/core';
import {headersFromIncomingMessage, headersFromServerResponse} from './headers';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<NodeHttpOptions> = {...DEFAULT_HTTP_OPTIONS};

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
    const isTest = getENV('NODE_ENV') === 'test';
    const isCompiling = getENV('MION_COMPILE') === 'true';

    if (options) setNodeHttpOpts(options);
    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    if (!isTest && !isCompiling) console.log(`mion node server running on ${url}`);

    return new Promise<HttpServer | HttpsServer>((resolve, reject) => {
        const server =
            httpOptions.protocol === 'https'
                ? createHttps(httpOptions.options, httpRequestHandler)
                : createHttp(httpOptions.options, httpRequestHandler);

        if (isCompiling) {
            console.log('Compiling routes metadata and skipping mion server initialization...');
            return resolve(server);
        }

        server.on('error', (e) => {
            reject(e);
        });

        server.listen(httpOptions.port, () => {
            resolve(server);
        });

        const shutdownHandler = function () {
            if (!isTest) console.log(`Shutting down mion server on ${url}`);
            server.close(() => {
                process.exit(0);
            });
        };

        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);
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

    httpResponse.setHeader('server', '@mionkit');
    const reqHeaders = headersFromIncomingMessage(httpReq);
    const respHeaders = headersFromServerResponse(httpResponse, httpOptions.defaultResponseHeaders);

    httpReq.on('data', (data) => {
        bodyChunks.push(data);
        const chunkLength = bodyChunks[bodyChunks.length - 1].length;
        size += chunkLength;
        if (size > httpOptions.maxBodySize && !replied) {
            replied = true;
            const error = new RpcError({
                publicMessage: 'Payload Too Large',
                type: 'request-payload-too-large',
            });
            fatalFail(httpResponse, respHeaders, error);
        }
    });

    httpReq.on('error', (e) => {
        if (replied) return;
        replied = true;
        const error = new RpcError({
            publicMessage: 'Connection Error',
            type: 'request-connection-error',
            originalError: e,
        });
        fatalFail(httpResponse, respHeaders, error);
    });

    httpReq.on('end', () => {
        if (replied) return;
        const buffer = Buffer.concat(bodyChunks);
        // Check content-type to determine if this is a binary request
        const contentType = httpReq.headers['content-type'] || '';
        const isBinary = contentType.includes('application/octet-stream');
        const reqRawBody = isBinary ? buffer : buffer.toString();
        const reqBodyType = isBinary ? SerializerModes.binary : SerializerModes.stringifyJson;

        dispatchRoute(path, reqRawBody, reqHeaders, respHeaders, httpReq, httpResponse, reqBodyType)
            .then((mionResponse: MionResponse) => {
                if (replied || httpResponse.writableEnded) return;
                replied = true;
                reply(httpResponse, mionResponse);
            })
            .catch((e) => {
                // this is only called when there is an unhandled error in the dispatchRoute
                // which is a pretty unlikely scenario
                if (replied) return;
                replied = true;
                const error = new RpcError({
                    publicMessage: 'Unknown Error',
                    type: 'unknown-error',
                    originalError: e,
                });
                fatalFail(httpResponse, respHeaders, error);
            });
    });

    httpResponse.on('error', (e) => {
        if (replied) return;
        replied = true;
        const error = new RpcError({
            publicMessage: 'Connection Error',
            type: 'response-connection-error',
            originalError: e,
        });
        fatalFail(httpResponse, respHeaders, error);
    });
}

// only called when there is an http error or weird unhandled route errors
function fatalFail(httpResponse: ServerResponse, respHeaders: MionHeaders, error: RpcError<string>) {
    if (httpResponse.writableEnded) return;
    const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
    reply(httpResponse, routeResponse);
}

function reply(httpResp: ServerResponse, mionResp: MionResponse) {
    httpResp.statusCode = mionResp.statusCode;
    const bodyType = mionResp.bodyType;
    switch (bodyType) {
        case SerializerModes.stringifyJson: {
            const buffer = Buffer.from(mionResp.rawBody as string, 'utf8');
            httpResp.setHeader('content-length', buffer.byteLength);
            // content-type already set by serializer
            httpResp.end(buffer);
            break;
        }
        case SerializerModes.json: {
            // Platform adapter stringifies the prepared body object
            const jsonString = JSON.stringify(mionResp.body);
            const buffer = Buffer.from(jsonString, 'utf8');
            httpResp.setHeader('content-length', buffer.byteLength);
            httpResp.end(buffer);
            break;
        }
        case SerializerModes.binary: {
            const serializer = mionResp.binSerializer!;
            httpResp.setHeader('content-length', serializer.getLength());
            // content-type already set by serializer
            httpResp.end(serializer.getBufferView());
            // Release buffer when response is finished
            const onFinish = () => serializer.markAsEnded();
            httpResp.on('finish', onFinish);
            httpResp.on('close', onFinish); // Fallback for aborted connection
            break;
        }
        default: {
            const error = new RpcError({
                publicMessage: 'unknown-mion-response-format',
                type: 'unknown-error',
                errorData: {bodyType},
            });
            fatalFail(httpResp, mionResp.headers, error);
        }
    }
}
