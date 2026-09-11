/* ########
 * 2022 mion
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
  requestPayloadTooLarge,
} from '@mionjs/router';
import {STATUS_CODES} from 'http';
import {loadUws} from '@mionjs/bin-uws';
import type {HttpRequest, HttpResponse, TemplatedApp, us_listen_socket} from '@mionjs/bin-uws';
import {DEFAULT_UWS_HTTP_OPTIONS} from './constants.ts';
import type {UwsHttpOptions} from './types.ts';
import type {MionHeaders, MionResponse} from '@mionjs/router';
import {getENV, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';
import {bufferedResponseHeaders, headersFromUwsRequest, forEachHeader} from './headers.ts';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<UwsHttpOptions> = {...DEFAULT_UWS_HTTP_OPTIONS};

// The most bytes one uWS socket read can deliver: uSockets' LIBUS_RECV_BUFFER_LENGTH (512 KiB) at
// the uwsTag pinned in packages/bin-uws. A body LARGER than this cannot have arrived in a single read,
// which is what makes the zero-copy branch in uwsRequestHandler safe (see the comment there); a
// detachment tripwire guards the assumption at runtime. Re-verify against uSockets on a tag bump.
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
  // Middleware mode cannot exist on this platform: uWS is its own C++ event loop and owns its
  // listen socket, so its handlers cannot mount on a host node http server (a vite dev server,
  // express). The vite plugin discovers this setter generically, so refuse the flag loudly here.
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

// exported for tests and for mounting on a hand-built uWS app; NOT a middleware handler (see
// setUwsHttpOpts). uWS contract: `req` is only valid synchronously inside this call, so everything
// the async dispatch needs is snapshotted before the first await; `res` stays valid until the
// response ends or onAborted fires.
function toRpcError(e: unknown): RpcError<string> {
  return e instanceof RpcError
    ? e
    : new FatalError({
        publicMessage: 'Unknown Error',
        type: 'unknown-error',
        originalError: e as Error,
      });
}

export function uwsRequestHandler(res: HttpResponse, req: HttpRequest): void {
  const state = {replied: false, aborted: false};
  // Everything read from `req` happens HERE, synchronously.
  const path = req.getUrl();
  const query = req.getQuery();
  const urlQuery = query === '' ? undefined : query;
  const reqHeaders = headersFromUwsRequest(req);

  const respHeaders = bufferedResponseHeaders(httpOptions.defaultResponseHeaders);
  respHeaders.set('server', '@mionjs');

  // Must be registered before any async work: after the client disconnects, touching `res`
  // without this flag set would crash the process (uWS frees the response).
  res.onAborted(() => {
    state.aborted = true;
  });

  // The context is built BEFORE the body, synchronously: one lookup gives the chain and the
  // request limit the route settled at registration, so the native read below stops at the route's
  // own number and the same context goes to the dispatch. The raw request object is built once, the
  // one a pathTransform reads and the one the handlers see.
  const rawRequest = {path, urlQuery, headers: reqHeaders};
  let context: ReturnType<typeof createCallContext>;
  try {
    context = createCallContext(path, urlQuery, rawRequest, reqHeaders, respHeaders);
  } catch (e) {
    state.replied = true;
    fatalFail(res, state, respHeaders, toRpcError(e));
    return;
  }

  const dispatchBody = (buffer: Buffer) => {
    let reqRawBody: any = buffer.toString();
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // a throw here runs inside uWS' native callback (or a microtask): it must become a response
    try {
      const queryBody = decodeQueryBody(urlQuery, reqRawBody || undefined);
      if (queryBody) {
        reqRawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
    } catch (e) {
      state.replied = true;
      fatalFail(res, state, respHeaders, e as RpcError<string>);
      return;
    }

    dispatchWithContext(context, rawRequest, res, reqRawBody, reqBodyType)
      .then((mionResponse) => {
        if (state.replied) return;
        state.replied = true;
        reply(res, state, mionResponse);
      })
      .catch((e) => {
        if (state.replied) return;
        state.replied = true;
        fatalFail(res, state, respHeaders, toRpcError(e));
      });
  };

  // collectBody assembles the whole request body natively (it rides uWS' onDataV2, which knows the
  // remaining length and can preallocate) and calls back ONCE — with null when the body exceeds
  // maxSize, which is exactly the maxBodySize contract. The size is the route's own resolved limit
  // (the adapter's option for a route whose types could not say).
  res.collectBody(context.maxBodySize, (fullBody) => {
    if (state.replied) return;
    if (fullBody === null) {
      state.replied = true;
      fatalFail(res, state, respHeaders, requestPayloadTooLarge());
      return;
    }

    // collectBody has two paths (verified in the pinned tag's HttpResponseWrapper.h and by test):
    // a body that arrived in ONE socket read is handed as a zero-copy window into uWS' receive
    // buffer and DETACHED when this callback returns — it must be copied here (Buffer.from over an
    // ArrayBuffer is only a view; the outer Buffer.from is the one real memcpy). A body that took
    // several reads was assembled in C++ and its memory OWNERSHIP-TRANSFERRED to JS — no copy.
    if (fullBody.byteLength <= UWS_MAX_SINGLE_READ) {
      // The window is valid for this synchronous callback, and dispatchBody turns it into a string
      // right here (that IS the copy), so no retaining copy is needed.
      dispatchBody(Buffer.from(fullBody));
      return;
    }
    // Bigger than one read can deliver → guaranteed the ownership-transferred path: use the buffer
    // as-is. The microtask runs after the moment uWS would have detached it (it never does on this
    // path), so the zero-length check is a tripwire for an upstream behavior change — fail loudly
    // instead of parsing a neutered buffer.
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
      dispatchBody(Buffer.from(fullBody));
    });
  });
}

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

  // An unknown serializer becomes a fatal-error response BEFORE corking — uWS ignores a second
  // writeStatus inside the same cork, so the swap can't happen mid-write.
  const bodyType = mionResp.serializer;
  const isKnownBodyType = bodyType === SerializerModes.stringifyJson || bodyType === SerializerModes.json;
  if (!isKnownBodyType) {
    const error = new FatalError({
      publicMessage: 'unknown-mion-response-format',
      type: 'unknown-error',
      errorData: {bodyType},
    });
    mionResp = getRouterFatalErrorResponse(error, mionResp.headers);
  }

  // cork batches status + headers + body into one syscall; headers are write-only in uWS and
  // must all precede end(). content-length is skipped: uWS derives and writes its own from the
  // end() payload, and a duplicate header corrupts the response.
  res.cork(() => {
    res.writeStatus(statusLine(mionResp.statusCode));
    // uWS writes header values unchecked (node and the fetch Headers throw on them), so a CR or LF
    // in a value a handler echoed from the request would be header injection here: dropped.
    forEachHeader(mionResp.headers, (name, value) => {
      if (name !== 'content-length' && isHeaderSafe(name) && isHeaderSafe(value)) res.writeHeader(name, value);
    });

    switch (mionResp.serializer) {
      case SerializerModes.json: {
        // Platform adapter stringifies the prepared body object
        res.end(JSON.stringify(mionResp.body));
        break;
      }
      default: {
        // stringifyJson (and the fatal-error swap above): content-type already set by serializer
        res.end(mionResp.rawBody as string);
      }
    }
  });
}
