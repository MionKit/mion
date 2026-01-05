/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {dispatchRoute, getPlatformErrorResponse, resetRouter} from '@mionkit/router';
import type {MionHeaders, MionResponse} from '@mionkit/router';
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

    // TODO use its own express headers wrapper instead headers from record
    rawResponse.setHeader('server', '@mionkit');
    const reqHeaders = headersFromIncomingMessage(rawRequest);
    const respHeaders = headersFromServerResponse(rawResponse, googleCFOptions.defaultResponseHeaders);

    try {
        const routeResponse = await dispatchRoute(
            rawRequest.path,
            rawRequest.body,
            reqHeaders,
            respHeaders,
            rawRequest,
            rawResponse
        );
        reply(routeResponse, rawResponse);
    } catch (err) {
        const error =
            err instanceof RpcError
                ? err
                : new RpcError({
                      publicMessage: 'Internal Error',
                      originalError: err as Error,
                      type: 'unknown-error',
                  });
        const routeResponse = getPlatformErrorResponse(error, respHeaders);
        reply(routeResponse, rawResponse);
    }
}

// ############# PRIVATE METHODS #############

function reply(mionResp: MionResponse, resp: Response): void {
    resp.status(mionResp.statusCode);
    const bodyType = mionResp.bodyType;
    switch (bodyType) {
        case 'J': {
            const buffer = Buffer.from(mionResp.rawBody as string, 'utf8');
            resp.set('content-length', `${buffer.byteLength}`);
            // content-type already set by serializer
            resp.end(buffer);
            break;
        }
        case 'B': {
            const serializer = mionResp.binSerializer!;
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
            unexpectedFail(resp, mionResp.headers, error);
        }
    }
}

function unexpectedFail(resp: Response, respHeaders: MionHeaders, error: RpcError<string>) {
    if (resp.writableEnded) return;
    const routeResponse = getPlatformErrorResponse(error, respHeaders);
    reply(routeResponse, resp);
}
