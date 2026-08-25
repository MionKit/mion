/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getRouterFatalErrorResponse, resetRouter, decodeQueryBody, setPlatformConfig} from '@mionjs/router';
import {STATUS_CODES} from 'http';
import {loadUws} from '@mionjs/uws';
import type {HttpRequest, HttpResponse, TemplatedApp, us_listen_socket} from '@mionjs/uws';
import {DEFAULT_UWS_HTTP_OPTIONS} from './constants.ts';
import type {UwsHttpOptions} from './types.ts';
import {configureBinary, type BinaryOptionsPatch} from '@mionjs/core';
import type {MionHeaders, MionResponse} from '@mionjs/router';
import {getENV, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError} from '@mionjs/core';
import {bufferedResponseHeaders, headersFromUwsRequest} from './headers.ts';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<UwsHttpOptions> = {...DEFAULT_UWS_HTTP_OPTIONS};

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

/** Applies the binary options, arming the buffer pool unless the caller turned it off. Safe here
 *  because uWS copies the payload into its own send buffer synchronously during end() — even under
 *  backpressure — so the adapter releases the pooled buffer right after the corked reply. The
 *  binary spec's concurrent large-payload test pins this assumption. */
function applyBinaryOptions(binary: BinaryOptionsPatch): void {
  configureBinary({...binary, pool: {enabled: true, ...binary.pool}});
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
  applyBinaryOptions(httpOptions.binary);
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
export function uwsRequestHandler(res: HttpResponse, req: HttpRequest): void {
  const state = {replied: false, aborted: false};
  // Everything read from `req` happens HERE, synchronously.
  const path = req.getUrl();
  const query = req.getQuery();
  const urlQuery = query === '' ? undefined : query;
  const reqHeaders = headersFromUwsRequest(req);
  const contentType = req.getHeader('content-type');

  const respHeaders = bufferedResponseHeaders(httpOptions.defaultResponseHeaders);
  respHeaders.set('server', '@mionjs');

  // Must be registered before any async work: after the client disconnects, touching `res`
  // without this flag set would crash the process (uWS frees the response).
  res.onAborted(() => {
    state.aborted = true;
  });

  // collectBody assembles the whole request body natively (it rides uWS' onDataV2, which knows the
  // remaining length and can preallocate) and calls back ONCE — with null when the body exceeds
  // maxSize, which is exactly the maxBodySize contract.
  res.collectBody(httpOptions.maxBodySize, (fullBody) => {
    if (state.replied) return;
    if (fullBody === null) {
      state.replied = true;
      const error = new RpcError({
        publicMessage: 'Payload Too Large',
        type: 'request-payload-too-large',
      });
      fatalFail(res, state, respHeaders, error);
      return;
    }

    // uWS DETACHES the handed ArrayBuffer when this callback returns (verified: touching it a tick
    // later throws on a detached buffer), so the body must be copied before the async dispatch.
    // Buffer.from(ArrayBuffer) is only a view — the inner call makes the view, the outer call is
    // the one real copy. That single memcpy replaces the old per-chunk copy + Buffer.concat pair.
    const buffer = Buffer.from(Buffer.from(fullBody));
    const isBinary = contentType.startsWith('application/octet-stream');
    let reqRawBody: any = isBinary ? buffer : buffer.toString();
    let reqBodyType: SerializerCode = isBinary ? SerializerModes.binary : SerializerModes.stringifyJson;
    const queryBody = decodeQueryBody(urlQuery, reqRawBody || undefined);
    if (queryBody) {
      reqRawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }

    dispatchRoute(path, reqRawBody, reqHeaders, respHeaders, {path, urlQuery, headers: reqHeaders}, res, reqBodyType, urlQuery)
      .then((mionResponse) => {
        if (state.replied) return;
        state.replied = true;
        reply(res, state, mionResponse);
      })
      .catch((e) => {
        if (state.replied) return;
        state.replied = true;
        const error = new RpcError({
          publicMessage: 'Unknown Error',
          type: 'unknown-error',
          originalError: e as Error,
        });
        fatalFail(res, state, respHeaders, error);
      });
  });
}

// only called when there is an http error or weird unhandled route errors
function fatalFail(res: HttpResponse, state: {aborted: boolean}, respHeaders: MionHeaders, error: RpcError<string>) {
  const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
  reply(res, state, routeResponse);
}

function statusLine(statusCode: number): string {
  const statusText = STATUS_CODES[statusCode];
  return statusText ? `${statusCode} ${statusText}` : `${statusCode}`;
}

function reply(res: HttpResponse, state: {aborted: boolean}, mionResp: MionResponse) {
  // The client is gone and uWS freed the response — touching it would crash. The only cleanup
  // owed is handing a pooled binary buffer back.
  if (state.aborted) {
    mionResp.releaseBinBuffer?.();
    return;
  }

  // An unknown serializer becomes a fatal-error response BEFORE corking — uWS ignores a second
  // writeStatus inside the same cork, so the swap can't happen mid-write.
  const bodyType = mionResp.serializer;
  const isKnownBodyType =
    bodyType === SerializerModes.stringifyJson || bodyType === SerializerModes.json || bodyType === SerializerModes.binary;
  if (!isKnownBodyType) {
    const error = new RpcError({
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
    for (const [name, value] of mionResp.headers.entries()) {
      if (name !== 'content-length') res.writeHeader(name, value);
    }

    switch (mionResp.serializer) {
      case SerializerModes.binary: {
        const serializer = mionResp.binSerializer!;
        res.end(serializer.getBufferView());
        // uWS copies the payload into its own send buffer synchronously inside end() (also on
        // the backpressure path), so unlike node there is nothing to wait for — the pooled
        // buffer goes back immediately. Pinned by the binary spec's concurrent-load test.
        mionResp.releaseBinBuffer?.();
        break;
      }
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
