/* ########
 * 2025 mion
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
  MionResponse,
  readRequestBody,
  BodyReadStrategy,
} from '@mionjs/router';
import {DEFAULT_VERCEL_OPTIONS} from './constants.ts';
import type {VercelHandlerOptions} from './types.ts';
import {SerializerModes} from '@mionjs/core';
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
    // the route is resolved BEFORE the body is read, the context only after it: one lookup gives
    // the chain and the request limit, the body is read against that limit as it arrives (a stream
    // past it is cancelled mid-flight), and building the context after the read keeps a big body
    // from outliving the cheap half of the garbage collector; the router checks the size once more
    // before parsing
    const resolved = resolveRequest(path, urlQuery, req);
    let rawBody: any;
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // a not-found chain (an unknown path or batch id) has no route to feed: its body is never read
    if (resolved.readsBody) {
      try {
        rawBody = await readRequestBody(req, resolved.maxBodySize, BodyReadStrategy.stream);
      } catch (e) {
        // the route resolved, so a refused body still runs the chain's alwaysRun members
        const refused = await dispatchPlatformError(resolved, toRpcError(e), req.headers, responseHeaders, req, undefined);
        return reply(refused, responseHeaders);
      }
      const queryBody = decodeQueryBody(urlQuery, rawBody);
      if (queryBody) {
        rawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
    }
    const context = createContextFromResolved(resolved, req.headers, responseHeaders, rawBody, reqBodyType);
    const platformResp = await dispatchWithContext(context, req, undefined);
    return reply(platformResp, responseHeaders);
  } catch (e) {
    return fatalFail(toRpcError(e), responseHeaders);
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

/** Whatever was thrown, as the mion error the wire carries. */
function toRpcError(e: unknown): RpcError<string> {
  return e instanceof RpcError
    ? e
    : new FatalError({
        publicMessage: 'Unknown Error',
        type: 'unknown-error',
        originalError: e as Error,
      });
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
