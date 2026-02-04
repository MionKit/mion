/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DataViewSerializer, RpcError, SerializerModes} from '@mionkit/core';
import {dispatchRoute, getRouterFatalErrorResponse, resetRouter} from '@mionkit/router';
import type {MionHeaders, PlatformResponse} from '@mionkit/router';
import {Request, Response} from 'express';
import {DEFAULT_GOOGLE_CF_OPTIONS} from './constants';
import {GoogleCFOptions} from './types';
import {headersFromIncomingMessage, headersFromServerResponse} from './headers';

// ############# STATE #############

let googleCFOptions: Readonly<GoogleCFOptions> = {...DEFAULT_GOOGLE_CF_OPTIONS};

// ############# PUBLIC METHODS #############

export function resetGoogleCFOpts() {
    googleCFOptions = {...DEFAULT_GOOGLE_CF_OPTIONS};
    resetRouter();
}

export function setGoogleCFOpts(routerOptions?: Partial<GoogleCFOptions>) {
    googleCFOptions = {
        ...googleCFOptions,
        ...routerOptions,
    };
    return googleCFOptions;
}

export async function googleCFHandler(rawRequest: Request, rawResponse: Response): Promise<void> {
    // Express in Google Cloud Functions might parse the body automatically when Content-Type is application/json
    // We handle both cases: string body and already-parsed object body
    // For binary requests, we need to handle the raw buffer

    // TODO use its own express headers wrapper instead headers from record
    rawResponse.setHeader('server', '@mionkit');
    const reqHeaders = headersFromIncomingMessage(rawRequest);
    const respHeaders = headersFromServerResponse(rawResponse, googleCFOptions.defaultResponseHeaders);

    // Check content-type to determine if this is a binary request
    const contentType = rawRequest.headers['content-type'] || '';
    const isBinary = contentType.includes('application/octet-stream');
    // For binary requests, pass the Buffer directly (it's an ArrayBufferView)
    // Google Cloud Functions provides rawBody as a Buffer on the request object
    const rawBody = isBinary ? (rawRequest as any).rawBody : rawRequest.body;
    // GCF may auto-parse JSON body, so use json mode for parsed objects, stringifyJson for strings
    const reqBodyType = isBinary
        ? SerializerModes.binary
        : typeof rawBody === 'string'
          ? SerializerModes.stringifyJson
          : SerializerModes.json;

    try {
        const routeResponse = await dispatchRoute(
            rawRequest.path,
            rawBody,
            reqHeaders,
            respHeaders,
            rawRequest,
            rawResponse,
            reqBodyType
        );
        reply(routeResponse, rawResponse, respHeaders);
    } catch (err) {
        const error =
            err instanceof RpcError
                ? err
                : new RpcError({
                      publicMessage: 'Internal Error',
                      originalError: err as Error,
                      type: 'unknown-error',
                  });
        const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
        reply(routeResponse, rawResponse, respHeaders);
    }
}

// ############# PRIVATE METHODS #############

function reply(platformResp: PlatformResponse, resp: Response, respHeaders: MionHeaders): void {
    resp.status(platformResp.statusCode);
    const bodyType = platformResp.bodyType;
    switch (bodyType) {
        case SerializerModes.stringifyJson: {
            const buffer = Buffer.from(platformResp.body as string, 'utf8');
            resp.set('content-length', `${buffer.byteLength}`);
            // content-type already set by serializer
            resp.end(buffer);
            break;
        }
        case SerializerModes.json: {
            // Platform adapter stringifies the prepared body object
            const jsonString = JSON.stringify(platformResp.body);
            const buffer = Buffer.from(jsonString, 'utf8');
            resp.set('content-type', 'application/json; charset=utf-8');
            resp.set('content-length', `${buffer.byteLength}`);
            resp.end(buffer);
            break;
        }
        case SerializerModes.binary: {
            const serializer = platformResp.body as DataViewSerializer;
            resp.set('content-length', `${serializer.getLength()}`);
            // content-type already set by serializer
            resp.end(Buffer.from(serializer.getBufferView()));

            // Release buffer when response is finished
            const onFinish = () => serializer.markAsEnded();
            resp.on('finish', onFinish);
            resp.on('close', onFinish); // Fallback for aborted connection
            break;
        }
        default: {
            const error = new RpcError({
                publicMessage: 'unknown-mion-response-format',
                type: 'unknown-error',
                errorData: {bodyType},
            });
            unexpectedFail(resp, respHeaders, error);
        }
    }
}

function unexpectedFail(resp: Response, respHeaders: MionHeaders, error: RpcError<string>) {
    if (resp.writableEnded) return;
    const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
    reply(routeResponse, resp, respHeaders);
}
