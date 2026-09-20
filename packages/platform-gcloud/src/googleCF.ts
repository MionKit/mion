/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, FatalError, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {
  dispatchWithContext,
  dispatchPlatformError,
  toRpcError,
  resolveExecutionChain,
  createContextFromChain,
  getRouterFatalErrorResponse,
  requestPayloadTooLarge,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
} from '@mionjs/router';
import type {MionHeaders, MionResponse} from '@mionjs/router';
import {Request, Response} from 'express';
import {DEFAULT_GOOGLE_CF_OPTIONS} from './constants.ts';
import {GoogleCFOptions} from './types.ts';
import {headersFromIncomingMessage, headersFromServerResponse} from './headers.ts';

// ############# STATE #############

let googleCFOptions: Readonly<GoogleCFOptions> = {...DEFAULT_GOOGLE_CF_OPTIONS};

// ############# PUBLIC METHODS #############

export function resetGoogleCFOpts() {
  googleCFOptions = {...DEFAULT_GOOGLE_CF_OPTIONS};
  resetRouter();
}

export function setGoogleCFOpts(routerOptions?: Partial<GoogleCFOptions>) {
  googleCFOptions = {
    ...googleCFOptions,
    ...routerOptions,
  };
  setPlatformConfig({...googleCFOptions});
  return googleCFOptions;
}

/** Creates a Google Cloud Functions handler with optional platform config */
export function createGoogleCFHandler(options?: Partial<GoogleCFOptions>) {
  setGoogleCFOpts(options);
  return googleCFHandler;
}

export async function googleCFHandler(rawRequest: Request, rawResponse: Response): Promise<void> {
  // Express in Google Cloud Functions might parse the body automatically when Content-Type is application/json
  // We handle both cases: string body and already-parsed object body

  // TODO use its own express headers wrapper instead headers from record
  rawResponse.setHeader('server', '@mionjs');
  const reqHeaders = headersFromIncomingMessage(rawRequest);
  const respHeaders = headersFromServerResponse(rawResponse, googleCFOptions.defaultResponseHeaders);
  let rawBody = rawRequest.body;
  let reqBodyType: SerializerCode = typeof rawBody === 'string' ? SerializerModes.stringifyJson : SerializerModes.json;
  // Extract query string from Express request. Everything after the FIRST `?`: a second one is a
  // legal character inside a query, so splitting on it would drop the rest of the parameters.
  const originalUrl = rawRequest.originalUrl;
  const queryIndex = originalUrl ? originalUrl.indexOf('?') : -1;
  const urlQuery = queryIndex === -1 ? undefined : originalUrl.slice(queryIndex + 1);

  try {
    // express already read (and may have parsed) the body, so the chain is resolved first to get
    // the route's own limit, then the too-large check runs before anything is handed to the router
    const chain = resolveExecutionChain(rawRequest.path, urlQuery, rawRequest);
    try {
      rejectOversizedRequest(rawRequest, rawBody, chain.maxBodySize);
    } catch (refusal) {
      // the route resolved, so the refusal still runs the chain's alwaysRun members
      const refused = await dispatchPlatformError(
        chain,
        rawRequest.path,
        urlQuery,
        toRpcError(refusal),
        reqHeaders,
        respHeaders,
        rawRequest,
        rawResponse
      );
      return reply(refused, rawResponse);
    }
    const queryBody = decodeQueryBody(urlQuery, bodyOrUndefined(rawBody));
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }
    const context = createContextFromChain(chain, rawRequest.path, urlQuery, reqHeaders, respHeaders, rawBody, reqBodyType);
    const routeResponse = await dispatchWithContext(context, rawRequest, rawResponse);
    reply(routeResponse, rawResponse);
  } catch (err) {
    const routeResponse = getRouterFatalErrorResponse(toRpcError(err), respHeaders);
    reply(routeResponse, rawResponse);
  }
}

// ############# PRIVATE METHODS #############

/** The body a request actually carried. express parses a request with none into an EMPTY object,
 *  which is truthy, so `?data=` would never be read on this platform without this: every other
 *  adapter gets an empty string and can pass `rawBody || undefined`. */
function bodyOrUndefined(rawBody: unknown): unknown {
  if (!rawBody) return undefined;
  if (typeof rawBody !== 'object') return rawBody;
  for (const key in rawBody) return rawBody;
  return undefined;
}

/** Refuses a body past the route's limit before the chain runs, the way node and uws decide it.
 *  The router only measures a string body, and express hands a `application/json` request over as
 *  a parsed object, so the wire size has to be found here: the declared `content-length` first
 *  (express leaves it intact, and it costs one compare), then the exact bytes the Google functions
 *  framework keeps on `rawBody` for a chunked request that declared no length, and last the parsed
 *  body re-serialised, which is all a plain express host with no raw-body saver leaves behind. */
function rejectOversizedRequest(rawRequest: Request, rawBody: unknown, maxBodySize: number): void {
  const declaredLength = rawRequest.headers['content-length'];
  if (declaredLength !== undefined) {
    if (Number(declaredLength) > maxBodySize) throw requestPayloadTooLarge();
    return;
  }
  // a string body is measured again by the router, so only a parsed one still needs a size here
  if (typeof rawBody !== 'object' || rawBody === null) return;
  const wireBytes = (rawRequest as {rawBody?: Buffer}).rawBody;
  const size = wireBytes ? wireBytes.byteLength : Buffer.byteLength(JSON.stringify(rawBody), 'utf8');
  if (size > maxBodySize) throw requestPayloadTooLarge();
}

function reply(mionResp: MionResponse, resp: Response): void {
  resp.status(mionResp.statusCode);
  const bodyType = mionResp.serializer;
  switch (bodyType) {
    // Buffer.byteLength counts the same bytes end() writes, without a full copy of the response first
    case SerializerModes.json: {
      const jsonString = JSON.stringify(mionResp.body);
      resp.set('content-type', 'application/json; charset=utf-8');
      resp.set('content-length', `${Buffer.byteLength(jsonString, 'utf8')}`);
      resp.end(jsonString, 'utf8');
      break;
    }
    default: {
      const error = new FatalError({
        publicMessage: 'unknown-mion-response-format',
        type: 'unknown-error',
        errorData: {bodyType},
      });
      unexpectedFail(resp, mionResp.headers, error);
    }
  }
}

function unexpectedFail(resp: Response, respHeaders: MionHeaders, error: RpcError<string>) {
  if (resp.writableEnded) return;
  const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
  reply(routeResponse, resp);
}
