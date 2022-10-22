/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Context, MapObj, MkRouter, RouterOptions, SharedDataFactory, StatusCodes} from '@mikrokit/router';
import {createServer as createHttp, IncomingMessage, RequestListener, Server as HttpServer, ServerResponse} from 'http';
import {createServer as createHttps, Server as HttpsServer} from 'https';
import {CONTENT_TYPE_HEADER_NAME, DEFAULT_HTTP_OPTIONS, JSON_CONTENT_TYPE} from './constants';
import {HttpOptions} from './types';

let httpOptions: HttpOptions = {
    ...DEFAULT_HTTP_OPTIONS,
};

export type HttpRequest = IncomingMessage & {body: string};
export type HttpCallContext<App extends MapObj, SharedData extends MapObj> = Context<App, SharedData, HttpRequest>;

export const initHttpApp = <App extends MapObj, SharedData extends MapObj>(
    app: App,
    handlersDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<HttpRequest>>,
) => {
    type CallContext = HttpCallContext<App, SharedData>;
    MkRouter.initRouter(app, handlersDataFactory, routerOptions);
    const emptyContext: CallContext = {} as CallContext;
    return {emptyContext, startHttpServer};
};

const startHttpServer = async (httpOptions_: Partial<HttpOptions> = {}): Promise<HttpServer | HttpsServer> => {
    httpOptions = {
        ...httpOptions,
        ...httpOptions_,
    };

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    if (process.env.NODE_ENV !== 'production') {
        console.log(`MikroKit local development server running on ${url}`);
    } else {
        console.log(`MikroKit server running on ${url}`);
    }

    return new Promise((resolve, reject) => {
        const server =
            httpOptions.protocol === 'https'
                ? createHttps(httpOptions.options, httpRequestHandler)
                : createHttp(httpOptions.options, httpRequestHandler);
        server.listen(httpOptions.port, () => {
            resolve(server);
        });
    });
};

const httpRequestHandler: RequestListener = (httpReq: IncomingMessage, httpResponse: ServerResponse): void => {
    httpResponse.setHeader('server', 'mikrokit-http');
    httpReq.headers;
    let hasError = false;
    const path = httpReq.url || '';
    httpResponse.setHeader('Content-Type', 'application/json; charset=utf-8');

    const bodyChunks: Uint8Array[] = [];
    httpReq.on('data', (data: Uint8Array) => {
        bodyChunks.push(data);
        const size = bodyChunks.map((chunk) => chunk.length).reduce((s: number, c: number) => s + c, 0);
        if (size > httpOptions.maxBodySize) {
            hasError = true;
            replyError(httpResponse, StatusCodes.REQUEST_TOO_LONG, 'Request Payload Too Large');
        }
    });

    httpReq.on('error', (e) => {
        hasError = true;
        replyError(httpResponse, StatusCodes.BAD_REQUEST, 'Bad Request', e);
    });

    httpReq.on('end', () => {
        if (!hasError) {
            const body = Buffer.concat(bodyChunks).toString();
            const req = {...httpReq, body};

            MkRouter.runRoute(path, req)
                .then((routeReply) => {
                    if (hasError) return;
                    reply(httpResponse, routeReply.statusCode, routeReply.json);
                })
                .catch((e) => {
                    if (hasError) return;
                    hasError = true;
                    replyError(httpResponse, StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Error', e);
                })
                .finally(() => {
                    if (!httpResponse.writableFinished) httpResponse.end();
                });
        }
    });
};

const reply = (httpResponse: ServerResponse, statusCode: number, json: string) => {
    httpResponse.statusCode = statusCode;
    httpResponse.setHeader('Content-Length', json.length);
    httpResponse.write(json);
    httpResponse.end();
};

const replyError = (httpResponse: ServerResponse, statusCode: number, message: string, error?: Error) => {
    reply(httpResponse, statusCode, JSON.stringify({errors: [{statusCode: statusCode, message: error?.message || message}]}));
};
