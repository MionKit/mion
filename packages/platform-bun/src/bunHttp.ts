/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  dispatchWithContext,
  createCallContext,
  getRouterFatalErrorResponse,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
  MionResponse,
  getMaxRouteBodySize,
  readRequestBody,
} from '@mionjs/router';
import {DEFAULT_BUN_HTTP_OPTIONS} from './constants.ts';
import type {BunHttpOptions} from './types.ts';
import {getENV, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';
import {Server} from 'bun';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<BunHttpOptions> = {...DEFAULT_BUN_HTTP_OPTIONS};
let defaultHeaders: [string, string][] = [['server', '@mionjs']];

export function resetBunHttpOpts() {
  httpOptions = {...DEFAULT_BUN_HTTP_OPTIONS};
  defaultHeaders = [['server', '@mionjs']];
  resetRouter();
}

export function setBunHttpOpts(options?: Partial<BunHttpOptions>) {
  httpOptions = {
    ...httpOptions,
    ...options,
  };
  // Pre-build default headers array once
  defaultHeaders = [['server', '@mionjs'], ...Object.entries(httpOptions.defaultResponseHeaders)];
  return httpOptions;
}

/** Dispatches one web Request through the router. Exported so the same handler mion serves can be
 *  mounted in a host that owns the socket: your own `Bun.serve({fetch: bunRequestHandler})`, or a
 *  vite dev server in middleware mode (see `asMiddleware`). */
export async function bunRequestHandler(req: Request): Promise<Response> {
  const reqUrl = req.url;
  const pathStart = reqUrl.indexOf('/', 8);
  const queryStart = reqUrl.indexOf('?', pathStart);
  const path = queryStart === -1 ? reqUrl.slice(pathStart) : reqUrl.slice(pathStart, queryStart);
  const urlQuery = queryStart === -1 ? undefined : reqUrl.slice(queryStart + 1);
  const responseHeaders = new Headers(defaultHeaders);

  // The body is read as TEXT and parsed by the router: `req.json()` would throw a raw SyntaxError
  // outside any mion envelope, and the router's own limit needs the size before parsing.
  try {
    // the context is built BEFORE the body is read: one lookup gives the chain and the request
    // limit, and the body is read against that limit as it arrives (a stream past it is cancelled
    // mid-flight); the router checks the size once more before parsing
    const context = createCallContext(path, urlQuery, req, req.headers, responseHeaders);
    let rawBody: any;
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // a not-found chain (an unknown path or batch id) has no route to feed: its body is never read
    if (context.readsBody) {
      rawBody = await readRequestBody(req, context.maxBodySize);
      const queryBody = decodeQueryBody(urlQuery, rawBody);
      if (queryBody) {
        rawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
    }
    const platformResp = await dispatchWithContext(context, req, undefined, rawBody, reqBodyType);
    return reply(platformResp, responseHeaders);
  } catch (e) {
    const error =
      e instanceof RpcError
        ? e
        : new FatalError({
            publicMessage: 'Unknown Error',
            type: 'unknown-error',
            originalError: e as Error,
          });
    // a body refused mid-flight leaves unread chunks on the socket: close it with the answer so
    // they are never parsed as the next request of a kept-alive connection
    if (error.type === 'request-payload-too-large') responseHeaders.set('connection', 'close');
    return fatalFail(error, responseHeaders);
  }
}

/** Bun's connection-level error hook (never a route error — those are handled in the dispatch). */
function bunErrorHandler(errReq: Error): Response {
  const responseHeaders = new Headers({
    server: '@mionjs',
    ...httpOptions.defaultResponseHeaders,
  });
  const error =
    errReq instanceof RpcError
      ? errReq
      : new FatalError({
          publicMessage: 'Connection Error',
          type: 'response-connection-error',
          originalError: errReq,
        });
  return fatalFail(error, responseHeaders);
}

/** The platform config the router publishes: everything but Bun's native serve options. */
function serializablePlatformConfig(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {options: _nativeOpts, ...serializableConfig} = httpOptions;
  return serializableConfig;
}

/** Starts the bun server. With `asMiddleware` it registers everything and returns UNDEFINED instead:
 *  in that mode there is no server to hand back — the host owns the socket and mounts
 *  `bunRequestHandler` itself. Typed through overloads so the ordinary call keeps returning a
 *  `Server` (setting the flag through `setBunHttpOpts` instead of the argument is the plugin's own
 *  path, where the return value is discarded). */
export async function startBunServer(options: Partial<BunHttpOptions> & {asMiddleware: true}): Promise<undefined>;
export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server<any>>;
export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server<any> | undefined> {
  const isTest = getENV('NODE_ENV') === 'test';

  if (options) setBunHttpOpts(options);

  const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
  const url = `http://localhost${port}`;
  // The host owns the socket: no Bun.serve(), and NO shutdown handlers — theirs calls
  // process.exit(0), which in middleware mode would kill the host on a signal it already handles.
  if (httpOptions.asMiddleware) {
    if (!isTest) console.log('mion running as middleware: routes are registered, mion did NOT open a port.');
    setPlatformConfig(serializablePlatformConfig());
    return undefined;
  }
  if (!isTest) console.log(`mion bun server running on ${url}`);
  // published BEFORE the server is sized: the routes whose types could not say take this number
  setPlatformConfig(serializablePlatformConfig());
  const server = Bun.serve({
    port: httpOptions.port,
    ...httpOptions.options,
    // after the user's own serve options, so they cannot silently switch the limit off. Bun has ONE
    // native, server-wide read limit, so it is sized to the largest limit any route resolves to; the
    // router then applies each route's own number before parsing.
    maxRequestBodySize: getMaxRouteBodySize(),
    fetch: bunRequestHandler,
    error: bunErrorHandler,
  });

  const shutdownHandler = function () {
    if (!isTest) console.log(`Shutting down mion server on ${url}`);
    void server.stop(true);
    process.exit(0);
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  // Hint to Bun's GC after initialization to clean up any temporary allocations
  if (typeof Bun !== 'undefined' && Bun.gc) {
    Bun.gc(false);
  }
  return server;
}

// only called whe there is an htt error or weird unhandled route errors
function fatalFail(err: RpcError<string>, responseHeaders: any): Response {
  const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
  return reply(routeResponse, responseHeaders);
}

function reply(
  mionResp: MionResponse,
  // TODO: fix issue with Native Bun Headers type messing with Node Headers type
  // responseHeaders: Headers,
  responseHeaders: any
): Response {
  const bodyType = mionResp.serializer;
  switch (bodyType) {
    case SerializerModes.stringifyJson: {
      // Pass string directly to Response - Bun handles encoding internally
      // and calculates content-length automatically. This avoids TextEncoder allocation.
      // content-type already set by serializer
      return new Response(mionResp.rawBody as string, {
        status: mionResp.statusCode,
        headers: responseHeaders,
      });
    }
    case SerializerModes.json: {
      // Platform adapter uses Response.json() which handles JSON.stringify internally
      return Response.json(mionResp.body, {
        status: mionResp.statusCode,
        headers: responseHeaders,
      });
    }
    default: {
      const error = new FatalError({
        publicMessage: 'unknown-mion-response-format',
        type: 'unknown-error',
        errorData: {bodyType},
      });
      return fatalFail(error, responseHeaders);
    }
  }
}
