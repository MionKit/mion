/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {dispatchRoute, getResponseFromError, resetRouter} from '@mionkit/router';
import type {MionResponse} from '@mionkit/router';
import {Request, Response} from 'express';
import {DEFAULT_GOOGLE_CF_OPTIONS} from './constants';
import {GoogleCFOptions} from './types';

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
    // body is already parsed by express in gfc
    const rawBody = rawRequest.body || '';
    // TODO use its own express headers wrapper instead headers from record
    rawResponse.setHeader('server', '@mionkit/gcf');
    const reqHeaders = headersFromIncomingMessage(rawRequest);
    const respHeaders = new Headers(googleCFOptions.defaultResponseHeaders);

    try {
        const routeResponse = await dispatchRoute(rawRequest.path, rawBody, reqHeaders, respHeaders, rawRequest, rawResponse);
        respHeaders.forEach((value, name) => rawResponse.setHeader(name, value));
        reply(routeResponse, rawResponse);
    } catch (err) {
        const error = new RpcError({statusCode: 500, publicMessage: 'Internal Error', originalError: err as Error});
        const routeResponse = getResponseFromError(
            rawRequest.path,
            'dispatchRoute',
            rawBody,
            rawRequest,
            rawResponse,
            error,
            reqHeaders,
            respHeaders
        );
        respHeaders.forEach((value, name) => rawResponse.setHeader(name, value));
        reply(routeResponse, rawResponse);
    }
}

// ############# PRIVATE METHODS #############

function reply(routeResponse: MionResponse, resp: Response): void {
    resp.set('content-length', `${routeResponse.rawBody.length}`);
    resp.status(routeResponse.statusCode).end(routeResponse.rawBody);
}

function headersFromIncomingMessage(request: Request): Headers {
    const reqHeaders = new Headers();

    // Iterate over each header in the Express.js request object
    for (const [name, value] of Object.entries(request.headers)) {
        if (!value) continue;
        // If the header is an array, iterate over its values
        if (Array.isArray(value)) {
            for (const val of value) {
                reqHeaders.append(name, val);
            }
        } else {
            // If it's not an array, assume it's a string
            reqHeaders.append(name, value);
        }
    }

    return reqHeaders;
}
