/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, FatalError, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {dispatchRoute, getRouterFatalErrorResponse, resetRouter, decodeQueryBody, setPlatformConfig} from '@mionjs/router';
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
  // Extract query string from Express request
  const urlQuery = rawRequest.originalUrl?.includes('?') ? rawRequest.originalUrl.split('?')[1] : undefined;

  try {
    const queryBody = decodeQueryBody(urlQuery, rawBody);
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }
    const routeResponse = await dispatchRoute(
      rawRequest.path,
      rawBody,
      reqHeaders,
      respHeaders,
      rawRequest,
      rawResponse,
      reqBodyType,
      urlQuery
    );
    reply(routeResponse, rawResponse);
  } catch (err) {
    const error =
      err instanceof RpcError
        ? err
        : new FatalError({
            publicMessage: 'Internal Error',
            originalError: err as Error,
            type: 'unknown-error',
          });
    const routeResponse = getRouterFatalErrorResponse(error, respHeaders);
    reply(routeResponse, rawResponse);
  }
}

// ############# PRIVATE METHODS #############

function reply(mionResp: MionResponse, resp: Response): void {
  resp.status(mionResp.statusCode);
  const bodyType = mionResp.serializer;
  switch (bodyType) {
    // Buffer.byteLength counts the same bytes end() writes, without a full copy of the response first
    case SerializerModes.stringifyJson: {
      const rawBody = mionResp.rawBody as string;
      resp.set('content-length', `${Buffer.byteLength(rawBody, 'utf8')}`);
      // content-type already set by serializer
      resp.end(rawBody, 'utf8');
      break;
    }
    case SerializerModes.json: {
      // Platform adapter stringifies the prepared body object
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
