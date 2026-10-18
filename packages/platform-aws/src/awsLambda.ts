/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, FatalError, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {
  dispatchWithContext,
  createCallContext,
  getRouterFatalErrorResponse,
  headersFromRecord,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
  getResponseDefaults,
} from '@mionjs/router';
import type {MionResponse} from '@mionjs/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {DEFAULT_AWS_LAMBDA_OPTIONS} from './constants.ts';
import {AwsLambdaOptions} from '../index.ts';

// ############# STATE #############

let lambdaOptions: Readonly<AwsLambdaOptions> = {...DEFAULT_AWS_LAMBDA_OPTIONS};
/** A record, not a list of pairs: `new Headers()` APPENDS a repeated name instead of letting the later one win. */
const SERVER_HEADER = {server: '@mionjs'};

// ############# PUBLIC METHODS #############

export function resetAwsLambdaOpts() {
  lambdaOptions = {...DEFAULT_AWS_LAMBDA_OPTIONS};
  resetRouter();
}

export function setAwsLambdaOpts(routerOptions?: Partial<AwsLambdaOptions>) {
  lambdaOptions = {
    ...lambdaOptions,
    ...routerOptions,
  };
  setPlatformConfig({...lambdaOptions});
  return lambdaOptions;
}

export function createAwsLambdaHandler(options?: Partial<AwsLambdaOptions>) {
  setAwsLambdaOpts(options);
  return awsLambdaHandler;
}

export async function awsLambdaHandler(rawRequest: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> {
  let rawBody: any = decodeEventBody(rawRequest);
  const reqHeaders = headersFromRecord(rawRequest.headers as Record<string, string>);
  // Node's own Headers, like bun: it keeps each set-cookie apart for multiValueHeaders
  const respHeaders = new Headers(getResponseDefaults(lambdaOptions.defaultResponseHeaders, SERVER_HEADER));
  // AWS Lambda always receives body as string (JSON)
  let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
  const urlQuery = buildQueryString(rawRequest.queryStringParameters);
  try {
    // the body arrives whole with the event, so there is nothing to read: the router checks its size before parsing
    const queryBody = decodeQueryBody(urlQuery, rawBody || undefined);
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }
    const context = createCallContext(rawRequest.path, urlQuery, rawRequest, reqHeaders, respHeaders, rawBody, reqBodyType);
    const routeResponse = await dispatchWithContext(context, rawRequest, awsContext);
    return reply(routeResponse, respHeaders);
  } catch (err) {
    const error =
      err instanceof RpcError
        ? err
        : new FatalError({
            publicMessage: 'Internal Error',
            originalError: err as Error,
            type: 'unknown-error',
          });
    return reply(getRouterFatalErrorResponse(error, respHeaders), respHeaders);
  }
}

// ############# PRIVATE METHODS #############

/** Decoded here so `maxBodySize` measures the text, not the base64 wire form; a non-base64 body just fails the JSON parse. */
function decodeEventBody(rawRequest: APIGatewayEvent): string {
  const body = rawRequest.body || '';
  if (!body || !rawRequest.isBase64Encoded) return body;
  return Buffer.from(body, 'base64').toString();
}

/** One pass into one string: the filter/map/join it replaced built three arrays and two closures per call. */
function buildQueryString(params: APIGatewayEvent['queryStringParameters']): string | undefined {
  if (!params) return undefined;
  let query = '';
  for (const name in params) {
    const value = params[name];
    if (value === undefined) continue;
    if (query) query += '&';
    query += `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  }
  return query;
}

function reply(routeResponse: MionResponse, headers: Headers): APIGatewayProxyResult {
  // AWS sets content-length itself, unlike node
  const singleHeaders: Record<string, string> = {};
  // RFC 6265 forbids folding set-cookie: each cookie goes out apart through multiValueHeaders
  for (const [name, value] of headers) if (name !== 'set-cookie') singleHeaders[name] = value;

  const responseBody = JSON.stringify(routeResponse.body);
  singleHeaders['content-type'] = 'application/json; charset=utf-8';

  // the body is always text, so `isBase64Encoded` keeps its default (false)
  const resp: APIGatewayProxyResult = {
    statusCode: routeResponse.statusCode,
    headers: singleHeaders,
    body: responseBody,
  };
  const cookies = headers.getSetCookie();
  if (cookies.length) resp.multiValueHeaders = {'set-cookie': cookies};
  return resp;
}
