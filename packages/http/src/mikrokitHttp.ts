/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Context, MapObj, MkError, MkRequest, MkRouter, RouterOptions, SharedDataFactory, StatusCodes} from '@mikrokit/router';
import {createServer as createHttp, IncomingMessage, RequestListener, Server as HttpServer, ServerResponse} from 'http';
import {createServer as createHttps, Server as HttpsServer} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants';
import {HttpOptions} from './types';

type Logger = typeof console | undefined;

let httpOptions: HttpOptions = {
    ...DEFAULT_HTTP_OPTIONS,
};
const defaultResponseHeaders: {key: string; value: string}[] = [];

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
    return {emptyContext, startHttpServer, MkRouter};
};

const startHttpServer = async (httpOptions_: Partial<HttpOptions> = {}): Promise<HttpServer | HttpsServer> => {
    httpOptions = {
        ...httpOptions,
        ...httpOptions_,
    };

    Object.entries(httpOptions.defaultResponseHeaders).forEach(([key, value]) => defaultResponseHeaders.push({key, value}));

    const logger = httpOptions_.logger;

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    logger?.log(`MikroKit server running on ${url}`);

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
            logger?.log(`Shutting down MikroKit server on ${url}`);
            server.close();
            process.exit(0);
        });
    });
};

const httpRequestHandler: RequestListener = (httpReq: IncomingMessage, httpResponse: ServerResponse): void => {
    let hasError = false;
    const path = httpReq.url || '/';
    const logger = httpOptions.logger;
    let size = 0;
    const bodyChunks: any[] = [];

    httpReq.on('data', (data) => {
        bodyChunks.push(data);
        const chunkLength = bodyChunks[bodyChunks.length - 1].length;
        size += chunkLength;
        if (size > httpOptions.maxBodySize) {
            if (httpOptions.allowExceedMaxBodySize && httpOptions.allowExceedMaxBodySize(size, httpReq, httpResponse)) return;
            hasError = true;
            replyError(httpResponse, logger, StatusCodes.REQUEST_TOO_LONG, 'Request Payload Too Large');
        }
    });

    httpReq.on('error', (e) => {
        hasError = true;
        replyError(httpResponse, logger, StatusCodes.BAD_REQUEST, 'Bad Request', e);
    });

    httpReq.on('end', () => {
        if (hasError) return;
        const body = Buffer.concat(bodyChunks).toString();
        (httpReq as any).body = body;

        MkRouter.runRoute_(path, {req: httpReq as any as MkRequest})
            .then((routeReply) => {
                if (hasError) return;
                reply(httpResponse, logger, routeReply.json, routeReply.statusCode);
            })
            .catch((e) => {
                if (hasError) return;
                hasError = true;
                replyError(httpResponse, logger, StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Error');
            })
            .finally(() => {
                if (!httpResponse.writableEnded) httpResponse.end();
            });
    });

    httpResponse.on('error', (e) => {
        hasError = true;
        logger?.error({statusCode: 0, message: 'error responding to client'}, e);
    });

    httpResponse.setHeader('server', '@mikrokit/http');
    httpResponse.setHeader('content-type', 'application/json; charset=utf-8');
    // here we could check that the client accepts application/json as response and abort
    // but this is gonna be true 99.999% of the time so is better to continue without checking it
    if (defaultResponseHeaders.length) defaultResponseHeaders.forEach(({key, value}) => httpResponse.setHeader(key, value));
};

const reply = (
    httpResponse: ServerResponse,
    logger: Logger,
    json: string,
    statusCode: number,
    statusMessage?: string,
    e?: Error,
) => {
    if (httpResponse.writableEnded) {
        if (logger) {
            const mkError: MkError = {statusCode, message: statusMessage || 'no status message'};
            logger.error({statusCode: 0, message: 'response has ended but server is still trying to reply'}, mkError, json, e);
        }
        return;
    }
    if (statusMessage) httpResponse.statusMessage = statusMessage;
    httpResponse.statusCode = statusCode;
    httpResponse.setHeader('content-length', json.length);
    httpResponse.write(json);
    httpResponse.end();
};

const replyError = (httpResponse: ServerResponse, logger: Logger, statusCode: number, statusMessage: string, e?: Error) => {
    const mkError: MkError = {statusCode, message: statusMessage};
    if (logger) e ? logger.error(mkError, e) : logger.error(mkError);
    const jsonBody = JSON.stringify({errors: [mkError]});
    reply(httpResponse, logger, jsonBody, statusCode, statusMessage, e);
};
