/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    Context,
    Headers,
    Obj,
    RawServerCallContext,
    RouteError,
    StatusCodes,
    addDefaultGlobalOptions,
    getCallContext,
    getGlobalOptions,
    statusCodeToReasonPhrase,
} from '@mionkit/core';
import {IncomingMessage, ServerResponse} from 'http';
import {HookDef} from './types';

export type HttpRequest = IncomingMessage & {body: string};
export type HttpRawServerContext = RawServerCallContext<HttpRequest, ServerResponse>;
export type HttpCallContext<SharedData extends Obj> = Context<SharedData, HttpRawServerContext>;

export type HttpConnectionOptions = {
    /** max request body size in Bytes*/
    maxBodySize: number;
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: Headers;
};

export const DEFAULT_HTTP_CONNECTION_OPTIONS = addDefaultGlobalOptions<HttpConnectionOptions>({
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: 256000, // 256KB
    defaultResponseHeaders: {},
});

/** Handles http connection, and fills the raw request body */
export const mionHttpConnectionHook = {
    isInternal: true,
    hook(app, context: HttpCallContext<any> | undefined) {
        const {rawCallContext} = context || getCallContext();
        const httpReq = rawCallContext.rawRequest as HttpRequest;
        const httpResponse = rawCallContext.rawResponse as ServerResponse;

        let hasError = false;
        let size = 0;
        const bodyChunks: any[] = [];
        const {maxBodySize} = getGlobalOptions<HttpConnectionOptions>();

        return new Promise<void>((resolve, reject) => {
            httpReq.on('data', (data) => {
                bodyChunks.push(data);
                const chunkLength = bodyChunks[bodyChunks.length - 1].length;
                size += chunkLength;
                if (size > maxBodySize) {
                    hasError = true;
                    reject(
                        new RouteError({
                            statusCode: StatusCodes.REQUEST_TOO_LONG,
                            publicMessage: 'Request Payload Too Large',
                        })
                    );
                }
            });

            httpReq.on('error', (e) => {
                hasError = true;
                reject(
                    new RouteError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        publicMessage: 'Request Connection Error',
                        originalError: e,
                    })
                );
            });

            httpReq.on('end', () => {
                if (hasError) return;
                // monkey patching IncomingMessage to add required body used by the router
                const body = Buffer.concat(bodyChunks).toString();
                httpReq.body = body;
                resolve();
            });

            httpResponse.on('error', (e) => {
                hasError = true;
                reject(
                    new RouteError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        publicMessage: 'Error responding to client',
                        originalError: e,
                    })
                );
            });
        });
    },
} satisfies HookDef;

/** Ends the http connection and sends data to client.  */
export const mionHttpCloseConnectionHook = {
    isInternal: true,
    hook(app, context: HttpCallContext<any> | undefined) {
        const {rawCallContext, response} = context || getCallContext();
        const httpResponse: ServerResponse = rawCallContext.rawResponse as any;
        const {defaultResponseHeaders} = getGlobalOptions<HttpConnectionOptions>();
        addDefaultResponseHeaders(httpResponse, defaultResponseHeaders);
        addDefaultResponseHeaders(httpResponse, response.headers);

        const statusMessage = statusCodeToReasonPhrase[response.statusCode];
        if (statusMessage) httpResponse.statusMessage = statusMessage;
        httpResponse.statusCode = response.statusCode;
        httpResponse.setHeader('content-length', response.json.length);
        httpResponse.end(response.json);
    },
} satisfies HookDef;

function addDefaultResponseHeaders(httpResponse: ServerResponse, headers: Headers) {
    Object.entries(headers).forEach(([key, value]) => httpResponse.setHeader(key, `${value}`));
}
