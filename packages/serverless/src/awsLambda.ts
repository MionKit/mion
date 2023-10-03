/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {initRouter, dispatchRoute, getResponseFromError, headersFromRecord} from '@mionkit/router';
import type {RouterOptions, MionResponse, HeaderValue, MionHeaders} from '@mionkit/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

// ############# PUBLIC METHODS #############

// TODO: pass default headers from config
export function initAwsLambdaRouter(routerOptions?: Partial<RouterOptions<APIGatewayEvent>>) {
    initRouter(routerOptions);
}

export async function awsLambdaHandler(rawRequest: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> {
    const rawBody = rawRequest.body || '';
    const reqHeaders = headersFromRecord(rawRequest.headers as Record<string, string>);
    const rawRespHeaders: Record<string, HeaderValue> = {server: '@mionkit/serverless'};
    const respHeaders = headersFromRecord(rawRespHeaders);

    return dispatchRoute(rawRequest.path, rawBody, rawRequest, awsContext, reqHeaders, respHeaders)
        .then((routeResponse) => reply(routeResponse, respHeaders))
        .catch((e) => {
            const error = new RpcError({statusCode: 500, publicMessage: 'Internal Error', originalError: e});
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
