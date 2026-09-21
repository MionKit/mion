/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  dispatchWithContext,
  dispatchPlatformError,
  resolveExecutionChain,
  createContextFromChain,
  getRouterFatalErrorResponse,
  toRpcError,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
  MionResponse,
  getMaxRouteBodySize,
  readRequestBody,
  BodyReadStrategy,
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
  defaultHeaders = [['server', '@mionjs'], ...Object.entries(httpOptions.defaultResponseHeaders)];
  return httpOptions;
}

/** Exported so a host that owns the socket can mount it: your own `Bun.serve({fetch})`, or vite in middleware mode. */
export async function bunRequestHandler(req: Request): Promise<Response> {
  const reqUrl = req.url;
  const pathStart = reqUrl.indexOf('/', 8);
  const queryStart = reqUrl.indexOf('?', pathStart);
  const path = queryStart === -1 ? reqUrl.slice(pathStart) : reqUrl.slice(pathStart, queryStart);
  const urlQuery = queryStart === -1 ? undefined : reqUrl.slice(queryStart + 1);
  const responseHeaders = new Headers(defaultHeaders);

  // read as TEXT: `req.json()` would throw a raw SyntaxError outside any mion envelope, and the limit needs the size first
  try {
    // route resolved BEFORE the body: the chain gives the limit bun's native read stops at, and a late context stays GC-cheap
    const chain = resolveExecutionChain(path, urlQuery, req);
    let rawBody: any;
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // a not-found chain (an unknown path or batch id) has no route to feed: its body is never read
    if (chain.readsBody) {
      try {
        rawBody = await readRequestBody(req, chain.maxBodySize, BodyReadStrategy.buffered);
      } catch (err) {
        const refusal = toRpcError(err);
        // unread chunks stay on the socket: close it, or they are parsed as the next request of a kept-alive connection
        if (refusal.type === 'request-payload-too-large') responseHeaders.set('connection', 'close');
        // the route resolved, so the refusal still runs the chain's alwaysRun members
        const refused = await dispatchPlatformError(chain, path, urlQuery, refusal, req.headers, responseHeaders, req, undefined);
        return reply(refused, responseHeaders);
      }
      const queryBody = decodeQueryBody(urlQuery, rawBody);
      if (queryBody) {
        rawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
    }
    const context = createContextFromChain(chain, path, urlQuery, req.headers, responseHeaders, rawBody, reqBodyType);
    const platformResp = await dispatchWithContext(context, req, undefined);
    return reply(platformResp, responseHeaders);
  } catch (err) {
    return fatalFail(toRpcError(err), responseHeaders);
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

/** `asMiddleware` returns UNDEFINED, the host owns the socket; the overloads keep the ordinary call returning a `Server`. */
export async function startBunServer(options: Partial<BunHttpOptions> & {asMiddleware: true}): Promise<undefined>;
export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server<any>>;
export async function startBunServer(options?: Partial<BunHttpOptions>): Promise<Server<any> | undefined> {
  const isTest = getENV('NODE_ENV') === 'test';

  if (options) setBunHttpOpts(options);

  const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
  const url = `http://localhost${port}`;
  // no Bun.serve() and NO shutdown handlers: ours calls process.exit(0) and would kill the host on a signal it handles
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
    // after the user's own options so they cannot switch it off; bun's ONE native limit is sized to the largest route's
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

  // hint to Bun's GC: release the allocations initialization left behind
  if (typeof Bun !== 'undefined' && Bun.gc) {
    Bun.gc(false);
  }
  return server;
}

// only called when there is an http error or weird unhandled route errors
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
    case SerializerModes.json: {
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
