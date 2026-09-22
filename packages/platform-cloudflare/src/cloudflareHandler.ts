/* ########
 * 2025 mion
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
  MionResponse,
  readRequestBody,
  BodyReadStrategy,
} from '@mionjs/router';
import {DEFAULT_CLOUDFLARE_OPTIONS} from './constants.ts';
import type {CloudflareHandlerOptions, CloudflareExecutionContext, CloudflarePlatformContext} from './types.ts';
import {SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {RpcError, FatalError} from '@mionjs/core';

// ############# PRIVATE STATE #############

let cloudflareOptions: Readonly<CloudflareHandlerOptions> = {...DEFAULT_CLOUDFLARE_OPTIONS};
/** Merged on the first request, not in the setter: the router's globals only settle once initRoutes has run. */
let defaultHeaders: [string, string][] | undefined;
const getDefaultHeaders = (): [string, string][] =>
  (defaultHeaders ??= [
    ['server', '@mionjs'],
    ...Object.entries(getGlobalResponseHeaders()),
    ...Object.entries(cloudflareOptions.defaultResponseHeaders),
  ]);

export function resetCloudflareHandlerOpts() {
  cloudflareOptions = {...DEFAULT_CLOUDFLARE_OPTIONS};
  defaultHeaders = undefined;
  resetRouter();
}

export function setCloudflareHandlerOpts(options?: Partial<CloudflareHandlerOptions>) {
  cloudflareOptions = {
    ...cloudflareOptions,
    ...options,
  };
  defaultHeaders = undefined;
  setPlatformConfig({...cloudflareOptions});
  return cloudflareOptions;
}

async function handleRequest<Env = unknown>(req: Request, env?: Env, ctx?: CloudflareExecutionContext): Promise<Response> {
  const reqUrl = req.url;
  const urlObj = new URL(reqUrl);
  let path = urlObj.pathname;
  if (cloudflareOptions.basePath && path.startsWith(cloudflareOptions.basePath)) {
    path = path.slice(cloudflareOptions.basePath.length) || '/';
  }
  const urlQuery = urlObj.search ? urlObj.search.slice(1) : undefined;
  const responseHeaders = new Headers(getDefaultHeaders());

  const platformContext: CloudflarePlatformContext<Env> | undefined =
    env !== undefined || ctx !== undefined ? {env: env as Env, ctx: ctx as CloudflareExecutionContext} : undefined;

  // read as TEXT: `req.json()` would throw a raw SyntaxError outside any mion envelope, and the limit needs the size first
  try {
    // route resolved BEFORE the body: the chain gives the limit the read is cancelled at, and a late context stays GC-cheap
    const chain = resolveExecutionChain(path, urlQuery, req);
    let rawBody: any;
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // a not-found chain (an unknown path or batch id) has no route to feed: its body is never read
    if (chain.readsBody) {
      try {
        rawBody = await readRequestBody(req, chain.maxBodySize, BodyReadStrategy.text);
      } catch (err) {
        // the route resolved, so a refused body still runs the chain's alwaysRun members
        const refused = await dispatchPlatformError(
          chain,
          path,
          urlQuery,
          toRpcError(err),
          req.headers,
          responseHeaders,
          req,
          platformContext
        );
        return reply(refused, responseHeaders);
      }
      const queryBody = decodeQueryBody(urlQuery, rawBody);
      if (queryBody) {
        rawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
      }
    }
    const context = createContextFromChain(chain, path, urlQuery, req.headers, responseHeaders, rawBody, reqBodyType);
    const platformResp = await dispatchWithContext(context, req, platformContext);
    return reply(platformResp, responseHeaders);
  } catch (err) {
    return fatalFail(toRpcError(err), responseHeaders);
  }
}

export function createCloudflareHandler<Env = unknown>(options?: Partial<CloudflareHandlerOptions>) {
  setCloudflareHandlerOpts(options);
  return {
    fetch: (req: Request, env?: Env, ctx?: CloudflareExecutionContext) => handleRequest<Env>(req, env, ctx),
  };
}

function fatalFail(err: RpcError<string>, responseHeaders: any): Response {
  const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
  return reply(routeResponse, responseHeaders);
}

function reply(mionResp: MionResponse, responseHeaders: any): Response {
  const bodyType = mionResp.serializer;
  switch (bodyType) {
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
