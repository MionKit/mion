/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, dispatchRoute, generateRouteResponseFromOutsideError} from '@mionkit/router';
import {Response, SharedDataFactory, getGlobalOptions, Obj} from '@mionkit/core';
import {BodyParserOptions} from '@mionkit/hooks';
import type {FullRouterOptions, RouterOptions} from '@mionkit/router';
import type {Context as AwsContext, APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import type {AwsRawServerContext} from './types';

export const initAwsLambdaRouter = <App extends Obj, SharedData extends Obj>(
    app: App,
    sharedDataFactory?: SharedDataFactory<SharedData>,
    routerOptions?: Partial<FullRouterOptions<AwsRawServerContext>>
) => {
    initRouter<App, SharedData, AwsRawServerContext>(app, sharedDataFactory, routerOptions);
};

export const lambdaHandler = async (req: APIGatewayEvent, awsContext: AwsContext): Promise<APIGatewayProxyResult> => {
    const serverContext: AwsRawServerContext = {rawRequest: req, awsContext};
    return dispatchRoute(req.path, serverContext)
        .then((routeResponse) => {
            return reply(routeResponse);
        })
        .catch((e) => {
            return reply(generateRouteResponseFromOutsideError(e));
        });
};

const reply = (routeResponse: Response) => {
    const {defaultResponseContentType} = getGlobalOptions<BodyParserOptions>();
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
};
