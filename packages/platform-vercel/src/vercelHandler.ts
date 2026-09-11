/* ########
 * 2025 mion
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
} from '@mionjs/router';
import {DEFAULT_VERCEL_OPTIONS} from './constants.ts';
import type {VercelHandlerOptions} from './types.ts';
import {SerializerModes, readBodyWithin} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';

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
  const responseHeaders = new Headers(defaultHeaders);

  // The body is read as TEXT and parsed by the router: `req.json()` would throw a raw SyntaxError
  // outside any mion envelope, and the router's own limit needs the size before parsing.
  try {
    // the context is built BEFORE the body is read: one lookup gives the chain and the request
    // limit, and the body is read against that limit as it arrives (a stream past it is cancelled
    // mid-flight); the router checks the size once more before parsing
    const context = createCallContext(path, urlQuery, req, req.headers, responseHeaders);
    let rawBody: any = await readBodyWithin(req, context.maxBodySize);
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    const queryBody = decodeQueryBody(urlQuery, rawBody);
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
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
