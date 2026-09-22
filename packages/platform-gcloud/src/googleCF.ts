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
  getResponseDefaults,
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
  // express may hand the body over already parsed, so both a string and an object body are accepted

  // TODO use its own express headers wrapper instead headers from record
  rawResponse.setHeader('server', '@mionjs');
  const reqHeaders = headersFromIncomingMessage(rawRequest);
  const respHeaders = headersFromServerResponse(rawResponse, getResponseDefaults(googleCFOptions.defaultResponseHeaders));
  let rawBody = rawRequest.body;
  let reqBodyType: SerializerCode = typeof rawBody === 'string' ? SerializerModes.stringifyJson : SerializerModes.json;
  // everything after the FIRST `?`: a second one is legal inside a query, so splitting on it would drop parameters
  const originalUrl = rawRequest.originalUrl;
  const queryIndex = originalUrl ? originalUrl.indexOf('?') : -1;
  const urlQuery = queryIndex === -1 ? undefined : originalUrl.slice(queryIndex + 1);

  try {
    // express already read the body, so the chain's limit is resolved first and the size check runs before the router sees it
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

/** express parses a body-less request into an EMPTY object, which is truthy, so `?data=` would never be read without this. */
function bodyOrUndefined(rawBody: unknown): unknown {
  if (!rawBody) return undefined;
  if (typeof rawBody !== 'object') return rawBody;
  for (const key in rawBody) return rawBody;
  return undefined;
}

/** express hands a JSON request over parsed and the router only measures strings, so the wire size is found here instead.
 *  `rawBody` is the exact bytes the Google functions framework keeps; a plain express host leaves only the parsed body. */
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
    // Buffer.byteLength counts the bytes end() writes, without a full copy of the response first
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
