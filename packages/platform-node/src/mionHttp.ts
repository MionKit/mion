/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {dispatchRoute, getRouterFatalErrorResponse, resetRouter, decodeQueryBody, setPlatformConfig} from '@mionjs/router';
import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {DEFAULT_HTTP_OPTIONS} from './constants.ts';
import type {NodeHttpOptions} from './types.ts';
import {configureBinary, type BinaryOptionsPatch} from '@mionjs/core';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';
import type {MionHeaders, MionResponse} from '@mionjs/router';
import {getENV, SerializerModes, StatusCodes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError} from '@mionjs/core';
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

/** Applies the binary options, arming the buffer pool unless the caller turned it off. Safe here
 *  because this adapter releases the buffer on the response's 'finish'/'close' events, once node is
 *  done with the view. */
function applyBinaryOptions(binary: BinaryOptionsPatch): void {
  configureBinary({...binary, pool: {enabled: true, ...binary.pool}});
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
  applyBinaryOptions(httpOptions.binary);
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
  const bodyChunks: any[] = [];

  httpResponse.setHeader('server', '@mionjs');
  const reqHeaders = headersFromIncomingMessage(httpReq);
  const respHeaders = headersFromServerResponse(httpResponse, httpOptions.defaultResponseHeaders);

  // Too large is decided BEFORE a byte is buffered: on the declared content-length when there is
  // one, and on the running size before each chunk is kept. The request stream is then destroyed so
  // the client cannot keep sending into a response that already went out.
  const declaredLength = Number(httpReq.headers['content-length']);
  if (declaredLength > httpOptions.maxBodySize) {
    replied = true;
    fatalFail(httpResponse, respHeaders, payloadTooLarge());
    httpReq.destroy();
    return;
  }

  httpReq.on('data', (data) => {
    if (replied) return;
    size += data.length;
    if (size > httpOptions.maxBodySize) {
      replied = true;
      bodyChunks.length = 0;
      fatalFail(httpResponse, respHeaders, payloadTooLarge());
      httpReq.destroy();
      return;
    }
    bodyChunks.push(data);
  });

  httpReq.on('error', (e) => {
    if (replied) return;
    replied = true;
    const error = new RpcError({
      publicMessage: 'Connection Error',
      type: 'request-connection-error',
      originalError: e,
    });
    fatalFail(httpResponse, respHeaders, error);
  });

  httpReq.on('end', async () => {
    if (replied) return;
    const buffer = Buffer.concat(bodyChunks);
    const contentType = httpReq.headers['content-type'] || '';
    const isBinary = contentType.startsWith('application/octet-stream');
    let reqRawBody: any = isBinary ? buffer : buffer.toString();
    let reqBodyType: SerializerCode = isBinary ? SerializerModes.binary : SerializerModes.stringifyJson;

    // Everything below is inside the guard: this listener is async, so a throw here would be an
    // unhandled rejection, which takes the whole process down under node's default.
    try {
      const queryBody = decodeQueryBody(urlQuery, reqRawBody || undefined);
      if (queryBody) {
        reqRawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
      const mionResponse = await dispatchRoute(
        path,
        reqRawBody,
        reqHeaders,
        respHeaders,
        httpReq,
        httpResponse,
        reqBodyType,
        urlQuery
      );
      if (replied || httpResponse.writableEnded) return;
      replied = true;
      reply(httpResponse, mionResponse);
    } catch (e) {
      if (replied) return;
      replied = true;
      const error =
        e instanceof RpcError
          ? e
          : new RpcError({
              publicMessage: 'Unknown Error',
              type: 'unknown-error',
              originalError: e as Error,
            });
      fatalFail(httpResponse, respHeaders, error);
    }
  });

  httpResponse.on('error', (e) => {
    if (replied) return;
    replied = true;
    const error = new RpcError({
      publicMessage: 'Connection Error',
      type: 'response-connection-error',
      originalError: e,
    });
    fatalFail(httpResponse, respHeaders, error);
  });
}

/** The router swaps a failed binary encode for a JSON envelope, so this is a tripwire, never a path. */
function missingBinaryPayload(): RpcError<'unknown-error'> {
  return new RpcError({
    publicMessage: 'Internal Server Error',
    type: 'unknown-error',
    message: 'binary response without a payload',
  });
}

function payloadTooLarge(): RpcError<'request-payload-too-large'> {
  return new RpcError({
    statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
    publicMessage: 'Payload Too Large',
    type: 'request-payload-too-large',
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
    case SerializerModes.stringifyJson: {
      const buffer = Buffer.from(mionResp.rawBody as string, 'utf8');
      httpResp.setHeader('content-length', buffer.byteLength);
      // content-type already set by serializer
      httpResp.end(buffer);
      break;
    }
    case SerializerModes.json: {
      // Platform adapter stringifies the prepared body object
      const jsonString = JSON.stringify(mionResp.body);
      const buffer = Buffer.from(jsonString, 'utf8');
      httpResp.setHeader('content-length', buffer.byteLength);
      httpResp.end(buffer);
      break;
    }
    case SerializerModes.binary: {
      const serializer = mionResp.binSerializer;
      if (!serializer) return fatalFail(httpResp, mionResp.headers, missingBinaryPayload());
      httpResp.setHeader('content-length', serializer.getLength());
      // content-type already set by serializer
      httpResp.end(serializer.getBufferView());
      // The view aliases the (possibly pooled) buffer and node keeps it queued until the
      // socket drains, so the buffer only goes back once the response is done. Both events
      // fire on a normal response and 'close' alone on an abort; release is idempotent.
      const releaseBuffer = () => mionResp.releaseBinBuffer?.();
      httpResp.on('finish', releaseBuffer);
      httpResp.on('close', releaseBuffer);
      break;
    }
    default: {
      const error = new RpcError({
        publicMessage: 'unknown-mion-response-format',
        type: 'unknown-error',
        errorData: {bodyType},
      });
      fatalFail(httpResp, mionResp.headers, error);
    }
  }
}
