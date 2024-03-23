/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {dispatchRoute, getResponseFromError, headersFromRecord, resetRouter} from '@mionkit/router';
import type {MionResponse, MionHeaders, SingleHeaderValue} from '@mionkit/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {DEFAULT_AWS_LAMBDA_OPTIONS} from './constants';
import {AwsLambdaOptions} from '..';

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
    return lambdaOptions;
}

export async function awsLambdaHandler(rawRequest: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> {
    const rawBody = rawRequest.body || '';
    const reqHeaders = headersFromRecord(rawRequest.headers as Record<string, string>);
    const rawRespHeaders: Record<string, SingleHeaderValue> = {
        server: '@mionkit/aws',
        ...lambdaOptions.defaultResponseHeaders,
    };
    const respHeaders = headersFromRecord(rawRespHeaders, true);

    return dispatchRoute(rawRequest.path, rawBody, reqHeaders, respHeaders, rawRequest, awsContext)
        .then((routeResponse) => reply(routeResponse, respHeaders))
        .catch((err) => {
            const error = new RpcError({statusCode: 500, publicMessage: 'Internal Error', originalError: err});
            return reply(
                getResponseFromError(
                    rawRequest.path,
                    'dispatchRoute',
                    rawBody,
                    rawRequest,
                    awsContext,
                    error,
                    reqHeaders,
                    respHeaders
                ),
                respHeaders
            );
        });
}

// ############# PRIVATE METHODS #############

function reply(routeResponse: MionResponse, headers: MionHeaders): APIGatewayProxyResult {
    headers.set('content-length', `${routeResponse.rawBody.length}`);
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
    const resp: APIGatewayProxyResult = {
        statusCode: routeResponse.statusCode,
        headers: singleHeaders,
        body: routeResponse.rawBody,
    };
    if (multiHeaderCount) resp.multiValueHeaders = multiHeaders;
    return resp;
}
