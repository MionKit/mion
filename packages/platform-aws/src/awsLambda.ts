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
import type {MionResponse, MionHeaders} from '@mionjs/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {DEFAULT_AWS_LAMBDA_OPTIONS} from './constants.ts';
import {AwsLambdaOptions} from '../index.ts';

// ############# STATE #############

let lambdaOptions: Readonly<AwsLambdaOptions> = {...DEFAULT_AWS_LAMBDA_OPTIONS};

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
  const rawRespHeaders: Record<string, string> = {
    server: '@mionjs',
    ...getResponseDefaults(lambdaOptions.defaultResponseHeaders),
  };
  const respHeaders = headersFromRecord(rawRespHeaders, true);
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

function reply(routeResponse: MionResponse, headers: MionHeaders): APIGatewayProxyResult {
  // AWS sets content-length itself, unlike node
  const singleHeaders: Record<string, string> = {};
  const multiHeaders: Record<string, string[]> = {};
  let multiHeaderCount = 0;
  // not Array.from: it would copy the Map into a second array
  for (const [name, value] of headers.entries()) {
    if (Array.isArray(value)) {
      multiHeaders[name] = value;
      multiHeaderCount++;
      continue;
    }
    singleHeaders[name] = value;
  }

  const responseBody = JSON.stringify(routeResponse.body);
  singleHeaders['content-type'] = 'application/json; charset=utf-8';

  // the body is always text, so `isBase64Encoded` keeps its default (false)
  const resp: APIGatewayProxyResult = {
    statusCode: routeResponse.statusCode,
    headers: singleHeaders,
    body: responseBody,
  };
  if (multiHeaderCount) resp.multiValueHeaders = multiHeaders;
  return resp;
}
