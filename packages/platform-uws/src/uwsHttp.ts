/* ########
 * 2022 mion
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
  getResponseDefaults,
  requestPayloadTooLarge,
} from '@mionjs/router';
import {STATUS_CODES} from 'http';
import {loadUws} from '@mionjs/bin-uws';
import type {HttpRequest, HttpResponse, TemplatedApp, us_listen_socket} from '@mionjs/bin-uws';
import {DEFAULT_UWS_HTTP_OPTIONS} from './constants.ts';
import type {UwsHttpOptions} from './types.ts';
import type {MethodsExecutionChain, MionHeaders, MionResponse} from '@mionjs/router';
import {getENV, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';
import {bufferedResponseHeaders, headersFromUwsRequest, forEachHeader} from './headers.ts';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<UwsHttpOptions> = {...DEFAULT_UWS_HTTP_OPTIONS};

// The most bytes one uWS socket read can deliver: uSockets' LIBUS_RECV_BUFFER_LENGTH (512 KiB) at the tag pinned in
// packages/bin-uws. A LARGER body cannot be single-read, which is what makes the zero-copy branch below safe (a
// detachment tripwire guards it at runtime). Re-verify against uSockets on a tag bump.
const UWS_MAX_SINGLE_READ = 524288;

/** The running server: the uWS app plus the socket handle listen() produced. */
export interface UwsServer {
  app: TemplatedApp;
  listenSocket: us_listen_socket;
  close(): void;
}

// ############# PUBLIC METHODS #############

export function resetUwsHttpOpts() {
  httpOptions = {...DEFAULT_UWS_HTTP_OPTIONS};
  resetRouter();
}

export function setUwsHttpOpts(options?: Partial<UwsHttpOptions>) {
  // uWS is its own C++ event loop and owns its listen socket, so it cannot mount on a host node server.
  // The vite plugin discovers this setter generically, so the flag is refused loudly here.
  if ((options as {asMiddleware?: boolean} | undefined)?.asMiddleware) {
    throw new Error(
      '@mionjs/platform-uws does not support middleware mode: uWebSockets.js owns its own listen ' +
        'socket and cannot mount on a host node server. Use @mionjs/platform-node for middleware mode.'
    );
  }
  httpOptions = {
    ...httpOptions,
    ...options,
  };

  return httpOptions;
}

/** The platform config the router publishes: everything but the TLS file paths. */
function serializablePlatformConfig(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {ssl: _ssl, ...serializableConfig} = httpOptions;
  return serializableConfig;
}

export async function startUwsServer(options?: Partial<UwsHttpOptions>): Promise<UwsServer> {
  const isTest = getENV('NODE_ENV') === 'test';

  if (options) setUwsHttpOpts(options);
  const protocol = httpOptions.ssl ? 'https' : 'http';
  const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
  const url = `${protocol}://localhost${port}`;
  if (!isTest)
    console.log(`mion uws server running on ${url}`, {
      port: httpOptions.port,
      httpOptions,
    });

  const uws = loadUws();
  const app = httpOptions.ssl ? uws.SSLApp(httpOptions.ssl) : uws.App();
  app.any('/*', uwsRequestHandler);

  return new Promise<UwsServer>((resolve, reject) => {
    app.listen(httpOptions.port, (listenSocket) => {
      if (!listenSocket) {
        reject(new Error(`mion uws server failed to listen on port ${httpOptions.port} (port in use?)`));
        return;
      }

      setPlatformConfig(serializablePlatformConfig());

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        uws.us_listen_socket_close(listenSocket);
      };
      const server: UwsServer = {app, listenSocket, close};

      const shutdownHandler = function () {
        if (!isTest) console.log(`Shutting down mion server on ${url}`);
        close();
        process.exit(0);
      };
      process.on('SIGINT', shutdownHandler);
      process.on('SIGTERM', shutdownHandler);

      resolve(server);
    });
  });
}

// ############# PRIVATE METHODS #############

// uWS refreshes a socket's idle timeout only from inside a body-data callback, and runs it only when a reader is registered.
// Without one, a request answered before its body finished arriving is closed mid-upload, so drop every chunk instead.
function drainRequestBody(res: HttpResponse) {
  res.onData(() => {});
}

// exported for tests and for mounting on a hand-built uWS app; NOT a middleware handler (see setUwsHttpOpts).
// uWS contract: `req` is valid only synchronously here, so the async dispatch snapshots it before the first await.
export function uwsRequestHandler(res: HttpResponse, req: HttpRequest): void {
  const state = {replied: false, aborted: false};
  // Everything read from `req` happens HERE, synchronously.
  const path = req.getUrl();
  const query = req.getQuery();
  const urlQuery = query === '' ? undefined : query;
  const reqHeaders = headersFromUwsRequest(req);

  const respHeaders = bufferedResponseHeaders(getResponseDefaults(httpOptions.defaultResponseHeaders));
  respHeaders.set('server', '@mionjs');

  // must be registered before any async work: after a disconnect uWS frees the response, and touching it would crash
  res.onAborted(() => {
    state.aborted = true;
  });

  // route resolved BEFORE the body, synchronously: the native read stops at the chain's limit, and a late context stays GC-cheap.
  // The raw request object is built once: the one a pathTransform reads and the one the handlers see.
  const rawRequest = {path, urlQuery, headers: reqHeaders};
  let chain: MethodsExecutionChain;
  try {
    chain = resolveExecutionChain(path, urlQuery, rawRequest);
  } catch (err) {
    drainRequestBody(res);
    state.replied = true;
    fatalFail(res, state, respHeaders, toRpcError(err));
    return;
  }

  const dispatchBody = (rawBody: string, readQueryBody: boolean) => {
    let reqRawBody: any = rawBody;
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // a throw here runs inside uWS' native callback (or a microtask): it must become a response
    try {
      const queryBody = readQueryBody ? decodeQueryBody(urlQuery, reqRawBody || undefined) : undefined;
      if (queryBody) {
        reqRawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
    } catch (err) {
      state.replied = true;
      fatalFail(res, state, respHeaders, err as RpcError<string>);
      return;
    }

    const context = createContextFromChain(chain, path, urlQuery, reqHeaders, respHeaders, reqRawBody, reqBodyType);
    answerWith(dispatchWithContext(context, rawRequest, res));
  };

  const answerWith = (dispatched: Promise<MionResponse>) => {
    dispatched
      .then((mionResponse) => {
        if (state.replied) return;
        state.replied = true;
        reply(res, state, mionResponse);
      })
      .catch((err) => {
        if (state.replied) return;
        state.replied = true;
        fatalFail(res, state, respHeaders, toRpcError(err));
      });
  };

  // collectBody assembles the body natively (uWS' onDataV2 preallocates) and calls back ONCE, with null past maxSize,
  // which is exactly the maxBodySize contract. A not-found chain has no route to feed: its body is dropped as it arrives.
  if (!chain.readsBody) {
    drainRequestBody(res);
    dispatchBody('', false);
    return;
  }

  res.collectBody(chain.maxBodySize, (fullBody) => {
    if (state.replied) return;
    if (fullBody === null) {
      // the route resolved, so the refusal still runs the chain's alwaysRun members
      answerWith(
        dispatchPlatformError(chain, path, urlQuery, requestPayloadTooLarge(), reqHeaders, respHeaders, rawRequest, res)
      );
      return;
    }

    // collectBody has two paths (verified in the pinned tag's HttpResponseWrapper.h and by test): a single-read body is a
    // zero-copy window into uWS' receive buffer, DETACHED when this callback returns, so it must be decoded synchronously
    // here; a multi-read body was assembled in C++ and OWNERSHIP-TRANSFERRED to JS, so it can be decoded from a microtask.
    if (fullBody.byteLength <= UWS_MAX_SINGLE_READ) {
      // a body-less request (every GET) skips the view and the decode altogether
      dispatchBody(fullBody.byteLength === 0 ? '' : Buffer.from(fullBody).toString(), true);
      return;
    }
    // bigger than one read can deliver → guaranteed the ownership-transferred path, so the buffer survives the microtask.
    // The zero-length check is a tripwire for an upstream change: fail loudly instead of parsing a neutered buffer.
    queueMicrotask(() => {
      if (state.replied) return;
      if (fullBody.byteLength === 0) {
        state.replied = true;
        const error = new FatalError({
          publicMessage: 'Internal Server Error',
          type: 'unknown-error',
          errorData: {reason: 'uws detached a multi-read body buffer (upstream behavior change) — report to mion'},
        });
        fatalFail(res, state, respHeaders, error);
        return;
      }
      dispatchBody(releaseAfterDecode(fullBody), true);
    });
  });
}

/** Frees an ownership-transferred body buffer right after decoding it; the single-read window must never come through here.
 *  `transfer(0)` and not `transfer()`: measured on node 26, only `transfer(0)` releases the backing store there and then.
 *  Guarded because a future uWS could hand back a buffer that cannot be transferred, which must not fail the request. */
function releaseAfterDecode(fullBody: ArrayBuffer): string {
  const text = Buffer.from(fullBody).toString();
  try {
    (fullBody as ReleasableBuffer).transfer?.(0);
  } catch {
    // not transferable: the collector gets it instead, exactly as before
  }
  return text;
}

/** `transfer` is ES2024 and this package compiles against an ES2023 lib; optional because a runtime without it must work. */
type ReleasableBuffer = ArrayBuffer & {transfer?: (newByteLength?: number) => ArrayBuffer};

// only called when there is an http error or weird unhandled route errors
function fatalFail(res: HttpResponse, state: {aborted: boolean}, respHeaders: MionHeaders, error: RpcError<string>) {
  const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
  reply(res, state, routeResponse);
}

function isHeaderSafe(text: string): boolean {
  // one pass, no allocation: a CR, LF or NUL anywhere makes the header unsafe to write
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 13 || code === 10 || code === 0) return false;
  }
  return true;
}

/** The line is a pure function of the code, so it is built once per code rather than per response. */
const statusLines = new Map<number, string>();
function statusLine(statusCode: number): string {
  const cached = statusLines.get(statusCode);
  if (cached !== undefined) return cached;
  const statusText = STATUS_CODES[statusCode];
  const line = statusText ? `${statusCode} ${statusText}` : `${statusCode}`;
  statusLines.set(statusCode, line);
  return line;
}

function reply(res: HttpResponse, state: {aborted: boolean}, mionResp: MionResponse) {
  // The client is gone and uWS freed the response — touching it would crash.
  if (state.aborted) return;

  // an unknown serializer swaps in the fatal response BEFORE corking: uWS ignores a second writeStatus inside one cork
  const bodyType = mionResp.serializer;
  if (bodyType !== SerializerModes.json) {
    const error = new FatalError({
      publicMessage: 'unknown-mion-response-format',
      type: 'unknown-error',
      errorData: {bodyType},
    });
    mionResp = getRouterFatalErrorResponse(error, mionResp.headers);
  }

  // serialized BEFORE the cork: uWS warns a cork buffer must not be held across event loop iterations
  const payload = JSON.stringify(mionResp.body);

  // cork batches status + headers + body into one syscall; headers are write-only in uWS and must all precede end().
  // content-length is skipped: uWS writes its own from the end() payload, and a duplicate header corrupts the response.
  res.cork(() => {
    res.writeStatus(statusLine(mionResp.statusCode));
    // uWS writes header values unchecked, so a CR or LF a handler echoed from the request would be header injection: dropped
    forEachHeader(mionResp.headers, (name, value) => {
      if (name !== 'content-length' && isHeaderSafe(name) && isHeaderSafe(value)) res.writeHeader(name, value);
    });

    res.end(payload);
  });
}
