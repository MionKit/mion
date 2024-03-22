/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {dispatchRoute, getResponseFromError, resetRouter} from '@mionkit/router';
import type {MionResponse} from '@mionkit/router';
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
    const reqHeaders = getHeadersFromApiRequest(rawRequest);
    const rawRespHeaders = {
        server: '@mionkit/aws',
        ...lambdaOptions.defaultResponseHeaders,
    };
    const respHeaders = new Headers(rawRespHeaders);

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

function reply(routeResponse: MionResponse, headers: Headers): APIGatewayProxyResult {
    headers.set('content-length', `${routeResponse.rawBody.length}`);
    const singleHeaders: Record<string, string> = {};
    const multiHeaders: Record<string, string[]> = {};
    let multiHeaderCount = 0;
    Array.from(headers.entries()).forEach(([name, value]) => {
        const values = value.split(',').map((v) => v.trim()); // Split values by comma and trim whitespace
        if (values.length === 1) {
            singleHeaders[name] = value;
        } else {
            multiHeaders[name] = values;
            multiHeaderCount++;
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

function getHeadersFromApiRequest(apiGatewayEvent: APIGatewayEvent): Headers {
    const fetchHeaders = new Headers();

    // Check if headers exist in the API Gateway Event
    if (apiGatewayEvent.headers) {
        // Iterate over each header in the API Gateway Event object
        for (const [name, value] of Object.entries(apiGatewayEvent.headers)) {
            if (!value) continue;
            // If the header is an array, iterate over its values
            if (Array.isArray(value)) {
                for (const val of value) {
                    fetchHeaders.append(name, val);
                }
            } else {
                // If it's not an array, assume it's a string
                fetchHeaders.append(name, value);
            }
        }
    }

    return fetchHeaders;
}
