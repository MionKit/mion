/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, FatalError, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {
  dispatchResolved,
  resolveRequest,
  getRouterFatalErrorResponse,
  headersFromRecord,
  resetRouter,
  decodeQueryBody,
  setPlatformConfig,
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

/** Creates an AWS Lambda handler with optional platform config */
export function createAwsLambdaHandler(options?: Partial<AwsLambdaOptions>) {
  setAwsLambdaOpts(options);
  return awsLambdaHandler;
}

export async function awsLambdaHandler(rawRequest: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> {
  let rawBody: any = decodeEventBody(rawRequest);
  const reqHeaders = headersFromRecord(rawRequest.headers as Record<string, string>);
  const rawRespHeaders: Record<string, string> = {
    server: '@mionjs',
    ...lambdaOptions.defaultResponseHeaders,
  };
  const respHeaders = headersFromRecord(rawRespHeaders, true);
  // AWS Lambda always receives body as string (JSON)
  let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
  // Reconstruct query string from AWS parsed query parameters
  const urlQuery = buildQueryString(rawRequest.queryStringParameters);
  try {
    // the body arrives whole with the event, so the route is resolved for its limit and its chain
    // in one lookup and the router checks the size before parsing
    const resolved = resolveRequest(rawRequest.path, urlQuery, rawRequest);
    const queryBody = decodeQueryBody(urlQuery, rawBody || undefined);
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }
    const routeResponse = await dispatchResolved(resolved, rawBody, reqHeaders, respHeaders, rawRequest, awsContext, reqBodyType);
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

/** API Gateway and Lambda Function URLs base64-encode the body (`isBase64Encoded: true`) for binary
 *  media types and some proxy setups. The router only ever sees text, so the body is decoded here
 *  and the router's `maxBodySize` check measures the decoded text, not the base64 wire form. A
 *  body that is not base64 decodes to garbage and fails the router's JSON parse like any other bad
 *  body: `Buffer.from(..., 'base64')` never throws. */
function decodeEventBody(rawRequest: APIGatewayEvent): string {
  const body = rawRequest.body || '';
  if (!body || !rawRequest.isBase64Encoded) return body;
  return Buffer.from(body, 'base64').toString();
}

/** One pass into one string: the filter/map/join chain built three arrays and two closures per
 *  invocation. Same output, `undefined` values skipped and both parts still percent-encoded. */
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
  // AWS manages content-length automatically, so no need to set header unlike node
  const singleHeaders: Record<string, string> = {};
  const multiHeaders: Record<string, string[]> = {};
  let multiHeaderCount = 0;
  // iterate the entries directly: Array.from materialized a second array on top of the Map the
  // iterator already builds, plus a closure per response
  for (const [name, value] of headers.entries()) {
    if (Array.isArray(value)) {
      multiHeaders[name] = value;
      multiHeaderCount++;
      continue;
    }
    singleHeaders[name] = value;
  }

  const bodyType = routeResponse.serializer;
  let responseBody: string;

  switch (bodyType) {
    case SerializerModes.stringifyJson:
      responseBody = routeResponse.rawBody as string;
      break;
    case SerializerModes.json:
      // Platform adapter stringifies the prepared body object
      responseBody = JSON.stringify(routeResponse.body);
      singleHeaders['content-type'] = 'application/json; charset=utf-8';
      break;
    default:
      throw new Error(`Unknown body type: ${bodyType}`);
  }

  // the body is always text, so `isBase64Encoded` stays at API Gateway's default (false)
  const resp: APIGatewayProxyResult = {
    statusCode: routeResponse.statusCode,
    headers: singleHeaders,
    body: responseBody,
  };
  if (multiHeaderCount) resp.multiValueHeaders = multiHeaders;
  return resp;
}
