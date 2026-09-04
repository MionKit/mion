/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  dispatchRoute,
  getRouterFatalErrorResponse,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
  MionResponse,
} from '@mionjs/router';
import {DEFAULT_VERCEL_OPTIONS} from './constants.ts';
import type {VercelHandlerOptions} from './types.ts';
import {SerializerModes, toResponseBody} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError} from '@mionjs/core';

// ############# PRIVATE STATE #############

let vercelOptions: Readonly<VercelHandlerOptions> = {...DEFAULT_VERCEL_OPTIONS};
let defaultHeaders: [string, string][] = [['server', '@mionjs']];

export function resetVercelHandlerOpts() {
  vercelOptions = {...DEFAULT_VERCEL_OPTIONS};
  defaultHeaders = [['server', '@mionjs']];
  resetRouter();
}

export function setVercelHandlerOpts(options?: Partial<VercelHandlerOptions>) {
  vercelOptions = {
    ...vercelOptions,
    ...options,
  };
  defaultHeaders = [['server', '@mionjs'], ...Object.entries(vercelOptions.defaultResponseHeaders)];
  setPlatformConfig({...vercelOptions});
  return vercelOptions;
}

/** Main handler for Web standard Request -> Response */
async function handleRequest(req: Request): Promise<Response> {
  const reqUrl = req.url;
  const urlObj = new URL(reqUrl);
  const path = urlObj.pathname;
  const urlQuery = urlObj.search ? urlObj.search.slice(1) : undefined;
  const contentType = req.headers.get('content-type') || '';
  const isBinary = contentType.startsWith('application/octet-stream');
  const responseHeaders = new Headers(defaultHeaders);

  // The body is read as TEXT and parsed by the router: `req.json()` would throw a raw SyntaxError
  // outside any mion envelope, and the router's own limit needs the size before parsing.
  try {
    let rawBody: any = req.body ? (isBinary ? await req.arrayBuffer() : await req.text()) : undefined;
    let reqBodyType: SerializerCode = isBinary ? SerializerModes.binary : SerializerModes.stringifyJson;
    const queryBody = decodeQueryBody(urlQuery, rawBody);
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }
    const platformResp = await dispatchRoute(path, rawBody, req.headers, responseHeaders, req, undefined, reqBodyType, urlQuery);
    return reply(platformResp, responseHeaders);
  } catch (e) {
    const error =
      e instanceof RpcError
        ? e
        : new RpcError({
            publicMessage: 'Unknown Error',
            type: 'unknown-error',
            originalError: e as Error,
          });
    return fatalFail(error, responseHeaders);
  }
}

/** Creates Next.js App Router / Vercel serverless route handlers */
export function createVercelHandler(options?: Partial<VercelHandlerOptions>) {
  setVercelHandlerOpts(options);
  return {
    GET: handleRequest,
    POST: handleRequest,
    PUT: handleRequest,
    DELETE: handleRequest,
    PATCH: handleRequest,
  };
}

function fatalFail(err: RpcError<string>, responseHeaders: any): Response {
  const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
  return reply(routeResponse, responseHeaders);
}

/** The router swaps a failed binary encode for a JSON envelope, so this is a tripwire, never a path. */
function missingBinaryPayload(): RpcError<'unknown-error'> {
  return new RpcError({
    publicMessage: 'Internal Server Error',
    type: 'unknown-error',
    message: 'binary response without a payload',
  });
}

function reply(mionResp: MionResponse, responseHeaders: any): Response {
  const bodyType = mionResp.serializer;
  switch (bodyType) {
    case SerializerModes.stringifyJson: {
      return new Response(mionResp.rawBody as string, {
        status: mionResp.statusCode,
        headers: responseHeaders,
      });
    }
    case SerializerModes.json: {
      return Response.json(mionResp.body, {
        status: mionResp.statusCode,
        headers: responseHeaders,
      });
    }
    case SerializerModes.binary: {
      const serializer = mionResp.binSerializer;
      if (!serializer) return fatalFail(missingBinaryPayload(), responseHeaders);
      responseHeaders.set('content-length', String(serializer.getLength()));
      const response = new Response(toResponseBody(serializer.getBufferView()), {
        status: mionResp.statusCode,
        headers: responseHeaders,
      });
      // `new Response(BufferSource)` copies the bytes per the Fetch spec, so the buffer is
      // free immediately. This runtime is not pooled by default regardless.
      mionResp.releaseBinBuffer?.();
      return response;
    }
    default: {
      const error = new RpcError({
        publicMessage: 'unknown-mion-response-format',
        type: 'unknown-error',
        errorData: {bodyType},
      });
      return fatalFail(error, responseHeaders);
    }
  }
}
