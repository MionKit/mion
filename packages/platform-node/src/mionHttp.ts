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
  getGlobalResponseHeaders,
  requestPayloadTooLarge,
} from '@mionjs/router';
import type {MethodsExecutionChain} from '@mionjs/router';
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
import {decodeBody} from './bodyDecode.ts';

// ############# PRIVATE STATE #############

let httpOptions: Readonly<NodeHttpOptions> = {...DEFAULT_HTTP_OPTIONS};
/** Merged on the first request, not in the setter: the router's globals only settle once initRoutes has run. */
let responseDefaults: Record<string, string> | undefined;
const getResponseDefaults = (): Record<string, string> =>
  (responseDefaults ??= {...getGlobalResponseHeaders(), ...httpOptions.defaultResponseHeaders});

// ############# PUBLIC METHODS #############

export function resetNodeHttpOpts() {
  httpOptions = {...DEFAULT_HTTP_OPTIONS};
  responseDefaults = undefined;
  resetRouter();
}

export function setNodeHttpOpts(options?: Partial<NodeHttpOptions>) {
  responseDefaults = undefined;
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

    // no listen() and NO shutdown handlers: ours calls process.exit(0) and would kill the host on the Ctrl-C it handles
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

// exported so a host server can proxy node requests into mion
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
  const respHeaders = headersFromServerResponse(httpResponse, getResponseDefaults());

  // route resolved BEFORE the body: the read below stops at the chain's limit, and a late context stays GC-cheap.
  // A throw here (a throwing pathTransform) has no chain to run, so it is answered bare with the stream destroyed.
  let chain: MethodsExecutionChain;
  try {
    chain = resolveExecutionChain(path, urlQuery, httpReq);
  } catch (err) {
    replied = true;
    fatalFail(httpResponse, respHeaders, toRpcError(err));
    httpReq.destroy();
    return;
  }
  // read once per request rather than per chunk
  const maxBodySize = chain.maxBodySize;

  // too large is decided BEFORE a byte is buffered: on the declared content-length, then on the running size per chunk
  const declaredLength = Number(httpReq.headers['content-length']);
  if (declaredLength > maxBodySize) {
    replied = true;
    void dispatchRefusal();
    return;
  }

  /** A refused body still runs the chain's `alwaysRun` members, then the stream is destroyed so the client cannot keep sending. */
  async function dispatchRefusal() {
    bodyChunks.length = 0;
    try {
      const mionResponse = await dispatchPlatformError(
        chain,
        path,
        urlQuery,
        requestPayloadTooLarge(),
        reqHeaders,
        respHeaders,
        httpReq,
        httpResponse
      );
      if (!httpResponse.writableEnded) reply(httpResponse, mionResponse);
    } catch (err) {
      fatalFail(httpResponse, respHeaders, toRpcError(err));
    } finally {
      httpReq.destroy();
    }
  }

  async function dispatch(reqRawBody: any, reqBodyType: SerializerCode, readQueryBody: boolean) {
    // runs from a listener: an unhandled rejection here takes the whole process down under node's default
    try {
      const queryBody = readQueryBody ? decodeQueryBody(urlQuery, reqRawBody || undefined) : undefined;
      if (queryBody) {
        reqRawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
      const context = createContextFromChain(chain, path, urlQuery, reqHeaders, respHeaders, reqRawBody, reqBodyType);
      const mionResponse = await dispatchWithContext(context, httpReq, httpResponse);
      if (replied || httpResponse.writableEnded) return;
      replied = true;
      reply(httpResponse, mionResponse);
    } catch (err) {
      if (replied) return;
      replied = true;
      fatalFail(httpResponse, respHeaders, toRpcError(err));
    }
  }

  httpResponse.on('error', (err) => {
    if (replied) return;
    replied = true;
    const error = new FatalError({
      publicMessage: 'Connection Error',
      type: 'response-connection-error',
      originalError: err,
    });
    fatalFail(httpResponse, respHeaders, error);
  });

  // a not-found chain (an unknown path or batch id) has no route to feed: no body, no data listener.
  // Node discards whatever the client still sends once the response ends, so a kept-alive connection stays usable.
  if (!chain.readsBody) {
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

  httpReq.on('error', (err) => {
    if (replied) return;
    replied = true;
    const error = new FatalError({
      publicMessage: 'Connection Error',
      type: 'request-connection-error',
      originalError: err,
    });
    fatalFail(httpResponse, respHeaders, error);
  });

  httpReq.on('end', () => {
    if (replied) return;
    void dispatch(decodeBody(bodyChunks, size), SerializerModes.stringifyJson, true);
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
    // Buffer.byteLength counts the bytes end() is about to write, without a copy of the whole response first
    case SerializerModes.json: {
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
