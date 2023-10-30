/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {
    dispatchRoute,
    getResponseFromError,
    headersFromIncomingMessage,
    headersFromServerResponse,
    resetRouter,
} from '@mionkit/router';
import type {MionResponse} from '@mionkit/router';
import {Request, Response} from 'express';
import {DEFAULT_GOOGLE_CF_OPTIONS} from './constants';
import {GoogleCFOptions} from '..';

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
    const respHeaders = headersFromServerResponse(rawResponse, googleCFOptions.defaultResponseHeaders);

    try {
        const routeResponse = await dispatchRoute(rawRequest.path, rawBody, rawRequest, rawResponse, reqHeaders, respHeaders);
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
        reply(routeResponse, rawResponse);
    }
}

// ############# PRIVATE METHODS #############

function reply(routeResponse: MionResponse, resp: Response): void {
    resp.set('content-length', `${routeResponse.rawBody.length}`);
    resp.status(routeResponse.statusCode).end(routeResponse.rawBody);
}
