/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  dispatchMaybeSync,
  dispatchPlatformError,
  resolveExecutionChain,
  createContextFromChain,
  getRouterFatalErrorResponse,
  toRpcError,
  resetRouter,
  setPlatformConfig,
  getMaxRouteBodySize,
  readRequestBody,
  BodyReadStrategy,
  handOverToHost,
  getDefaultFetchHeaders,
  replyFetch,
} from '@mionjs/router';
import type {MethodsExecutionChain, FetchResponseHeaders} from '@mionjs/router';
import {DEFAULT_BUN_HTTP_OPTIONS} from './constants.ts';
import type {BunHttpOptions} from './types.ts';
import {getENV, SerializerModes} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';
import {Server} from 'bun';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<BunHttpOptions> = {...DEFAULT_BUN_HTTP_OPTIONS};

export function resetBunHttpOpts() {
  httpOptions = {...DEFAULT_BUN_HTTP_OPTIONS};
  resetRouter();
}

export function setBunHttpOpts(options?: Partial<BunHttpOptions>) {
  httpOptions = {
    ...httpOptions,
    ...options,
  };
  return httpOptions;
}

/** Exported so a host that owns the socket can mount it: your own `Bun.serve({fetch})`, or vite in middleware mode.
 *  NOT async: a body-less request on an all-sync route gets a `Response`, never a promise. */
export function bunRequestHandler(req: Request): Response | Promise<Response> {
  const reqUrl = req.url;
  const pathStart = reqUrl.indexOf('/', 8);
  const queryStart = reqUrl.indexOf('?', pathStart);
  const path = queryStart === -1 ? reqUrl.slice(pathStart) : reqUrl.slice(pathStart, queryStart);
  const urlQuery = queryStart === -1 ? undefined : reqUrl.slice(queryStart + 1);
  const responseHeaders = getDefaultFetchHeaders();

  try {
    // route resolved BEFORE the body: the chain gives the limit bun's native read stops at, and a late context stays GC-cheap
    const chain = resolveExecutionChain(path, urlQuery, req);
    // a not-found chain (an unknown path or batch id) has no route to feed: its body is never read
    if (chain.readsBody && req.body) return readBodyAndDispatch(req, chain, path, urlQuery, responseHeaders);
    return dispatchBody(req, chain, path, urlQuery, responseHeaders, undefined);
  } catch (err) {
    return fatalFail(toRpcError(err), responseHeaders);
  }
}

async function readBodyAndDispatch(
  req: Request,
  chain: MethodsExecutionChain,
  path: string,
  urlQuery: string | undefined,
  responseHeaders: FetchResponseHeaders
): Promise<Response> {
  // read as TEXT: `req.json()` would throw a raw SyntaxError outside any mion envelope, and the limit needs the size first
  try {
    let rawBody: string | undefined;
    try {
      rawBody = await readRequestBody(req, chain.maxBodySize, BodyReadStrategy.buffered);
    } catch (err) {
      const refusal = toRpcError(err);
      // unread chunks stay on the socket: close it, or they are parsed as the next request of a kept-alive connection
      if (refusal.type === 'request-payload-too-large') responseHeaders.set('connection', 'close');
      // the route resolved, so the refusal still runs the chain's alwaysRun members
      const refused = await dispatchPlatformError(
        chain,
        path,
        urlQuery,
        req.method,
        refusal,
        req.headers,
        responseHeaders,
        req,
        undefined
      );
      return replyFetch(refused, responseHeaders);
    }
    return dispatchBody(req, chain, path, urlQuery, responseHeaders, rawBody);
  } catch (err) {
    return fatalFail(toRpcError(err), responseHeaders);
  }
}

/** An all-sync chain answers with a `Response`, anything else with a promise of one. */
function dispatchBody(
  req: Request,
  chain: MethodsExecutionChain,
  path: string,
  urlQuery: string | undefined,
  responseHeaders: FetchResponseHeaders,
  rawBody: string | undefined
): Response | Promise<Response> {
  const method = req.method;
  const context = createContextFromChain(
    chain,
    path,
    urlQuery,
    method,
    req.headers,
    responseHeaders,
    rawBody,
    SerializerModes.stringifyJson
  );
  const platformResp = dispatchMaybeSync(context, req, undefined);
  if (!(platformResp instanceof Promise)) return replyFetch(platformResp, responseHeaders);
  return platformResp
    .then((resp) => replyFetch(resp, responseHeaders))
    .catch((err) => fatalFail(toRpcError(err), responseHeaders));
}

/** Bun's connection-level error hook (never a route error — those are handled in the dispatch). */
function bunErrorHandler(errReq: Error): Response {
  const responseHeaders = getDefaultFetchHeaders();
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
  // Local, never written back: a later server in the same process listens once the host lets go of the socket.
  const asMiddleware = handOverToHost({fetch: bunRequestHandler}) || !!httpOptions.asMiddleware;

  const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
  const url = `http://localhost${port}`;
  // no Bun.serve() and NO shutdown handlers: ours calls process.exit(0) and would kill the host on a signal it handles
  if (asMiddleware) {
    if (!isTest) console.log('mion running as middleware: routes are registered, mion did NOT open a port.');
    setPlatformConfig({...serializablePlatformConfig(), asMiddleware});
    return undefined;
  }
  if (!isTest) console.log(`mion bun server running on ${url}`);
  // published BEFORE the server is sized: the routes whose types could not say take this number
  setPlatformConfig({...serializablePlatformConfig(), asMiddleware});
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
function fatalFail(err: RpcError<string>, responseHeaders: FetchResponseHeaders): Response {
  const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
  return replyFetch(routeResponse, responseHeaders);
}
