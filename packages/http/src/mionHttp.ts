/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, dispatchRoute, dispatchRouteCallback, addStartHooks, addEndHooks} from '@mionkit/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import type {FullHttpOptions, HttpOptions} from './types';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import {Obj, SharedDataFactory, addDefaultGlobalOptions, getGlobalOptions, updateGlobalOptions} from '@mionkit/core';
import {HttpRawServerContext, HttpRequest, mionHooks} from '@mionkit/hooks';
import {DEFAULT_SERVER_OPTIONS} from './constants';

addDefaultGlobalOptions<HttpOptions>(DEFAULT_SERVER_OPTIONS);

export function initHttpRouter<App extends Obj, SharedData extends Obj>(
    app: App,
    sharedDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<FullHttpOptions<HttpRawServerContext>>
) {
    initRouter(app, sharedDataFactory, routerOptions);
    addStartHooks({httpConnectionHandler: mionHooks.mionHttpConnectionHook});
    addEndHooks({httpCloseConnection: mionHooks.mionHttpCloseConnectionHook});
}

export async function startHttpServer(httpOptions_: Partial<HttpOptions> = {}): Promise<HttpServer | HttpsServer> {
    const httpOptions = updateGlobalOptions<HttpOptions>(httpOptions_);

    const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
    const url = `${httpOptions.protocol}://localhost${port}`;
    console.log(`mion server running on ${url}`);

    return new Promise<HttpServer | HttpsServer>((resolve, reject) => {
        const server =
            httpOptions_.protocol === 'https'
                ? createHttps(httpOptions.options, httpRequestHandler)
                : createHttp(httpOptions.options, httpRequestHandler);
        server.on('error', (e) => {
            reject(e);
        });

        server.listen(httpOptions.port, () => {
            resolve(server);
        });

        process.on('SIGINT', function () {
            console.log(`Shutting down mion server on ${url}`);
            server.close(() => {
                process.exit(0);
            });
        });
    });
}

function httpRequestHandler(httpReq: IncomingMessage, httpResponse: ServerResponse): void {
    const httpOptions = getGlobalOptions<HttpOptions>();
    const path = httpReq.url || '/';
    httpResponse.setHeader('server', '@mionkit/http');

    // missing httpReq.body will be monkey patched by the httpConnectionHandler hook
    const rawCallContext: HttpRawServerContext = {rawRequest: httpReq as HttpRequest, rawResponse: httpResponse};
    if (httpOptions.useCallbacks) {
        dispatchRouteCallback(path, rawCallContext, (e, routeResponse) => {
            if (!httpResponse.writableEnded) httpResponse.end();
        });
    } else {
        dispatchRoute(path, rawCallContext).finally(() => {
            if (!httpResponse.writableEnded) httpResponse.end();
        });
    }
}
