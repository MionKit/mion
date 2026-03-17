/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {
    dispatchRoute,
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

export async function awsLambdaHandler(rawRequest: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> {
    let rawBody: any = rawRequest.body || '';
    const reqHeaders = headersFromRecord(rawRequest.headers as Record<string, string>);
    const rawRespHeaders: Record<string, string> = {
        server: '@mionjs',
        ...lambdaOptions.defaultResponseHeaders,
    };
    const respHeaders = headersFromRecord(rawRespHeaders, true);
    // AWS Lambda always receives body as string (JSON)
    let reqBodyType: SerializerCode = SerializerModes.stringifyJson;
    // Reconstruct query string from AWS parsed query parameters
    const urlQuery = rawRequest.queryStringParameters
        ? Object.entries(rawRequest.queryStringParameters)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
              .join('&')
        : undefined;
    const queryBody = decodeQueryBody(urlQuery, rawBody || undefined);
    if (queryBody) {
        rawBody = queryBody.rawBody;
        reqBodyType = queryBody.bodyType;
    }

    try {
        const routeResponse = await dispatchRoute(
            rawRequest.path,
            rawBody,
            reqHeaders,
            respHeaders,
            rawRequest,
            awsContext,
            reqBodyType,
            urlQuery
        );
        return reply(routeResponse, respHeaders);
    } catch (err) {
        const error =
            err instanceof RpcError
                ? err
                : new RpcError({
                      publicMessage: 'Internal Error',
                      originalError: err as Error,
                      type: 'unknown-error',
                  });
        return reply(getRouterFatalErrorResponse(error, respHeaders), respHeaders);
    }
}

// ############# PRIVATE METHODS #############

function reply(routeResponse: MionResponse, headers: MionHeaders): APIGatewayProxyResult {
    // AWS manages content-length automatically, so no need to set header unlike node
    const singleHeaders: Record<string, string> = {};
    const multiHeaders: Record<string, string[]> = {};
    let multiHeaderCount = 0;
    Array.from(headers.entries()).forEach(([name, value]) => {
        if (Array.isArray(value)) {
            multiHeaders[name] = value;
            multiHeaderCount++;
            return;
        }
        singleHeaders[name] = value;
    });

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
        case SerializerModes.binary:
            throw new Error('Binary responses are not yet supported on AWS Lambda');
        default:
            throw new Error(`Unknown body type: ${bodyType}`);
    }

    const resp: APIGatewayProxyResult = {
        statusCode: routeResponse.statusCode,
        headers: singleHeaders,
        body: responseBody,
    };
    if (multiHeaderCount) resp.multiValueHeaders = multiHeaders;
    return resp;
}
