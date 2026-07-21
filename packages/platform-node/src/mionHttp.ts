/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getRouterFatalErrorResponse, resetRouter, decodeQueryBody, setPlatformConfig} from '@mionjs/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants.ts';
import type {NodeHttpOptions} from './types.ts';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {MionHeaders, MionResponse} from '@mionjs/router';
import {getENV, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError} from '@mionjs/core';
import {headersFromIncomingMessage, headersFromServerResponse} from './headers.ts';

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

    if (options) setNodeHttpOpts(options);
    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    if (!isTest)
        console.log(`mion node server running on ${url}`, {
            port: httpOptions.port,
            httpOptions,
        });

    return new Promise<HttpServer | HttpsServer>((resolve, reject) => {
        const server =
            httpOptions.protocol === 'https'
                ? createHttps(httpOptions.options, httpRequestHandler)
                : createHttp(httpOptions.options, httpRequestHandler);

        server.on('error', (e) => {
            reject(e);
        });

        server.listen(httpOptions.port, () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const {options: _nativeOpts, ...serializableConfig} = httpOptions;
            setPlatformConfig(serializableConfig);
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

// exported as can be used in some server to proxy node requests
export function httpRequestHandler(httpReq: IncomingMessage, httpResponse: ServerResponse): void {
    let replied = false;
    const nodeUrl = httpReq.url || '/';
    const queryIndex = nodeUrl.indexOf('?');
    const path = queryIndex === -1 ? nodeUrl : nodeUrl.substring(0, queryIndex);
    const urlQuery = queryIndex === -1 ? undefined : nodeUrl.substring(queryIndex + 1);
    let size = 0;
    const bodyChunks: any[] = [];

    httpResponse.setHeader('server', '@mionjs');
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

    httpReq.on('end', async () => {
        if (replied) return;
        const buffer = Buffer.concat(bodyChunks);
        const contentType = httpReq.headers['content-type'] || '';
        const isBinary = contentType.startsWith('application/octet-stream');
        let reqRawBody: any = isBinary ? buffer : buffer.toString();
        let reqBodyType: SerializerCode = isBinary ? SerializerModes.binary : SerializerModes.stringifyJson;
        const queryBody = decodeQueryBody(urlQuery, reqRawBody || undefined);
        if (queryBody) {
            reqRawBody = queryBody.rawBody;
            reqBodyType = queryBody.bodyType;
        }

        try {
            const mionResponse = await dispatchRoute(
                path,
                reqRawBody,
                reqHeaders,
                respHeaders,
                httpReq,
                httpResponse,
                reqBodyType,
                urlQuery
            );
            if (replied || httpResponse.writableEnded) return;
            replied = true;
            reply(httpResponse, mionResponse);
        } catch (e) {
            if (replied) return;
            replied = true;
            const error = new RpcError({
                publicMessage: 'Unknown Error',
                type: 'unknown-error',
                originalError: e as Error,
            });
            fatalFail(httpResponse, respHeaders, error);
        }
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
    const bodyType = mionResp.serializer;
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
