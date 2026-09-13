/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  dispatchWithContext,
  dispatchPlatformError,
  resolveRequest,
  createContextFromResolved,
  getRouterFatalErrorResponse,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
  requestPayloadTooLarge,
} from '@mionjs/router';
import type {ResolvedRequest} from '@mionjs/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants.ts';
import type {NodeHttpOptions} from './types.ts';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {MionHeaders, MionResponse} from '@mionjs/router';
import {getENV, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';
import {headersFromIncomingMessage, headersFromServerResponse} from './headers.ts';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<NodeHttpOptions> = {...DEFAULT_HTTP_OPTIONS};

// ############# PUBLIC METHODS #############

export function resetNodeHttpOpts() {
  httpOptions = {...DEFAULT_HTTP_OPTIONS};
  resetRouter();
}

export function setNodeHttpOpts(options?: Partial<NodeHttpOptions>) {
  httpOptions = {
    ...httpOptions,
    ...options,
  };

  return httpOptions;
}

/** The platform config the router publishes: everything but node's native ServerOptions. */
function serializablePlatformConfig(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {options: _nativeOpts, ...serializableConfig} = httpOptions;
  return serializableConfig;
}

export async function startNodeServer(options?: Partial<NodeHttpOptions>): Promise<HttpServer | HttpsServer> {
  const isTest = getENV('NODE_ENV') === 'test';

  if (options) setNodeHttpOpts(options);
  const port = httpOptions.port !== 80 ? `:${httpOptions.port}` : '';
  const url = `${httpOptions.protocol}://localhost${port}`;
  if (!isTest && !httpOptions.asMiddleware)
    console.log(`mion node server running on ${url}`, {
      port: httpOptions.port,
      httpOptions,
    });

  return new Promise<HttpServer | HttpsServer>((resolve, reject) => {
    const server =
      httpOptions.protocol === 'https'
        ? createHttps(httpOptions.options, httpRequestHandler)
        : createHttp(httpOptions.options, httpRequestHandler);

    // The host owns the socket: no listen(), and NO shutdown handlers — theirs calls
    // process.exit(0), which in middleware mode would kill the host (a vite dev server, an
    // express app) on the first Ctrl-C it was already handling itself.
    if (httpOptions.asMiddleware) {
      if (!isTest) console.log('mion running as middleware: routes are registered, mion did NOT open a port.');
      setPlatformConfig(serializablePlatformConfig());
      return resolve(server);
    }

    server.on('error', (e) => {
      reject(e);
    });

    server.listen(httpOptions.port, () => {
      setPlatformConfig(serializablePlatformConfig());
      resolve(server);
    });

    const shutdownHandler = function () {
      if (!isTest) console.log(`Shutting down mion server on ${url}`);
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
  });
}

// ############# PRIVATE METHODS #############

// exported as can be used in some server to proxy node requests
export function httpRequestHandler(httpReq: IncomingMessage, httpResponse: ServerResponse): void {
  let replied = false;
  const nodeUrl = httpReq.url || '/';
  const queryIndex = nodeUrl.indexOf('?');
  const path = queryIndex === -1 ? nodeUrl : nodeUrl.substring(0, queryIndex);
  const urlQuery = queryIndex === -1 ? undefined : nodeUrl.substring(queryIndex + 1);
  let size = 0;
  const bodyChunks: Buffer[] = [];

  httpResponse.setHeader('server', '@mionjs');
  const reqHeaders = headersFromIncomingMessage(httpReq);
  const respHeaders = headersFromServerResponse(httpResponse, httpOptions.defaultResponseHeaders);

  // The route is resolved BEFORE the body, the context only after it: one lookup gives the chain
  // and the request limit the route settled at registration, so the read below stops at the route's
  // own number, while the context (and the body hanging off it) stays young enough for the cheap
  // half of the garbage collector. A throw here (an unknown batch id, a throwing pathTransform) is
  // answered like a too-large body: before a byte is buffered, with the stream destroyed.
  let resolved: ResolvedRequest;
  try {
    resolved = resolveRequest(path, urlQuery, httpReq);
  } catch (e) {
    replied = true;
    fatalFail(httpResponse, respHeaders, toRpcError(e));
    httpReq.destroy();
    return;
  }
  // read once per request rather than per chunk: the route's own number, or the adapter's option
  // for a route whose types could not say
  const maxBodySize = resolved.maxBodySize;

  // Too large is decided BEFORE a byte is buffered: on the declared content-length when there is
  // one, and on the running size before each chunk is kept.
  const declaredLength = Number(httpReq.headers['content-length']);
  if (declaredLength > maxBodySize) {
    replied = true;
    void dispatchRefusal();
    return;
  }

  /** A body this adapter refused. The route resolved, so the chain still runs its `alwaysRun`
   *  members over the refusal (a rate limiter, an access log) and writes the answer. The request
   *  stream is destroyed after the reply, so the client cannot keep sending into a response that
   *  already went out. */
  async function dispatchRefusal() {
    bodyChunks.length = 0;
    try {
      const mionResponse = await dispatchPlatformError(
        resolved,
        requestPayloadTooLarge(),
        reqHeaders,
        respHeaders,
        httpReq,
        httpResponse
      );
      if (!httpResponse.writableEnded) reply(httpResponse, mionResponse);
    } catch (e) {
      fatalFail(httpResponse, respHeaders, toRpcError(e));
    } finally {
      httpReq.destroy();
    }
  }

  async function dispatch(reqRawBody: any, reqBodyType: SerializerCode, readQueryBody: boolean) {
    // Everything below is inside the guard: this runs from a listener, so a throw here would be an
    // unhandled rejection, which takes the whole process down under node's default.
    try {
      const queryBody = readQueryBody ? decodeQueryBody(urlQuery, reqRawBody || undefined) : undefined;
      if (queryBody) {
        reqRawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
      const context = createContextFromResolved(resolved, reqHeaders, respHeaders, reqRawBody, reqBodyType);
      const mionResponse = await dispatchWithContext(context, httpReq, httpResponse);
      if (replied || httpResponse.writableEnded) return;
      replied = true;
      reply(httpResponse, mionResponse);
    } catch (e) {
      if (replied) return;
      replied = true;
      fatalFail(httpResponse, respHeaders, toRpcError(e));
    }
  }

  httpResponse.on('error', (e) => {
    if (replied) return;
    replied = true;
    const error = new FatalError({
      publicMessage: 'Connection Error',
      type: 'response-connection-error',
      originalError: e,
    });
    fatalFail(httpResponse, respHeaders, error);
  });

  // A not-found chain (an unknown path or batch id) has no route to feed: dispatch right away with
  // no body and no data listener. Node discards whatever the client still sends once the response
  // ends, so a kept-alive connection stays usable and nothing is ever buffered.
  if (!resolved.readsBody) {
    void dispatch('', SerializerModes.stringifyJson, false);
    return;
  }

  httpReq.on('data', (data) => {
    if (replied) return;
    size += data.length;
    if (size > maxBodySize) {
      replied = true;
      void dispatchRefusal();
      return;
    }
    bodyChunks.push(data);
  });

  httpReq.on('error', (e) => {
    if (replied) return;
    replied = true;
    const error = new FatalError({
      publicMessage: 'Connection Error',
      type: 'request-connection-error',
      originalError: e,
    });
    fatalFail(httpResponse, respHeaders, error);
  });

  httpReq.on('end', () => {
    if (replied) return;
    // Buffer.concat allocates and copies even for one chunk, and a body-less request is the common
    // case for a GET: neither needs a buffer at all.
    const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks, size);
    void dispatch(bodyChunks.length === 0 ? '' : buffer.toString(), SerializerModes.stringifyJson, true);
  });
}

function toRpcError(e: unknown): RpcError<string> {
  return e instanceof RpcError
    ? e
    : new FatalError({
        publicMessage: 'Unknown Error',
        type: 'unknown-error',
        originalError: e as Error,
      });
}

// only called when there is an http error or weird unhandled route errors
function fatalFail(httpResponse: ServerResponse, respHeaders: MionHeaders, error: RpcError<string>) {
  if (httpResponse.writableEnded) return;
  const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
  reply(httpResponse, routeResponse);
}

function reply(httpResp: ServerResponse, mionResp: MionResponse) {
  httpResp.statusCode = mionResp.statusCode;
  const bodyType = mionResp.serializer;
  switch (bodyType) {
    // Buffer.byteLength counts the same bytes end() is about to write, without building a copy of
    // the whole response first. node encodes the string straight into its own write buffer.
    case SerializerModes.stringifyJson: {
      const rawBody = mionResp.rawBody as string;
      httpResp.setHeader('content-length', Buffer.byteLength(rawBody, 'utf8'));
      // content-type already set by serializer
      httpResp.end(rawBody, 'utf8');
      break;
    }
    case SerializerModes.json: {
      // Platform adapter stringifies the prepared body object
      const jsonString = JSON.stringify(mionResp.body);
      httpResp.setHeader('content-length', Buffer.byteLength(jsonString, 'utf8'));
      httpResp.end(jsonString, 'utf8');
      break;
    }
    default: {
      const error = new FatalError({
        publicMessage: 'unknown-mion-response-format',
        type: 'unknown-error',
        errorData: {bodyType},
      });
      fatalFail(httpResp, mionResp.headers, error);
    }
  }
}
