/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {dispatchRoute, getGlobalErrorResponse, headersFromRecord, resetRouter} from '@mionkit/router';
import type {MionResponse, MionHeaders} from '@mionkit/router';
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
    const rawRespHeaders: Record<string, string> = {
        server: '@mionkit',
        ...lambdaOptions.defaultResponseHeaders,
    };
    const respHeaders = headersFromRecord(rawRespHeaders, true);

    return dispatchRoute(rawRequest.path, rawBody, reqHeaders, respHeaders, rawRequest, awsContext)
        .then((routeResponse) => reply(routeResponse, respHeaders))
        .catch((err) => {
            const error =
                err instanceof RpcError
                    ? err
                    : new RpcError({
                          publicMessage: 'Internal Error',
                          originalError: err,
                          type: 'unknown-error',
                      });
            return reply(getGlobalErrorResponse(error, respHeaders), respHeaders);
        });
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
    if (typeof routeResponse.rawBody !== 'string') throw new Error('Binary responses are not yet supported on AWS Lambda');
    const resp: APIGatewayProxyResult = {
        statusCode: routeResponse.statusCode,
        headers: singleHeaders,
        body: routeResponse.rawBody,
    };
    if (multiHeaderCount) resp.multiValueHeaders = multiHeaders;
    return resp;
}
