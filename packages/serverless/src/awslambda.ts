/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, getRouterOptions, dispatchRoute, getResponseFromError} from '@mionkit/router';
import type {Obj, SharedDataFactory, RouterOptions, PublicError, Response} from '@mionkit/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';

let defaultResponseContentType: string;

// ############# PUBLIC METHODS #############

export function initAwsLambdaRouter<SharedData extends Obj>(
    sharedDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<RouterOptions<APIGatewayEvent>>
) {
    initRouter<SharedData, APIGatewayEvent>(sharedDataFactory, routerOptions);
    defaultResponseContentType = getRouterOptions().responseContentType;
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
            'content-type': defaultResponseContentType,
            'content-length': routeResponse.json.length,
            server: '@mionkit/serverless',
            ...routeResponse.headers,
        },
        body: routeResponse.json,
    };
}
