/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, dispatchRoute, getResponseFromError} from '@mionkit/router';
import type {RouterOptions, Response} from '@mionkit/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

// ############# PUBLIC METHODS #############

export function initAwsLambdaRouter(routerOptions?: Partial<RouterOptions<APIGatewayEvent>>) {
    initRouter(routerOptions);
}

export async function lambdaHandler(rawRequest: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> {
    return dispatchRoute(rawRequest.path, rawRequest, awsContext)
        .then((routeResponse) => {
            return reply(routeResponse);
        })
        .catch((e) => {
            return reply(getResponseFromError(e));
        });
}

// ############# PRIVATE METHODS #############

function reply(routeResponse: Response) {
    return {
        statusCode: routeResponse.statusCode,
        headers: {
            'content-length': routeResponse.json.length,
            server: '@mionkit/serverless',
            ...routeResponse.headers,
        },
        body: routeResponse.json,
    };
}
